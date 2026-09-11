@echo off
title IBVAP Sentinel - Command Center
cls
echo ======================================================================
echo           IBVAP SENTINEL - MASTER COMMAND CENTER
echo   (FastAPI Backend + React Web Console + AI Phone Camera Ingress)
echo ======================================================================
echo.
echo [1/2] Starting AI Backend API Gateway on http://localhost:8000 ...
start /b cmd /c "python -m uvicorn services.api_gateway.server:app --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak >nul

echo [2/2] Starting React Command Console on http://localhost:5173 ...
cd frontend
start /b cmd /c "npm run dev"
cd ..
timeout /t 3 /nobreak >nul

echo.
echo Opening Command Console in your browser...
start http://localhost:5173/console

echo.
echo ======================================================================
echo  All systems running!
echo  - Web Console: http://localhost:5173/console
echo  - REST API:    http://localhost:8000/docs
echo.
echo  In the console under 'Live Surveillance - CCTV Ingress':
echo  Enter your phone IP, select CAM_ALPHA or CAM_BRAVO, and click Connect!
echo  Press any key to exit this launcher window.
echo ======================================================================
pause
