@echo off
chcp 65001 >nul
title הפתרון המבריק - עדכון
cd /d "%~dp0"

echo.
echo   ============================================
echo     הפתרון המבריק - עדכון גרסה
echo   ============================================
echo.

where git >nul 2>&1
if errorlevel 1 goto nogit

rem The dev server rewrites AGENTS.md and CLAUDE.md, and both are tracked, so
rem a plain pull fails with "local changes would be overwritten" on any machine
rem that has ever run start-social.cmd. Park those changes instead of stopping;
rem stash keeps them, so nothing is thrown away.
git diff --quiet
if errorlevel 1 goto stash
goto pull

:stash
echo   יש שינויים מקומיים בקבצים. שומר אותם בצד...
git stash push -u -m "auto-stash before update" >nul
echo.

:pull
echo   מוריד את הגרסה האחרונה...
echo.
git pull --ff-only
if errorlevel 1 goto pullfailed

echo.
echo   מתקין רכיבים...
echo.
call npm.cmd install
if errorlevel 1 goto installfailed

echo.
echo   ============================================
for /f %%i in ('git rev-parse --short HEAD 2^>nul') do echo     העדכון הסתיים. גרסה: %%i
echo   ============================================
echo.
echo   המספר הזה צריך להופיע גם באפליקציה, תחת "עוד".
echo   עכשיו אפשר לסגור ולהפעיל את start-worker.cmd
echo.
pause
exit /b 0

:nogit
echo   [!] לא מצאתי Git על המחשב.
echo       התקינו מהאתר https://git-scm.com ואז הריצו את הקובץ הזה שוב.
echo.
pause
exit /b 1

:pullfailed
echo.
echo   [!] ההורדה נכשלה.
echo       בדרך כלל זה אינטרנט, או שהענף המקומי שונה מזה שבשרת.
echo       צלמו את השורות שלמעלה ושלחו אותן.
echo.
pause
exit /b 1

:installfailed
echo.
echo   [!] התקנת הרכיבים נכשלה. בדקו חיבור לאינטרנט ונסו שוב.
echo.
pause
exit /b 1
