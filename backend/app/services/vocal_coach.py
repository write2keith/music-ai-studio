import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

# Constants
FMIN = 65.0        # ~C2
FMAX = 1200.0      # ~D6
HOP_LENGTH = 256   # ~5.8ms at 44.1kHz — fine enough for DTW alignment
IN_TUNE_CENTS = 25.0
COMPOSITE_WEIGHTS = {
    "pitch_accuracy": 0.45,
    "stability": 0.25,
    "timing": 0.15,
    "dynamics": 0.15,
}


def extract_pitch_pyin(audio_path: str) -> dict:
    """Extract F0 contour using Librosa's probabilistic YIN (pyin).

    Returns a dict with keys:
        times: 1D float array of timestamps (seconds)
        f0: 1D float array of fundamental frequencies (Hz, NaN for unvoiced)
        voiced_flag: 1D bool array — True = voiced, False = unvoiced/silence
        voiced_prob: 1D float array — pyin's voiced probability [0,1]
        rms: 1D float array — RMS energy contour
    """
    import librosa

    data, sr = librosa.load(str(audio_path), sr=None, mono=True)
    data = data.astype(np.float32)
    max_val = np.max(np.abs(data))
    if max_val > 0:
        data = data / max_val

    # pyin requires >= 22050 sample rate for robustness
    if sr < 22050:
        data = librosa.resample(data, orig_sr=sr, target_sr=22050)
        sr = 22050

    # Stage 1: PYIN F0 extraction
    f0, voiced_flag, voiced_prob = librosa.pyin(
        data,
        fmin=FMIN,
        fmax=FMAX,
        sr=sr,
        hop_length=HOP_LENGTH,
        fill_na=np.nan,
        center=True,
    )
    times = librosa.frames_to_time(
        np.arange(len(f0)), sr=sr, hop_length=HOP_LENGTH,
    )

    # Stage 2: RMS energy contour (same hop length for alignment)
    rms = librosa.feature.rms(
        y=data, frame_length=2048, hop_length=HOP_LENGTH,
    )[0]
    if len(rms) < len(f0):
        rms = np.pad(rms, (0, len(f0) - len(rms)), mode="edge")

    return {
        "times": times,
        "f0": f0,
        "voiced_flag": voiced_flag,
        "voiced_prob": voiced_prob,
        "rms": rms.astype(np.float64),
    }


def hz_to_midi(hz: float) -> float:
    if hz <= 0 or np.isnan(hz):
        return -1.0
    return 69.0 + 12.0 * np.log2(hz / 440.0)


def hz_to_cents(user_hz: float, ref_hz: float) -> float:
    """Compute cent deviation of user_freq from ref_freq.
    Positive = user is sharp, negative = flat."""
    if ref_hz <= 0 or user_hz <= 0 or np.isnan(ref_hz) or np.isnan(user_hz):
        return 0.0
    return 1200.0 * np.log2(user_hz / ref_hz)


def compute_dtw_alignment(ref_f0: np.ndarray, user_f0: np.ndarray) -> tuple[list, float]:
    """Align user F0 contour to reference using Dynamic Time Warping.

    Returns (warping_path, normalized_cost) where:
        warping_path: list of (ref_idx, user_idx) alignment pairs
        normalized_cost: DTW cumulative cost / path length (0 = perfect alignment)
    """
    from librosa.sequence import dtw

    # Replace NaN with 0 for DTW computation (avoid undefined distances)
    ref_clean = np.nan_to_num(ref_f0, nan=0.0)
    user_clean = np.nan_to_num(user_f0, nan=0.0)

    # Use log-frequency to make cents-like distance metric
    ref_log = np.zeros_like(ref_clean)
    user_log = np.zeros_like(user_clean)
    mask_ref = ref_clean > 0
    mask_user = user_clean > 0
    ref_log[mask_ref] = np.log2(ref_clean[mask_ref])
    user_log[mask_user] = np.log2(user_clean[mask_user])

    # DTW on log-frequency feature matrix
    D, wp = dtw(ref_log.reshape(1, -1), user_log.reshape(1, -1))
    # wp is shape (N, 2) — each row is [ref_idx, user_idx]

    # Normalized cost: divide by path length
    norm_cost = float(D[-1, -1]) / max(len(wp), 1)

    return [(int(r), int(u)) for r, u in wp], norm_cost


