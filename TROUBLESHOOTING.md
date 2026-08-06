# Music AI Studio - Local Setup Troubleshooting

## Step 1: Ensure Python is Installed

Download Python 3.11+ from https://python.org/downloads/
During install, check "Add Python to PATH"

Verify:
```powershell
python --version
# Should output: Python 3.11.x
```

---

## Step 2: Clone and Pull Latest

```powershell
git clone https://github.com/write2keith/music-ai-studio.git
cd E:\music-ai-studio
git fetch origin
git reset --hard origin/master
```

---

## Step 3: Backend Setup

### Issue: Wrong Python/Pip from Another Venv
If `python` points to another venv (e.g. hermes-agent), create a fresh venv with the system Python.

```powershell
cd E:\music-ai-studio\backend

# Deactivate any active venv
deactivate

# Create fresh venv using system Python
python -m venv venv
```

### Issue: PowerShell Script Execution Blocked
If you get `running scripts is disabled on this system`, activate via cmd or use python directly:

```powershell
# Option A: Use cmd to activate
cmd /c "venv\Scripts\activate.bat && pip install -r requirements.txt"

# Option B: Skip activation, use venv python directly
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

### Install Dependencies and Run

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend runs on `http://localhost:8000`

---

## Step 4: Frontend Setup

### Issue: Wrong Frontend Files (Old Legacy Build)
If `dir` shows `app.js`, `index.html`, `style.css` instead of `package.json`, the clone is stale. See Step 2.

```powershell
cd E:\music-ai-studio\frontend
npm install
npm run dev
```

### Issue: Duplicate Page Route Errors
If you see `You cannot have two parallel pages that resolve to the same path` for `/community`, `/studio`, `/library`, `/editor`, `/generate`:

```powershell
cd E:\music-ai-studio
git pull
```

Frontend runs on `http://localhost:3000`

---

## Step 5: Verify Everything Works

1. Open `http://localhost:3000` in browser
2. You should see the DAW-themed Music AI Studio dashboard
3. Create an account at `http://localhost:3000/login`
4. API requests from frontend are proxied to backend automatically

---

## Key URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Login | http://localhost:3000/login |
| Studio | http://localhost:3000/studio |
| Community | http://localhost:3000/community |
| Library | http://localhost:3000/library |

---

## Quick Restart

```powershell
# Terminal 1 - Backend
cd E:\music-ai-studio\backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 - Frontend
cd E:\music-ai-studio\frontend
npm run dev
```
