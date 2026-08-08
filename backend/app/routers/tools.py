import uuid
import logging
import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel

from ..config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])
settings = get_settings()


class YouTubeRequest(BaseModel):
    url: str
    mp3: bool = False


class YouTubeResponse(BaseModel):
    ok: bool = True
    title: str = ""
    artist: str = ""
    filename: str = ""
    url: str = ""
    duration_secs: float = 0
    thumbnail: str = ""


class CompressResponse(BaseModel):
    ok: bool = True
    original_size: int = 0
    compressed_size: int = 0
    reduction_pct: float = 0
    filename: str = ""
    url: str = ""
    sample_rate: int = 0
    duration_secs: float = 0
    channels: int = 1


class NoteEvent(BaseModel):
    start_time: float
    end_time: float
    pitch: int
    note_name: str
    velocity: float


class TranscribeResponse(BaseModel):
    ok: bool = True
    notes: list[NoteEvent] = []
    duration_secs: float = 0
    method: str = "fft"
    note_count: int = 0


def _do_extract(url: str, ydl_opts: dict) -> dict:
    import yt_dlp
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=True)


@router.post("/youtube", response_model=YouTubeResponse)
async def download_youtube(body: YouTubeRequest):
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    import re

    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    file_id = uuid.uuid4().hex[:12]
    output_template = str(output_dir / f"yt_{file_id}.%(ext)s")

    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "socket_timeout": 30,
        "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
    }

    try:
        logger.info(f"YouTube extraction started for: {url[:80]}")
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, lambda: _do_extract(url, ydl_opts))
        logger.info("YouTube extraction download complete")
        title = info.get("title", "Unknown")
        uploader = info.get("uploader", "Unknown Artist")
        duration = info.get("duration", 0) or 0
        thumbnail = info.get("thumbnail", "")

        candidates = list(output_dir.glob(f"yt_{file_id}.*"))
        if not candidates:
            raise HTTPException(status_code=500, detail="Download produced no file")

        dl_path = candidates[0]
        dl_ext = dl_path.suffix

        safe_title = re.sub(r'[^\w\-]', '_', title)
        safe_title = re.sub(r'_+', '_', safe_title).strip('_')[:80]
        if not safe_title:
            safe_title = f"youtube_{file_id}"
        safe_name = f"{safe_title}{dl_ext}"
        final_path = output_dir / safe_name
        counter = 1
        while final_path.exists():
            final_path = output_dir / f"{safe_title}_{counter}{dl_ext}"
            counter += 1
        dl_path.rename(final_path)
        filename = final_path.name

        if body.mp3:
            try:
                from pydub import AudioSegment
                audio = AudioSegment.from_file(str(final_path))
                mp3_name = final_path.stem + ".mp3"
                mp3_path = output_dir / mp3_name
                audio.export(str(mp3_path), format="mp3", bitrate="192k")
                final_path.unlink(missing_ok=True)
                filename = mp3_path.name
            except ImportError:
                logger.warning("pydub not available, keeping original format")
            except Exception as e:
                logger.warning(f"MP3 conversion failed: {e}, keeping original format")

        logger.info(f"YouTube: '{title}' by {uploader} -> {filename}")

        return YouTubeResponse(
            ok=True,
            title=title,
            artist=uploader,
            filename=filename,
            url=f"/api/audio/{filename}",
            duration_secs=float(duration),
            thumbnail=thumbnail or "",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"YouTube download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)[:200]}")


