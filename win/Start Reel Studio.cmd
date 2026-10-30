@echo off
rem Double-click to start Reel Studio. It runs in the background and opens the editor.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start.ps1"
