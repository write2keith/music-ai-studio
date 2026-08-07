# Music AI Studio

A production-grade DAW-inspired web application combining AI music generation, stem separation, audio editing, compression, and instrument note detection. Powered by Meta MusicGen, Demucs, and Pedalboard.

## Architecture

```
music-ai-studio/
├── backend/                     # FastAPI Python backend
│   ├── app/
│   │   ├── main.py              # FastAPI entry point with lifespan
│   │   ├── config.py            # Centralized settings via pydantic-settings
│   │   ├── routers/
│   │   │   ├── generate.py      # /api/generate, /api/separate endpoints
│   │   │   ├── edit.py          # /api/edit/* endpoints
│   │   │   ├── tracks.py        # /api/tracks, /api/community, /api/library
│   │   │   ├── auth.py          # /api/auth/register, /login, /logout, /me
│   │   │   ├── billing.py       # /api/billing/plans, /credits, /checkout, /webhook
│   │   │   └── llm.py          # /api/enhance-prompt (LLM prompt enrichment)
│   │   ├── store/
│   │   │   ├── tracks.py        # In-memory track store with community seeding
│   │   │   └── users.py         # In-memory user store with bcrypt auth
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic request/response validation
│   │   ├── services/
│   │   │   ├── generator.py     # MusicGen (HuggingFace Transformers)
│   │   │   ├── separator.py     # Demucs stem separation
│   │   │   ├── editor.py        # pydub + Pedalboard audio editing
│   │   │   └── llm.py           # OpenAI-compatible LLM prompt enhancer
│   │   ├── queue/
│   │   │   ├── worker.py        # In-memory job queue (Redis fallback ready)
│   │   │   └── tasks.py         # Registered async task handlers
│   │   └── middleware/
│   │       └── auth.py          # JWT authentication middleware
│   ├── prisma/
│   │   └── schema.prisma        # Database schema (User, Project, Generation, Separation)
│   └── requirements.txt
├── frontend/                    # Next.js TypeScript frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # Root layout (auth + toast + audio providers)
│   │   │   ├── globals.css      # DAW dark theme design system
│   │   │   ├── providers.tsx    # React Query provider
│   │   │   ├── (main)/          # Authenticated routes (sidebar + topnav shell)
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx     # Redirect to /studio
│   │   │   │   ├── studio/      # Studio dashboard
│   │   │   │   ├── community/   # Community feed
│   │   │   │   ├── library/     # Personal library
│   │   │   │   ├── generate/    # Stem separation
│   │   │   │   └── editor/      # Audio waveform editor
│   │   │   └── (auth)/          # Auth routes (standalone, no shell)
│   │   │       ├── layout.tsx
│   │   │       └── login/       # DAW-themed login/register page
│   │   ├── components/
│   │   │   ├── ui/              # Design primitives (Button, Card, Badge, Tabs, Toast, Skeleton)
│   │   │   ├── studio/          # Sidebar, TopNav, PromptBuilder, TrackCard, CreditWidget
│   │   │   ├── community/       # CommunityFeed component
│   │   │   ├── library/         # LibraryView component
│   │   │   ├── AudioPlayer.tsx
│   │   │   └── WaveformEditor.tsx
│   │   └── lib/
│   │       ├── api.ts           # Typed API client (generate, tracks, auth, billing, publish, fork)
│   │       ├── types.ts         # TypeScript interfaces
│   │       ├── hooks.ts         # Data fetching + mutation hooks (useTracks, usePublish, useFork, etc.)
│   │       ├── auth-context.tsx # Auth context provider (login, register, logout, refresh)
│   │       ├── audio-player.tsx # Global audio player context
│   │       └── utils.ts         # cn(), formatTime(), formatSize()
│   └── next.config.ts           # API proxy rewrites + allowedHosts
├── .env.example                 # Comprehensive env template
├── CHANGELOG.md
└── README.md
```

## Key Design Decisions

