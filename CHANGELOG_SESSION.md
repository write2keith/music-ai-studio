# Music AI Studio — Full Change Log

## Session Summary
- **Date**: 2026-08-10
- **Total Files Changed**: 17 (14 modified + 3 new)
- **Total Changes**: +2,131 / -246 lines

---

## New Files Created (3)

| File | Purpose |
|------|---------|
| `backend/app/services/guitar_tab.py` | Guitar Tab analysis: GP parse/export, Tayuya fretboard mapping, 5-method note detection |
| `backend/app/services/pitch_tempo.py` | High-quality pitch shifting + time stretching via librosa phase vocoder |
| `backend/app/services/vocal_coach.py` | Multi-dimensional vocal scoring: PYIN F0 + DTW alignment + 4-pillar metrics |

---

## Module 5: Lyric Transcription

### `backend/app/services/lyrics.py` (+272 lines)
- **faster-whisper large-v3** as primary engine (CTranslate2-optimized), with fallbacks: distil-large-v3 → small → openai-whisper
- **Demucs vocal isolation**: `_isolate_vocals_demucs()` preprocesses with htdemucs before transcription
- **Silero VAD**: Neural voice activity detection (`_silero_vad()`) preferred, energy VAD fallback
- **Music-aware LRC grouping**: Constants `MAX_CHARS_PER_LINE=45`, `MAX_LINE_DURATION_SEC=8.0`; blank lines at >3s gaps (verse/chorus boundaries); refined break logic with character-count checks

### `backend/app/routers/tools.py`
- Added `isolate_vocals: bool = Form(default=False)` to `/lyric-transcribe` endpoint

### `backend/app/queue/tasks.py`
- Passes `isolate_vocals` to `transcribe_lyrics()`

### `frontend/src/app/(main)/tools/lyrics/page.tsx`
- Added "Isolate vocals first (Demucs)" checkbox toggle

### `frontend/src/lib/api.ts`
- Updated `lyricTranscribe(file, language, isolateVocals)` with optional 3rd param

---

## Module 6: Vocal Coach

### `backend/app/services/vocal_coach.py` (NEW — 340 lines)
**PYIN pitch tracking** (`extract_pitch_pyin`):
- Replaces old 20ms STFT peak-picking with `librosa.pyin` (probabilistic YIN)
- Outputs: `f0`, `voiced_flag`, `voiced_prob`, `rms` energy contour
- F0 range: 65Hz–1200Hz, hop_length=256

**DTW time alignment** (`compute_dtw_alignment`):
- Replaces old static `ratio = N/M` linear stretch
- Uses `librosa.sequence.dtw` on log-frequency contours
- Returns warping path + normalized cost

**4-pillar multi-dimensional scoring** (`score_vocal_performance`):

| Pillar | Weight | Metric | Method |
|--------|--------|--------|--------|
| Pitch Accuracy | 45% | Mean absolute cent deviation, `< 25¢ = in-tune` | `hz_to_cents()` per frame |
| Stability & Vibrato | 25% | F0 variance on sustained segments + vibrato rate via autocorrelation | `_find_sustained_note_segments()` |
| Timing | 15% | DTW normalized cost + duration ratio | DTW path analysis |
| Dynamics | 15% | RMS Pearson correlation + dynamic range match | Envelope comparison |

Grading: S ≥ 95, A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, else F

### `backend/app/routers/tools.py`
- `VocalScoreResponse` extended with: `pitch_accuracy`, `stability`, `timing`, `dynamics` (all optional dicts)
- `vocal_score` endpoint: try new pipeline → legacy fallback on error

### `backend/app/queue/tasks.py`
- `_run_vocal_prep` now uses `extract_pitch_pyin` instead of old `_extract_pitch_contour`

### `frontend/src/app/(main)/tools/vocal-coach/page.tsx`
- Added `ScorePillar` component with progress bars for each metric
- 2×2 grid showing all 4 pillars with detailed tooltips (cents MAD, variance, DTW cost, correlation)