@router.post("/compress", response_model=CompressResponse)
async def compress_audio(
    file: UploadFile = File(...),
    sample_rate: int = Form(default=22050),
    bit_depth: int = Form(default=16),
    to_mono: bool = Form(default=True),
    output_format: str = Form(default="wav"),
):
    import numpy as np
    import scipy.io.wavfile as wav

    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    original_content = await file.read()
    original_size = len(original_content)

    ext = Path(file.filename).suffix if file.filename else ".wav"
    tmp_path = output_dir / f"compress_in_{uuid.uuid4().hex[:12]}{ext}"
    tmp_path.write_bytes(original_content)

    wav_path = tmp_path
    try:
        sr, data = wav.read(str(wav_path))
    except Exception:
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(str(tmp_path))
            wav_path = output_dir / f"compress_in_{uuid.uuid4().hex[:12]}.wav"
            audio.export(str(wav_path), format="wav")
            tmp_path.unlink(missing_ok=True)
            sr, data = wav.read(str(wav_path))
        except Exception as e:
            for p in [tmp_path, wav_path]:
                p.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"Unable to read audio file. {str(e)[:100]}",
            )

    if data.ndim > 1:
        if to_mono:
            data = data.mean(axis=1)
        else:
            data = data[:, 0]

    if sample_rate < sr:
        from scipy import signal
        ratio = sample_rate / sr
        new_len = int(len(data) * ratio)
        data = signal.resample(data, new_len)

    dtype = np.int16 if bit_depth == 16 else np.int8
    max_val = np.max(np.abs(data))
    if max_val > 0:
        data = data / max_val
    data = (data * (np.iinfo(dtype).max - 1)).astype(dtype)

    duration = len(data) / sample_rate

    out_ext = "mp3" if output_format == "mp3" else "wav"
    out_filename = f"compressed_{uuid.uuid4().hex[:12]}.{out_ext}"
    out_path = output_dir / out_filename

    wav.write(str(out_path), sample_rate, data)

    if output_format == "mp3":
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_wav(str(out_path))
            mp3_path = output_dir / out_filename
            audio.export(str(mp3_path), format="mp3", bitrate="128k")
            out_path.unlink(missing_ok=True)
            out_path = mp3_path
        except Exception as e:
            logger.warning(f"MP3 export failed, falling back to WAV: {e}")

    compressed_size = out_path.stat().st_size
    reduction_pct = round((1 - compressed_size / original_size) * 100, 1) if original_size > 0 else 0

    for p in [tmp_path, wav_path]:
        p.unlink(missing_ok=True)

    out_filename = out_path.name
    logger.info(f"Compressed: {original_size}B -> {compressed_size}B ({reduction_pct}% reduction) [{out_ext}]")

    return CompressResponse(
        ok=True,
        original_size=original_size,
        compressed_size=compressed_size,
        reduction_pct=reduction_pct,
        filename=out_filename,
        url=f"/api/audio/{out_filename}",
        sample_rate=sample_rate,
        duration_secs=round(duration, 1),
        channels=1 if to_mono else 2,
    )


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _hz_to_note(hz: float) -> tuple[int, str]:
    if hz <= 0:
        return 0, "?"
    midi = int(round(69 + 12 * __import__("math").log2(hz / 440.0)))
    midi = max(0, min(127, midi))
    return midi, f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def _detect_notes_fft(audio_path: str, calibration: dict | None = None) -> dict:
    import numpy as np
    import scipy.io.wavfile as wav

    sr, data = wav.read(str(audio_path))
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    max_val = np.max(np.abs(data))
    if max_val > 0:
        data = data / max_val

    params = calibration or {}
    threshold_mult = params.get("threshold_multiplier", 1.5)
    stability = params.get("stability_frames", 2)
    min_duration_val = params.get("min_duration_sec", 0.04)
    merge_gap_val = params.get("merge_gap_sec", 0.10)

    duration = len(data) / sr
    window_sec = 0.08
    hop_sec = 0.03
    window_samples = int(sr * window_sec)
    hop_samples = int(sr * hop_sec)
    if window_samples > len(data):
        return {"notes": [], "duration_secs": round(duration, 1), "method": "fft"}
    num_windows = (len(data) - window_samples) // hop_samples + 1

    rms_values = []
    for i in range(num_windows):
        start = i * hop_samples
        frame = data[start : start + window_samples]
        rms_values.append(float(np.sqrt(np.mean(frame ** 2))))

    rms_arr = np.array(rms_values)
    nonzero = rms_arr[rms_arr > 1e-6]
    noise_floor = float(np.median(nonzero)) if len(nonzero) > 0 else 1e-6
    threshold = max(0.015, noise_floor * threshold_mult)

    fft_len = window_samples
    freqs = np.fft.rfftfreq(fft_len, 1.0 / sr)
    freq_mask = (freqs >= 30) & (freqs <= 4000)
    valid_freqs = freqs[freq_mask]
    valid_indices = np.where(freq_mask)[0]

    raw_midi = []
    raw_rms = []
    for i in range(num_windows):
        if rms_values[i] < threshold:
            raw_midi.append(-1)
            raw_rms.append(0.0)
            continue

        start = i * hop_samples
        frame = data[start : start + window_samples]
        windowed = frame * np.hanning(len(frame))
        fft = np.abs(np.fft.rfft(windowed, n=fft_len))
        fft_valid = fft[valid_indices]

        peak_rel = int(np.argmax(fft_valid))
        peak_idx = valid_indices[peak_rel]

        if 1 <= peak_rel < len(fft_valid) - 1:
            y0 = fft[peak_idx]
            y_left = fft_valid[peak_rel - 1]
            y_right = fft_valid[peak_rel + 1]
            delta = 0.5 * (y_left - y_right) / (y_left - 2 * y0 + y_right + 1e-10)
            delta = max(-0.5, min(0.5, delta))
            freq = valid_freqs[peak_rel] + delta * (valid_freqs[1] - valid_freqs[0])
        else:
            freq = valid_freqs[peak_rel]

        midi, _ = _hz_to_note(freq)
        raw_midi.append(midi)
        raw_rms.append(rms_values[i])

    stability = 2
    notes = []
    i = 0
    while i < len(raw_midi):
        if raw_midi[i] < 0:
            i += 1
            continue

        segment_midis = [raw_midi[i]]
        segment_rms = [raw_rms[i]]
        j = i + 1
        while j < len(raw_midi):
            if raw_midi[j] < 0:
                break
            mode_midi = max(set(segment_midis), key=segment_midis.count)
            if abs(raw_midi[j] - mode_midi) > 1:
                break
            segment_midis.append(raw_midi[j])
            segment_rms.append(raw_rms[j])
            j += 1

        if len(segment_midis) >= stability:
            midi = round(np.mean(segment_midis))
            name = _hz_to_note(440.0 * 2 ** ((midi - 69) / 12))[1]
            vel = min(1.0, round(float(np.mean(segment_rms)) / max(noise_floor, 1e-6) * 0.3, 2))
            start_t = i * hop_sec + window_sec / 2
            end_t = (j - 1) * hop_sec + window_sec / 2
            notes.append({
                "start_time": round(start_t, 3),
                "end_time": round(end_t, 3),
                "pitch": midi,
                "note_name": name,
                "velocity": vel,
            })

        i = j

    merge_gap = merge_gap_val
    notes = [n for n in notes if n["end_time"] - n["start_time"] >= min_duration_val]

    merged = []
    for n in notes:
        if merged and merged[-1]["pitch"] == n["pitch"] and n["start_time"] - merged[-1]["end_time"] < merge_gap:
            merged[-1]["end_time"] = n["end_time"]
            merged[-1]["velocity"] = round(max(merged[-1]["velocity"], n["velocity"]), 2)
        else:
            merged.append(n)

    return {
        "notes": merged,
        "duration_secs": round(duration, 1),
        "method": "fft",
    }


