from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..config import get_settings
from ..services.generator import get_model_info, MODEL_ID as default_model

router = APIRouter(prefix="/api/settings", tags=["settings"])
settings = get_settings()

AVAILABLE_PROVIDERS = [
    {
        "id": "huggingface",
        "name": "HuggingFace",
        "description": "Free cloud inference via HuggingFace API",
        "type": "cloud",
        "model": "facebook/musicgen-small",
        "needs_token": True,
        "free_tier": True,
        "url": "https://huggingface.co/settings/tokens",
    },
    {
        "id": "local-musicgen",
        "name": "Local MusicGen",
        "description": "Run MusicGen on your GPU (requires torch + 8GB VRAM)",
        "type": "local",
        "model": "facebook/musicgen-small",
        "needs_token": False,
        "free_tier": True,
        "needs_hardware": "NVIDIA GPU 8GB+ VRAM",
    },
    {
        "id": "replicate",
        "name": "Replicate",
        "description": "Cloud GPU inference via replicate.com",
        "type": "cloud",
        "model": "meta/musicgen",
        "needs_token": True,
        "free_tier": False,
        "url": "https://replicate.com/account/api-tokens",
    },
    {
        "id": "fal",
        "name": "Fal.ai",
        "description": "Fast serverless GPU inference",
        "type": "cloud",
        "model": "fal-ai/musicgen",
        "needs_token": True,
        "free_tier": False,
        "url": "https://fal.ai/dashboard/keys",
    },
]


class GenerationSettings(BaseModel):
    provider: str = "auto"
    model_id: str = ""
    hf_token: str = ""


_active_provider = "auto"
_active_model = ""
_active_hf_token = ""


@router.get("")
async def get_settings_root():
    return {"ok": True, "routes": ["/api/settings/generation"]}


@router.get("/generation")
async def get_generation_settings():
    model_info = get_model_info()
    return {
        "current_provider": _active_provider,
        "current_model": _active_model or default_model,
        "effective_mode": model_info["mode"],
        "cloud_available": model_info["cloud_available"],
        "local_available": model_info["local_available"],
        "gpu_available": model_info["gpu_available"],
        "gpu_name": model_info["gpu_name"],
        "providers": AVAILABLE_PROVIDERS,
        "hf_token_configured": bool(settings.HF_TOKEN or _active_hf_token),
    }


@router.post("/generation")
async def update_generation_settings(body: GenerationSettings, request: Request):
    global _active_provider, _active_model, _active_hf_token

    valid_providers = {p["id"] for p in AVAILABLE_PROVIDERS} | {"auto"}
    if body.provider not in valid_providers:
        return {"error": f"Unknown provider: {body.provider}"}, 400

    _active_provider = body.provider
    _active_model = body.model_id if body.model_id else ""
    _active_hf_token = body.hf_token if body.hf_token else ""

    provider = next((p for p in AVAILABLE_PROVIDERS if p["id"] == body.provider), None)
    effective_model = body.model_id or (provider["model"] if provider else default_model)

    return {
        "ok": True,
        "provider": _active_provider,
        "model": effective_model,
        "token_set": bool(_active_hf_token),
    }


# ── Separation Settings ───────────────────────────────────────

class SeparationSettings(BaseModel):
    mode: str = "auto"
    hf_token: str = ""

_active_sep_mode = "auto"
_active_sep_token = ""

SEPARATION_PROVIDERS = [
    {
        "id": "auto",
        "name": "Auto-detect",
        "description": "Use local Demucs if torch available, cloud otherwise",
        "type": "auto",
        "needs_token": False,
    },
    {
        "id": "local",
        "name": "Local Demucs",
        "description": "Run Demucs on your machine (CPU or GPU, ~8 min per song on CPU)",
        "type": "local",
        "needs_token": False,
        "needs_hardware": "CPU or GPU, 4GB+ RAM",
    },
    {
        "id": "cloud",
        "name": "Cloud (HuggingFace)",
        "description": "Fast cloud separation via HuggingFace Inference API",
        "type": "cloud",
        "needs_token": True,
        "free_tier": True,
    },
]


@router.get("/separation")
async def get_separation_settings():
    import torch
    local_available = True
    try:
        from demucs import pretrained
        pretrained.get_model("htdemucs")
    except Exception:
        local_available = False

    return {
        "current_mode": _active_sep_mode or settings.SEPARATION_MODE,
        "providers": SEPARATION_PROVIDERS,
        "local_available": local_available,
        "cloud_available": bool(settings.HF_TOKEN or _active_sep_token),
        "hf_token_configured": bool(settings.HF_TOKEN or _active_sep_token),
        "gpu_available": torch.cuda.is_available() if local_available else False,
    }


@router.post("/separation")
async def update_separation_settings(body: SeparationSettings):
    global _active_sep_mode, _active_sep_token

    valid_modes = {p["id"] for p in SEPARATION_PROVIDERS}
    if body.mode not in valid_modes:
        return {"error": f"Unknown mode: {body.mode}"}, 400

    _active_sep_mode = body.mode
    if body.hf_token:
        _active_sep_token = body.hf_token

    from ..services.separator import set_active_separation_mode
    set_active_separation_mode(body.mode)

    return {
        "ok": True,
        "mode": _active_sep_mode,
        "token_set": bool(settings.HF_TOKEN or _active_sep_token),
    }


# ── LLM Settings ──────────────────────────────────────────────

class LLMSettings(BaseModel):
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-chat"


@router.get("/llm")
async def get_llm_settings():
    return {
        "ok": True,
        "configured": bool(settings.USER_LLM_API_KEY),
        "base_url": settings.USER_LLM_BASE_URL,
        "model": settings.USER_LLM_MODEL,
    }


@router.post("/llm")
async def update_llm_settings(body: LLMSettings):
    return {
        "ok": True,
        "message": "Set USER_LLM_API_KEY, USER_LLM_BASE_URL, USER_LLM_MODEL in your .env file. Runtime override not available for LLM keys.",
        "configured": bool(settings.USER_LLM_API_KEY),
    }