### `frontend/src/lib/api.ts`
- `VocalScoreResult` extended with optional `pitch_accuracy`, `stability`, `timing`, `dynamics` sub-interfaces

---

## Module 7: Pitch & Tempo Playground

### `backend/app/services/pitch_tempo.py` (NEW — 140 lines)
**Decoupled pitch & tempo processing** (`process_pitch_tempo`):

| Operation | Old (pydub) | New (librosa) |
|-----------|-------------|---------------|
| Pitch shift | Sample-rate trick (changes pitch + tempo together → chipmunk effect) | `librosa.effects.pitch_shift` + `soxr_hq` resampling (duration locked) |
| Time stretch | `speedup()` resamples both pitch and tempo | `librosa.effects.time_stretch` phase vocoder (pitch locked) |

**Transient preservation** (crispness 0/1/2):
- 0 = 2048 FFT window (balanced)
- 1 = 1024 FFT window (crisp drum transients)
- 2 = 512 FFT window (maximum transient detail)

**BPM estimation**: `librosa.onset.onset_strength` + `beat_track`

Pydub legacy mode available via `formant_preserved=False`

### `backend/app/routers/tools.py`
- `PitchTempoResponse` extended with: `engine`, `formant_preserved`
- Endpoint accepts: `formant_preserved`, `transient_preservation`
- Branches to librosa or pydub based on `formant_preserved` flag

### `frontend/src/app/(main)/tools/pitch-tempo/page.tsx`
- "Quality Settings" panel with formant preservation toggle + transient slider (0/1/2)
- Animated reveal for transient control when formant preservation is on

### `frontend/src/lib/api.ts`
- `pitchTempo(file, pitchSemitones, tempoFactor, formantPreserved, transientPreservation)` — all 5 params

---

## Module 8: Voice Cleaner

### `backend/app/services/cleaner.py` (+227 lines)
**Three cleaning engines** with graceful fallback chain:

| Method | Technology | Key feature |
|--------|-----------|-------------|
| `noisereduce` (default) | `noisereduce` spectral gating | `freq_mask_smooth_hz=500`, `time_mask_smooth_ms=50` — eliminates musical noise artifacts |
| `deepfilternet` | Neural speech enhancement | On-demand model loading, handles complex noise |
| `spectral` | Improved Wiener soft-masking | Exponent-based gain + noise floor = no hard chopping |

**noisereduce modes**:
- `stationary=True`: profiles noise from quietest frames (AC hum, fan)
- `stationary=False`: adaptive non-stationary gating with `n_std_thresh_stationary=1.5` (traffic, clicks)

**Soft-masking improvements** (`_clean_spectral`):
- Wiener gain formula: `gain = mag^beta / (mag^beta + noise^beta)` where `beta = max(0.5, 2.0 - reduction)`
- Minimum gain floor of 0.02 (−34dB) preserves phase, prevents digital distortion
- Noise floor prevents zero-division and low-signal obliteration

### `backend/app/routers/tools.py`
- `VoiceCleanResponse` extended with: `method`, `reduction_db`
- Endpoint accepts: `method` (noisereduce/deepfilternet/spectral), `stationary`

### `frontend/src/app/(main)/tools/voice-cleaner/page.tsx`
- Method selector: "Spectral Gate" / "DeepFilterNet" / "Classic SpecSub"
- Stationary/non-stationary toggle (animated reveal for noisereduce)
- Result display shows method name + dB reduction

### `frontend/src/lib/api.ts`
- `voiceClean(file, noiseReduction, method, stationary)` — all 4 params
- `VoiceCleanResult` extended with `method`, `reduction_db`

---

## Module 9: Echo/Reverb Remover

### `backend/app/services/dereverb.py` (+217 lines)
**Three dereverb engines**:

| Method | Algorithm | Key feature |
|--------|-----------|-------------|
| `wpe` (default) | Weighted Prediction Error via `nara_wpe` | Models room reflections as linear prediction, subtracts late reverb mathematically |
| `deepfilternet` | Neural speech enhancement | Dereverb + denoise in one pass |
| `envelope` | RMS envelope + peak-hold decay (improved) | Fast fallback |

