from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.customer import Customer, CallStatus, OrderStatus
from app.schemas.customer import CustomerResponse, CustomerCreate
from app.tasks.call_tasks import initiate_outbound_call
import pandas as pd
from typing import List

router = APIRouter()

@router.post("/upload", response_model=dict)
async def upload_customers_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    try:
        df = pd.read_csv(file.file)
        # Required columns mapping
        required_cols = ["customer_name", "phone_number", "preferred_language", 
                         "order_details", "order_amount", "delivery_date", 
                         "payment_mode", "order_id"]
        
        for col in required_cols:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")

        records_created = 0
        for _, row in df.iterrows():
            order_id_val = str(row["order_id"])
            # Check if order_id exists
            existing = db.query(Customer).filter(Customer.order_id == order_id_val).first()
            if not existing:
                customer = Customer(
                    customer_name=str(row["customer_name"]),
                    phone_number=str(row["phone_number"]),
                    preferred_language=str(row["preferred_language"]),
                    order_id=order_id_val,
                    order_details=str(row["order_details"]),
                    order_amount=float(row["order_amount"]),
                    delivery_date=str(row["delivery_date"]),
                    payment_mode=str(row["payment_mode"])
                )
                db.add(customer)
                records_created += 1

        db.commit()
        return {"message": f"Successfully uploaded {records_created} customers"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/start-campaign")
async def start_call_campaign(db: Session = Depends(get_db)):
    """
    Finds all customers and resets them to PENDING, then queues them for calling.
    This ensures the demo works every time the button is clicked.
    """
    # Reset all for demo purposes
    db.query(Customer).update({
        Customer.call_status: CallStatus.PENDING,
        Customer.order_status: OrderStatus.PENDING,
        Customer.has_selected_language: 0
    })
    db.commit()

    pending_customers = db.query(Customer).all()
    
    for customer in pending_customers:
        initiate_outbound_call.delay(customer.id)
        
    return {"message": f"Started campaign for {len(pending_customers)} customers"}

@router.post("/{customer_id}/confirm")
def confirm_order_manually(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    customer.order_status = OrderStatus.CONFIRMED
    customer.call_status = CallStatus.COMPLETED
    db.commit()
    return {"message": "Order confirmed manually"}

@router.post("/", response_model=CustomerResponse)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    db_customer = Customer(**customer.model_dump())
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: int, customer: CustomerCreate, db: Session = Depends(get_db)):
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    for key, value in customer.model_dump().items():
        setattr(db_customer, key, value)
    
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    db.delete(db_customer)
    db.commit()
    return {"message": "Customer deleted"}

@router.get("/", response_model=List[CustomerResponse])
def get_customers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    customers = db.query(Customer).offset(skip).limit(limit).all()
    return customers