def _find_sustained_note_segments(f0: np.ndarray, voiced: np.ndarray, times: np.ndarray) -> list[tuple[int, int]]:
    """Find continuous voiced segments >= 150ms for stability analysis."""
    segments = []
    in_segment = False
    seg_start = 0

    for i in range(len(f0)):
        if voiced[i] and not np.isnan(f0[i]):
            if not in_segment:
                in_segment = True
                seg_start = i
        else:
            if in_segment:
                duration = times[i - 1] - times[seg_start]
                if duration >= 0.15 and (i - seg_start) >= 3:
                    segments.append((seg_start, i - 1))
                in_segment = False

    if in_segment:
        duration = times[-1] - times[seg_start]
        if duration >= 0.15 and (len(f0) - seg_start) >= 3:
            segments.append((seg_start, len(f0) - 1))

    return segments


def _score_pitch_accuracy(ref_f0: np.ndarray, user_f0: np.ndarray,
                          ref_voiced: np.ndarray, user_voiced: np.ndarray) -> dict:
    """Score pitch accuracy in cents. Only evaluated on frames where BOTH are voiced."""
    both_voiced = ref_voiced & user_voiced
    if not np.any(both_voiced):
        return {"cents_mad": 999, "cents_std": 999, "score": 0, "in_tune_pct": 0}

    cent_deviations = []
    for i in range(len(ref_f0)):
        if both_voiced[i]:
            cents = hz_to_cents(user_f0[i], ref_f0[i])
            cent_deviations.append(abs(cents))

    cents_arr = np.array(cent_deviations)
    mad = float(np.mean(cents_arr))   # Mean Absolute Deviation in cents
    std = float(np.std(cents_arr))

    in_tune = np.sum(cents_arr <= IN_TUNE_CENTS)
    in_tune_pct = round(in_tune / len(cents_arr) * 100, 1)

    # Map MAD to 0-100: MAD=0 = 100, MAD=50 = 80, MAD=100 = 50, MAD=200 = 20
    score = max(0, min(100, 100 - 40 * (mad / 50.0)))

    return {
        "cents_mad": round(mad, 1),
        "cents_std": round(std, 1),
        "score": round(score, 1),
        "in_tune_pct": in_tune_pct,
    }


