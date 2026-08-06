import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone

import torch
import torchaudio
import scipy.io.wavfile

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MODEL = None
PROCESSOR = None
MODEL_ID = f"facebook/musicgen-{settings.MUSICGEN_MODEL_SIZE}"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def get_output_dir() -> Path:
    path = Path(settings.UPLOAD_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _load_model():
    global MODEL, PROCESSOR
    if MODEL is not None:
        return MODEL, PROCESSOR

    logger.info(f"Loading MusicGen model: {MODEL_ID} on {DEVICE}")
    from transformers import AutoProcessor, MusicgenForConditionalGeneration

    PROCESSOR = AutoProcessor.from_pretrained(MODEL_ID)
    MODEL = MusicgenForConditionalGeneration.from_pretrained(MODEL_ID)
    MODEL = MODEL.to(DEVICE)
    MODEL.eval()

    logger.info("MusicGen model loaded successfully")
    return MODEL, PROCESSOR


def generate(prompt: str, duration: int = 10) -> tuple[str, float]:
    model, processor = _load_model()

    logger.info(f"Generating: prompt='{prompt[:80]}...', duration={duration}s")

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


def get_model_info() -> dict:
    return {
        "model": MODEL_ID,
        "device": DEVICE,
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU only",
        "loaded": MODEL is not None,
    }
