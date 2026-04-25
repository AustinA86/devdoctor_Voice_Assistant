from twilio.rest import Client
from app.core.config import settings
from app.models.customer import Customer
from urllib.parse import urlencode
import logging

logger = logging.getLogger(__name__)

class TwilioService:
    def __init__(self):
        self.client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        self.from_phone = settings.TWILIO_PHONE_NUMBER
        self.base_url = settings.TWILIO_WEBHOOK_BASE_URL.rstrip('/')

    def make_call(self, customer: Customer) -> str:
        """
        Initiates an outbound call to the customer and points to the webhook for TwiML instructions.
        """
        webhook_url = f"{self.base_url}/api/v1/webhooks/twilio/outbound/{customer.id}"
        
        logger.info(f"Initiating call to {customer.phone_number} for customer {customer.id}")
        
        call = self.client.calls.create(
            to=customer.phone_number,
            from_=self.from_phone,
            url=webhook_url,
            method="POST",
            record=True,
            status_callback=f"{self.base_url}/api/v1/webhooks/twilio/status/{customer.id}",
            status_callback_event=["completed", "no-answer", "canceled", "failed", "busy"],
            status_callback_method="POST"
        )
        return call.sid