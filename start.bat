@echo off
cd /d "%~dp0"
where python >nul 2>nul && (set PY=python) || (set PY=py)
start "" cmd /c "timeout /t 3 /nobreak >nul & start https://localhost:8443"
%PY% server.py
pause