**WPE implementation** (`_dereverb_wpe`):
- STFT → WPE (taps=5-15, delay=1-4, iterations=1-5 scaled by strength) → ISTFT
- Resamples to 16kHz speech rate, processes, resamples back
- Zero gating artifacts — preserves direct-path speech

**Adaptive highpass filter** replaces hardcoded 3kHz:
- `_detect_fundamental_f0()` uses `librosa.pyin` to detect median voice F0
- HP cutoff = `max(75, min(200, f0_hz * 0.5))` — preserves fundamentals (85-255Hz voice range)
- Male voice at 110Hz → HP 75Hz; soprano at 400Hz → HP 200Hz
- Applied to both WPE and envelope engines

### `backend/app/routers/tools.py`
- `DereverbResponse` extended with: `method`, `hp_cutoff_hz`, `detected_f0_hz`
- Endpoint accepts: `method` (wpe/deepfilternet/envelope)

### `frontend/src/app/(main)/tools/dereverb/page.tsx`
- Method selector: "WPE" / "DeepFilterNet" / "Envelope"
- Result display shows method + voice F0 + adaptive HP cutoff

### `frontend/src/lib/api.ts`
- `dereverb(file, strength, method)` — 3 params
- `DereverbResult` extended with `method`, `hp_cutoff_hz`, `detected_f0_hz`

---

## Supporting Infrastructure Changes

### `backend/app/queue/tasks.py`
- `_run_vocal_prep` migrated from old `_extract_pitch_contour` to new `extract_pitch_pyin`
- `_run_lyric_transcribe` passes `isolate_vocals` parameter

### `backend/app/routers/tools.py` (+814 lines)
- Updated response models: `VocalScoreResponse`, `PitchTempoResponse`, `VoiceCleanResponse`, `DereverbResponse`, `LyricLineDetailed`
- All endpoints updated with new parameters and graceful fallbacks

### `frontend/src/lib/api.ts` (+62 lines)
- Extended interfaces: `VocalScoreResult`, `PitchTempoResult`, `VoiceCleanResult`, `DereverbResult`
- All API methods updated with new parameters

### `backend/app/services/guitar_tab.py` (NEW)
- Guitar Tab analysis service (from Module 4 work)
- 5 analysis methods: FFT, Polyphonic, Advanced (HPSS+onset+HPS), CQT, ML
- GP import/export with velocity-to-dynamics and duration-to-rhythmic mapping

---

## Dependencies Installed
- `faster-whisper` 1.2.1 (CTranslate2-optimized speech transcription)
- `noisereduce` 3.0.3 (spectral gating noise reduction)
- `nara_wpe` (Weighted Prediction Error dereverberation)

---

## Testing Results

| Module | Test | Result |
|--------|------|--------|
| Lyrics | faster-whisper large-v3 import | OK |
| Vocal Coach | PYIN F0 extraction (440Hz sine) | 439.8Hz detected |
| Vocal Coach | DTW alignment (identical waveforms) | cost=0.0166 |
| Vocal Coach | 4-pillar scoring (perfect match) | score=100, grade=S |
| Vocal Coach | 4-pillar scoring (19.5¢ sharp) | composite=92.8, grade=A |
| Pitch & Tempo | Pitch +5st, formant preserved | duration=3.0s (unchanged) |
| Pitch & Tempo | Tempo 0.7x, pitch locked | duration=4.3s, pitch unchanged |
| Voice Cleaner | noisereduce stationary | 17dB, no artifacts |
| Voice Cleaner | noisereduce non-stationary | 12dB, adaptive |
| Voice Cleaner | spectral-subtraction-v2 | soft-masking, 13 noise frames |
| Dereverb | WPE taps=10 | F0=220Hz detected, HP=110Hz adaptive |
| Dereverb | envelope-v2 | adaptive HP, F0=220Hz |
