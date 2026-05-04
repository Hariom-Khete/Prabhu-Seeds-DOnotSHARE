@echo off
setlocal EnableDelayedExpansion
title PGA AgriTask - Setup
chcp 65001 > nul 2>&1

echo.
echo  ============================================================
echo   PGA AgriTask  ^|  First-Time Setup
echo  ============================================================
echo.
echo  Install these BEFORE running this script:
echo.
echo    1. Python 3.11+
echo       https://www.python.org/downloads/
echo       IMPORTANT: tick "Add Python to PATH" during install
echo.
echo    2. Node.js 18+ (LTS)
echo       https://nodejs.org/
echo.
echo    3. Docker Desktop  ^(must be open and running^)
echo       https://www.docker.com/products/docker-desktop/
echo.
echo  ============================================================
echo.
pause

cd /d "%~dp0"

:: ===========================================================================
:: 1. PYTHON
:: ===========================================================================
echo.
echo [1/7] Checking Python 3.11+ ...

set "PY="
python --version > nul 2>&1
if not errorlevel 1 set "PY=python"
if not defined PY (
    py --version > nul 2>&1
    if not errorlevel 1 set "PY=py"
)

if not defined PY (
    echo.
    echo  ERROR: Python not found.
    echo  Download: https://www.python.org/downloads/
    echo  Tick "Add Python to PATH" during install, then re-run this script.
    echo.
    pause & exit /b 1
)

for /f "tokens=2" %%v in ('!PY! --version 2^>^&1') do set "PYVER=%%v"
for /f "tokens=1 delims=." %%a in ("!PYVER!") do set "PYMAJ=%%a"
for /f "tokens=2 delims=." %%b in ("!PYVER!") do set "PYMIN=%%b"
if !PYMAJ! LSS 3 goto :python_old
if !PYMAJ! EQU 3 if !PYMIN! LSS 11 goto :python_old
echo  Python !PYVER! ... OK
goto :check_node

:python_old
echo  ERROR: Python !PYVER! is too old. Need 3.11 or newer.
echo  Download: https://www.python.org/downloads/
echo.
pause & exit /b 1

:: ===========================================================================
:: 2. NODE.JS
:: ===========================================================================
:check_node
echo.
echo [2/7] Checking Node.js 18+ ...

node --version > nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Node.js not found.
    echo  Download: https://nodejs.org/  (choose the LTS version^)
    echo.
    pause & exit /b 1
)
for /f %%v in ('node --version') do set "NODEVER=%%v"
for /f "tokens=1 delims=." %%a in ("!NODEVER:~1!") do set "NODEMAJ=%%a"
if !NODEMAJ! LSS 18 (
    echo  ERROR: Node.js !NODEVER! is too old. Need 18 or newer.
    echo  Download: https://nodejs.org/
    echo.
    pause & exit /b 1
)
echo  Node.js !NODEVER! ... OK

:: ===========================================================================
:: 3. DOCKER  (detect new plugin vs old standalone)
:: ===========================================================================
echo.
echo [3/7] Checking Docker Desktop ...

docker --version > nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Docker not found.
    echo  Download: https://www.docker.com/products/docker-desktop/
    echo  Install it, START Docker Desktop, then re-run this script.
    echo.
    pause & exit /b 1
)
docker info > nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Docker is installed but NOT running.
    echo  Open Docker Desktop from the Start Menu, wait for it to fully load,
    echo  then re-run this script.
    echo.
    pause & exit /b 1
)
echo  Docker ... OK

:: Detect docker compose plugin vs old docker-compose binary
set "DC=docker-compose"
docker compose version > nul 2>&1
if not errorlevel 1 set "DC=docker compose"
echo  Docker Compose command: %DC%

:: Detect whether we are using Supabase (cloud DB) or local Docker DB
set "USE_SUPABASE=0"
if exist "backend\.env" (
    findstr /i "supabase.com" "backend\.env" > nul 2>&1
    if not errorlevel 1 set "USE_SUPABASE=1"
)

