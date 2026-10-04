from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import re
import json
import datetime
from datetime import datetime, timedelta
import dateparser
security = HTTPBearer()
router = APIRouter()

from bson import ObjectId
from db import users_collection
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from config import JWT_SECRET, JWT_ALGORITHM
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = users_collection.find_one({"_id": ObjectId(payload.get("sub"))})
        if not user: raise HTTPException(status_code=401, detail="Invalid token")
        return user
    except JWTError: raise HTTPException(status_code=401, detail="Invalid token")

import threading
current_scheduler = {'thread': None, 'hour': 20, 'minute': 11}

@router.post("/scheduler/time")
async def set_scheduler_time(data: dict, current_user: dict = Depends(get_current_user)):
    hour = int(data.get('hour', 6))
    minute = int(data.get('minute', 0))
    
    # Calculate next notification timestamp based on new time
    next_run = calculate_next_run(hour, minute)
    
    # Update user's notification settings and schedule
    users_collection.update_one(
        {"_id": current_user["_id"]},
        {"$set": {
            "notification_time": {"hour": hour, "minute": minute},
            "next_notification_at": next_run
        }}
    )
    return {"message": f"Notification time updated to {hour:02d}:{minute:02d}. Next alert at {next_run.strftime('%Y-%m-%d %H:%M:%S')}"}

@router.get("/scheduler/time")
async def get_scheduler_time_route(current_user: dict = Depends(get_current_user)):
    notif = current_user.get("notification_time", {"hour": 6, "minute": 0})
    print(f"[Backend] Fetching scheduler time for {current_user['username']}: {notif}")
    return notif

@router.get("/debug/notifications")
async def debug_notifications(current_user: dict = Depends(get_current_user)):
    user = users_collection.find_one({"_id": current_user["_id"]})
    return {
        "notification_time": user.get("notification_time"),
        "last_alert_sent": user.get("last_alert_sent"),
        "now_server_time": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "notifications_flag_exists": notifications_enabled()
    }

@router.post("/notifications/on")
async def enable_notifications(current_user: dict = Depends(get_current_user)):
    users_collection.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"notifications_enabled": True}}
    )
    return {"message": "Notifications enabled"}

@router.post("/notifications/off")
async def disable_notifications(current_user: dict = Depends(get_current_user)):
    users_collection.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"notifications_enabled": False}}
    )
    return {"message": "Notifications disabled"}

from datetime import datetime, timedelta
from PIL import Image
import io, base64, threading, dateparser, json, re

from bson import ObjectId
from schemas import UserCreate, ProductCreate
from db import users_collection, products_collection
from security import hash_password, verify_password, create_access_token
from utils import get_product_status, send_email_alert, get_product_from_open_facts, notifications_enabled
from email_scheduler import calculate_next_run
from ocr import extract_text_from_image, extract_expiry_date_from_text



@router.post("/signup")
async def signup(user: UserCreate):
    if users_collection.find_one({"username": user.username}): raise HTTPException(status_code=400, detail="Username already exists")
    if users_collection.find_one({"email": user.email}): raise HTTPException(status_code=400, detail="Email already exists")
    # Set default notification_time if not provided
    notification_time = user.notification_time if user.notification_time else {"hour": 6, "minute": 0}
    
    # Initialize next_notification_at for the new user
    next_run = calculate_next_run(notification_time.get("hour", 6), notification_time.get("minute", 0))
    
    doc = {
        "username": user.username, 
        "email": user.email, 
        "password": hash_password(user.password), 
        "created_at": datetime.utcnow(), 
        "notification_time": notification_time,
        "next_notification_at": next_run
    }
    result = users_collection.insert_one(doc)
    return {"access_token": create_access_token(data={"sub": str(result.inserted_id)}), "token_type": "bearer", "user": {"id": str(result.inserted_id), "username": user.username, "email": user.email, "notification_time": notification_time, "next_notification_at": next_run}}


