from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.customer import CallStatus, OrderStatus

class CustomerBase(BaseModel):
    customer_name: str
    phone_number: str
    preferred_language: str
    order_id: str
    order_details: str
    order_amount: float
    delivery_date: str
    payment_mode: str

class CustomerCreate(CustomerBase):
    pass

class CustomerResponse(CustomerBase):
    id: int
    call_status: CallStatus
    order_status: OrderStatus
    call_sid: Optional[str]
    recording_url: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True