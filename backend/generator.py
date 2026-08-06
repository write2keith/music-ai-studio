import os
import torch
import torchaudio
import logging
import scipy.io.wavfile
from pathlib import Path

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

MUSICGEN_MODEL = None
MUSICGEN_PROCESSOR = None
MODEL_SIZE = os.getenv("MUSICGEN_MODEL_SIZE", "small")
MODEL_ID = f"facebook/musicgen-{MODEL_SIZE}"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def _load_model():
    global MUSICGEN_MODEL, MUSICGEN_PROCESSOR
    if MUSICGEN_MODEL is not None:
        return MUSICGEN_MODEL, MUSICGEN_PROCESSOR

    logger.info(f"Loading MusicGen model: {MODEL_ID} on {DEVICE}")

    from transformers import AutoProcessor, MusicgenForConditionalGeneration

    MUSICGEN_PROCESSOR = AutoProcessor.from_pretrained(MODEL_ID)
    MUSICGEN_MODEL = MusicgenForConditionalGeneration.from_pretrained(MODEL_ID)
    MUSICGEN_MODEL = MUSICGEN_MODEL.to(DEVICE)

    logger.info("MusicGen model loaded")
    return MUSICGEN_MODEL, MUSICGEN_PROCESSOR


def generate_music(prompt: str, duration: int = 10) -> str:
    model, processor = _load_model()

    logger.info(f"Generating music for prompt: {prompt}, duration: {duration}s")

    inputs = processor(
        text=[prompt],
        padding=True,
        return_tensors="pt",
    ).to(DEVICE)

    model.generation_config.max_length = int(duration * model.config.audio_encoder.frame_rate)
    model.generation_config.do_sample = True

    audio_values = model.generate(**inputs)
    audio_data = audio_values[0, 0].cpu().numpy()

    sample_rate = model.config.audio_encoder.sampling_rate

    filename = f"musicgen_{abs(hash(prompt + str(duration)))}.wav"
    filepath = OUTPUT_DIR / filename
    scipy.io.wavfile.write(str(filepath), sample_rate, audio_data)

    logger.info(f"Saved generated music to {filepath}")
    return str(filepath)


def get_model_info() -> dict:
    return {
        "model": MODEL_ID,
        "duration": int(os.getenv("MUSICGEN_DURATION", "10")),
        "loaded": MUSICGEN_MODEL is not None,
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU only",
        "device": DEVICE,
    }
