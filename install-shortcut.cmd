@echo off
rem ASCII only: this file just hands over to the .ps1, which carries all the
rem Hebrew and is decoded from its BOM rather than the console codepage.
chcp 65001 >nul
title Install desktop shortcut
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-shortcut.ps1"
echo.
pause
