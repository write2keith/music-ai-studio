# Changelog

## [1.2.0] - 2026-08-06

### Added
- Audacity-style waveform editor with visual audio display
- Click-and-drag region selection on the waveform
- Playback controls: play/pause, stop, zoom in/out
- Real-time time display with selection tracking
- "Set In/Out" markers at playback position
- Drag-and-drop file loading onto waveform
- Modal dialogs for speed change and stem merge
- Toggle effects panel below waveform
- Selection-based actions: cut outside, keep selection, fade in/out selection
- Wavesurfer.js for high-performance waveform rendering

## [1.1.0] - 2026-08-06

### Added
- Audio editor tab with tabbed navigation UI
- Trim / cut audio sections
- Fade in/out with configurable duration
- Volume adjustment (gain in dB)
- Audio normalization to target dB level
- Speed change (0.25x to 3x with pitch correction)
- Merge multiple stems into a single track
- Effects chain: reverb, delay, 3-band EQ, compressor, output gain
- Real-time slider feedback in the UI
- Pedalboard for high-quality DSP effects
- pydub for lossless editing operations

## [1.0.0] - 2026-08-06

### Added
- Music generation via Meta MusicGen (text-to-music)
- Stem separation via Meta Demucs (htdemucs, htdemucs_ft, htdemucs_6s)
- Pipeline mode: generate music then auto-separate into stems
- Web UI with dark theme and audio playback
- GPU/CPU auto-detection
- Audio download support for generated tracks and stems
- Drag-and-drop file upload for stem separation
- Configurable model size and generation duration via env vars
