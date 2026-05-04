@echo off
echo Starting PGA AgriTask Backend...
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
