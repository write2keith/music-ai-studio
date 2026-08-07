import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Server
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "http://localhost:3000"

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/music_ai"

    # Redis (Queue)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    AUTH_SECRET: str = "change-me-in-production-use-a-64-char-random-string"
    AUTH_GOOGLE_CLIENT_ID: str = ""
    AUTH_GOOGLE_CLIENT_SECRET: str = ""
    AUTH_GITHUB_CLIENT_ID: str = ""
    AUTH_GITHUB_CLIENT_SECRET: str = ""

    # AI Models
    MUSICGEN_MODEL_SIZE: str = "small"
    MUSICGEN_DURATION: int = 10
    HF_TOKEN: str = ""
    GENERATION_MODE: str = "auto"  # auto, local, cloud
    SEPARATION_MODE: str = "auto"  # auto, local, cloud
    DEMUCS_MODEL_ID: str = "facebook/htdemucs"

    # Cloud Storage (S3/R2)
    STORAGE_PROVIDER: str = "local"
    S3_BUCKET: str = ""
    S3_REGION: str = "auto"
    S3_ENDPOINT: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    # GPU Serverless (Modal)
    MODAL_TOKEN_ID: str = ""
    MODAL_TOKEN_SECRET: str = ""
    MODAL_ENVIRONMENT: str = "dev"

    # Payments
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_ID_BASIC: str = ""
    STRIPE_PRICE_ID_PRO: str = ""

    # LLM (Prompt Enhancement)
    USER_LLM_API_KEY: str = ""
    USER_LLM_BASE_URL: str = "https://api.deepseek.com/v1"
    USER_LLM_MODEL: str = "deepseek-chat"

    # File Storage
    UPLOAD_DIR: str = "./output/uploads"
    EDITS_DIR: str = "./output/edits"
    STEMS_DIR: str = "./output/stems"
    MAX_UPLOAD_SIZE_MB: int = 100
    FILE_RETENTION_HOURS: int = 24

    # Rate Limiting
    RATE_LIMIT_GENERATIONS_PER_HOUR: int = 20
    RATE_LIMIT_SEPARATIONS_PER_HOUR: int = 50
    FREE_TIER_CREDITS: int = 10

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