def _detect_notes_polyphonic(audio_path: str) -> dict:
    import numpy as np
    import scipy.io.wavfile as wav

    sr, data = wav.read(str(audio_path))
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    max_val = np.max(np.abs(data))
    if max_val > 0:
        data = data / max_val

    duration = len(data) / sr

    n_fft = 4096
    hop_samples = n_fft // 4
    num_frames = (len(data) - n_fft) // hop_samples + 1
    if num_frames < 1:
        return {"notes": [], "duration_secs": round(duration, 1), "method": "polyphonic"}

    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    lo_idx = int(40 * n_fft / sr)
    hi_idx = int(4000 * n_fft / sr)
    valid_freqs = freqs[lo_idx:hi_idx + 1]
    valid_len = len(valid_freqs)

    all_frame_notes = []

    for f in range(num_frames):
        start = f * hop_samples
        frame = data[start : start + n_fft]
        rms = float(np.sqrt(np.mean(frame ** 2)))
        if rms < 0.008:
            all_frame_notes.append([])
            continue

        windowed = frame * np.hanning(n_fft)
        spec = np.abs(np.fft.rfft(windowed, n=n_fft))
        spec_valid = spec[lo_idx:hi_idx + 1].copy()
        peak_mag = float(np.max(spec_valid))
        if peak_mag < 1e-6:
            all_frame_notes.append([])
            continue

        frame_notes = []
        work_spec = spec_valid.copy()
        noise_floor = float(np.median(spec[lo_idx:hi_idx + 1])) * 3

        for _ in range(6):
            peak_rel = int(np.argmax(work_spec))
            mag = float(work_spec[peak_rel])
            if mag < noise_floor or mag < peak_mag * 0.08:
                break

            freq = valid_freqs[peak_rel]
            midi, name = _hz_to_note(freq)
            vel = min(1.0, round(mag / max(peak_mag, 1e-6) * 0.6, 2))

            if vel > 0.05:
                frame_notes.append({
                    "pitch": midi,
                    "note_name": name,
                    "velocity": vel,
                })

            for h in [1, 2, 3, 4, 5, 6]:
                hz = freq * h
                hz_idx_exact = hz * n_fft / sr
                center = int(hz_idx_exact) - lo_idx
                bw = max(2, int(hz * 0.03 * n_fft / sr))
                for k in range(max(0, center - bw), min(valid_len, center + bw + 1)):
                    work_spec[k] *= 0.05

        all_frame_notes.append(frame_notes)

    notes = []
    i = 0
    while i < num_frames:
        current = all_frame_notes[i]
        if not current:
            i += 1
            continue

        pitches = tuple(sorted(n["pitch"] for n in current))
        j = i + 1
        while j < num_frames:
            if not all_frame_notes[j]:
                break
            next_pitches = tuple(sorted(n["pitch"] for n in all_frame_notes[j]))
            if len(pitches) != len(next_pitches):
                if len(next_pitches) > 0:
                    overlap = len(set(pitches) & set(next_pitches))
                    if overlap >= max(1, len(pitches) // 2):
                        pitches = next_pitches
                        j += 1
                        continue
                break
            if pitches != next_pitches:
                common = set(pitches) & set(next_pitches)
                if len(common) >= max(1, len(pitches) // 2):
                    pitches = next_pitches
                    j += 1
                    continue
                break
            j += 1

        duration_sec = (j - i) * (hop_samples / sr)
        if duration_sec >= 0.04:
            start_t = i * hop_samples / sr + n_fft / (2 * sr)
            end_t = (j - 1) * hop_samples / sr + n_fft / (2 * sr)
            note_count = 0
            for fnotes in all_frame_notes[i:j]:
                for fn in fnotes:
                    if fn["pitch"] in pitches and fn["pitch"] not in [n["pitch"] for n in notes if n["start_time"] == round(start_t, 3)]:
                        notes.append({
                            "start_time": round(start_t, 3),
                            "end_time": round(end_t, 3),
                            "pitch": fn["pitch"],
                            "note_name": fn["note_name"],
                            "velocity": fn["velocity"],
                        })
                        note_count += 1
                    if note_count >= len(pitches):
                        break

        i = j

    merged = []
    notes.sort(key=lambda n: (n["pitch"], n["start_time"]))
    for n in notes:
        if merged and merged[-1]["pitch"] == n["pitch"] and n["start_time"] - merged[-1]["end_time"] < 0.12:
            merged[-1]["end_time"] = n["end_time"]
            merged[-1]["velocity"] = round(max(merged[-1]["velocity"], n["velocity"]), 2)
        else:
            merged.append(n)

    merged.sort(key=lambda n: n["start_time"])

    return {
        "notes": merged,
        "duration_secs": round(duration, 1),
        "method": "polyphonic",
    }


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_notes(
    file: UploadFile = File(...),
    method: str = Form(default="fft"),
    store_id: str = Form(default="default"),
):
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    tmp_path = output_dir / f"transcribe_{uuid.uuid4().hex[:12]}{ext}"
    tmp_path.write_bytes(content)

    wav_path = tmp_path
    try:
        import scipy.io.wavfile
        scipy.io.wavfile.read(str(wav_path))
    except Exception:
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(str(tmp_path))
            wav_path = output_dir / f"transcribe_{uuid.uuid4().hex[:12]}.wav"
            audio.export(str(wav_path), format="wav")
            tmp_path.unlink(missing_ok=True)
            scipy.io.wavfile.read(str(wav_path))
        except Exception as e:
            for p in [tmp_path, wav_path]:
                p.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail="Unable to read audio file. Supported formats: WAV, MP3, M4A, FLAC, OGG. Ensure ffmpeg is installed for non-WAV formats.",
            )

    try:
        if method == "polyphonic":
            result = _detect_notes_polyphonic(str(wav_path))
        else:
            from ..services.calibration import get_detection_params
            cal = get_detection_params(store_id)
            result = _detect_notes_fft(str(wav_path), cal)
    except Exception as e:
        wav_path.unlink(missing_ok=True)
        if wav_path != tmp_path:
            tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)[:200]}")

    wav_path.unlink(missing_ok=True)
    if wav_path != tmp_path:
        tmp_path.unlink(missing_ok=True)

    return TranscribeResponse(
        ok=True,
        notes=[NoteEvent(**n) for n in result["notes"]],
        duration_secs=result["duration_secs"],
        method=result["method"],
        note_count=len(result["notes"]),
    )


class VocalScoreResponse(BaseModel):
    ok: bool = True
    score: float = 0.0
    max_score: float = 100.0
    grade: str = "F"
    ref_pitch: list[dict] = []
    user_pitch: list[dict] = []
    ref_duration: float = 0.0
    user_duration: float = 0.0
    total_frames: int = 0
    matched_frames: int = 0


