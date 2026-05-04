@echo off
setlocal EnableDelayedExpansion
title PGA AgriTask - Launcher
chcp 65001 > nul 2>&1

cd /d "%~dp0"

:: Check setup has been run
if not exist ".setup_done" (
    echo.
    echo  ERROR: Setup has not been run yet.
    echo  Please double-click  setup.bat  first.
    echo.
    pause & exit /b 1
)

:: Check Docker is running
docker info > nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Docker Desktop is not running.
    echo  Open Docker Desktop from the Start Menu, wait for it to fully load,
    echo  then run start.bat again.
    echo.
    pause & exit /b 1
)

:: Detect docker compose plugin vs old docker-compose binary
set "DC=docker-compose"
docker compose version > nul 2>&1
if not errorlevel 1 set "DC=docker compose"

:: Start Redis (and Postgres if local dev mode)
echo.
echo  Starting containers ...
set "USE_SUPABASE=0"
if exist "backend\.env" (
    findstr /i "supabase.com" "backend\.env" > nul 2>&1
    if not errorlevel 1 set "USE_SUPABASE=1"
)
if "%USE_SUPABASE%"=="1" (
    %DC% -f backend\docker-compose.dev.yml up -d redis > nul 2>&1
) else (
    %DC% -f backend\docker-compose.dev.yml up -d > nul 2>&1
)
echo  Containers started.

:: Brief wait for Redis to be ready
timeout /t 2 /nobreak > nul

:: Start backend in a new window
echo  Starting backend  (http://localhost:8000^) ...
set "BACKEND=%~dp0backend"
start "PGA Backend" cmd /k "cd /d ""%BACKEND%"" && call venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

:: Start frontend in a new window
echo  Starting frontend (http://localhost:5173^) ...
set "FRONTEND=%~dp0frontend"
start "PGA Frontend" cmd /k "cd /d ""%FRONTEND%"" && npm run dev"

:: Open browser after a short wait
echo.
echo  Opening browser in 6 seconds ...
timeout /t 6 /nobreak > nul
start http://localhost:5173

echo.
echo  ============================================================
echo   App is running!
echo.
echo    Frontend  http://localhost:5173
echo    Backend   http://localhost:8000
echo    API Docs  http://localhost:8000/docs
echo.
echo   Close the Backend and Frontend windows to stop the app.
echo   Run  stop.bat  to shut down the containers.
echo  ============================================================
echo.
