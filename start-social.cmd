@echo off
chcp 65001 >nul
cd /d "%~dp0"
title הפתרון המבריק - הפעלה
start "הפתרון המבריק - אתר" cmd /k "npm.cmd run dev"
start "הפתרון המבריק - worker" cmd /k "npm.cmd run social-worker"
timeout /t 8 >nul
start http://localhost:3000/social