def _score_stability(ref_f0: np.ndarray, user_f0: np.ndarray,
                     ref_voiced: np.ndarray, user_voiced: np.ndarray,
                     times: np.ndarray) -> dict:
    """Score pitch stability (vibrato control) on sustained note segments.

    For each sustained segment:
        - Compute F0 standard deviation in cents
        - Detect vibrato rate (4-8 Hz FM modulation) — 0 = no vibrato, 1 = clean vibrato
        - Lower variance = higher score (controlled vibrato or steady tone)
    """
    segments = _find_sustained_note_segments(ref_f0, ref_voiced & user_voiced, times)
    if not segments:
        return {"f0_variance_cents": 999, "vibrato_rate_hz": 0, "score": 50}

    segment_variances = []
    vibrato_rates = []

    for seg_start, seg_end in segments:
        seg_f0 = user_f0[seg_start:seg_end + 1]
        seg_f0 = seg_f0[~np.isnan(seg_f0) & (seg_f0 > 0)]
        if len(seg_f0) < 4:
            continue

        # Convert to cents around the mean
        f0_mean = np.mean(seg_f0)
        if f0_mean <= 0:
            continue
        f0_cents = 1200.0 * np.log2(seg_f0 / f0_mean)
        var_cents = float(np.var(f0_cents))
        segment_variances.append(var_cents)

        # Estimate vibrato rate via autocorrelation of F0
        if len(f0_cents) >= 16:
            ac = np.correlate(f0_cents - np.mean(f0_cents),
                              f0_cents - np.mean(f0_cents), mode="full")
            ac = ac[len(ac) // 2:]
            ac = ac / max(ac[0], 1e-12)
            # Find first peak after lag 3 (~17ms) — look in 4-8 Hz range
            dt = times[seg_start + 1] - times[seg_start]
            min_lag = max(3, int(1.0 / (8.0 * dt)))
            max_lag = min(len(ac) - 1, int(1.0 / (4.0 * dt)))
            if max_lag > min_lag:
                peak_lag = int(np.argmax(ac[min_lag:max_lag + 1])) + min_lag
                if ac[peak_lag] > 0.3:
                    vibrato_rates.append(1.0 / (peak_lag * dt))

    if not segment_variances:
        return {"f0_variance_cents": 999, "vibrato_rate_hz": 0, "score": 50}

    mean_var = float(np.mean(segment_variances))
    mean_vibrato = float(np.mean(vibrato_rates)) if vibrato_rates else 0.0

    # Score: professional vibrato is 5-7 Hz with moderate variance (10-40 cents^2)
    # Steady tone (var < 5) = perfect stability = 100
    # Low variance (5-30) = good = 85-95
    # Moderate variance (30-100) = acceptable vibrato = 70-85
    # High variance (>200) = pitchy/wobbly = <50
    if mean_var < 5:
        score = 100.0
    elif mean_var < 30:
        score = 95.0 - (mean_var - 5) * 0.4
    elif mean_var < 100:
        score = 85.0 - (mean_var - 30) * 0.25
    elif mean_var < 300:
        score = 67.5 - (mean_var - 100) * 0.09
    else:
        score = max(10, 50 - (mean_var - 300) * 0.05)

    return {
        "f0_variance_cents": round(mean_var, 1),
        "vibrato_rate_hz": round(mean_vibrato, 1),
        "score": round(score, 1),
    }


def _score_timing(dtw_norm_cost: float, duration_ratio: float) -> dict:
    """Score rhythmic/timing alignment from DTW cost.

    dtw_norm_cost: normalized DTW cumulative cost (per-step log-frequency distance)
    duration_ratio: user_duration / ref_duration (1.0 = same length)
    """
    # DTW cost: 0 is perfect; typical values range 0.01-5.0
    # Duration ratio: 0.8-1.2 is good; outside is rushing/dragging
    cost_score = max(0, min(100, 100 - dtw_norm_cost * 25))

    if 0.85 <= duration_ratio <= 1.15:
        dur_score = 100.0
    elif 0.7 <= duration_ratio <= 1.3:
        dur_score = 80.0
    elif 0.5 <= duration_ratio <= 1.5:
        dur_score = 60.0
    else:
        dur_score = 30.0

    score = cost_score * 0.7 + dur_score * 0.3

    return {
        "dtw_cost": round(dtw_norm_cost, 4),
        "duration_ratio": round(duration_ratio, 3),
        "score": round(score, 1),
    }


def _score_dynamics(ref_rms: np.ndarray, user_rms: np.ndarray) -> dict:
    """Score breath support / dynamics via RMS energy contour correlation.

    Uses Pearson correlation of RMS envelopes + RMS std ratio as proxy for
    dynamic range matching.
    """
    if len(ref_rms) == 0 or len(user_rms) == 0:
        return {"rms_correlation": 0, "dynamic_range_match": 0, "score": 50}

    # Time-scale user to match ref length (linear stretch)
    if len(user_rms) != len(ref_rms):
        indices = np.linspace(0, len(user_rms) - 1, len(ref_rms))
        user_aligned = np.interp(indices, np.arange(len(user_rms)), user_rms)
    else:
        user_aligned = user_rms

    # Pearson correlation of RMS contours
    ref_zeroed = ref_rms - np.mean(ref_rms)
    user_zeroed = user_aligned - np.mean(user_aligned)
    denom = np.std(ref_zeroed) * np.std(user_zeroed)
    if denom > 1e-12:
        corr = float(np.dot(ref_zeroed, user_zeroed) / (len(ref_rms) * denom))
    else:
        corr = 0.0

    # Dynamic range match: ratio of std deviations
    ref_std = np.std(ref_rms)
    user_std = np.std(user_aligned)
    if ref_std > 1e-10:
        dr_match = min(user_std / ref_std, ref_std / user_std)
    else:
        dr_match = 0.0
    dr_match = max(0, min(1, dr_match))

    score = (max(0, corr) * 70) + (dr_match * 30)
    score = max(0, min(100, score))

    return {
        "rms_correlation": round(corr, 3),
        "dynamic_range_match": round(dr_match, 3),
        "score": round(score, 1),
    }


def _grade(score: float) -> str:
    if score >= 95:
        return "S"
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    if score >= 40:
        return "D"
    return "F"


def score_vocal_performance(audio_ref_path: str, audio_user_path: str) -> dict:
    """Full multi-dimensional vocal scoring pipeline:
    1. Extract F0 + RMS with pyin
    2. DTW time alignment
    3. Score 4 pillars: pitch accuracy, stability, timing, dynamics
    4. Compute weighted composite
    """
    import librosa

    # Extract F0 contours
    ref = extract_pitch_pyin(audio_ref_path)
    user = extract_pitch_pyin(audio_user_path)

    ref_f0 = ref["f0"]
    user_f0 = user["f0"]
    ref_voiced = ref["voiced_flag"]
    user_voiced = user["voiced_flag"]

    # Compute DTW alignment path and cost
    wp, dtw_cost = compute_dtw_alignment(ref_f0, user_f0)

    # Score 4 dimensions
    pitch = _score_pitch_accuracy(ref_f0, user_f0, ref_voiced, user_voiced)
    stability = _score_stability(ref_f0, user_f0, ref_voiced, user_voiced, ref["times"])

    user_dur = user["times"][-1] if len(user["times"]) > 0 else 1
    ref_dur = ref["times"][-1] if len(ref["times"]) > 0 else 1
    dur_ratio = user_dur / max(ref_dur, 0.01)
    timing = _score_timing(dtw_cost, dur_ratio)

    dynamics = _score_dynamics(ref["rms"], user["rms"])

    # Weighted composite
    composite = (
        pitch["score"] * COMPOSITE_WEIGHTS["pitch_accuracy"]
        + stability["score"] * COMPOSITE_WEIGHTS["stability"]
        + timing["score"] * COMPOSITE_WEIGHTS["timing"]
        + dynamics["score"] * COMPOSITE_WEIGHTS["dynamics"]
    )
    composite = round(composite, 1)
    grade = _grade(composite)

    # Build simplified contour lists for frontend graphing (every 4th frame)
    step = 4
    build_contour = lambda t, f, v: [
        {"time": round(float(t[i]), 3), "midi": int(round(hz_to_midi(float(f[i])))) if v[i] and not np.isnan(f[i]) else -1}
        for i in range(0, len(f), step)
    ]

    logger.info(
        f"Vocal score: composite={composite}, grade={grade}, "
        f"pitch={pitch['score']}, stability={stability['score']}, "
        f"timing={timing['score']}, dynamics={dynamics['score']}"
    )

    return {
        "composite_score": composite,
        "grade": grade,
        "pitch_accuracy": pitch,
        "stability": stability,
        "timing": timing,
        "dynamics": dynamics,
        "dtw_path": wp,
        "dtw_norm_cost": round(dtw_cost, 4),
        "ref_pitch": build_contour(ref["times"], ref_f0, ref_voiced),
        "user_pitch": build_contour(user["times"], user_f0, user_voiced),
        "ref_duration": round(float(ref_dur), 2),
        "user_duration": round(float(user_dur), 2),
        "ref_voiced_ratio": round(float(np.sum(ref_voiced)) / max(len(ref_voiced), 1), 3),
        "user_voiced_ratio": round(float(np.sum(user_voiced)) / max(len(user_voiced), 1), 3),
    }
