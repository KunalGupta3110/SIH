@echo off
title IBVAP Sentinel - Live Surveillance
cls
echo ======================================================================
echo           IBVAP SENTINEL - LIVE SURVEILLANCE SYSTEM
echo   (YOLO Person/Vehicle Tracking + ANPR Number Plates + Drones)
echo ======================================================================
echo.
echo Launching Live Webcam (Camera 0)...
echo Press 'q' on the video window to quit.
echo.
python run.py --live
pause
