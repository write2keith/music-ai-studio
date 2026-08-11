import numpy as np
import scipy.io.wavfile as wav
from pathlib import Path
from ..config import get_settings

settings = get_settings()


def split_lead_backing(
    vocals_path: str,
    method: str = "auto",
    lyrics_text: str = "",
    stereo_aware: bool = True,
) -> dict:
    import soundfile as sf
    data, sr = sf.read(vocals_path)
    is_stereo = data.ndim > 1 and data.shape[1] >= 2

    if data.ndim > 1:
        left = data[:, 0].astype(np.float32)
        right = data[:, 1].astype(np.float32) if data.shape[1] >= 2 else left.copy()
    else:
        left = right = data.astype(np.float32)

    audio_mono = (left + right) / 2.0

    frame_size = 1024
    hop = 256
    n_frames = max(1, (len(audio_mono) - frame_size) // hop + 1)

    # ── Build per-method masks ──────────────────────────────────
    masks = []

    # 1. Energy mask (always computed as baseline)
    energy_mask = _energy_mask(audio_mono, frame_size, hop)
    masks.append(("energy", energy_mask))

    # 2. F0 polyphony mask
    if method in ("auto", "polyphony", "hybrid"):
        try:
            poly_mask = _polyphony_mask(audio_mono, sr, frame_size, hop)
            masks.append(("polyphony", poly_mask))
        except Exception:
            pass

    # 3. Lyric alignment mask
    if lyrics_text.strip() and method in ("auto", "hybrid", "lyric"):
        try:
            lyric_mask = _lyric_alignment_mask(audio_mono, sr, lyrics_text, frame_size, hop)
            masks.append(("lyric", lyric_mask))
        except Exception:
            pass

    # 4. M/S stereo mask
    if stereo_aware and is_stereo and method in ("auto", "hybrid", "stereo"):
        try:
            ms_mask = _mid_side_mask(left, right, frame_size, hop)
            masks.append(("stereo", ms_mask))
        except Exception:
            pass

    # ── Combine masks ───────────────────────────────────────────
    if len(masks) == 1:
        lead_mask = masks[0][1]
        used_method = masks[0][0]
    else:
        weights = {"energy": 0.3, "polyphony": 0.35, "lyric": 0.15, "stereo": 0.2}
        lead_mask = np.zeros(len(audio_mono), dtype=np.float32)
        total_w = 0
        for name, m in masks:
            w = weights.get(name, 0.25)
            lead_mask += m * w
            total_w += w
        lead_mask /= max(total_w, 1e-10)
        used_method = "+".join(n for n, _ in masks)

    # ── Threshold & smooth ──────────────────────────────────────
    backing_mask = 1.0 - lead_mask

    smooth_len = hop * 3
    kernel = np.hanning(smooth_len)
    kernel /= kernel.sum()
    lead_mask = np.convolve(lead_mask, kernel, mode="same")
    backing_mask = np.convolve(backing_mask, kernel, mode="same")

    lead_mask = np.clip(lead_mask, 0, 1)
    backing_mask = np.clip(backing_mask, 0, 1)

    lead = audio_mono * lead_mask
    backing = audio_mono * backing_mask
    instrumental = audio_mono - lead - backing

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
        "duration": len(audio_mono) / sr,
        "lead_ratio": float(np.sum(lead_mask) / max(len(lead_mask), 1)),
        "method": used_method,
    }


# ── Energy (Legacy RMS) ────────────────────────────────────────

