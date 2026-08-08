@echo off
echo Starting Music AI Studio...
echo.

set PYTHON=C:\Users\Keith\AppData\Local\Programs\Python\Python311\python.exe

echo [1/2] Starting backend on port 8000...
start "Music AI - Backend" cmd /c "cd /d E:\music-ai-studio\backend && %PYTHON% -m uvicorn app.main:app --reload --port 8000"

timeout /t 8 /nobreak >nul

echo [2/2] Starting frontend on port 3000...
start "Music AI - Frontend" cmd /c "cd /d E:\music-ai-studio\frontend && npm run dev"

echo.
echo Both servers starting...
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
pause
