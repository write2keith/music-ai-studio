import base64
import json
import logging
import uuid
from pathlib import Path
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_active_separation_mode: str | None = None


def set_active_separation_mode(mode: str):
    global _active_separation_mode
    _active_separation_mode = mode


def _check_demucs() -> bool:
    try:
        import subprocess
        from demucs import separate
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return True
    except Exception:
        return False


def _check_cloud() -> bool:
    return bool(settings.HF_TOKEN)


def _use_cloud() -> bool:
    mode = _active_separation_mode or settings.SEPARATION_MODE
    if mode == "cloud":
        return True
    if mode == "local":
        return False
    return not _check_demucs()


def get_stems_dir() -> Path:
    path = Path(settings.STEMS_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _separate_cloud(audio_path: str, model_name: str = "htdemucs") -> dict:
    import requests

    logger.info(f"Cloud separate: {audio_path} (model: {model_name})")

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    audio_ext = Path(audio_path).suffix.lower()
    content_type_map = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".webm": "audio/webm",
    }
    content_type = content_type_map.get(audio_ext, "audio/wav")

    headers = {
        "Authorization": f"Bearer {settings.HF_TOKEN}",
        "Content-Type": content_type,
    }

    resp = requests.post(
        f"https://api-inference.huggingface.co/models/{settings.DEMUCS_MODEL_ID}",
        headers=headers,
        data=audio_bytes,
        timeout=180,
    )

    if resp.status_code == 503:
        logger.info("Model loading on HF, waiting 30s and retrying...")
        import time
        time.sleep(30)
        resp = requests.post(
            f"https://api-inference.huggingface.co/models/{settings.DEMUCS_MODEL_ID}",
            headers=headers,
            data=audio_bytes,
            timeout=180,
        )

    if resp.status_code != 200:
        raise RuntimeError(f"HF API error {resp.status_code}: {resp.text[:200]}")

    result_data = resp.json()
    stems = {}

    if isinstance(result_data, list):
        for item in result_data:
            label = item.get("label", "unknown")
            blob_b64 = item.get("blob", "")
            if blob_b64:
                stem_path = get_stems_dir() / f"{uuid.uuid4().hex}_{label}.wav"
                stem_path.write_bytes(base64.b64decode(blob_b64))
                stems[label] = str(stem_path)
    elif isinstance(result_data, dict):
        if "stems" in result_data:
            for label, blob_b64 in result_data["stems"].items():
                stem_path = get_stems_dir() / f"{uuid.uuid4().hex}_{label}.wav"
                stem_path.write_bytes(base64.b64decode(blob_b64))
                stems[label] = str(stem_path)
        elif isinstance(result_data.get("response"), list):
            for item in result_data["response"]:
                label = item.get("label", "unknown")
                blob_b64 = item.get("blob", "")
                if blob_b64:
                    stem_path = get_stems_dir() / f"{uuid.uuid4().hex}_{label}.wav"
                    stem_path.write_bytes(base64.b64decode(blob_b64))
                    stems[label] = str(stem_path)

    if not stems:
        raise RuntimeError(
            f"Unexpected cloud response format. "
            f"Expected list of stems with label/blob fields. "
            f"Response keys: {list(result_data.keys()) if isinstance(result_data, dict) else 'non-dict'}"
        )

    stems_dir = get_stems_dir()
    logger.info(f"Cloud separation complete. Stems: {list(stems.keys())}")
    return {
        "model": model_name,
        "source": audio_path,
        "stems": stems,
        "stems_dir": str(stems_dir),
        "mp3_stems": _make_mp3s(stems),
    }


def _make_mp3s(stems: dict) -> dict:
    mp3_stems = {}
    try:
        from pydub import AudioSegment
        for name, wav_path in stems.items():
            mp3_path = Path(wav_path).with_suffix(".mp3")
            if not mp3_path.exists():
                AudioSegment.from_wav(wav_path).export(str(mp3_path), format="mp3", bitrate="192k")
            mp3_stems[name] = str(mp3_path)
    except ImportError:
        logger.warning("pydub not available, skipping MP3 conversion")
    except Exception as e:
        logger.warning(f"MP3 conversion failed: {e}")
    return mp3_stems


def wav_to_mp3(wav_path: str, bitrate: str = "192k") -> str:
    """Convert a WAV file to MP3 using ffmpeg. Falls back to WAV path on failure."""
    import subprocess
    mp3_path = Path(wav_path).with_suffix(".mp3")
    if mp3_path.exists():
        return str(mp3_path)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav_path), "-b:a", bitrate, str(mp3_path)],
            capture_output=True, check=True, timeout=120,
        )
        return str(mp3_path)
    except Exception as e:
        logger.warning(f"MP3 conversion failed for {wav_path}: {e}")
        return str(wav_path)


def separate(audio_path: str, model_name: str = "htdemucs") -> dict:
    if _use_cloud():
        if not _check_cloud():
            raise RuntimeError(
                "Cloud separation requires HF_TOKEN. Options:\n"
                "  1. Set HF_TOKEN in your .env for cloud separation (free at https://huggingface.co/settings/tokens)\n"
                "  2. Go to Settings > Stem Separation and select 'Local Demucs' to use your machine\n"
                "  3. Or set SEPARATION_MODE=local in backend/.env"
            )
        return _separate_cloud(audio_path, model_name)

    if not _check_demucs():
        raise RuntimeError(
            "demucs is not installed or ffmpeg is missing. Install with: pip install demucs\n"
            "This requires torch (~2GB) and a GPU with 8GB+ VRAM.\n"
            "On CPU it will be very slow (~10 min per track).\n"
            "Set HF_TOKEN for cloud separation as a fallback."
        )

    logger.info(f"Separating stems: {audio_path} (model: {model_name})")

    from demucs import separate as demucs_separate

    output_base = get_stems_dir()

    if model_name == "htdemucs_ft":
        demucs_separate.main([
            "--name", model_name,
            "--out", str(output_base),
            "--two-stems", "vocals",
            audio_path,
        ])
    else:
        demucs_separate.main([
            "--name", model_name,
            "--out", str(output_base),
            audio_path,
        ])

    audio_stem = Path(audio_path).stem
    stems_dir = output_base / model_name / audio_stem

    stems = {}
    for f in sorted(stems_dir.glob("*.wav")):
        stems[f.stem] = str(f)

    logger.info(f"Separation complete. Stems: {list(stems.keys())}")
    return {
        "model": model_name,
        "source": audio_path,
        "stems": stems,
        "stems_dir": str(stems_dir),
        "mp3_stems": _make_mp3s(stems),
    }


def get_separator_info() -> dict:
    return {
        "demucs_available": _check_demucs(),
        "cloud_available": _check_cloud(),
        "mode": "cloud" if _use_cloud() else "local",
    }
