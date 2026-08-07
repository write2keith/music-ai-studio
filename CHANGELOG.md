# Changelog

## [2.2.0] - 2026-08-06

### Added
- Async stem separation: job queue-based architecture, submit returns `job_id` instantly, frontend polls status every 2s with progress display
- Cloud stem separation: HuggingFace Inference API fallback when local demucs/ffmpeg unavailable, same auto/local/cloud mode as generation
- WaveformEditor canvas rendering: real waveform visualization via AudioContext, drag-to-select regions, click-to-seek, playhead cursor animation
- WaveformEditor edit chaining: each edit result becomes the new working file for progressive editing
- Configurable fade/normalize: inline sliders for fade duration (0.5-10s) and normalize target (-24 to 0 dB)
- Audio compressor tool: scipy/numpy-based WAV compression with sample rate/bit depth/mono controls, on /tools page
- Instrument note detection: FFT-based monophonic pitch transcription, MIDI note names + timing, on /tools page
- Studio generation polling: PromptBuilder now submits async job and polls for completion with live status text
- `SEPARATION_MODE` config (auto/cloud/local) and `DEMUCS_MODEL_ID` settings

### Fixed
- Backend reload prevents uvicorn from restarting when demucs writes stem files to output/ (added `--reload-exclude "output/*"`)
- Frontend separation polling hardened with try/catch for graceful network failure handling
- `GenerationJobResponse.result` widened to `Optional[dict]` to accept both audio and stem response formats
- Frontend `GenerationJob.result` type widened to `AudioResult | StemResult`

### Changed
- Separation mode added to `get_separator_info()` and health endpoint
- `.gitignore`: added `frontend-legacy/` and `push_*.py` entries

## [2.1.0] - 2026-08-06

### Added
- Authentication system: email/password registration and login with JWT session tokens
- `/login` page with DAW-themed glass card UI, sign-in/sign-up toggle, error states
- Auth context provider (`useAuth()`) with auto-session refresh on mount
- User menu dropdown in TopNav (name, email, sign out) and Sign In button for guests
- Backend `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `GET /api/auth/me`
- JWT-based auth middleware with `python-jose` and bcrypt password hashing
- In-memory user store with email uniqueness enforcement

### Added (Billing)
- Stripe billing router: `GET /api/billing/plans`, `GET /api/billing/credits`, `POST /api/billing/checkout`, `POST /api/billing/webhook`
- Credit management in user store: `add_credits()`, `deduct_credits()`, `get_credits()`
- Test mode: selecting a plan instantly grants credits when Stripe keys are not configured
- CreditWidget reads real user credits from auth context and sends checkout requests
- Free ($0/10cr), Pro ($12/200cr), Studio ($29/unlimited) plan tiers

### Added (Publish & Fork)
- `POST /api/tracks/{id}/publish` and `POST /api/tracks/{id}/unpublish` endpoints with ownership checks
- `POST /api/tracks/{id}/fork` endpoint (clones track or community post into user library, increments fork count)
- Track model: `user_id` field with per-user track filtering in `list_user_tracks()`
- Frontend mutation hooks: `usePublish()`, `useUnpublish()`, `useFork()`
- LibraryView: Globe/GlobeOff publish/unpublish buttons on completed tracks
- CommunityFeed: wired fork button with loading spinner, optimistic count, toast notification
- TrackCard grid variant: wired fork quick action with loading state and toast

### Fixed
- Root route structure split into `(main)` (sidebar+topnav shell) and `(auth)` (standalone login) route groups

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
