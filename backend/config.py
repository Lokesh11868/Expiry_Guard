import os
from dotenv import load_dotenv
load_dotenv()
if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017/expiryguard")
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key")
JWT_ALGORITHM = "HS256"
EMAIL_USER = os.getenv("EMAIL_USER", "your-email@gmail.com")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://expiry-guard-frontend.onrender.com").rstrip("/")
OPEN_MODEL_API_KEY = os.getenv("OPEN_MODEL_API_KEY", "")
OPEN_MODEL_BASE_URL = os.getenv("OPEN_MODEL_BASE_URL", "https://openrouter.ai/api/v1")
OPEN_MODEL_NAME = os.getenv("OPEN_MODEL_NAME", "google/gemma-4-26b-a4b-it")
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
