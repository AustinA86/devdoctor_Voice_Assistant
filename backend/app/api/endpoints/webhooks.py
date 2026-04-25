from fastapi import APIRouter, Request, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.customer import Customer, CallStatus, OrderStatus
from app.core.config import settings
from twilio.twiml.voice_response import VoiceResponse, Gather

router = APIRouter()

# Simple dictionary for multi-lingual initial messages
# In a real setup, this might hit a TTS service or load pre-recorded audio
MESSAGES = {
    "English": "Hello {name}, your order for {amount} rupees is ready for confirmation. Delivery is scheduled for {date}. Press 1 to confirm. Press 2 to cancel. Press 3 for callback later.",
    "Hindi": "Namaste {name}, aapka {amount} rupaye ka order confirmation ke liye taiyaar hai. Delivery {date} ko hogi. Confirm karne ke liye 1 dabaye. Cancel karne ke liye 2 dabaye. Baad mein call karne ke liye 3 dabaye.",
    "Kannada": "Namaskara {name}, nimma {amount} roopaayiya order confirmation ge siddhavagide. Delivery {date} ge ide. Confirm maadalu ondu otti. Cancel maadalu eradu otti. Nantara kare maadalu mooru otti.",
    "Marathi": "Namaskar {name}, tumchi {amount} rupayachi order confirmation sathi tayar ahe. Delivery {date} la hoil. Confirm karnyashathi ek daba. Cancel karnyashathi don daba. Nantar call karnyashathi teen daba."
}

def get_message(customer: Customer) -> str:
    lang = customer.preferred_language if customer.preferred_language in MESSAGES else "English"
    template = MESSAGES[lang]
    return template.format(
        name=customer.customer_name,
        amount=customer.order_amount,
        date=customer.delivery_date
    )

@router.post("/twilio/outbound/{customer_id}")
async def twilio_outbound_webhook(customer_id: int, request: Request, db: Session = Depends(get_db)):
    """
    Webhook called by Twilio when the user answers the phone.
    Returns TwiML instructing Twilio to read the message and gather DTMF input.
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return Response(content="<Response><Reject/></Response>", media_type="text/xml")

    response = VoiceResponse()
    
    # We use Gather to capture keypress
    action_url = f"{settings.TWILIO_WEBHOOK_BASE_URL}/api/v1/webhooks/twilio/gather/{customer_id}"
    gather = Gather(num_digits=1, action=action_url, method="POST", timeout=10)
    
    # Read the message. Using Amazon Polly for better multilingual support
    # Or default Alice voice
    message_text = get_message(customer)
    gather.say(message_text, voice="alice") 
    
    response.append(gather)
    # If no input is received
    response.say("We did not receive any input. Goodbye.")
    response.hangup()
    
    return Response(content=str(response), media_type="text/xml")

@router.post("/twilio/gather/{customer_id}")
async def twilio_gather_webhook(customer_id: int, request: Request, db: Session = Depends(get_db)):
    """
    Handles the DTMF input from the user (1, 2, or 3)
    """
    form_data = await request.form()
    digits = form_data.get("Digits")
    
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return Response(content="<Response><Reject/></Response>", media_type="text/xml")

    response = VoiceResponse()
    
    if digits == "1":
        customer.order_status = OrderStatus.CONFIRMED
        response.say("Thank you. Your order has been confirmed.")
    elif digits == "2":
        customer.order_status = OrderStatus.CANCELLED
        response.say("Your order has been cancelled.")
    elif digits == "3":
        customer.order_status = OrderStatus.CALLBACK_LATER
        response.say("We will call you back later.")
    else:
        response.say("Invalid input. Goodbye.")
        
    db.commit()
    response.hangup()
    
    return Response(content=str(response), media_type="text/xml")

@router.post("/twilio/status/{customer_id}")
async def twilio_status_webhook(customer_id: int, request: Request, db: Session = Depends(get_db)):
    """
    Webhook called by Twilio when the call ends, fails, etc.
    Updates the database with the final call status and recording URL if available.
    """
    form_data = await request.form()
    call_status = form_data.get("CallStatus")
    recording_url = form_data.get("RecordingUrl")
    
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if customer:
        if call_status == "completed":
            customer.call_status = CallStatus.COMPLETED
        elif call_status in ["failed", "canceled"]:
            customer.call_status = CallStatus.FAILED
        elif call_status in ["no-answer", "busy"]:
            customer.call_status = CallStatus.NO_ANSWER
            
        if recording_url:
            customer.recording_url = recording_url
            
        db.commit()

    return Response(status_code=200)