def _extract_pitch_contour(audio_path: str) -> list[dict]:
    import numpy as np
    import scipy.io.wavfile as wav

    sr, data = wav.read(str(audio_path))
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    max_val = np.max(np.abs(data))
    if max_val > 0:
        data = data / max_val

    hop_sec = 0.02
    window_sec = 0.06
    window_samples = int(sr * window_sec)
    hop_samples = int(sr * hop_sec)
    num_windows = max(1, (len(data) - window_samples) // hop_samples + 1)
    if window_samples < 1:
        return []

    fft_len = max(2048, 2 ** int(np.ceil(np.log2(window_samples))))
    contour = []

    for i in range(num_windows):
        start = i * hop_samples
        frame = data[start : start + window_samples]
        rms = float(np.sqrt(np.mean(frame ** 2)))

        if rms < 0.01:
            contour.append({"time": round(i * hop_sec + window_sec / 2, 3), "midi": -1})
            continue

        windowed = frame * np.hanning(len(frame))
        fft = np.abs(np.fft.rfft(windowed, n=fft_len))
        freqs = np.fft.rfftfreq(fft_len, 1.0 / sr)

        valid = (freqs >= 65) & (freqs <= 1200)
        if not np.any(valid):
            contour.append({"time": round(i * hop_sec + window_sec / 2, 3), "midi": -1})
            continue

        peak_idx = np.argmax(fft[valid])
        freq = freqs[valid][peak_idx]
        midi, _ = _hz_to_note(freq)
        contour.append({"time": round(i * hop_sec + window_sec / 2, 3), "midi": midi})

    return contour


def _score_contours(ref: list[dict], user: list[dict]) -> dict:
    ref_len = len(ref)
    user_len = len(user)

    if ref_len == 0 or user_len == 0:
        return {"score": 0, "total_frames": 0, "matched_frames": 0, "grade": "F"}

    ratio = ref_len / max(user_len, 1)
    aligned_user = []
    for i in range(ref_len):
        ui = min(int(i / max(ratio, 0.01)), user_len - 1)
        aligned_user.append(user[ui]["midi"])

    matched = 0.0
    total = 0
    for i in range(ref_len):
        r_midi = ref[i]["midi"]
        u_midi = aligned_user[i]
        if r_midi < 0 or u_midi < 0:
            continue
        total += 1
        diff = abs(r_midi - u_midi)
        if diff == 0:
            matched += 1.0
        elif diff <= 1:
            matched += 0.75
        elif diff <= 2:
            matched += 0.5
        elif diff <= 3:
            matched += 0.25

    score = round((matched / max(total, 1)) * 100, 1)
    grade = "S" if score >= 95 else "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "F"

    return {
        "score": score,
        "total_frames": total,
        "matched_frames": int(matched),
        "grade": grade,
    }


@router.post("/vocal-score", response_model=VocalScoreResponse)
async def vocal_score(
    reference: UploadFile = File(...),
    recording: UploadFile = File(...),
):
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    paths = []
    contours = []

    for label, upload in [("ref", reference), ("user", recording)]:
        content = await upload.read()
        ext = Path(upload.filename).suffix if upload.filename else ".wav"
        tmp_path = output_dir / f"vocal_{label}_{uuid.uuid4().hex[:12]}{ext}"
        tmp_path.write_bytes(content)

        wav_path = tmp_path
        try:
            import scipy.io.wavfile
            scipy.io.wavfile.read(str(wav_path))
        except Exception:
            try:
                from pydub import AudioSegment
                audio = AudioSegment.from_file(str(tmp_path))
                wav_path = output_dir / f"vocal_{label}_{uuid.uuid4().hex[:12]}.wav"
                audio.export(str(wav_path), format="wav")
                tmp_path.unlink(missing_ok=True)
                scipy.io.wavfile.read(str(wav_path))
            except Exception as e:
                for p in set(paths + [tmp_path, wav_path]):
                    p.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail=f"Cannot read {label} audio: {str(e)[:100]}")

        paths.extend([tmp_path, wav_path])
        contour = _extract_pitch_contour(str(wav_path))
        contours.append(contour)

    ref_contour, user_contour = contours
    result = _score_contours(ref_contour, user_contour)

    for p in set(paths):
        p.unlink(missing_ok=True)

    ref_dur = ref_contour[-1]["time"] if ref_contour else 0
    user_dur = user_contour[-1]["time"] if user_contour else 0

    return VocalScoreResponse(
        ok=True,
        score=result["score"],
        max_score=100.0,
        grade=result["grade"],
        ref_pitch=ref_contour,
        user_pitch=user_contour,
        ref_duration=round(ref_dur, 1),
        user_duration=round(user_dur, 1),
        total_frames=result["total_frames"],
        matched_frames=result["matched_frames"],
    )


class VocalPrepResponse(BaseModel):
    ok: bool = True
    job_id: str = ""
    status: str = "queued"
    pitch_data: list[dict] = []
    vocals_url: str = ""
    duration_secs: float = 0.0


@router.post("/vocal-prep", response_model=VocalPrepResponse)
async def vocal_prep(
    file: UploadFile = File(...),
):
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    save_path = output_dir / f"vocal_prep_{uuid.uuid4().hex[:12]}{ext}"
    save_path.write_bytes(content)

    from ..queue.worker import queue
    job = queue.submit(
        "vocal_prep",
        {"audio_path": str(save_path), "model": "htdemucs"},
    )
    job_id = job.id
    logger.info(f"Vocal prep job {job_id} enqueued for {save_path}")

    return VocalPrepResponse(ok=True, job_id=job_id, status="queued")


@router.get("/vocal-prep/{job_id}", response_model=VocalPrepResponse)
async def vocal_prep_status(job_id: str):
    from ..queue.worker import queue, JobStatus

    job = queue.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status == JobStatus.FAILED:
        raise HTTPException(status_code=500, detail=job.error or "Job failed")

    resp = VocalPrepResponse(
        ok=True,
        job_id=job_id,
        status=job.status,
    )

    if job.status == JobStatus.COMPLETED and job.result:
        result = job.result
        pitch_contour = result.get("pitch_contour", [])
        vocals_path = result.get("vocals_path", "")
        duration = pitch_contour[-1]["time"] if pitch_contour else 0

        if vocals_path:
            vocals_name = Path(vocals_path).name
            resp.vocals_url = f"/api/audio/stems/{result['model']}/{Path(result['stems_dir']).name}/{vocals_name}"

        resp.pitch_data = pitch_contour
        resp.duration_secs = round(duration, 1)

    return resp


# ── Vocal Remover ──────────────────────────────────────────────

class VocalRemoveResponse(BaseModel):
    ok: bool = True
    instrumental_url: str = ""
    vocals_url: str = ""
    filename: str = ""
    duration_secs: float = 0.0


@router.post("/vocal-remove", response_model=VocalRemoveResponse)
async def vocal_remove(file: UploadFile = File(...)):
    from ..queue.worker import queue

    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    save_path = output_dir / f"vocal_rm_{uuid.uuid4().hex[:12]}{ext}"
    save_path.write_bytes(content)

    job = queue.submit(
        "vocal_remove",
        {"audio_path": str(save_path), "model": "htdemucs"},
    )
    logger.info(f"Vocal remove job {job.id} enqueued")

    return VocalRemoveResponse(
        ok=True,
        instrumental_url=f"/api/tools/vocal-remove/{job.id}/instrumental",
        vocals_url=f"/api/tools/vocal-remove/{job.id}/vocals",
        filename=f"instrumental_{job.id}.wav",
    )


@router.get("/vocal-remove/{job_id}/status")
async def vocal_remove_status(job_id: str):
    from ..queue.worker import queue, JobStatus

    job = queue.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == JobStatus.FAILED:
        raise HTTPException(status_code=500, detail=job.error or "Job failed")

    res = {
        "status": job.status,
        "instrumental_ready": False,
        "vocals_ready": False,
    }
    if job.status == JobStatus.COMPLETED and job.result:
        r = job.result
        res["instrumental_ready"] = bool(r.get("instrumental_path"))
        res["vocals_ready"] = bool(r.get("vocals_path"))
    return res


@router.get("/vocal-remove/{job_id}/instrumental")
async def serve_instrumental(job_id: str):
    from fastapi.responses import FileResponse
    from ..queue.worker import queue, JobStatus

    job = queue.get(job_id)
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Not ready")
    path = (job.result or {}).get("instrumental_path", "")
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="audio/wav")


@router.get("/vocal-remove/{job_id}/vocals")
async def serve_vocals(job_id: str):
    from fastapi.responses import FileResponse
    from ..queue.worker import queue, JobStatus

    job = queue.get(job_id)
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Not ready")
    path = (job.result or {}).get("vocals_path", "")
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="audio/wav")


# ── Chord Detection ───────────────────────────────────────────