def _energy_mask(audio: np.ndarray, frame_size: int = 1024, hop: int = 256) -> np.ndarray:
    n_frames = max(1, (len(audio) - frame_size) // hop + 1)
    frame_rms = np.zeros(n_frames, dtype=np.float32)
    for i in range(n_frames):
        frame_rms[i] = np.sqrt(np.mean(audio[i * hop:i * hop + frame_size] ** 2) + 1e-10)

    median_rms = np.median(frame_rms)
    lead_thresh = median_rms * 1.3

    mask = np.zeros(len(audio), dtype=np.float32)
    for i in range(n_frames):
        start = i * hop
        end = min(start + frame_size, len(audio))
        w = np.hanning(end - start)
        val = 1.0 if frame_rms[i] >= lead_thresh else 0.0
        mask[start:end] += w[:end - start] * val

    return np.clip(mask, 0, 1)


# ── F0 Polyphony Analysis ──────────────────────────────────────

def _polyphony_mask(audio: np.ndarray, sr: int, frame_size: int = 1024, hop: int = 256) -> np.ndarray:
    import librosa

    fmin_hz, fmax_hz = 65.0, 1200.0
    f0, voiced_flag, voiced_prob = librosa.pyin(
        audio, fmin=fmin_hz, fmax=fmax_hz, sr=sr,
        frame_length=frame_size, hop_length=hop,
    )

    stft = librosa.stft(audio, n_fft=frame_size, hop_length=hop)
    mag = np.abs(stft)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=frame_size)
    freq_res = freqs[1] - freqs[0] if len(freqs) > 1 else sr / frame_size

    n_frames = min(len(f0), mag.shape[1])
    mask = np.ones(n_frames, dtype=np.float32)

    for f in range(n_frames):
        if not voiced_flag[f] or f0[f] <= 0 or voiced_prob[f] < 0.4:
            mask[f] = 0.2
            continue

        spectrum = mag[:, f]
        noise_floor = np.median(spectrum)

        # Count harmonics of the dominant F0
        harmonic_peaks = 0
        alien_peaks = 0
        max_harmonic = 9
        f0_val = f0[f]

        for h in range(1, max_harmonic + 1):
            hf = f0_val * h
            if hf > sr / 2:
                break
            bin_idx = int(round(hf / freq_res))
            win = max(1, int(round(fmin_hz / freq_res / 2)))
            lo = max(0, bin_idx - win)
            hi = min(len(spectrum) - 1, bin_idx + win)

            if lo < hi:
                peak_val = np.max(spectrum[lo:hi + 1])
                peak_pos_rel = (np.argmax(spectrum[lo:hi + 1]) - win) * freq_res
                if peak_val > noise_floor * 2 and abs(peak_pos_rel) < fmin_hz:
                    harmonic_peaks += 1

        # Scan for non-harmonic spectral peaks
        total_bins = min(len(spectrum), int(sr / 2 / freq_res))
        peak_threshold = noise_floor * 4
        for b in range(1, total_bins - 1):
            if spectrum[b] > peak_threshold and spectrum[b] > spectrum[b - 1] and spectrum[b] > spectrum[b + 1]:
                peak_hz = b * freq_res
                is_harmonic = False
                for h in range(1, max_harmonic + 1):
                    if abs(peak_hz - f0_val * h) < fmin_hz:
                        is_harmonic = True
                        break
                if not is_harmonic:
                    alien_peaks += 1

        # Score: high harmonic peaks + low alien peaks = lead
        #        low harmonic peaks + high alien peaks = backing/harmonies
        if harmonic_peaks >= 3 and alien_peaks <= 2:
            mask[f] = 0.9
        elif harmonic_peaks >= 2 and alien_peaks <= 3:
            mask[f] = 0.65
        elif alien_peaks > harmonic_peaks:
            mask[f] = 0.15
        else:
            mask[f] = 0.4

    return _frames_to_sample_mask(mask, len(audio), frame_size, hop)


# ── Lyric Forced Alignment ─────────────────────────────────────

