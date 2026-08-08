@echo off
echo Starting Music AI Studio...
echo.

set PYTHON=C:\Users\Keith\AppData\Local\Programs\Python\Python311\python.exe

echo [1/2] Starting backend on port 8000...
start "Music AI - Backend" cmd /c "cd /d E:\music-ai-studio\backend && %PYTHON% -m uvicorn app.main:app --reload --port 8000"
echo Backend starting... waiting 8 seconds for it to be ready

timeout /t 8 /nobreak >nul

echo [2/2] Starting frontend on port 3000...
if not exist "E:\music-ai-studio\frontend\.env.local" (
    echo NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 > "E:\music-ai-studio\frontend\.env.local"
    echo Created .env.local with 127.0.0.1 (avoids Windows IPv6 localhost dead-end)
)
start "Music AI - Frontend" cmd /c "cd /d E:\music-ai-studio\frontend && npm run dev"

echo.
echo Both servers starting...
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:3000
echo.
pause
