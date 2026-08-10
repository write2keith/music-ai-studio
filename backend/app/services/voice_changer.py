import numpy as np
import scipy.io.wavfile as wav
import scipy.signal as sig
from pathlib import Path
from ..config import get_settings

settings = get_settings()

_CREPE_LOADED = False
_CREPE_MODEL = None
_RVC_AVAILABLE = False
_HUBERT_MODEL = None


def _load_crepe():
    global _CREPE_LOADED, _CREPE_MODEL
    if _CREPE_LOADED:
        return _CREPE_MODEL
    try:
        import torchcrepe
        _CREPE_MODEL = torchcrepe
        _CREPE_LOADED = True
    except ImportError:
        _CREPE_MODEL = None
        _CREPE_LOADED = True
    return _CREPE_MODEL


def _load_hubert():
    global _HUBERT_MODEL
    if _HUBERT_MODEL is not None:
        return _HUBERT_MODEL
    try:
        from transformers import HubertModel, Wav2Vec2FeatureExtractor
        import torch
        _HUBERT_MODEL = {
            "model": HubertModel.from_pretrained("facebook/hubert-base-ls960"),
            "extractor": Wav2Vec2FeatureExtractor.from_pretrained("facebook/hubert-base-ls960"),
            "torch": torch,
        }
    except Exception:
        _HUBERT_MODEL = False
    return _HUBERT_MODEL


def _check_rvc():
    global _RVC_AVAILABLE
    if _RVC_AVAILABLE:
        return True
    try:
        import rvc_python
        _RVC_AVAILABLE = True
    except ImportError:
        _RVC_AVAILABLE = False
    return _RVC_AVAILABLE


def change_voice(audio_path: str, semitones: int = 0, formant_shift: float = 0.0, method: str = "auto") -> dict:
    if method == "auto":
        crepe = _load_crepe()
        method = "crepe" if crepe else "spectral"
    elif method == "crepe" and not _load_crepe():
        method = "spectral"
    elif method == "rvc" and not _check_rvc():
        method = "crepe" if _load_crepe() else "spectral"

    if method == "crepe":
        return _change_voice_crepe(audio_path, semitones, formant_shift)
    elif method == "rvc":
        return _change_voice_rvc(audio_path, semitones, formant_shift)
    else:
        return _change_voice_spectral(audio_path, semitones, formant_shift)


def _load_audio(audio_path: str):
    sr, data = wav.read(audio_path)
    orig_dtype = data.dtype
    if data.ndim > 1:
        data = data.mean(axis=1)
    audio = data.astype(np.float32) / 32767.0 if np.issubdtype(orig_dtype, np.integer) else data.astype(np.float32)
    return sr, audio


def _write_output(audio_path: str, shifted: np.ndarray, sr: int, semitones: int, formant_shift: float, method: str) -> dict:
    peak = np.max(np.abs(shifted))
    if peak > 0:
        shifted = shifted / peak * 0.95

    suffix = f"_p{semitones}" if semitones else ""
    suffix += f"_f{int(formant_shift)}" if formant_shift else ""
    suffix += f"_{method}"
    output_path = str(Path(settings.EDITS_DIR) / f"voicechanged_{Path(audio_path).stem}{suffix}.wav")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    wav.write(output_path, sr, (shifted * 32767).astype(np.int16))

    return {
        "changed_path": output_path,
        "sample_rate": sr,
        "duration": len(shifted) / sr,
        "semitones": semitones,
        "formant_shift": formant_shift,
        "method": method,
    }


# ── Spectral (Legacy) ──────────────────────────────────────────

def _change_voice_spectral(audio_path: str, semitones: int = 0, formant_shift: float = 0.0) -> dict:
    sr, audio = _load_audio(audio_path)
    shifted = audio.copy()

    if semitones != 0:
        pitch_factor = 2 ** (semitones / 12.0)
        resampled_len = int(len(audio) / pitch_factor)
        resampled = sig.resample(audio, resampled_len)
        shifted = _time_stretch(resampled, len(audio))

    if formant_shift != 0:
        shifted = _shift_formants(shifted, sr, formant_shift)

    return _write_output(audio_path, shifted, sr, semitones, formant_shift, "spectral")


# ── CREPE Neural Pitch Shift ───────────────────────────────────

def _extract_f0_crepe(audio: np.ndarray, sr: int) -> np.ndarray:
    torchcrepe = _load_crepe()
    if torchcrepe is None:
        return None
    import torch

    with torch.no_grad():
        audio_t = torch.from_numpy(audio).unsqueeze(0)
        f0, periodicity = torchcrepe.predict(
            audio_t, sr, hop_length=256,
            fmin=65, fmax=1200, model="full",
            batch_size=512, device="cpu",
        )
        # f0 shape: (1, n_frames)
        f0 = f0.squeeze(0).cpu().numpy()
        voicing = periodicity.squeeze(0).cpu().numpy()
        f0[voicing < 0.3] = 0.0
        return f0


