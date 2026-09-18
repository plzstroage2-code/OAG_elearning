@echo off
cd /d "%~dp0"
echo ICTC e-Learning Draw - http://localhost:3100
echo Local rehearsal code: ICTC-DEMO
echo Keep this window open while using the website.
call npm.cmd run dev
pause
