import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone

import numpy as np
import scipy.io.wavfile

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MODEL_ID = f"facebook/musicgen-{settings.MUSICGEN_MODEL_SIZE}"

MODEL = None
PROCESSOR = None
DEVICE = "cpu"
TORCH_AVAILABLE = False
CLOUD_AVAILABLE = bool(settings.HF_TOKEN)

try:
    import torch
    import torchaudio
    from transformers import AutoProcessor, MusicgenForConditionalGeneration

    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    TORCH_AVAILABLE = True
except ImportError:
    logger.info("torch not installed - music generation will use cloud API")
    torch = None
    torchaudio = None


def _use_cloud() -> bool:
    mode = settings.GENERATION_MODE
    if mode == "cloud":
        return True
    if mode == "local":
        return False
    return not TORCH_AVAILABLE


def get_output_dir() -> Path:
    path = Path(settings.UPLOAD_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _load_model():
    global MODEL, PROCESSOR
    if MODEL is not None:
        return MODEL, PROCESSOR

    logger.info(f"Loading MusicGen model: {MODEL_ID} on {DEVICE}")
    PROCESSOR = AutoProcessor.from_pretrained(MODEL_ID)
    MODEL = MusicgenForConditionalGeneration.from_pretrained(MODEL_ID)
    MODEL = MODEL.to(DEVICE)
    MODEL.eval()
    logger.info("MusicGen model loaded successfully")
    return MODEL, PROCESSOR


def _generate_cloud(prompt: str, duration: int = 10) -> tuple[str, float]:
    import requests

    logger.info(f"Cloud generate: prompt='{prompt[:80]}...', duration={duration}s")

    headers = {"Authorization": f"Bearer {settings.HF_TOKEN}"}
    payload = {
        "inputs": prompt,
        "parameters": {"max_new_tokens": duration * 50},
    }

    resp = requests.post(
        f"https://api-inference.huggingface.co/models/{MODEL_ID}",
        headers=headers,
        json=payload,
        timeout=120,
    )

    if resp.status_code == 503:
        logger.info("Model loading on HF, waiting 30s and retrying...")
        import time
        time.sleep(30)
        resp = requests.post(
            f"https://api-inference.huggingface.co/models/{MODEL_ID}",
            headers=headers,
            json=payload,
            timeout=120,
        )

    if resp.status_code != 200:
        raise RuntimeError(f"HF API error {resp.status_code}: {resp.text[:200]}")

    filename = f"gen_{uuid.uuid4().hex[:12]}.wav"
    filepath = get_output_dir() / filename

    with open(filepath, "wb") as f:
        f.write(resp.content)

    try:
        sample_rate, audio_data = scipy.io.wavfile.read(str(filepath))
        actual_duration = len(audio_data) / sample_rate if sample_rate > 0 else 10
    except Exception:
        actual_duration = 10

    logger.info(f"Cloud generated {actual_duration:.1f}s -> {filepath}")
    return str(filepath), actual_duration


def _generate_local(prompt: str, duration: int = 10) -> tuple[str, float]:
    model, processor = _load_model()

    logger.info(f"Local generate: prompt='{prompt[:80]}...', duration={duration}s")

    inputs = processor(
        text=[prompt],
        padding=True,
        return_tensors="pt",
    ).to(DEVICE)

    audio_frames_per_second = model.config.audio_encoder.frame_rate
    model.generation_config.max_length = int(duration * audio_frames_per_second)
    model.generation_config.do_sample = True
    model.generation_config.temperature = 1.0
    model.generation_config.top_k = 250
    model.generation_config.top_p = 0.0

    with torch.no_grad():
        audio_values = model.generate(**inputs)

    audio_data = audio_values[0, 0].cpu().numpy()
    sample_rate = model.config.audio_encoder.sampling_rate

    filename = f"gen_{uuid.uuid4().hex[:12]}.wav"
    filepath = get_output_dir() / filename
    scipy.io.wavfile.write(str(filepath), sample_rate, audio_data)

    actual_duration = len(audio_data) / sample_rate
    logger.info(f"Generated {actual_duration:.1f}s of audio -> {filepath}")

    return str(filepath), actual_duration


def generate(prompt: str, duration: int = 10) -> tuple[str, float]:
    if _use_cloud():
        if not CLOUD_AVAILABLE:
            raise RuntimeError(
                "Cloud generation requires HF_TOKEN. "
                "Get a free token at https://huggingface.co/settings/tokens"
            )
        return _generate_cloud(prompt, duration)

    if not TORCH_AVAILABLE:
        raise RuntimeError(
            "torch is not installed and HF_TOKEN is not set. "
            "Install torch for local generation or set HF_TOKEN for cloud generation. "
            "Get a free token at https://huggingface.co/settings/tokens"
        )

    return _generate_local(prompt, duration)


def get_model_info() -> dict:
    return {
        "model": MODEL_ID,
        "mode": "cloud" if _use_cloud() else "local",
        "device": DEVICE,
        "gpu_available": TORCH_AVAILABLE and torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if TORCH_AVAILABLE and torch.cuda.is_available() else "CPU only",
        "loaded": MODEL is not None,
        "cloud_available": CLOUD_AVAILABLE,
        "local_available": TORCH_AVAILABLE,
    }
