import os
import json
from datetime import datetime
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Optional, List

class ExtractedExpiryData(BaseModel):
    item_name: str = Field(description="The name of the item, product, document, or subscription.")
    category: str = Field(description="Category of the item (e.g., Grocery, Warranty, Subscription, Medicine, Document, Other).")
    purchase_date: Optional[str] = Field(description="Purchase date or issue date in YYYY-MM-DD format if available.", default=None)
    expiry_date: Optional[str] = Field(description="Expiry date or renewal date in YYYY-MM-DD format if available.", default=None)
    expiry_type: str = Field(description="Type of expiry (e.g., expiry, warranty, subscription, renewal, return_window).", default="expiry")
    document_type: Optional[str] = Field(description="Type of document (e.g., Warranty Certificate, Passport, Policy) if applicable.", default=None)
    provider: Optional[str] = Field(description="Company or provider name if clearly visible.", default=None)
    reference_number: Optional[str] = Field(description="Reference, policy, or certificate number if clearly visible.", default=None)
    confidence: float = Field(description="Confidence score between 0.0 and 1.0.", default=0.9)

class SearchFilter(BaseModel):
    category: Optional[str] = None
    expiry_type: Optional[str] = None
    days_remaining_max: Optional[int] = None
    days_remaining_min: Optional[int] = None
    risk_level: Optional[str] = None
    action_status: Optional[str] = None