CHORD_TEMPLATES: dict[str, list[int]] = {
    "":      [0, 4, 7],          # major
    "m":     [0, 3, 7],          # minor
    "dim":   [0, 3, 6],          # diminished
    "aug":   [0, 4, 8],          # augmented
    "sus2":  [0, 2, 7],          # suspended 2nd
    "sus4":  [0, 5, 7],          # suspended 4th
    "7":     [0, 4, 7, 10],      # dominant 7th
    "maj7":  [0, 4, 7, 11],      # major 7th
    "m7":    [0, 3, 7, 10],      # minor 7th
    "dim7":  [0, 3, 6, 9],       # diminished 7th
    "m7b5":  [0, 3, 6, 10],      # half-diminished 7th
    "6":     [0, 4, 7, 9],       # major 6th
    "m6":    [0, 3, 7, 9],       # minor 6th
    "9":     [0, 4, 7, 10, 2],   # dominant 9th
    "add9":  [0, 4, 7, 2],       # add9
}


class ChordEvent(BaseModel):
    start_time: float
    end_time: float
    chord: str
    notes: str
    confidence: float


class ChordDetectResponse(BaseModel):
    ok: bool = True
    chords: list[ChordEvent] = []
    duration_secs: float = 0.0
    chord_count: int = 0


def _intervals_to_chord(notes: list[int]) -> tuple[str, str, float]:
    if not notes:
        return "N", "", 0.0
    if len(notes) == 1:
        n = notes[0]
        return f"{NOTE_NAMES[n % 12]}{n // 12 - 1}", f"{NOTE_NAMES[n % 12]}{n // 12 - 1}", 1.0
    if len(notes) == 2:
        interval = (notes[1] - notes[0]) % 12
        labels = {1: "m2", 2: "M2", 3: "m3", 4: "M3", 5: "P4", 6: "TT", 7: "P5", 8: "m6", 9: "M6", 10: "m7", 11: "M7"}
        n = notes[0]
        root_name = f"{NOTE_NAMES[n % 12]}{n // 12 - 1}"
        return f"{root_name} ({labels.get(interval, '?')})", f"{NOTE_NAMES[notes[0] % 12]}{notes[0] // 12 - 1}-{NOTE_NAMES[notes[1] % 12]}{notes[1] // 12 - 1}", 0.9

    best_name = "?"
    best_notes = ""
    best_score = 0.0

    for root_candidate in set(notes):
        root_bucket = root_candidate % 12
        norm_intervals = sorted(set((n - root_candidate) % 12 for n in notes))

        for suffix, template in CHORD_TEMPLATES.items():
            template_set = set(template)
            overlap = len(template_set & set(norm_intervals))
            extra = len(set(norm_intervals) - template_set)
            missing = len(template_set - set(norm_intervals))
            score = overlap / max(len(template_set), 1) * (1.0 - 0.2 * extra - 0.3 * missing)
            if score > best_score:
                best_score = score
                root_name = f"{NOTE_NAMES[root_bucket]}{root_candidate // 12 - 1}"
                best_name = f"{root_name}{suffix}" if suffix else root_name
                best_notes = "-".join(f"{NOTE_NAMES[n % 12]}{n // 12 - 1}" for n in sorted(notes))

    confidence = min(1.0, max(0.0, best_score))
    return best_name, best_notes, confidence


def _detect_chords_polyphonic(audio_path: str) -> dict:
    import numpy as np
    import scipy.io.wavfile as wav

    sr, data = wav.read(str(audio_path))
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    max_val = np.max(np.abs(data))
    if max_val > 0:
        data = data / max_val

    duration = len(data) / sr
    n_fft = 4096
    hop_samples = n_fft // 4
    num_frames = (len(data) - n_fft) // hop_samples + 1
    if num_frames < 1:
        return {"chords": [], "duration_secs": round(duration, 1)}

    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    lo_idx = int(40 * n_fft / sr)
    hi_idx = int(4000 * n_fft / sr)
    valid_freqs = freqs[lo_idx:hi_idx + 1]
    valid_len = len(valid_freqs)

    frame_chords = []
    for f in range(num_frames):
        start = f * hop_samples
        frame = data[start : start + n_fft]
        rms = float(np.sqrt(np.mean(frame ** 2)))
        if rms < 0.008:
            frame_chords.append(None)
            continue

        windowed = frame * np.hanning(n_fft)
        spec = np.abs(np.fft.rfft(windowed, n=n_fft))
        spec_valid = spec[lo_idx:hi_idx + 1].copy()
        peak_mag = float(np.max(spec_valid))
        if peak_mag < 1e-6:
            frame_chords.append(None)
            continue

        work_spec = spec_valid.copy()
        noise_floor = float(np.median(spec[lo_idx:hi_idx + 1])) * 3

        detected = []
        for _ in range(6):
            peak_rel = int(np.argmax(work_spec))
            mag = float(work_spec[peak_rel])
            if mag < noise_floor or mag < peak_mag * 0.08:
                break

            freq = valid_freqs[peak_rel]
            midi, _ = _hz_to_note(freq)
            detected.append(midi)

            for h in [1, 2, 3, 4, 5, 6]:
                hz_exact = freq * h
                center = int(hz_exact * n_fft / sr) - lo_idx
                bw = max(2, int(freq * h * 0.03 * n_fft / sr))
                for k in range(max(0, center - bw), min(valid_len, center + bw + 1)):
                    work_spec[k] *= 0.05

        if detected:
            frame_chords.append(sorted(set(detected)))
        else:
            frame_chords.append(None)

    chords = []
    i = 0
    while i < num_frames:
        current = frame_chords[i]
        if current is None:
            i += 1
            continue

        j = i + 1
        merged_pitches = set(current)
        while j < num_frames:
            nxt = frame_chords[j]
            if nxt is None:
                break
            overlap = len(set(merged_pitches) & set(nxt))
            total = len(set(merged_pitches) | set(nxt)) or 1
            if overlap / total < 0.5:
                break
            merged_patches = set(merged_pitches) | set(nxt)
            if len(merged_patches) <= 8:
                merged_pitches = merged_patches
            j += 1

        dur = (j - i) * hop_samples / sr
        if dur >= 0.08:
            pitches_list = sorted(merged_pitches)
            chord_name, note_labels, conf = _intervals_to_chord(pitches_list)
            chords.append({
                "start_time": round(i * hop_samples / sr + n_fft / (2 * sr), 3),
                "end_time": round((j - 1) * hop_samples / sr + n_fft / (2 * sr), 3),
                "chord": chord_name,
                "notes": note_labels,
                "confidence": round(conf, 2),
            })
        i = j

    return {
        "chords": chords,
        "duration_secs": round(duration, 1),
    }


