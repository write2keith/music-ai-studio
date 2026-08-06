# Music AI Studio - Verification Checklist

Use this checklist to verify the application is running correctly in any environment.

## Prerequisites

- [ ] Python 3.10+ installed (`python3 --version`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm 9+ installed (`npm --version`)
- [ ] PostgreSQL 14+ running (for DB features, optional in dev mode)
- [ ] Redis 6+ running (for async queue, optional in dev mode with in-memory fallback)
- [ ] 16GB+ RAM (32GB recommended for MusicGen large model)
- [ ] GPU with 8GB+ VRAM (optional, CPU mode works but is slow)

## Backend Setup

1. Clone and enter backend:
   ```
   cd backend
   ```

2. Create virtual environment:
   ```
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Copy environment file:
   ```
   cp ../.env.example .env
   ```

5. Edit `.env` — set `AUTH_SECRET` to a random string and configure `DATABASE_URL` if using PostgreSQL.

6. Run database migrations (if using PostgreSQL):
   ```
   prisma migrate dev
   ```

7. Verify backend starts:
   ```
   python3 -m app.main
   ```

8. Test health endpoint:
   ```
   curl http://localhost:8000/api/health
   ```
   Expected: `{"status":"ok","service":"Music AI Studio","gpu_available":true/false,...}`

## Frontend Setup

1. Enter frontend:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Copy environment file:
   ```
   cp .env.example .env.local
   ```

4. Start development server:
   ```
   npm run dev
   ```

5. Verify in browser at `http://localhost:3000`

6. Test API proxy: open `/api/health` in browser or:
   ```
   curl http://localhost:3000/api/health
   ```
   Expected: Same health response as backend (proxied through Next.js)

## AI Features

### Music Generation (MusicGen)
1. Open the Generate tab
2. Enter a prompt: "upbeat electronic dance with synth bass"
3. Set duration to 10 seconds
4. Click Generate
5. Polling indicator appears — generation is async via the job queue
6. Audio player appears when complete

**Troubleshooting:**
- First run downloads the model (~1.5GB for small, ~5GB for medium)
- CPU generation is slow (5-10 min for 10s clip)
- Set `MUSICGEN_MODEL_SIZE=small` in .env for lower memory usage
- If OOM error, try smaller duration (5s) or use `medium`/`large` models only on high-VRAM GPUs

### Stem Separation (Demucs)
1. Open the Separate tab
2. Upload an audio file (WAV/MP3)
3. Select htdemucs model
4. Click Separate Stems
5. Individual stem players appear (vocals, drums, bass, other)

**Troubleshooting:**
- First run downloads the Demucs model (~350MB)
- CPU separation is reasonably fast (1-2 min per 3-minute track)
- htdemucs_6s adds piano and guitar stems but requires more memory

### Audio Editor
1. Open the Editor tab
2. Upload an audio file
3. Use the toolbar buttons to play/pause/stop
4. Make a selection (drag on waveform in the legacy frontend)
5. Apply edits: trim, crop, fade, normalize, speed, merge, effects chain

## Error Boundaries & Loading States

Verify error handling:
- [ ] Generation timeout: start generation and wait >2 min — should show "timed out" error
- [ ] Invalid file upload: upload a non-audio file to separate — should show "Invalid file type"
- [ ] Network error: stop the backend, try generating — should show connection error with retry option
- [ ] Out of credits: (when auth is enabled) — should show appropriate message
- [ ] Loading spinner visible during all AI operations
- [ ] Error boundary catches unhandled React errors and shows fallback UI

## API Endpoint Verification

```
curl -s http://localhost:8000/api/health | python3 -m json.tool
curl -s http://localhost:8000/api/model-info | python3 -m json.tool
```

For generation (async):
```
curl -s -X POST -F "prompt=test" -F "duration=5" http://localhost:8000/api/generate
# Returns {"job_id": "abc123", "status": "pending", ...}
# Then poll:
curl -s http://localhost:8000/api/generate/<job_id>
```

## Security Verification

- [ ] `.env` is in `.gitignore` and not committed
- [ ] All `push_*.py` scripts with hardcoded tokens are removed
- [ ] `AUTH_SECRET` is set to a random value in production
- [ ] CORS origins are restricted in production (not `*`)
- [ ] Rate limiting is configured for production
- [ ] API keys (GitHub PAT, Stripe, etc.) are never hardcoded in source

## Production Readiness

- [ ] Database backups configured
- [ ] File retention policy active (old uploads cleaned up)
- [ ] Monitoring and logging set up
- [ ] GPU autoscaling configured (Modal or similar)
- [ ] SSL/TLS configured for all endpoints
- [ ] CI/CD pipeline for automated testing
- [ ] Load testing performed on generation endpoints