from pymongo.errors import ExecutionTimeout

@router.post("/login")
async def login(username: str = Form(...), password: str = Form(...)):
    try:
        user = users_collection.find_one({"username": username}, max_time_ms=2000)  # 2 seconds timeout
    except ExecutionTimeout:
        raise HTTPException(status_code=504, detail="Database timeout. Please try again later.")
    if not user or not verify_password(password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "access_token": create_access_token(data={"sub": str(user["_id"])}),
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]), 
            "username": user["username"], 
            "email": user["email"],
            "notification_time": user.get("notification_time", {"hour": 6, "minute": 0})
        }
    }


@router.get("/users/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    notif = current_user.get("notification_time", {"hour": 6, "minute": 0})
    print(f"[Backend] get_current_user_info for {current_user['username']} - notification_time: {notif}")
    return {
        "id": str(current_user["_id"]), 
        "username": current_user["username"], 
        "email": current_user["email"],
        "notification_time": notif
    }


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    try:
        image_bytes = await file.read()
        text = extract_text_from_image(image_bytes)
        
        # New: Use open-weight AI to extract structured info
        from ai_service import ai_service
        extracted = ai_service.extract_structured_data(text)
        
        if extracted:
            expiry_date = extracted.get("expiry_date")
            product_name = extracted.get("item_name")
            category = extracted.get("category")
            expiry_type = extracted.get("expiry_type", "expiry")
            confidence = extracted.get("confidence", 0.9)
            purchase_date = extracted.get("purchase_date")
            document_type = extracted.get("document_type")
            provider = extracted.get("provider")
            reference_number = extracted.get("reference_number")
        else:
            # Fallback
            expiry_date = extract_expiry_date_from_text(text)
            from utils import extract_product_info, categorize_product
            info = extract_product_info(text)
            product_name = info.get("product_name")
            category = categorize_product(product_name) if product_name else "Other"
            expiry_type = "expiry"
            confidence = 0.5
            purchase_date = None
            document_type = None
            provider = None
            reference_number = None
        
        import base64
        image_url = f"data:image/png;base64,{base64.b64encode(image_bytes).decode()}"
    except Exception as e:
        print(f"OCR error: {e}")
        return {"image_url": None, "expiry_date": None, "extracted_text": "", "product_name": None, "category": "Other", "confidence": 0, "expiry_type": "expiry"}
    return {
        "image_url": image_url, 
        "expiry_date": expiry_date, 
        "extracted_text": text, 
        "product_name": product_name, 
        "category": category,
        "expiry_type": expiry_type,
        "purchase_date": purchase_date,
        "confidence": confidence,
        "document_type": document_type,
        "provider": provider,
        "reference_number": reference_number
    }


@router.post("/categorize-product")
async def categorize_product_route(data: dict = Body(...)):
    product_name = data.get("product_name")
    if not product_name:
        return {"category": "Other"}
    from utils import categorize_product
    category = categorize_product(product_name)
    return {"category": category}


@router.post("/add-item")
async def add_item(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    from ai_service import ai_service
    status = get_product_status(product.expiry_date)
    
    # Conflict & Validation Logic
    if not product.force_save:
        # Check Expiry vs Purchase date
        if product.expiry_date and product.purchase_date:
            try:
                exp = datetime.strptime(product.expiry_date, '%Y-%m-%d').date()
                pur = datetime.strptime(product.purchase_date, '%Y-%m-%d').date()
                if exp < pur:
                    raise HTTPException(status_code=409, detail={"type": "logical_conflict", "message": "Expiry date is before purchase date."})
            except Exception:
                pass
                
        # Check for Duplicates / Existing matches
        existing = products_collection.find_one({
            "user_id": str(current_user["_id"]),
            "product_name": {"$regex": f"^{product.product_name}$", "$options": "i"}
        })
        if existing:
            raise HTTPException(status_code=409, detail={
                "type": "duplicate_conflict",
                "message": "Potential conflict detected. An item with this name already exists.",
                "existing_id": str(existing["_id"]),
                "existing_date": existing.get("expiry_date"),
                "new_date": product.expiry_date
            })

    # If overwrite_id is passed, we update instead of insert
    
    days_remaining = None
    if product.expiry_date:
        try:
            today = datetime.now().date()
            # Handle YYYY-MM-DD or DD/MM/YYYY
            fmt = '%Y-%m-%d' if '-' in product.expiry_date else '%d/%m/%Y'
            expiry = datetime.strptime(product.expiry_date, fmt).date()
            days_remaining = (expiry - today).days
            # Standardize to YYYY-MM-DD
            product.expiry_date = expiry.strftime('%Y-%m-%d')
        except Exception:
            pass

    risk_info = ai_service.calculate_risk(product.product_name, product.category, product.expiry_type, days_remaining, product.action_status)
    action_req = ai_service.recommend_action(product.product_name, product.category, product.expiry_type, days_remaining)

    doc = {
        "user_id": str(current_user["_id"]),
        "product_name": product.product_name,
        "expiry_date": product.expiry_date,
        "category": product.category,
        "image_url": product.image_url,
        "barcode": product.barcode,
        "expiry_type": product.expiry_type,
        "purchase_date": product.purchase_date,
        "confidence": product.confidence,
        "source": product.source,
        "document_type": product.document_type,
        "provider": product.provider,
        "reference_number": product.reference_number,
        "action_status": product.action_status or "Active",
        "priority": risk_info["priority"],
        "risk_reasons": risk_info["reasons"],
        "risk_score": risk_info["score"],
        "risk_level": risk_info["level"],
        "action_required": action_req,
        "status": status,
        "created_at": datetime.utcnow()
    }
    
    if product.overwrite_id:
        products_collection.update_one({"_id": ObjectId(product.overwrite_id), "user_id": str(current_user["_id"])}, {"$set": doc})
        doc["_id"] = product.overwrite_id
    else:
        doc["_id"] = str(products_collection.insert_one(doc).inserted_id)
        
    return doc


@router.post("/batch-delete")
async def batch_delete(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    item_ids = data.get("ids", [])
    if not item_ids:
        return {"message": "No items to delete"}
    object_ids = [ObjectId(id) for id in item_ids]
    result = products_collection.delete_many({"_id": {"$in": object_ids}, "user_id": str(current_user["_id"])})
    return {"message": f"Successfully deleted {result.deleted_count} items"}


@router.post("/batch-status")
async def batch_status(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    item_ids = data.get("ids", [])
    new_status = data.get("status")
    if not item_ids or not new_status:
        return {"message": "Invalid data provided"}
    object_ids = [ObjectId(id) for id in item_ids]
    result = products_collection.update_many(
        {"_id": {"$in": object_ids}, "user_id": str(current_user["_id"])},
        {"$set": {"status": new_status}}
    )
    return {"message": f"Successfully updated {result.modified_count} items to '{new_status}'"}

@router.patch("/update-action-status/{item_id}")
async def update_action_status(item_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    from ai_service import ai_service
    new_action_status = data.get("action_status")
    if not new_action_status:
        raise HTTPException(status_code=400, detail="action_status required")
        
    item = products_collection.find_one({"_id": ObjectId(item_id), "user_id": str(current_user["_id"])})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    # Recalculate risk/priority based on new status
    days_remaining = None
    if item.get("expiry_date"):
        try:
            today = datetime.now().date()
            fmt = '%Y-%m-%d' if '-' in item["expiry_date"] else '%d/%m/%Y'
            expiry = datetime.strptime(item["expiry_date"], fmt).date()
            days_remaining = (expiry - today).days
        except: pass
        
    risk_info = ai_service.calculate_risk(item.get("product_name"), item.get("category"), item.get("expiry_type"), days_remaining, new_action_status)
    
    products_collection.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {
            "action_status": new_action_status,
            "priority": risk_info["priority"],
            "risk_score": risk_info["score"],
            "risk_level": risk_info["level"],
            "risk_reasons": risk_info["reasons"]
        }}
    )
    return {"message": "Action status updated", "new_priority": risk_info["priority"]}


@router.get("/get-items")
async def get_items(current_user: dict = Depends(get_current_user)):
    products = list(products_collection.find({"user_id": str(current_user["_id"])}))
    for p in products: 
        p["_id"] = str(p["_id"])
        p["status"] = get_product_status(p["expiry_date"])
    products.sort(key=lambda p: datetime.strptime(p["expiry_date"], '%Y-%m-%d' if '-' in p.get("expiry_date","") else "%d/%m/%Y") if p.get("expiry_date") else datetime.max)
    return products

@router.get("/briefing")
async def get_briefing(current_user: dict = Depends(get_current_user)):
    from ai_service import ai_service
    products = list(products_collection.find({"user_id": str(current_user["_id"])}))
    for p in products: p["_id"] = str(p["_id"])
    briefing = ai_service.generate_briefing(products)
    return {"briefing": briefing}

@router.post("/search-natural")
async def search_natural(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    from ai_service import ai_service
    query = data.get("query")
    if not query:
        raise HTTPException(status_code=400, detail="Query required")
        
    filters = ai_service.parse_natural_search(query)
    
    # Map structured filter to MongoDB query safely
    mongo_query = {"user_id": str(current_user["_id"])}
    if filters.get("category"):
        mongo_query["category"] = {"$regex": f"^{filters['category']}$", "$options": "i"}
    if filters.get("expiry_type"):
        mongo_query["expiry_type"] = {"$regex": f"^{filters['expiry_type']}$", "$options": "i"}
    if filters.get("risk_level"):
        mongo_query["risk_level"] = {"$regex": f"^{filters['risk_level']}$", "$options": "i"}
    if filters.get("action_status"):
        mongo_query["action_status"] = {"$regex": f"^{filters['action_status']}$", "$options": "i"}
        
    products = list(products_collection.find(mongo_query))
    
    # Filter days mathematically
    filtered_products = []
    today = datetime.now().date()
    for p in products:
        p["_id"] = str(p["_id"])
        include = True
        days = None
        if p.get("expiry_date"):
            try:
                fmt = '%Y-%m-%d' if '-' in p["expiry_date"] else '%d/%m/%Y'
                expiry = datetime.strptime(p["expiry_date"], fmt).date()
                days = (expiry - today).days
            except: pass
            
        if filters.get("days_remaining_max") is not None:
            if days is None or days > filters["days_remaining_max"]: include = False
        if filters.get("days_remaining_min") is not None:
            if days is None or days < filters["days_remaining_min"]: include = False
            
        if include:
            filtered_products.append(p)

    return {"results": filtered_products, "applied_filters": filters}


@router.delete("/delete-item/{item_id}")
async def delete_item(item_id: str, current_user: dict = Depends(get_current_user)):
    result = products_collection.delete_one({"_id": ObjectId(item_id), "user_id": str(current_user["_id"])})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted successfully"}


@router.get("/items/needs-attention")
async def get_needs_attention(current_user: dict = Depends(get_current_user)):
    """Return items that require attention: Critical, High risk, Expired, Action Required."""
    from ai_service import ai_service
    products = list(products_collection.find({"user_id": str(current_user["_id"])}))
    today = datetime.now().date()
    result = []
    for p in products:
        p["_id"] = str(p["_id"])
        p["status"] = get_product_status(p.get("expiry_date", ""))
        days_remaining = None
        if p.get("expiry_date"):
            try:
                fmt = '%Y-%m-%d' if '-' in p["expiry_date"] else '%d/%m/%Y'
                expiry = datetime.strptime(p["expiry_date"], fmt).date()
                days_remaining = (expiry - today).days
            except: pass
        p["daysUntilExpiry"] = days_remaining
        priority = p.get("priority", "Low")
        action_status = p.get("action_status", "Active")
        is_attention = (
            priority in ("Critical", "High") or
            p["status"] in ("expired", "near") or
            action_status == "Action Required"
        )
        if is_attention:
            result.append(p)
    result.sort(key=lambda x: {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}.get(x.get("priority", "Low"), 3))
    return result


@router.get("/items/renewals")
async def get_renewals(current_user: dict = Depends(get_current_user)):
    """Return items that have renewal-oriented action statuses."""
    products = list(products_collection.find({"user_id": str(current_user["_id"])}))
    today = datetime.now().date()
    result = []
    for p in products:
        p["_id"] = str(p["_id"])
        p["status"] = get_product_status(p.get("expiry_date", ""))
        days_remaining = None
        if p.get("expiry_date"):
            try:
                fmt = '%Y-%m-%d' if '-' in p["expiry_date"] else '%d/%m/%Y'
                expiry = datetime.strptime(p["expiry_date"], fmt).date()
                days_remaining = (expiry - today).days
            except: pass
        p["daysUntilExpiry"] = days_remaining
        action_status = p.get("action_status", "Active")
        # Include items that are not "Active" or that are nearing expiry and need action
        if action_status != "Active" or p.get("priority") in ("Critical", "High"):
            result.append(p)
    result.sort(key=lambda x: {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}.get(x.get("priority", "Low"), 3))
    return result


@router.get("/items/documents")
async def get_documents(current_user: dict = Depends(get_current_user)):
    """Return items that have document metadata (document_type, provider, reference_number)."""
    doc_categories = ["Documents", "Certificates", "Licenses", "Warranties", "Insurance", "Contracts", "Memberships"]
    products = list(products_collection.find({
        "user_id": str(current_user["_id"]),
        "$or": [
            {"document_type": {"$exists": True, "$ne": None}},
            {"category": {"$in": doc_categories}}
        ]
    }))
    today = datetime.now().date()
    result = []
    for p in products:
        p["_id"] = str(p["_id"])
        p["status"] = get_product_status(p.get("expiry_date", ""))
        days_remaining = None
        if p.get("expiry_date"):
            try:
                fmt = '%Y-%m-%d' if '-' in p["expiry_date"] else '%d/%m/%Y'
                expiry = datetime.strptime(p["expiry_date"], fmt).date()
                days_remaining = (expiry - today).days
            except: pass
        p["daysUntilExpiry"] = days_remaining
        # Determine verification status
        conf = p.get("confidence", 1.0) or 1.0
        if conf < 0.6:
            p["verification_status"] = "Needs Verification"
        elif p.get("source") == "manual":
            p["verification_status"] = "Verified"
        else:
            p["verification_status"] = "Verified" if conf >= 0.8 else "Needs Verification"
        result.append(p)
    return result


@router.get("/notifications/history")
async def get_notification_history(current_user: dict = Depends(get_current_user)):
    """Return synthetic notification history based on expiring/expired items."""
    from ai_service import ai_service
    products = list(products_collection.find({"user_id": str(current_user["_id"])}))
    today = datetime.now().date()
    notifications = []
    read_ids = set(current_user.get("read_notification_ids", []))
    
    for p in products:
        p_id = str(p["_id"])
        days_remaining = None
        if p.get("expiry_date"):
            try:
                fmt = '%Y-%m-%d' if '-' in p["expiry_date"] else '%d/%m/%Y'
                expiry = datetime.strptime(p["expiry_date"], fmt).date()
                days_remaining = (expiry - today).days
            except: pass
        
        if days_remaining is None:
            continue
            
        notif_type, message = None, None
        if days_remaining < 0:
            notif_type = "expired"
            message = f"{p['product_name']} has expired {abs(days_remaining)} day(s) ago."
        elif days_remaining <= 3:
            notif_type = "critical"
            message = f"{p['product_name']} expires in {days_remaining} day(s). Immediate action required."
        elif days_remaining <= 7:
            notif_type = "urgent"
            message = f"{p['product_name']} expires in {days_remaining} days."
        elif days_remaining <= 30:
            notif_type = "reminder"
            message = f"{p['product_name']} expires in {days_remaining} days. Consider taking action."
        
        if notif_type:
            notifications.append({
                "id": f"notif_{p_id}",
                "item_id": p_id,
                "item_name": p["product_name"],
                "category": p.get("category", "Other"),
                "type": notif_type,
                "message": message,
                "days_remaining": days_remaining,
                "expiry_date": p.get("expiry_date"),
                "is_read": f"notif_{p_id}" in read_ids,
                "created_at": p.get("created_at", datetime.utcnow()).isoformat() if hasattr(p.get("created_at", datetime.utcnow()), 'isoformat') else str(p.get("created_at", ""))
            })
    
    notifications.sort(key=lambda x: x["days_remaining"])
    return notifications


@router.patch("/notifications/read/{notif_id}")
async def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    read_ids = list(set(current_user.get("read_notification_ids", []) + [notif_id]))
    users_collection.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"read_notification_ids": read_ids}}
    )
    return {"message": "Notification marked as read"}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    products = list(products_collection.find({"user_id": str(current_user["_id"])}, {"_id": 1}))
    all_ids = [f"notif_{str(p['_id'])}" for p in products]
    users_collection.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"read_notification_ids": all_ids}}
    )
    return {"message": "All notifications marked as read"}