@router.post("/chord-detect", response_model=ChordDetectResponse)
async def chord_detect(file: UploadFile = File(...)):
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    tmp_path = output_dir / f"chord_{uuid.uuid4().hex[:12]}{ext}"
    tmp_path.write_bytes(content)

    wav_path = tmp_path
    try:
        import scipy.io.wavfile
        scipy.io.wavfile.read(str(wav_path))
    except Exception:
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(str(tmp_path))
            wav_path = output_dir / f"chord_{uuid.uuid4().hex[:12]}.wav"
            audio.export(str(wav_path), format="wav")
            tmp_path.unlink(missing_ok=True)
        except Exception as e:
            for p in [tmp_path, wav_path]:
                p.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"Cannot read audio: {str(e)[:100]}")

    try:
        result = _detect_chords_polyphonic(str(wav_path))
    except Exception as e:
        wav_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Chord detection failed: {str(e)[:200]}")

    wav_path.unlink(missing_ok=True)

    return ChordDetectResponse(
        ok=True,
        chords=[ChordEvent(**c) for c in result["chords"]],
        duration_secs=result["duration_secs"],
        chord_count=len(result["chords"]),
    )


# ── Pitch & Tempo Adjustment ──────────────────────────────────

class PitchTempoResponse(BaseModel):
    ok: bool = True
    filename: str = ""
    url: str = ""
    duration_secs: float = 0.0
    original_bpm: float = 0.0
    adjusted_bpm: float = 0.0


@router.post("/pitch-tempo", response_model=PitchTempoResponse)
async def adjust_pitch_tempo(
    file: UploadFile = File(...),
    pitch_semitones: float = Form(default=0.0),
    tempo_factor: float = Form(default=1.0),
):
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    pitch_semitones = max(-12.0, min(12.0, pitch_semitones))
    tempo_factor = max(0.5, min(2.0, tempo_factor))

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    tmp_path = output_dir / f"pitch_in_{uuid.uuid4().hex[:12]}{ext}"
    tmp_path.write_bytes(content)

    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(str(tmp_path))
    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Cannot read audio: {str(e)[:100]}")

    original_bpm = len(audio) and (audio.frame_rate / len(audio.get_array_of_samples())) or 0.0

    if tempo_factor != 1.0:
        try:
            audio = audio.speedup(playback_speed=tempo_factor)
        except Exception:
            try:
                new_frame_rate = int(audio.frame_rate * tempo_factor)
                audio = audio._spawn(audio.raw_data, overrides={"frame_rate": new_frame_rate})
                audio = audio.set_frame_rate(audio.frame_rate)
            except Exception:
                pass

    if pitch_semitones != 0:
        new_sample_rate = int(audio.frame_rate * (2.0 ** (-pitch_semitones / 12.0)))
        try:
            pitched = audio._spawn(audio.raw_data, overrides={"frame_rate": new_sample_rate})
            pitched = pitched.set_frame_rate(audio.frame_rate)
            audio = pitched
        except Exception:
            pass

    out_filename = f"adjusted_{uuid.uuid4().hex[:12]}.wav"
    out_path = output_dir / out_filename
    audio.export(str(out_path), format="wav")

    tmp_path.unlink(missing_ok=True)

    adjusted_bpm = original_bpm * tempo_factor if original_bpm > 0 else 0.0

    return PitchTempoResponse(
        ok=True,
        filename=out_filename,
        url=f"/api/audio/{out_filename}",
        duration_secs=round(len(audio) / 1000.0, 1),
        original_bpm=round(original_bpm if original_bpm > 0 else 120.0, 1),
        adjusted_bpm=round(adjusted_bpm, 1),
    )


# ── Lyric Transcription ───────────────────────────────────────

class LyricLine(BaseModel):
    start: float
    end: float
    text: str
    confidence: float


class LyricTranscribeResponse(BaseModel):
    ok: bool = True
    job_id: str = ""
    status: str = "queued"
    lyrics: list[LyricLine] = []
    full_text: str = ""
    language: str = ""
    error: str = ""
    txt_path: str = ""
    lrc_path: str = ""


@router.post("/lyric-transcribe", response_model=LyricTranscribeResponse)
async def lyric_transcribe(
    file: UploadFile = File(...),
    language: str = Form(default="auto"),
):
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    save_path = output_dir / f"lyric_{uuid.uuid4().hex[:12]}{ext}"
    save_path.write_bytes(content)

    from ..queue.worker import queue
    job = queue.submit(
        "lyric_transcribe",
        {"audio_path": str(save_path), "language": language},
    )
    logger.info(f"Lyric transcribe job {job.id} enqueued")

    return LyricTranscribeResponse(ok=True, job_id=job.id, status="queued")


@router.get("/lyric-transcribe/{job_id}", response_model=LyricTranscribeResponse)
async def lyric_transcribe_status(job_id: str):
    from ..queue.worker import queue, JobStatus

    job = queue.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    resp = LyricTranscribeResponse(
        ok=True,
        job_id=job_id,
        status=job.status,
    )

    if job.status == JobStatus.FAILED:
        resp.status = "failed"
        if job.result:
            r = job.result
            resp.lyrics = [LyricLine(**l) for l in r.get("lyrics", [])]
            resp.full_text = r.get("full_text", "")
            resp.language = r.get("language", "")
            resp.txt_path = r.get("txt_path", "")
            resp.lrc_path = r.get("lrc_path", "")
        resp.error = job.error

    if job.status == JobStatus.COMPLETED and job.result:
        r = job.result
        resp.lyrics = [LyricLine(**l) for l in r.get("lyrics", [])]
        resp.full_text = r.get("full_text", "")
        resp.language = r.get("language", "")
        resp.txt_path = r.get("txt_path", "")
        resp.lrc_path = r.get("lrc_path", "")

    return resp


@router.get("/lyrics/download/{filename:path}")
async def download_lyrics(filename: str):
    from fastapi.responses import FileResponse
    lyrics_dir = Path("output/lyrics")
    file_path = lyrics_dir / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path), media_type="text/plain", filename=filename)


# ── Guitar Tab Generator ──────────────────────────────────────

