from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, Text
from sqlalchemy.sql import func
from app.db.base import Base
import enum

class CallStatus(str, enum.Enum):
    PENDING = "PENDING"
    CALLING = "CALLING"
    RINGING = "RINGING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    NO_ANSWER = "NO_ANSWER"

class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    CALLBACK_LATER = "CALLBACK_LATER"

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String, index=True)
    phone_number = Column(String, index=True)
    preferred_language = Column(String, default="English")
    
    order_id = Column(String, unique=True, index=True)
    order_details = Column(Text)
    order_amount = Column(Float)
    delivery_date = Column(String)
    payment_mode = Column(String)
    
    call_status = Column(Enum(CallStatus), default=CallStatus.PENDING)
    order_status = Column(Enum(OrderStatus), default=OrderStatus.PENDING)
    call_sid = Column(String, nullable=True) # Twilio Call ID
    recording_url = Column(String, nullable=True)
    has_selected_language = Column(Integer, default=0) # 0 for No, 1 for Yes
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())