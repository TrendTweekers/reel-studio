@echo off
rem Double-click to talk to Claude about your reels. Write in Polish or English.
chcp 65001 >nul
cd /d "%~dp0.."
rem Always your Claude subscription, never paid API billing.
set "ANTHROPIC_API_KEY="
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
where claude >nul 2>nul || (echo Claude Code nie jest zainstalowany. Wklej jeszcze raz linię instalacyjną z maila po zakupie. / Claude Code is not installed. Paste the install line from the purchase email again. & pause & exit /b 1)
claude
