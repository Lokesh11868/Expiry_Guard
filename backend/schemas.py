from pydantic import BaseModel, EmailStr
from typing import Optional

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    notification_time: Optional[dict] = None  # {'hour': int, 'minute': int}

class ProductCreate(BaseModel):
    product_name: str
    expiry_date: str
    category: Optional[str] = "Other"
    image_url: Optional[str] = None
    barcode: Optional[str] = None
    expiry_type: Optional[str] = "expiry"
    purchase_date: Optional[str] = None
    confidence: Optional[float] = None
    risk_score: Optional[int] = None
    risk_level: Optional[str] = None
    action_required: Optional[str] = None
    source: Optional[str] = "manual"
    document_type: Optional[str] = None
    provider: Optional[str] = None
    reference_number: Optional[str] = None
    action_status: Optional[str] = "Active"
    priority: Optional[str] = None
    risk_reasons: Optional[list] = None
    force_save: Optional[bool] = False
    overwrite_id: Optional[str] = None