class AIService:
    def __init__(self):
        self.api_key = os.getenv("OPEN_MODEL_API_KEY", "")
        self.base_url = os.getenv("OPEN_MODEL_BASE_URL", "https://openrouter.ai/api/v1")
        self.model_name = os.getenv("OPEN_MODEL_NAME", "google/gemma-4-26b-a4b-it")
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url) if self.api_key else None

    def is_enabled(self):
        return self.client is not None

    def extract_structured_data(self, text: str) -> dict:
        if not self.is_enabled():
            return None

        today_str = datetime.now().strftime("%Y-%m-%d")
        prompt = f"""
You are an expert AI that extracts expiry information from unstructured text, OCR, or voice transcripts.
Extract the relevant details and return them in JSON format. Do not include markdown formatting or extra text.
Only extract information actually present. Do NOT invent dates or names. If a field is missing, return null.

Today's date is: {today_str}. Use this to resolve relative dates like 'tomorrow', 'next week'.

Text to analyze:
"{text}"

Required JSON structure:
{{
  "item_name": "String",
  "category": "String (Products, Groceries, Documents, Certificates, Licenses, Warranties, Subscriptions, Memberships, Insurance, Contracts, Return windows, Other)",
  "purchase_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "expiry_type": "String (expiry, warranty, subscription, renewal, return_window)",
  "document_type": "String or null",
  "provider": "String or null",
  "reference_number": "String or null",
  "confidence": "Float between 0.0 and 1.0"
}}
"""
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are a helpful data extraction assistant. Always respond with pure valid JSON matching the exact requested structure."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            content = response.choices[0].message.content
            
            content = content.strip()
            if content.startswith("```json"): content = content[7:]
            if content.startswith("```"): content = content[3:]
            if content.endswith("```"): content = content[:-3]
            content = content.strip()
                
            data = json.loads(content)
            return ExtractedExpiryData(**data).model_dump()
        except Exception as e:
            print(f"AI Service Extraction Error: {e}")
            return None

    def calculate_risk(self, item_name: str, category: str, expiry_type: str, days_remaining: int, action_status: str = "Active") -> dict:
        """
        Deterministic Risk and Priority Calculation System.
        """
        if days_remaining is None:
            return {"score": 0, "level": "unknown", "reasons": ["No expiry date available."], "priority": "Low"}

        score = 0
        reason_parts = []
        priority = "Low"

        # Action status modifier
        if action_status == "Completed":
            return {"score": 0, "level": "low", "reasons": ["Action already completed."], "priority": "Low"}

        if days_remaining < 0:
            score += 100
            reason_parts.append(f"Item is already overdue by {abs(days_remaining)} days.")
            priority = "Critical"
        elif days_remaining <= 3:
            score += 80
            reason_parts.append(f"Extremely close to expiry ({days_remaining} days).")
            priority = "Critical"
        elif days_remaining <= 7:
            score += 50
            reason_parts.append(f"Expiring very soon ({days_remaining} days).")
            priority = "High"
        elif days_remaining <= 30:
            score += 20
            reason_parts.append(f"Expiring in {days_remaining} days.")
            priority = "Medium"
        else:
            score += 5
            reason_parts.append(f"Ample time remaining ({days_remaining} days).")
            priority = "Low"

        high_risk_categories = ["Document", "Medicine", "Subscription", "Warranty", "Insurance", "Certificate", "License"]
        if category in high_risk_categories or expiry_type in ["subscription", "warranty", "renewal"]:
            if days_remaining <= 30 and days_remaining >= 0:
                score += 30
                reason_parts.append(f"Important {category.lower()} requiring attention.")
                if priority == "Medium": priority = "High"
            elif days_remaining < 0:
                score += 20
                reason_parts.append(f"Lapsed {category.lower()} may cause issues.")
                priority = "Critical"

        if action_status == "Renewal In Progress":
            score = max(0, score - 40)
            reason_parts.append("Renewal is currently in progress.")
            if priority in ["Critical", "High"]: priority = "Medium"

        score = min(100, max(0, score))

        if score >= 80: level = "high"
        elif score >= 50: level = "medium"
        else: level = "low"

        return {
            "score": score,
            "level": level,
            "reasons": reason_parts,
            "priority": priority
        }
        
    def recommend_action(self, item_name: str, category: str, expiry_type: str, days_remaining: int) -> str:
        if days_remaining is None: return "Review item details."
        if days_remaining < 0:
            if category == "Document": return "Check if late renewal is possible."
            if category == "Subscription": return "Verify if auto-renewed or service suspended."
            if expiry_type == "warranty": return "Warranty has lapsed."
            if category in ["Grocery", "Medicine"]: return "Discard safely."
            return "Item has expired."
        if category == "Document":
            if days_remaining <= 30: return "Start renewal process immediately."
            if days_remaining <= 90: return "Gather documents for upcoming renewal."
        if category == "Subscription" or expiry_type == "subscription":
            if days_remaining <= 7: return "Review before auto-renewal charges apply."
        if expiry_type == "warranty":
            if days_remaining <= 30: return "Check whether a claim or extension is required."
        if category == "Grocery" or category == "Medicine":
            if days_remaining <= 3: return "Consume or use soon to prevent waste."
        if expiry_type == "return_window":
            if days_remaining <= 7: return "Return/replacement window closes soon."
        return "Monitor closely."

    def generate_briefing(self, items: list) -> str:
        if not self.is_enabled() or not items:
            return "You have no items requiring immediate attention."
            
        # Select top priority items
        priority_items = [i for i in items if i.get("priority") in ["Critical", "High"] and i.get("action_status") != "Completed"]
        
        if not priority_items:
            return "All items are currently safe. No immediate action required."

        item_summaries = "\\n".join([f"- {i.get('product_name', 'Item')} ({i.get('category')}): Expires on {i.get('expiry_date')}. Risk Level: {i.get('risk_level')}." for i in priority_items[:5]])
        
        prompt = f"""
Summarize the following high-priority expiry items into a very concise, readable 'Expiry Briefing' (2-3 sentences max).
Do not invent dates or facts. Do not use markdown.

Items:
{item_summaries}
"""
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=150
            )
            return response.choices[0].message.content.strip()
        except Exception:
            return "You have items that require attention soon. Please check your priority queue."

    def parse_natural_search(self, query: str) -> dict:
        if not self.is_enabled(): return {}
        
        prompt = f"""
You are an AI that converts natural language search queries into a structured JSON filter for an expiry tracking database.
Do not invent fields. Only output JSON matching the exact schema.

Allowed Categories: Products, Groceries, Documents, Certificates, Licenses, Warranties, Subscriptions, Memberships, Insurance, Contracts, Return windows, Other.
Allowed Expiry Types: expiry, warranty, subscription, renewal, return_window.
Allowed Risk Levels: low, medium, high.
Allowed Action Statuses: Active, Action Required, Renewal In Progress, Completed.

User Query: "{query}"

Required JSON structure (include only fields you confidently extract, omit others):
{{
  "category": "String or null",
  "expiry_type": "String or null",
  "days_remaining_max": "Integer or null (e.g. 'within 30 days' -> 30)",
  "days_remaining_min": "Integer or null",
  "risk_level": "String or null",
  "action_status": "String or null"
}}
"""
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are a pure JSON structured search parser."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0
            )
            content = response.choices[0].message.content.strip()
            if content.startswith("```json"): content = content[7:]
            if content.startswith("```"): content = content[3:]
            if content.endswith("```"): content = content[:-3]
            data = json.loads(content.strip())
            return SearchFilter(**data).model_dump(exclude_none=True)
        except Exception as e:
            print(f"Natural Search Parsing Error: {e}")
            return {}

ai_service = AIService()
