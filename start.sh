#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Starting Music AI Studio..."
echo ""

# ── Backend ──────────────────────────────────────────
echo "[backend] Installing dependencies..."
cd "$ROOT/backend"
# Try --break-system-packages (newer pip), fall back if unsupported
pip install -q -r requirements.txt --break-system-packages 2>/dev/null || pip install -q -r requirements.txt

echo "[backend] Starting on port 8000..."
cd "$ROOT/backend"
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────
echo "[frontend] Installing dependencies..."
cd "$ROOT/frontend"
npm install --silent

echo "[frontend] Starting on port 3000..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""

# ── Cleanup on exit ──────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  wait
}
trap cleanup EXIT INT TERM

wait