if "%USE_SUPABASE%"=="1" (
    echo.
    echo  Cloud database detected ^(Supabase^) - starting Redis only ...
    %DC% -f backend\docker-compose.dev.yml up -d redis
    if errorlevel 1 (
        echo  ERROR: Failed to start Redis container.
        echo  Make sure Docker Desktop is running and try again.
        pause & exit /b 1
    )
    echo  Redis started.
) else (
    echo.
    echo  Local database mode - starting PostgreSQL + Redis ...
    %DC% -f backend\docker-compose.dev.yml up -d
    if errorlevel 1 (
        echo  ERROR: Failed to start containers. Check Docker Desktop is running.
        pause & exit /b 1
    )
    echo  Waiting for PostgreSQL to be ready (up to 60s) ...
    set /a PG_TRIES=0
    :wait_pg
    set /a PG_TRIES+=1
    if !PG_TRIES! GTR 30 (
        echo  ERROR: PostgreSQL did not start in time.
        echo  Check Docker Desktop logs for errors.
        pause & exit /b 1
    )
    %DC% -f backend\docker-compose.dev.yml exec -T postgres pg_isready -U pgauser -d prabhu_seeds > nul 2>&1
    if errorlevel 1 (
        timeout /t 2 /nobreak > nul
        goto :wait_pg
    )
    echo  PostgreSQL is ready!
)

:: ===========================================================================
:: 4. PYTHON VIRTUAL ENVIRONMENT + PACKAGES
:: ===========================================================================
echo.
echo [4/7] Setting up Python environment ...

if not exist "backend\venv\" (
    echo  Creating virtual environment ...
    !PY! -m venv backend\venv
    if errorlevel 1 (
        echo  ERROR: Failed to create virtual environment.
        pause & exit /b 1
    )
)

call backend\venv\Scripts\activate.bat
if errorlevel 1 (
    echo  ERROR: Could not activate virtual environment.
    pause & exit /b 1
)

echo  Installing Python packages (this may take 1-2 minutes) ...
pip install -r backend\requirements.txt --quiet --disable-pip-version-check
if errorlevel 1 (
    echo  ERROR: pip install failed. Check your internet connection.
    pause & exit /b 1
)
echo  Python packages ... OK

:: ===========================================================================
:: 5. CONFIG FILES
:: ===========================================================================
echo.
echo [5/7] Creating config files ...

if not exist "backend\.env" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\setup-env.ps1"
    if errorlevel 1 (
        echo  WARNING: Could not auto-create backend\.env
        echo  Copy backend\.env.example to backend\.env and fill in your values.
    )
) else (
    echo  backend\.env already exists, keeping it.
)

if not exist "frontend\.env" (
    (echo VITE_API_URL=http://localhost:8000) > "frontend\.env"
    echo  frontend\.env created.
) else (
    echo  frontend\.env already exists, keeping it.
)

:: ===========================================================================
:: 6. DATABASE MIGRATIONS + SEED
:: ===========================================================================
echo.
echo [6/7] Setting up database ...

cd /d "%~dp0backend"

echo  Running migrations ...
alembic upgrade head
if errorlevel 1 (
    echo.
    echo  ERROR: Database migration failed.
    if "%USE_SUPABASE%"=="1" (
        echo  Check your internet connection and that backend\.env has the correct
        echo  DATABASE_URL pointing to Supabase.
    ) else (
        echo  Check that PostgreSQL is running (Docker Desktop^).
    )
    cd /d "%~dp0"
    pause & exit /b 1
)
echo  Migrations ... OK

echo.
echo  Seeding demo accounts ...
!PY! scripts\seed_dev.py
if errorlevel 1 (
    echo  NOTE: Seed script returned a warning - this is usually OK if
    echo  the demo accounts already exist.
)

cd /d "%~dp0"

:: ===========================================================================
:: 7. FRONTEND PACKAGES
:: ===========================================================================
echo.
echo [7/7] Installing frontend packages (this may take 1-2 minutes) ...

cd /d "%~dp0frontend"
if not exist "node_modules\" (
    npm install
    if errorlevel 1 (
        echo  ERROR: npm install failed. Check your internet connection.
        cd /d "%~dp0"
        pause & exit /b 1
    )
) else (
    echo  node_modules already present, skipping.
)
cd /d "%~dp0"

:: ===========================================================================
:: DONE
:: ===========================================================================
echo 1 > .setup_done

echo.
echo  ============================================================
echo   Setup Complete!
echo  ============================================================
echo.
echo  Login with any registered mobile number.
echo  OTP code is: 123456  (until MSG91 credentials are added^)
echo.
echo  Run  start.bat  to launch the app.
echo  ============================================================
echo.
pause