def _lyric_alignment_mask(
    audio: np.ndarray, sr: int, lyrics_text: str,
    frame_size: int = 1024, hop: int = 256,
) -> np.ndarray:
    n_frames = max(1, (len(audio) - frame_size) // hop + 1)
    mask = np.full(n_frames, 0.5, dtype=np.float32)

    # Attempt word-level alignment via Whisper or phonetic DTW
    try:
        words = _align_words(audio, sr, lyrics_text)
    except Exception:
        words = []

    if not words:
        # Fallback: mark lyrics text as full lead
        return np.ones(len(audio), dtype=np.float32)

    for w in words:
        start_frame = max(0, int(w["start"] * sr / hop))
        end_frame = min(n_frames, int(w["end"] * sr / hop) + 1)
        mask[start_frame:end_frame] = 0.9  # word regions = strong lead

    # Fade between word boundaries
    kernel = np.hanning(hop)
    kernel /= kernel.sum()
    mask = np.convolve(mask, kernel, mode="same")

    return _frames_to_sample_mask(np.clip(mask, 0.05, 1), len(audio), frame_size, hop)


def _align_words(audio: np.ndarray, sr: int, lyrics_text: str) -> list:
    try:
        from transformers import pipeline

        pipe = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-tiny",
            chunk_length_s=30,
            return_timestamps="word",
        )
        result = pipe({"raw": audio, "sampling_rate": sr})
        chunks = result.get("chunks", [])
        return [
            {"start": c["timestamp"][0] or 0, "end": c["timestamp"][1] or len(audio) / sr}
            for c in chunks if "timestamp" in c
        ]
    except Exception:
        return _dtw_lyric_heuristic(audio, sr, lyrics_text)


def _dtw_lyric_heuristic(audio: np.ndarray, sr: int, lyrics_text: str) -> list:
    import librosa

    # Simple energy-based onset detection divided by word count
    onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units="time")

    words = [w for w in lyrics_text.split() if len(w) > 1]
    if not words or len(onsets) < 2:
        return []

    aligned = []
    duration = len(audio) / sr
    seg_dur = duration / len(words)

    for i, _ in enumerate(words):
        t_start = i * seg_dur
        t_end = min((i + 1) * seg_dur, duration)

        # Find nearest onset to snap to
        for o in onsets:
            if abs(o - t_start) < seg_dur * 0.3:
                t_start = o
                break

        aligned.append({"start": t_start, "end": t_end})

    return aligned


# ── Mid-Side Stereo Analysis ───────────────────────────────────

def _mid_side_mask(
    left: np.ndarray, right: np.ndarray,
    frame_size: int = 1024, hop: int = 256,
) -> np.ndarray:
    n_frames = max(1, (len(left) - frame_size) // hop + 1)
    mask = np.ones(n_frames, dtype=np.float32)

    for i in range(n_frames):
        start = i * hop
        end = min(start + frame_size, len(left))

        l_seg = left[start:end]
        r_seg = right[start:end]

        m = (l_seg + r_seg) / 2.0  # mid = center
        s = (l_seg - r_seg) / 2.0  # side = stereo width

        m_rms = np.sqrt(np.mean(m ** 2) + 1e-10)
        s_rms = np.sqrt(np.mean(s ** 2) + 1e-10)

        ms_ratio = m_rms / max(s_rms, 1e-10)

        # M >> S = center-focused = lead vocal
        # S dominant = wide stereo = backing/harmonies
        if ms_ratio > 3.0:
            mask[i] = 0.9
        elif ms_ratio > 1.5:
            mask[i] = 0.7
        elif ms_ratio > 0.8:
            mask[i] = 0.4
        else:
            mask[i] = 0.1

    return _frames_to_sample_mask(mask, len(left), frame_size, hop)


# ── Utility ────────────────────────────────────────────────────

def _frames_to_sample_mask(
    frame_mask: np.ndarray, total_samples: int,
    frame_size: int = 1024, hop: int = 256,
) -> np.ndarray:
    mask = np.zeros(total_samples, dtype=np.float32)
    n_frames = len(frame_mask)
    for i in range(n_frames):
        start = i * hop
        end = min(start + frame_size, total_samples)
        w = np.hanning(end - start)
        mask[start:end] += w[:end - start] * frame_mask[i]
    return np.clip(mask, 0, 1)
