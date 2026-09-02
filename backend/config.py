from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "GreenPulse API"
    database_url: str = "sqlite:///./data/greenpulse.db"
    gemini_api_key: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