GUITAR_TUNINGS = {
    "standard":       {"name": "Standard (EADGBE)",    "midi": [40, 45, 50, 55, 59, 64], "strings": ["E", "A", "D", "G", "B", "e"]},
    "drop_d":         {"name": "Drop D (DADGBE)",      "midi": [38, 45, 50, 55, 59, 64], "strings": ["D", "A", "D", "G", "B", "e"]},
    "open_g":         {"name": "Open G (DGDGBD)",      "midi": [38, 43, 50, 55, 59, 62], "strings": ["D", "G", "D", "G", "B", "D"]},
    "open_d":         {"name": "Open D (DADF#AD)",     "midi": [38, 45, 50, 54, 57, 62], "strings": ["D", "A", "D", "F#", "A", "D"]},
    "open_e":         {"name": "Open E (EBEG#BE)",     "midi": [40, 47, 52, 56, 59, 64], "strings": ["E", "B", "E", "G#", "B", "E"]},
    "dadgad":         {"name": "DADGAD",               "midi": [38, 45, 50, 55, 57, 62], "strings": ["D", "A", "D", "G", "A", "D"]},
    "eb_standard":    {"name": "Eb Standard",          "midi": [39, 44, 49, 54, 58, 63], "strings": ["Eb", "Ab", "Db", "Gb", "Bb", "eb"]},
    "half_step_down": {"name": "Half Step Down",       "midi": [39, 44, 49, 54, 58, 63], "strings": ["Eb", "Ab", "Db", "Gb", "Bb", "eb"]},
    "c_standard":     {"name": "C Standard",           "midi": [36, 41, 46, 51, 55, 60], "strings": ["C", "F", "Bb", "Eb", "G", "C"]},
    "drop_c":         {"name": "Drop C (CGCFAD)",      "midi": [36, 43, 48, 53, 57, 62], "strings": ["C", "G", "C", "F", "A", "D"]},
}
DEFAULT_TUNING = "standard"
MAX_FRET = 22


def _midi_to_tab(midi: int, tuning_key: str = DEFAULT_TUNING) -> list[tuple[int, int]]:
    tuning = GUITAR_TUNINGS.get(tuning_key, GUITAR_TUNINGS[DEFAULT_TUNING])
    candidates = []
    for s, open_midi in enumerate(tuning["midi"]):
        fret = midi - open_midi
        if 0 <= fret <= MAX_FRET:
            candidates.append((s, fret))
    if not candidates:
        return []
    candidates.sort(key=lambda x: x[1] + (5 - x[0]) * 2)
    return candidates


class TabNote(BaseModel):
    start_time: float
    end_time: float
    pitch: int
    note_name: str
    string: int
    string_name: str
    fret: int
    velocity: float


class GuitarTabResponse(BaseModel):
    ok: bool = True
    notes: list[TabNote] = []
    duration_secs: float = 0.0
    note_count: int = 0
    tuning: list[str] = ["E", "A", "D", "G", "B", "e"]
    tuning_key: str = "standard"


@router.post("/guitar-tab", response_model=GuitarTabResponse)
async def guitar_tab(
    file: UploadFile = File(...),
    store_id: str = Form(default="default"),
    tuning_key: str = Form(default=DEFAULT_TUNING),
):
    tuning = GUITAR_TUNINGS.get(tuning_key, GUITAR_TUNINGS[DEFAULT_TUNING])
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    tmp_path = output_dir / f"tab_{uuid.uuid4().hex[:12]}{ext}"
    tmp_path.write_bytes(content)

    wav_path = tmp_path
    try:
        import scipy.io.wavfile
        scipy.io.wavfile.read(str(wav_path))
    except Exception:
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(str(tmp_path))
            wav_path = output_dir / f"tab_{uuid.uuid4().hex[:12]}.wav"
            audio.export(str(wav_path), format="wav")
            tmp_path.unlink(missing_ok=True)
        except Exception as e:
            for p in [tmp_path, wav_path]:
                p.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"Cannot read audio: {str(e)[:100]}")

    try:
        from ..services.calibration import get_detection_params
        cal = get_detection_params(store_id)
        result = _detect_notes_fft(str(wav_path), cal)
    except Exception as e:
        wav_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Note detection failed: {str(e)[:200]}")

    wav_path.unlink(missing_ok=True)

    tab_notes = []
    for n in result["notes"]:
        midi = n["pitch"]
        candidates = _midi_to_tab(midi, tuning_key)
        if not candidates:
            continue
        best_s, best_f = candidates[0]
        tab_notes.append(TabNote(
            start_time=n["start_time"],
            end_time=n["end_time"],
            pitch=midi,
            note_name=n["note_name"],
            string=best_s,
            string_name=tuning["strings"][best_s],
            fret=best_f,
            velocity=n["velocity"],
        ))

    return GuitarTabResponse(
        ok=True,
        notes=tab_notes,
        duration_secs=round(result["duration_secs"], 2),
        note_count=len(tab_notes),
        tuning=tuning["strings"],
        tuning_key=tuning_key,
    )


# ── Learning / Calibration System ─────────────────────────────

class FeedbackRequest(BaseModel):
    store_id: str = "default"
    tool: str
    action: str = "corrected"
    note_pitch: int | None = None
    note_name: str | None = None
    original_pitch: int | None = None
    original_note: str | None = None
    original_chord: str | None = None
    corrected_chord: str | None = None
    detail: str = ""


class MidiExportRequest(BaseModel):
    notes: list[dict]
    tempo: int = 120


class CalibrationResponse(BaseModel):
    ok: bool = True
    store_id: str = "default"
    total_corrections: int = 0
    accuracy: float = 1.0
    params: dict = {}
    all_stores: dict = {}
    chord_corrections: int = 0
    chord_accuracy: float = 1.0


@router.post("/feedback", response_model=CalibrationResponse)
async def submit_feedback(body: FeedbackRequest):
    from ..services.calibration import record_correction, record_chord_correction, get_calibration

    if body.action == "corrected_chord":
        record_chord_correction(
            store_id=body.store_id,
            original_chord=body.original_chord,
            corrected_chord=body.corrected_chord,
            detail=body.detail,
        )
    else:
        record_correction(
            store_id=body.store_id,
            tool=body.tool,
            note_pitch=body.note_pitch,
            note_name=body.note_name,
            original_pitch=body.original_pitch,
            original_note=body.original_note,
            action=body.action,
            detail=body.detail,
        )
    data = get_calibration(body.store_id)
    stats = get_calibration_stats()
    return CalibrationResponse(
        ok=True,
        store_id=body.store_id,
        total_corrections=data["total_corrections"],
        accuracy=data["accuracy"],
        params=data["params"],
        all_stores=stats,
        chord_corrections=data.get("chord_corrections", 0),
        chord_accuracy=data.get("chord_accuracy", 1.0),
    )


@router.get("/calibration", response_model=CalibrationResponse)
async def get_calibration_status(store_id: str = "default"):
    from ..services.calibration import get_calibration, get_calibration_stats

    data = get_calibration(store_id)
    all_stores = get_calibration_stats()

    return CalibrationResponse(
        ok=True,
        store_id=store_id,
        total_corrections=data["total_corrections"],
        accuracy=data.get("accuracy", 1.0),
        params=data.get("params", {}),
        all_stores=all_stores,
    )


# ── MIDI Export ───────────────────────────────────────────────

