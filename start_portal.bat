@echo off
title PortalHub - Central Dashboard Server (Port 8088)
cd /d "%~dp0"
echo ==========================================================
echo Starting PortalHub Unified Service Gateway (Port 8088)...
echo Sibling projects in D:\PROJECTS will be accessible.
echo ==========================================================
echo.
python serve.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server could not start. If Python is not installed or port 8088 is in use,
    echo check the error message above.
    echo.
    pause
)
