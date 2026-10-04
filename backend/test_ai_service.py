import os
import sys

# Append the directory to sys.path so we can import ai_service
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai_service import ai_service, ExtractedExpiryData

def test_extraction_pipeline():
    print("Testing the extraction pipeline...")
    
    class MockMessage:
        def __init__(self, content):
            self.content = content
            
    class MockChoice:
        def __init__(self, message):
            self.message = message
            
    class MockResponse:
        def __init__(self, content):
            self.choices = [MockChoice(MockMessage(content))]

    class MockCompletions:
        def create(self, **kwargs):
            return MockResponse('```json\n{"item_name": "Dell Inspiron 15", "category": "Warranty", "expiry_date": "2027-04-12", "expiry_type": "warranty", "purchase_date": "2025-04-12", "confidence": 0.95}\n```')
            
    class MockChat:
        def __init__(self):
            self.completions = MockCompletions()
            
    class MockClient:
        def __init__(self):
            self.chat = MockChat()

    # Mock the client
    ai_service.client = MockClient()
    ai_service.api_key = "mock_key"
    
    test_string = "Warranty Certificate. Dell Inspiron 15. Purchased on 12 April 2025. Warranty valid until 12 April 2027."
    print(f"Input: {test_string}")
    
    extracted = ai_service.extract_structured_data(test_string)
    print("\n--- Extracted JSON ---")
    print(extracted)
    
    print("\n--- Testing Risk Engine ---")
    risk_info = ai_service.calculate_risk(
        item_name=extracted.get("item_name"), 
        category=extracted.get("category"), 
        expiry_type=extracted.get("expiry_type"), 
        days_remaining=730 # 2 years remaining approx
    )
    print(f"Risk Score: {risk_info.get('score')}")
    print(f"Risk Level: {risk_info.get('level')}")
    print(f"Risk Reason: {risk_info.get('reason')}")
    
    action = ai_service.recommend_action(
        item_name=extracted.get("item_name"), 
        category=extracted.get("category"), 
        expiry_type=extracted.get("expiry_type"), 
        days_remaining=730
    )
    print(f"Action Recommendation: {action}")
    
    print("\n--- Testing Failure Cases ---")
    
    # 1. Missing API Key
    ai_service.client = None
    ai_service.api_key = None
    result = ai_service.extract_structured_data("test")
    print(f"Missing API Key Result: {result}")
    
    # 2. Malformed JSON
    ai_service.api_key = "mock"
    class MalformedCompletions:
        def create(self, **kwargs):
            return MockResponse('This is not json at all')
    ai_service.client.chat.completions = MalformedCompletions()
    result = ai_service.extract_structured_data("test")
    print(f"Malformed JSON Result: {result}")

if __name__ == "__main__":
    test_extraction_pipeline()
