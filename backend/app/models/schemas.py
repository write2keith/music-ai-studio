from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime
from enum import Enum


class GenerationStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class StemModel(str, Enum):
    HTDEMUCS = "htdemucs"
    HTDEMUCS_FT = "htdemucs_ft"
    HTDEMUCS_6S = "htdemucs_6s"


# --- Request Schemas ---

class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    duration: int = Field(default=10, ge=5, le=30)
    project_id: Optional[str] = None

    @field_validator("prompt")
    @classmethod
    def sanitize_prompt(cls, v: str) -> str:
        return v.strip()


class SeparateRequest(BaseModel):
    model: StemModel = Field(default=StemModel.HTDEMUCS)


class TrimRequest(BaseModel):
    start_sec: float = Field(default=0.0, ge=0)
    end_sec: float = Field(default=0.0, ge=0)


class FadeRequest(BaseModel):
    fade_in: float = Field(default=0.0, ge=0, le=30)
    fade_out: float = Field(default=0.0, ge=0, le=30)


class VolumeRequest(BaseModel):
    gain_db: float = Field(default=0.0, ge=-60, le=60)


class NormalizeRequest(BaseModel):
    target_db: float = Field(default=-1.0, ge=-24, le=0)


class SpeedRequest(BaseModel):
    factor: float = Field(default=1.0, ge=0.25, le=4.0)


class EffectsRequest(BaseModel):
    reverb_room_size: float = Field(default=0.0, ge=0, le=1.0)
    reverb_wet: float = Field(default=0.0, ge=0, le=1.0)
    delay_seconds: float = Field(default=0.0, ge=0, le=2.0)
    delay_feedback: float = Field(default=0.0, ge=0, le=1.0)
    delay_mix: float = Field(default=0.0, ge=0, le=1.0)
    eq_low_gain: float = Field(default=0.0, ge=-24, le=24)
    eq_mid_gain: float = Field(default=0.0, ge=-24, le=24)
    eq_high_gain: float = Field(default=0.0, ge=-24, le=24)
    compressor_threshold: float = Field(default=0.0, ge=-60, le=0)
    compressor_ratio: float = Field(default=4.0, ge=1.0, le=20.0)
    gain_db: float = Field(default=0.0, ge=-24, le=24)
    speed_factor: float = Field(default=1.0, ge=0.25, le=4.0)


# --- Response Schemas ---

class AudioResponse(BaseModel):
    url: str
    filename: str
    duration: Optional[float] = None


class StemResponse(BaseModel):
    model: str
    stems: dict[str, str]


class GenerationJobResponse(BaseModel):
    job_id: str
    status: GenerationStatus
    project_id: Optional[str] = None
    result: Optional[AudioResponse] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    gpu_available: bool
    gpu_name: Optional[str] = None


class ErrorResponse(BaseModel):
    error: str
    code: str
    detail: Optional[str] = None
