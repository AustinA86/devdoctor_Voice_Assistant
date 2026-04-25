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
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
whisper_lock = asyncio.Lock()

router = APIRouter()

VOICES = {
    "English": "en-IN-NeerjaNeural",
    "Hindi": "hi-IN-SwaraNeural",
    "Kannada": "kn-IN-SapnaNeural",
    "Marathi": "mr-IN-AarohiNeural"
}

# Master Intent Keywords (Global)
CONFIRM_WORDS = ["yes", "confirm", "howdu", "haan", "ho", "sari", "hudu", "houdu", "agali", "ok", "okay", "ದೃಢೀಕರಿಸಿ", "पुष्टि", "पुष्टी"]
CANCEL_WORDS = ["no", "cancel", "beda", "nahi", "nako", "illa", "radd", "ರದ್ದುಮಾಡು", "रद्द", "रद्द करा"]

async def generate_audio(text: str, lang: str):
    voice = VOICES.get(lang, "en-IN-NeerjaNeural")
    rate = "-15%" if lang == "Kannada" else "-10%"
    temp_file = f"/tmp/{uuid.uuid4()}.mp3"
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        for i in range(3):
            try:
                await communicate.save(temp_file)
                break
            except:
                await asyncio.sleep(1)
        with open(temp_file, "rb") as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')
        os.remove(temp_file)
        return b64
    except: return None

def get_order_prompt(customer: Customer):
    lang = customer.preferred_language
    name = customer.customer_name
    amt = customer.order_amount
    
    prompts = {
        "English": f"Hello {name}, your order for {amt} rupees is ready. Please say YES to confirm or NO to cancel. To hear this again, press 0.",
        "Hindi": f"Namaste {name} ji, aapka {amt} rupaye ka order taiyaar hai. Pakka karne ke liye HAAN bolein ya radd karne ke liye NAHI bolein. Dobara sunne ke liye 0 dabayein.",
        "Kannada": f"Namaskara {name} avare, nimma {amt} roopaayiya adesha siddhavagide. Khachitapadisalu HOWDU endu heli athava raddhu madalu BEDA endu heli. Punah kelalu 0 otti.",
        "Marathi": f"Namaskar {name} ji, tumcha {amt} rupayancha order tayaar aahe. Khatri karnyasaathi HO bolein kinva radda karnyasaathi NAKO bolein. Punha aikanyasathi 0 daba."
    }
    return prompts.get(lang, prompts["English"])

@router.get("/poll")
def poll_calls(db: Session = Depends(get_db)):
    call = db.query(Customer).filter(Customer.call_status == "RINGING").first()
    if call:
        return {"call_id": call.id, "customer_name": call.customer_name, "phone_number": call.phone_number}
    return {"call_id": None}

@router.post("/{customer_id}/accept")
async def accept_call(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    customer.call_status = "IN_PROGRESS"
    db.commit()
    text = "Please select your language. Press 1 for English, 2 for Kannada, 3 for Hindi, 4 for Marathi."
    audio = await generate_audio(text, "English")
    return {"state": "LANGUAGE_SELECTION", "text": text, "audio_base64": audio}

class IVRInput(BaseModel):
    digit: str
    state: str

@router.post("/{customer_id}/input")
async def handle_ivr_input(customer_id: int, data: IVRInput, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    digit = str(data.digit)
    state = data.state

    if state == "LANGUAGE_SELECTION":
        lang_map = {"1": "English", "2": "Kannada", "3": "Hindi", "4": "Marathi"}
        if digit in lang_map:
            customer.preferred_language = lang_map[digit]
            customer.has_selected_language = 1
            db.commit()
            text = get_order_prompt(customer)
            audio = await generate_audio(text, customer.preferred_language)
            return {"state": "ORDER_DETAILS", "text": text, "audio_base64": audio}
        
    if state == "ORDER_DETAILS":
        if digit == "0":
            text = get_order_prompt(customer)
            audio = await generate_audio(text, customer.preferred_language)
            return {"state": "ORDER_DETAILS", "text": text, "audio_base64": audio}
        elif digit == "1" or digit == "5":
            customer.order_status = "CONFIRMED"
            customer.call_status = "COMPLETED"
            text = "Thank you. Your order has been confirmed."
        elif digit == "2" or digit == "6":
            customer.order_status = "CANCELLED"
            customer.call_status = "COMPLETED"
            text = "Your order has been cancelled."
        
        if customer.call_status == "COMPLETED":
            db.commit()
            audio = await generate_audio(text, customer.preferred_language)
            return {"state": "COMPLETED", "text": text, "audio_base64": audio}

    return {"state": state, "text": "Invalid Input", "audio_base64": None}

@router.post("/{customer_id}/voice")
async def handle_voice(customer_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    temp_path = f"/tmp/{uuid.uuid4()}.m4a"
    with open(temp_path, "wb") as f: f.write(await file.read())
    async with whisper_lock:
        segments, _ = whisper_model.transcribe(temp_path)
        transcript = " ".join([s.text for s in segments]).lower()
    os.remove(temp_path)
    
    if any(w in transcript for w in CONFIRM_WORDS):
        customer.order_status = "CONFIRMED"
        text = "Confirmed via voice. Thank you."
    elif any(w in transcript for w in CANCEL_WORDS):
        customer.order_status = "CANCELLED"
        text = "Cancelled via voice. Goodbye."
    else:
        return {"state": "ORDER_DETAILS", "text": "Didn't catch that. Please use keypad or say it again.", "audio_base64": None}

    customer.call_status = "COMPLETED"
    db.commit()
    audio = await generate_audio(text, customer.preferred_language)
    return {"state": "COMPLETED", "text": text, "audio_base64": audio}
