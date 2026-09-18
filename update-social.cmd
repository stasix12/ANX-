@echo off
title הפתרון המבריק - עדכון
cd /d "%~dp0"
git pull
npm.cmd install
echo.
echo העדכון הסתיים. אפשר לסגור את החלון ולהפעיל את start-social.cmd
pause