def _interpolate_f0_frames(audio_len: int, f0_frames: np.ndarray, hop_length: int = 256, sr: int = 22050) -> np.ndarray:
    if f0_frames is None:
        return None
    n_frames = len(f0_frames)
    frame_times = np.arange(n_frames) * hop_length / sr
    out_times = np.arange(audio_len) / sr
    voiced = f0_frames > 0
    if not voiced.any():
        return np.zeros(audio_len, dtype=np.float32)
    f0_interp = np.interp(out_times, frame_times, f0_frames, left=0, right=0)
    return f0_interp.astype(np.float32)


def _pitch_shift_phase_vocoder(audio: np.ndarray, sr: int, semitones: int, f0_interp: np.ndarray = None) -> np.ndarray:
    import librosa

    if f0_interp is None or not f0_interp.any():
        return librosa.effects.pitch_shift(y=audio, sr=sr, n_steps=semitones, res_type="soxr_hq")

    return librosa.effects.pitch_shift(y=audio, sr=sr, n_steps=semitones, bins_per_octave=24, res_type="soxr_hq")


def _change_voice_crepe(audio_path: str, semitones: int = 0, formant_shift: float = 0.0) -> dict:
    sr, audio = _load_audio(audio_path)

    target_sr = 16000
    if sr != target_sr:
        import librosa
        audio_16k = librosa.resample(audio, orig_sr=sr, target_sr=target_sr)
    else:
        audio_16k = audio.copy()
        target_sr = sr

    shifted = audio.copy()

    if semitones != 0:
        f0_frames = _extract_f0_crepe(audio_16k, target_sr)
        f0_interp = _interpolate_f0_frames(len(audio), f0_frames, hop_length=256, sr=target_sr)

        if f0_interp is not None and f0_interp.any():
            shifted = _pitch_shift_phase_vocoder(audio, sr, semitones, f0_interp)
        else:
            import librosa
            shifted = librosa.effects.pitch_shift(y=audio, sr=sr, n_steps=semitones, res_type="soxr_hq")

    if formant_shift != 0:
        shifted = _shift_formants(shifted, sr, formant_shift)

    return _write_output(audio_path, shifted, sr, semitones, formant_shift, "crepe")


# ── RVC Neural Voice Conversion ────────────────────────────────

def _change_voice_rvc(audio_path: str, semitones: int = 0, formant_shift: float = 0.0) -> dict:
    global _RVC_AVAILABLE

    if not _check_rvc():
        return _change_voice_crepe(audio_path, semitones, formant_shift)

    sr, audio = _load_audio(audio_path)

    try:
        import rvc_python
        import torch

        audio_t = torch.from_numpy(audio).unsqueeze(0).float()
        kwargs = {}
        if semitones != 0:
            kwargs["f0_up_key"] = semitones
        if formant_shift != 0:
            kwargs["formant_shift"] = formant_shift

        result = rvc_python.infer(audio_t, sr, **kwargs)
        if isinstance(result, torch.Tensor):
            shifted = result.squeeze(0).cpu().numpy()
        else:
            shifted = np.array(result).squeeze()
    except Exception:
        return _change_voice_crepe(audio_path, semitones, formant_shift)

    return _write_output(audio_path, shifted, sr, semitones, formant_shift, "rvc")


# ── Helpers ────────────────────────────────────────────────────

def _time_stretch(audio: np.ndarray, target_len: int) -> np.ndarray:
    if len(audio) == target_len:
        return audio
    return sig.resample(audio, target_len)


def _shift_formants(audio: np.ndarray, sr: int, shift: float) -> np.ndarray:
    n_fft = 2048
    hop = n_fft // 4
    num_frames = (len(audio) - n_fft) // hop + 1
    result = np.zeros(len(audio), dtype=np.float32)

    for i in range(num_frames):
        start = i * hop
        segment = audio[start:start + n_fft]
        if len(segment) < n_fft:
            break
        windowed = segment * np.hanning(n_fft)
        spec = np.fft.rfft(windowed)
        mag = np.abs(spec)
        phase = np.angle(spec)

        idx = np.arange(len(mag), dtype=np.float64)
        warped_idx = np.clip(idx * (2 ** (-shift / 12.0)), 0, len(mag) - 1)
        warped_mag = np.zeros_like(mag)
        for j in range(len(mag)):
            wi = int(warped_idx[j])
            frac = warped_idx[j] - wi
            warped_mag[j] = mag[wi] * (1 - frac) + mag[min(wi + 1, len(mag) - 1)] * frac

        warped_spec = warped_mag * np.exp(1j * phase)
        result[start:start + n_fft] += np.fft.irfft(warped_spec) * np.hanning(n_fft)

    return result
