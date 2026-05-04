@echo off
setlocal EnableDelayedExpansion
title PGA AgriTask - Stop
chcp 65001 > nul 2>&1

cd /d "%~dp0"

echo.
echo  Stopping PGA AgriTask containers ...

set "DC=docker-compose"
docker compose version > nul 2>&1
if not errorlevel 1 set "DC=docker compose"

%DC% -f backend\docker-compose.dev.yml stop
echo  Done. Your data is preserved - run start.bat to resume.
echo.
pause
