@echo off
echo Starting Solace Health Check Application
echo ==========================================
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Press Ctrl+C to stop both servers
echo.

start "Backend" cmd /k "cd /d %~dp0back-end && python api_server.py"

start "Frontend" cmd /k "cd /d %~dp0front-end && npm run dev"
