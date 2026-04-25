from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, File, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.models.customer import Customer, CallStatus, OrderStatus
import edge_tts
import asyncio
import os
import uuid
import base64
from faster_whisper import WhisperModel

# Initialize AI Models
# Using a global lock to prevent race conditions during model inference
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
whisper_lock = asyncio.Lock()

router = APIRouter()

VOICES = {
    "English": "en-IN-NeerjaNeural",
    "Hindi": "hi-IN-SwaraNeural",
    "Kannada": "kn-IN-SapnaNeural",
    "Marathi": "mr-IN-AarohiNeural"
}

# REUSABLE TTS ENGINE
async def generate_audio(text: str, lang: str):
    voice = VOICES.get(lang, "en-IN-NeerjaNeural")
    rate = "-15%" if lang == "Kannada" else "-10%"
    temp_file = f"/tmp/{uuid.uuid4()}.mp3"
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        # Adding a small retry loop for Edge-TTS 403 errors
        for i in range(3):
            try:
                await communicate.save(temp_file)
                break
            except Exception as e:
                if i == 2: raise e
                await asyncio.sleep(1)
        
        with open(temp_file, "rb") as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')
        os.remove(temp_file)
        return b64
    except Exception as e:
        print(f"TTS Final Error: {e}")
        return None

def get_order_prompt(customer: Customer):
    lang = customer.preferred_language
    name = customer.customer_name
    amt = customer.order_amount
    date = customer.delivery_date
    
    prompts = {
        "English": f"Hello {name}, your medicine order for {amt} rupees is ready. Delivery is scheduled for {date}. Press 1 to confirm, 2 to cancel, or 3 to hear details again. Or simply say YES or NO after the beep.",
        "Hindi": f"Namaste {name} ji, aapka {amt} rupaye ka dawaai ka order taiyaar hai. Delivery {date} ko hogi. Pakka karne ke liye 1 dabayein, radd karne ke liye 2 dabayein, ya jankari dobara sunne ke liye 3 dabayein. Ya beep ke baad HAAN ya NAHI bolein.",
        "Kannada": f"Namaskara {name} avare, nimma {amt} roopaayiya aushadhi adesha siddhavagide. Delivery {date} ge ide. Khachitapadisalu 1 otti, raddhu madalu 2 otti, punah kelalu 3 otti. Athava beep nantara HOWDU athava BEDA endu heli.",
        "Marathi": f"Namaskar {name} ji, tumcha {amt} rupayancha order tayaar aahe. Delivery {date} la hoil. Khatri karnyasaathi 1 daba, radda karnyasaathi 2 daba, kinva 3 daba. Kinva beep nantar HO athava NAKO bolein."
    }
    return prompts.get(lang, prompts["English"])

@router.get("/poll")
def poll_calls(db: Session = Depends(get_db)):
    # Reset is handled by the start-campaign endpoint, so here we just find RINGING
    call = db.query(Customer).filter(Customer.call_status == "RINGING").first()
    if call:
        return {"call_id": call.id, "customer_name": call.customer_name, "phone_number": call.phone_number}
    return {"call_id": None}

@router.post("/{customer_id}/accept")
async def accept_call(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer: raise HTTPException(status_code=404)
    customer.call_status = "IN_PROGRESS"
    db.commit()
    
    text = "Please select your language. Press 1 for English. Press 2 for Kannada. Press 3 for Hindi. Press 4 for Marathi."
    audio = await generate_audio(text, "English")
    return {"state": "LANGUAGE_SELECTION", "text": text, "audio_base64": audio}

class IVRInput(BaseModel):
    digit: str
    state: str

@router.post("/{customer_id}/input")
async def handle_ivr_input(customer_id: int, data: IVRInput, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer: raise HTTPException(status_code=404)
    digit = str(data.digit)
    current_state = data.state
    
    # STATE: LANGUAGE SELECTION
    if current_state == "LANGUAGE_SELECTION":
        lang_map = {"1": "English", "2": "Kannada", "3": "Hindi", "4": "Marathi"}
        if digit in lang_map:
            customer.preferred_language = lang_map[digit]
            customer.has_selected_language = 1
            db.commit()
            text = get_order_prompt(customer)
            audio = await generate_audio(text, customer.preferred_language)
            return {"state": "ORDER_DETAILS", "text": text, "audio_base64": audio}
        else:
            text = "Invalid selection. Press 1 for English, 2 for Kannada, 3 for Hindi, 4 for Marathi."
            audio = await generate_audio(text, "English")
            return {"state": "LANGUAGE_SELECTION", "text": text, "audio_base64": audio}

    # STATE: ORDER DETAILS
    if current_state == "ORDER_DETAILS":
        if digit == "1":
            customer.order_status = "CONFIRMED"
            customer.call_status = "COMPLETED"
            db.commit()
            t = {"English": "Thank you. Your order has been confirmed.", "Kannada": "Dhanyavadagalu. Nimma adesha khachitavagide.", "Hindi": "Dhanyavad. Aapka order pakka ho gaya hai.", "Marathi": "Dhanyavad. Tumcha order nishchit jhala aahe."}
            text = t.get(customer.preferred_language, t["English"])
            audio = await generate_audio(text, customer.preferred_language)
            return {"state": "COMPLETED", "text": text, "audio_base64": audio}
        elif digit == "2":
            customer.order_status = "CANCELLED"
            customer.call_status = "COMPLETED"
            db.commit()
            t = {"English": "Your order has been cancelled.", "Kannada": "Nimma adesha raddhagide.", "Hindi": "Aapka order radd ho gaya hai.", "Marathi": "Tumcha order radd jhala aahe."}
            text = t.get(customer.preferred_language, t["English"])
            audio = await generate_audio(text, customer.preferred_language)
            return {"state": "COMPLETED", "text": text, "audio_base64": audio}
        elif digit == "3":
            text = get_order_prompt(customer)
            audio = await generate_audio(text, customer.preferred_language)
            return {"state": "ORDER_DETAILS", "text": text, "audio_base64": audio}

    return {"state": current_state, "text": "Invalid Input", "audio_base64": None}

@router.post("/{customer_id}/voice")
async def handle_voice(customer_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer: raise HTTPException(status_code=404)
    
    temp_path = f"/tmp/{uuid.uuid4()}.m4a"
    with open(temp_path, "wb") as f: f.write(await file.read())
    
    async with whisper_lock:
        segments, _ = whisper_model.transcribe(temp_path)
        transcript = " ".join([s.text for s in segments]).lower()
    os.remove(temp_path)

    print(f"DEBUG STT: {transcript}")

    confirm_keywords = ["yes", "confirm", "howdu", "haan", "ho", "sari", "hudu", "houdu", "agali", "ok", "okay"]
    cancel_keywords = ["no", "cancel", "beda", "nahi", "nako", "illa", "radd"]

    if any(w in transcript for w in confirm_keywords):
        customer.order_status = "CONFIRMED"
        customer.call_status = "COMPLETED"
        text = "Confirmed via voice. Thank you."
    elif any(w in transcript for w in cancel_keywords):
        customer.order_status = "CANCELLED"
        customer.call_status = "COMPLETED"
        text = "Cancelled via voice. Goodbye."
    else:
        return {"state": "ORDER_DETAILS", "text": "Didn't catch that. Please use keypad or say it again.", "audio_base64": None}

    db.commit()
    audio = await generate_audio(text, customer.preferred_language)
    return {"state": "COMPLETED", "text": text, "audio_base64": audio}
