from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    app_name: str = "GreenPulse API"
    database_url: str = "sqlite:///./data/greenpulse.db"
    gemini_api_key: str = ""
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    session_hours: int = Field(default=8, ge=1, le=24)

    class Config:
        env_file = ".env"

settings = Settings()
