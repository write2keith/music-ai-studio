import numpy as np
import scipy.io.wavfile as wav
from pathlib import Path
from ..config import get_settings

settings = get_settings()


def split_lead_backing(vocals_path: str) -> dict:
    sr, data = wav.read(vocals_path)
    orig_dtype = data.dtype
    if data.ndim > 1:
        data = data.mean(axis=1)
    audio = data.astype(np.float32) / 32767.0 if np.issubdtype(orig_dtype, np.integer) else data.astype(np.float32)

    frame_size = 1024
    hop = 256
    num_frames = (len(audio) - frame_size) // hop + 1
    frame_rms = np.zeros(num_frames)
    for i in range(num_frames):
        frame_rms[i] = np.sqrt(np.mean(audio[i * hop:i * hop + frame_size] ** 2) + 1e-10)

    median_rms = np.median(frame_rms)
    lead_thresh = median_rms * 1.3

    lead_mask = np.zeros(len(audio), dtype=np.float32)
    backing_mask = np.zeros(len(audio), dtype=np.float32)

    for i in range(num_frames):
        start = i * hop
        end = min(start + frame_size, len(audio))
        w = np.hanning(end - start) if end <= start + frame_size else np.ones(end - start)
        if frame_rms[i] >= lead_thresh:
            lead_mask[start:end] += w[:end - start]
        else:
            backing_mask[start:end] += w[:end - start]

    lead_mask = np.clip(lead_mask, 0, 1)
    backing_mask = np.clip(backing_mask, 0, 1)

    # Smooth masks
    smooth_len = hop * 3
    kernel = np.ones(smooth_len) / smooth_len
    lead_mask = np.convolve(lead_mask, kernel, mode="same")
    backing_mask = np.convolve(backing_mask, kernel, mode="same")

    lead = audio * lead_mask
    backing = audio * backing_mask
    instrumental = audio * (1.0 - lead_mask - backing_mask + 0.3)  # residual/mix

    base = Path(vocals_path).stem
    out_dir = Path(settings.STEMS_DIR) / f"leadback_{base}"
    out_dir.mkdir(parents=True, exist_ok=True)

    lead_path = str(out_dir / "lead_vocals.wav")
    backing_path = str(out_dir / "backing_vocals.wav")
    inst_path = str(out_dir / "vocal_instrumental.wav")

    for path, sig in [(lead_path, lead), (backing_path, backing), (inst_path, instrumental)]:
        p = np.max(np.abs(sig))
        if p > 0:
            sig = sig / p * 0.95
        wav.write(path, sr, (sig * 32767).astype(np.int16))

    return {
        "lead_path": lead_path,
        "backing_path": backing_path,
        "instrumental_path": inst_path,
        "sample_rate": sr,
        "duration": len(audio) / sr,
        "lead_ratio": float(np.sum(lead_mask) / max(len(lead_mask), 1)),
    }
