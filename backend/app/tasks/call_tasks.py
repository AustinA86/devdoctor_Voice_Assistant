from app.tasks.celery_app import celery_app
from app.services.twilio_service import TwilioService
from app.db.session import SessionLocal
from app.models.customer import Customer, CallStatus
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, max_retries=3)
def initiate_outbound_call(self, customer_id: int):
    db = SessionLocal()
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            logger.error(f"Customer {customer_id} not found")
            return
            
        if customer.call_status == CallStatus.COMPLETED:
            return

        # Bypass Twilio for Local Simulator Demo
        logger.info(f"Simulating call for {customer.customer_name} ({customer.phone_number})")
        customer.call_status = CallStatus.RINGING
        db.commit()
        
    except Exception as exc:
        logger.error(f"Error calling customer {customer_id}: {exc}")
        if customer:
            customer.call_status = CallStatus.FAILED
            db.commit()
        # Retry logic
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()