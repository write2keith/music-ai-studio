# Changelog

## [2.0.0] - 2026-08-06

### Added
- DAW-inspired dark theme design system (Ableton/Logic Pro style)
- Glass morphism, glow effects, and framer-motion micro-interactions
- Sidebar navigation with animated active indicators
- Top navigation bar with search, notifications, and user menu
- Advanced Prompt Builder with genre, mood, key, BPM, structure toggle filters
- AI Smart Prompt Enhancer (LLM-powered prompt enrichment)
- Credit Balance widget with plan/monetization modal
- Studio Dashboard with two-column layout (prompt + recent tracks)
- Community Discover feed (SoundCloud-style with trending/new/top tabs)
- Personal Library with All/Completed/Drafts/Published tab filtering
- TrackCard component (grid and list variants with play overlay and quick actions)
- Toast notification system (success, error, info with animated dismiss)
- Skeleton loaders for dashboard, track cards, and content
- Custom UI primitives: Button, Card, Badge, Tabs, Progress, Toast
- Stem-colored badges (vocals, drums, bass, piano, guitar)
- Custom scrollbar styling and selection colors
- JetBrains Mono monospace font for technical displays
- Router redirect from `/` to `/studio`

### Changed
- Root layout: sidebar + topbar shell replaces old Navbar+footer
- globals.css: complete Tailwind v4 theme redesign with CSS custom properties
- page.tsx: redirect to /studio instead of old generation form
- package.json: added framer-motion, @radix-ui, lucide-react, sonner, class-variance-authority

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