@router.patch("/users/me")
async def update_profile(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Update profile fields like username."""
    allowed = ["username", "notification_time", "notifications_enabled", "default_warning_days"]
    update = {k: v for k, v in data.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    users_collection.update_one({"_id": current_user["_id"]}, {"$set": update})
    return {"message": "Profile updated"}




@router.get("/statistics")
async def get_statistics(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    products = list(products_collection.find({"user_id": user_id}))
    today = datetime.now().date()
    
    total, expiring, expired = len(products), 0, 0
    status_breakdown = {"safe": 0, "near": 0, "expired": 0}
    category_breakdown = {}
    monthly_expiry = {} # Next 6 months
    
    # Initialize monthly_expiry for next 6 months
    for i in range(6):
        month_date = (today + timedelta(days=i*30)).strftime("%b %Y")
        monthly_expiry[month_date] = 0

    for p in products:
        try:
            expiry_dt = datetime.strptime(p["expiry_date"], '%d/%m/%Y')
            expiry = expiry_dt.date()
        except: continue
        
        # Status & Basic Stats
        status = get_product_status(p["expiry_date"])
        status_breakdown[status] += 1
        
        if expiry < today:
            expired += 1
        elif expiry <= today + timedelta(days=7):
            expiring += 1
            
        # Category Breakdown
        cat = p.get("category", "Other")
        category_breakdown[cat] = category_breakdown.get(cat, 0) + 1
        
        # Monthly Trend (if in next 6 months)
        month_key = expiry_dt.strftime("%b %Y")
        if month_key in monthly_expiry:
            monthly_expiry[month_key] += 1

    health_score = round((status_breakdown["safe"] / total * 100), 1) if total > 0 else 100
    
    return {
        "total_items": total,
        "expiring_this_week": expiring,
        "expired_items": expired,
        "status_breakdown": status_breakdown,
        "category_breakdown": category_breakdown,
        "monthly_expiry": monthly_expiry,
        "health_score": health_score
    }


@router.post("/send-expiry-alerts")
async def send_expiry_alerts(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    products = list(products_collection.find({"user_id": user_id}))
    today = datetime.now().date()
    # Reverting to 3 days as per user's specific logic
    alert_products = [p for p in products if (lambda d: (datetime.strptime(d, '%d/%m/%Y').date() - today).days <= 3 if '/' in d else False)(p["expiry_date"])]
    if alert_products:
        threading.Thread(target=lambda: send_email_alert(current_user["email"], alert_products)).start()
        return {"message": f"Expiry alerts sent for {len(alert_products)} products", "products_count": len(alert_products)}
    return {"message": "No products require alerts at this time"}


@router.get("/product-by-barcode/{barcode}")
async def get_product_by_barcode(barcode: str, current_user: dict = Depends(get_current_user)):
    p = products_collection.find_one({"user_id": str(current_user["_id"]), "barcode": barcode})
    if p: return {"product_name": p["product_name"], "barcode": barcode, "source": "user_inventory", "category": p.get("category", "Other")}
    
    from utils import get_product_from_open_facts, categorize_product
    ofp = get_product_from_open_facts(barcode)
    if ofp: 
        ofp["category"] = categorize_product(ofp["product_name"])
        return ofp
        
    raise HTTPException(status_code=404, detail="Product not found")


@router.post("/parse-voice")
async def parse_voice(data: dict = Body(...)):
    transcript = data.get('transcript', '').strip()
    if not transcript:
        return {"error": "Empty transcript received."}

    from ai_service import ai_service
    
    try:
        if ai_service.is_enabled():
            extracted = ai_service.extract_structured_data(transcript)
            if extracted:
                return extracted
        
        # Fallback to Gemini if Open Model is not enabled
        if GEMINI_API_KEY:
            # Keep existing Gemini logic as fallback for safety
            llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                google_api_key=GEMINI_API_KEY,
                temperature=0
            )
            # ... (the rest of the fallback is handled by the try/except block below which I'll preserve)
    except Exception as e:
        print(f"[parse-voice] AI Service failed: {e}")

    try:
        # Re-initialize variables for fallback
        today_dt = datetime.now()
        today_str = today_dt.strftime('%d/%m/%Y')
        tomorrow_str = (today_dt + timedelta(days=1)).strftime('%d/%m/%Y')
        days_to_monday = (7 - today_dt.weekday()) % 7 or 7
        next_monday_str = (today_dt + timedelta(days=days_to_monday)).strftime('%d/%m/%Y')
        
        VOICE_PROMPT = """You extract product info from a spoken sentence. Return ONLY raw JSON, no markdown.

Rules:
- "product_name": the item noun only (1-3 words). Remove verbs like will/expire/going to/expires/expiring.
- "expiry_date": as DD/MM/YYYY. Today = {today}. "tomorrow" = {tomorrow}. Relative dates use today as base.
- Do NOT include category in your response.

Examples:
- "milk will expire tomorrow" -> {{"product_name": "Milk", "expiry_date": "{tomorrow}"}}
- "milk expires tomorrow" -> {{"product_name": "Milk", "expiry_date": "{tomorrow}"}}
- "bread best before 15th March 2025" -> {{"product_name": "Bread", "expiry_date": "15/03/2025"}}
- "paracetamol use by next Monday" -> {{"product_name": "Paracetamol", "expiry_date": "{next_monday}"}}
- "orange juice expires in 3 months" -> {{"product_name": "Orange Juice", "expiry_date": null}}

Sentence: '{sentence}'"""

        if GEMINI_API_KEY:
            prompt = PromptTemplate(
                input_variables=["sentence", "today", "tomorrow", "next_monday"],
                template=VOICE_PROMPT
            )
            chain = prompt | llm
            result = chain.invoke({
                "sentence": transcript,
                "today": today_str,
                "tomorrow": tomorrow_str,
                "next_monday": next_monday_str,
            })
            content = result.content if hasattr(result, 'content') else str(result)
            def strip_markdown_fences(text: str) -> str:
                text = text.strip()
                text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
                text = re.sub(r'\s*```$', '', text)
                return text.strip()
            content = strip_markdown_fences(content)
            extracted = json.loads(content)

            name = extracted.get('product_name')
            if name and str(name) not in ('null', 'None', ''):
                filler = re.compile(
                    r'\b(will|would|shall|is|are|going|gone|expire[sd]?|expiring|'
                    r'khatam|ho jayega|kal|tomorrow|use by|best before|today|soon)\b.*',
                    re.IGNORECASE | re.DOTALL
                )
                name = filler.sub('', name).strip().title()
                name = ' '.join(name.split()[:3]) if name else None
                extracted['product_name'] = name or None
            else:
                extracted['product_name'] = None

            expiry_raw = extracted.get('expiry_date')
            if expiry_raw and str(expiry_raw) not in ('null', 'None', ''):
                parsed_date = dateparser.parse(
                    str(expiry_raw),
                    settings={"PREFER_DAY_OF_MONTH": "last", "DATE_ORDER": "DMY",
                              "RELATIVE_BASE": today_dt}
                )
                extracted['expiry_date'] = parsed_date.strftime('%d/%m/%Y') if parsed_date else None
            else:
                extracted['expiry_date'] = None

            from utils import categorize_product
            if extracted.get('product_name'):
                extracted['category'] = categorize_product(extracted['product_name'])
            else:
                extracted['category'] = 'Other'
            
            # Map back to ExtractedExpiryData shape slightly
            extracted["item_name"] = extracted.get("product_name")
            return extracted

    except Exception as e:
        print(f"[parse-voice] LLM call failed: {e}. Falling back to regex.")

        # ── Regex fallback ────────────────────────────────────────────────────
        expiry_date, product_name = None, None

        # Extended date patterns: ordinal, month-year, numeric, relative
        date_patterns = [
            r'\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}',
            r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}',
            r'\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}',
            r'(?:in\s+)?\d+\s+months?',
            r'(?:tomorrow|day after tomorrow|next\s+\w+)',
        ]
        for pat in date_patterns:
            m = re.search(pat, transcript, re.IGNORECASE)
            if m:
                expiry_date = m.group(0)
                break

        # Extract product name with smarter filtering
        # Try to find common verbs/expire markers
        markers = r'(?:is\s+)?(?:going\s+to\s+)?(?:expires?|expiring|expire|khatam|ho\s+jayega|best\s+before|use\s+by|will|expir)'
        prod_match = re.search(r'(?:(?:add|log|record|put|put\s+the)\s+)?(.*?)\s+' + markers, transcript, re.IGNORECASE)
        
        if prod_match:
            product_name = prod_match.group(1).strip()
            # Clean up leading 'the', 'a', 'an'
            product_name = re.sub(r'^(?:the|a|an)\s+', '', product_name, flags=re.IGNORECASE)
            # Clean up trailing filler verbs
            product_name = re.sub(r'\b(will|is|are|going|gone|shall|expires?|expiring)\b.*', '', product_name, flags=re.IGNORECASE | re.DOTALL).strip().title()
        
        if not product_name:
            # Last-ditch: first word if nothing else worked
            words = transcript.split()
            if words: product_name = words[0].title()

        # Parse and normalise the extracted date string
        if expiry_date:
            parsed = dateparser.parse(
                expiry_date,
                settings={"PREFER_DAY_OF_MONTH": "last", "DATE_ORDER": "DMY"}
            )
            expiry_date = parsed.strftime('%d/%m/%Y') if parsed else None

        if not product_name and not expiry_date:
            return {"error": "Could not understand the spoken input. Please try speaking clearly with product name and date.", "transcript": transcript}

        from utils import categorize_product
        category = categorize_product(product_name) if product_name else "Other"
        return {"product_name": product_name, "expiry_date": expiry_date, "category": category}