| Concern | Implementation |
|---------|---------------|
| UI Framework | Next.js 16 + TailwindCSS v4 + framer-motion |
| Design System | DAW-inspired dark theme (deep charcoal/slate, violet/cyan accents) |
| UI Primitives | Custom shadcn-style components built from Radix UI + lucide-react |
| API Validation | Pydantic v2 schemas on all endpoints |
| Async Processing | Job queue with polling (in-memory, Redis-ready) |
| Type Safety | TypeScript on frontend, Python type hints on backend |
| Error Handling | Error boundaries, try-catch, typed API errors, toast notifications |
| Loading States | Skeleton loaders, LoadingSpinner, progress bars |
| Auth | Email/password with JWT sessions, bcrypt password hashing, httponly cookies |
| Database | Prisma schema for users, projects, generations (in-memory stores for MVP) |
| Payments | Stripe checkout integration, webhook handler, test mode fallback |
| Cloud Storage | S3/R2 config in settings |

## Features

### Authentication
Email/password registration and login with DAW-themed glass card UI. JWT session tokens are stored in httponly cookies and validated by backend middleware. User menu dropdown in the top navigation bar shows name, email, and sign-out. `useAuth()` React context provides login, register, logout, and auto-session refresh.

### Billing & Credits
Plan-based credit system with Free (10/mo), Pro (200/mo), and Studio (unlimited) tiers. In test mode (no Stripe keys), selecting a plan instantly grants credits. With Stripe configured, users are redirected to Stripe Checkout and credits are granted via webhook on `checkout.session.completed`.

### Publish & Fork
Publish completed tracks to share them publicly. Fork tracks or community posts to clone them into your personal library. Library rows show Globe/GlobeOff publish actions. Community cards show a fork button with loading spinner. Track cards on the dashboard include a fork quick action.

### Studio Dashboard
Two-column layout with the Advanced Prompt Builder on the left and recent tracks on the right. The Prompt Builder includes toggles for Genre, Mood, Key, BPM, and Structure with an AI-powered Smart Prompt Enhancer. Track cards show cover art, play overlay, stem badges, and quick actions (download MP3/WAV, stems, fork).

### Community Feed
SoundCloud-style explore view with Trending, New, Top, and For You tabs. Each post shows the track title, artist, genre, the original prompt used to generate it, and like/fork/share actions with counts.

### Library
Personal track management with All, Completed, Drafts, and Published tab filters. Tracks are displayed in a table-row layout with play buttons, genre/mood tags, export format badges, published status, and inline actions (publish, edit, download, stems, more).

### Generate
Text-to-music via Meta MusicGen. Submit a prompt, the job is queued asynchronously, and the frontend polls for completion with live status text.

### Separate
Upload any audio file and split into isolated stems (vocals, drums, bass, guitar, piano, other via htdemucs_6s). Supports htdemucs, htdemucs_ft, and htdemucs_6s models. Async job queue with live polling. Automatic cloud fallback via HuggingFace Inference API when local demucs/ffmpeg unavailable.

### Tools
Multi-tool utility page with YouTube audio extraction (yt-dlp), audio compressor (sample rate/bit depth/mono reduction), and instrument note detection (FFT-based pitch transcription with MIDI note names and timing).

### Edit
Audio editor with real waveform canvas rendering, drag-to-select regions, click-to-seek, and playhead cursor animation. Supports trim/crop, fade in/out with configurable duration, normalize with configurable target dB, speed change, merge stems, and effects chain (reverb, delay, 3-band EQ, compressor). Edit chaining: each result becomes the working file for progressive editing.

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
cp ../.env.example .env
python3 -m app.main

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Backend runs on `http://localhost:8000`, frontend on `http://localhost:3000`. API requests from the frontend are proxied via Next.js rewrites.

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU VRAM | 8GB (MusicGen small) | 16GB (large model) |
| RAM | 16GB | 32GB |
| Storage | 15GB free | 30GB |
| Python | 3.10+ | 3.11+ |
| Node.js | 18+ | 22+ |
| PostgreSQL | 14+ | 16+ |
| Redis | 6+ | 7+ |

CPU-only mode works for Demucs and audio editing. MusicGen on CPU is very slow.

## Environment Variables

See `.env.example` for the complete list covering:
- Server configuration
- Database (PostgreSQL)
- Redis (async queue)
- Authentication (JWT secret, Google/GitHub OAuth)
- AI Models (MusicGen size, HuggingFace token)
- LLM Prompt Enhancement (API key, base URL, model)
- Cloud Storage (S3/R2)
- Serverless GPU (Modal)
- Payments (Stripe secret, webhook secret, price IDs)
- Rate limiting & credits
