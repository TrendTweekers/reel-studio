@echo off
rem Double-click to stop Klipownia (the background server on port 8787).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