def _write_midi(notes: list[dict], tempo: int) -> bytes:
    from struct import pack
    import io

    ticks_per_quarter = 480
    us_per_quarter = 60_000_000 // tempo

    def write_var_len(val):
        buf = bytearray()
        buf.append(val & 0x7F)
        val >>= 7
        while val:
            buf.append(0x80 | (val & 0x7F))
            val >>= 7
        buf.reverse()
        return bytes(buf)

    track_events = bytearray()

    # Set tempo
    track_events += b'\x00'
    track_events += b'\xFF\x51\x03'
    track_events += pack('>I', us_per_quarter)[1:]

    last_tick = 0
    for n in notes:
        pitch = n.get("pitch", 60)
        velocity = max(1, min(127, int(n.get("velocity", 0.7) * 127)))
        start_sec = n.get("start_time", 0)
        end_sec = n.get("end_time", start_sec + 0.2)
        start_tick = int(start_sec * tempo / 60 * ticks_per_quarter)
        end_tick = int(end_sec * tempo / 60 * ticks_per_quarter)

        delta_on = max(0, start_tick - last_tick)
        track_events += write_var_len(delta_on)
        track_events += pack('BBB', 0x90, pitch, velocity)
        last_tick = start_tick

        delta_off = max(1, end_tick - start_tick)
        track_events += write_var_len(delta_off)
        track_events += pack('BBB', 0x80, pitch, 0)
        last_tick = end_tick

    # End of track
    track_events += write_var_len(0)
    track_events += b'\xFF\x2F\x00'

    buf = bytearray()
    buf += b'MThd'
    buf += pack('>I', 6)
    buf += pack('>HHH', 0, 1, ticks_per_quarter)
    buf += b'MTrk'
    buf += pack('>I', len(track_events))
    buf += track_events

    return bytes(buf)


class MidiExportResponse(BaseModel):
    ok: bool = True
    filename: str = ""
    url: str = ""


@router.post("/midi-export", response_model=MidiExportResponse)
async def midi_export(body: MidiExportRequest):
    output_dir = Path(settings.UPLOAD_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    midi_bytes = _write_midi(body.notes, body.tempo)

    filename = f"export_{uuid.uuid4().hex[:12]}.mid"
    path = output_dir / filename
    path.write_bytes(midi_bytes)

    return MidiExportResponse(
        ok=True,
        filename=filename,
        url=f"/api/audio/midi/{filename}",
    )


# ── Voice Cleaner ──────────────────────────────────────────────

class VoiceCleanResponse(BaseModel):
    ok: bool = True
    url: str = ""
    filename: str = ""
    duration: float = 0.0
    noise_frames: int = 0


@router.post("/voice-clean", response_model=VoiceCleanResponse)
async def voice_clean(
    file: UploadFile = File(...),
    noise_reduction: float = Form(default=0.7, ge=0.0, le=1.0),
):
    try:
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(file.filename).suffix or ".wav"
        upload_path = upload_dir / f"vc_{uuid.uuid4().hex}{ext}"
        content = await file.read()
        upload_path.write_bytes(content)

        from ..services.cleaner import clean_voice
        result = clean_voice(str(upload_path), noise_reduction)

        filename = Path(result["cleaned_path"]).name
        return VoiceCleanResponse(
            ok=True,
            url=f"/api/audio/edits/{filename}",
            filename=filename,
            duration=result["duration"],
            noise_frames=result["noise_profile_frames"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Lead/Back Vocal Splitter ───────────────────────────────────

class LeadBackResponse(BaseModel):
    ok: bool = True
    lead_url: str = ""
    backing_url: str = ""
    instrumental_url: str = ""
    lead_ratio: float = 0.0
    duration: float = 0.0


@router.post("/lead-back-split", response_model=LeadBackResponse)
async def lead_back_split(
    file: UploadFile = File(...),
):
    try:
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(file.filename).suffix or ".wav"
        upload_path = upload_dir / f"lb_{uuid.uuid4().hex}{ext}"
        content = await file.read()
        upload_path.write_bytes(content)

        # First separate vocals
        from ..services.separator import separate as separate_stems
        stem_result = separate_stems(str(upload_path), model_name="htdemucs")
        vocals_path = stem_result["stems"].get("vocals")
        if not vocals_path:
            raise HTTPException(status_code=400, detail="No vocals found in the audio")

        from ..services.lead_back import split_lead_backing
        result = split_lead_backing(vocals_path)

        return LeadBackResponse(
            ok=True,
            lead_url=f"/api/audio/stems/htdemucs/{Path(result['lead_path']).parent.name}/{Path(result['lead_path']).name}",
            backing_url=f"/api/audio/stems/htdemucs/{Path(result['backing_path']).parent.name}/{Path(result['backing_path']).name}",
            instrumental_url=f"/api/audio/stems/htdemucs/{Path(result['instrumental_path']).parent.name}/{Path(result['instrumental_path']).name}",
            lead_ratio=result["lead_ratio"],
            duration=result["duration"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Voice Changer ──────────────────────────────────────────────

class VoiceChangeResponse(BaseModel):
    ok: bool = True
    url: str = ""
    filename: str = ""
    duration: float = 0.0
    semitones: int = 0
    formant_shift: float = 0.0


@router.post("/voice-change", response_model=VoiceChangeResponse)
async def voice_change(
    file: UploadFile = File(...),
    semitones: int = Form(default=0, ge=-12, le=12),
    formant_shift: float = Form(default=0.0, ge=-6.0, le=6.0),
):
    try:
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(file.filename).suffix or ".wav"
        upload_path = upload_dir / f"vg_{uuid.uuid4().hex}{ext}"
        content = await file.read()
        upload_path.write_bytes(content)

        from ..services.voice_changer import change_voice
        result = change_voice(str(upload_path), semitones, formant_shift)

        filename = Path(result["changed_path"]).name
        return VoiceChangeResponse(
            ok=True,
            url=f"/api/audio/edits/{filename}",
            filename=filename,
            duration=result["duration"],
            semitones=result["semitones"],
            formant_shift=result["formant_shift"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Echo/Reverb Remover ────────────────────────────────────────

class DereverbResponse(BaseModel):
    ok: bool = True
    url: str = ""
    filename: str = ""
    duration: float = 0.0
    strength: float = 0.7


@router.post("/dereverb", response_model=DereverbResponse)
async def dereverb(
    file: UploadFile = File(...),
    strength: float = Form(default=0.7, ge=0.0, le=1.0),
):
    try:
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(file.filename).suffix or ".wav"
        upload_path = upload_dir / f"dr_{uuid.uuid4().hex}{ext}"
        content = await file.read()
        upload_path.write_bytes(content)

        from ..services.dereverb import remove_reverb
        result = remove_reverb(str(upload_path), strength)

        filename = Path(result["cleaned_path"]).name
        return DereverbResponse(
            ok=True,
            url=f"/api/audio/edits/{filename}",
            filename=filename,
            duration=result["duration"],
            strength=result["strength"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
