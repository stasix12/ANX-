@echo off
chcp 65001 >nul
title הפתרון המבריק - worker פרסום
cd /d "%~dp0"

echo.
echo   ============================================
echo     הפתרון המבריק - worker פרסום
echo   ============================================
echo.
echo   החלון הזה צריך להישאר פתוח כדי שפרסומים מתוזמנים יצאו.
echo   אפשר למזער אותו - רק לא לסגור.
echo.
echo   לעצירה: סגרו את החלון.
echo.

where node >nul 2>&1
if errorlevel 1 goto nonode
if not exist node_modules goto install
goto ready

:nonode
echo   [!] לא מצאתי Node.js על המחשב.
echo       התקינו מהאתר https://nodejs.org ואז הריצו את הקובץ הזה שוב.
echo.
pause
exit /b 1

:install
echo   מתקין רכיבים בפעם הראשונה. זה לוקח כמה דקות...
echo.
call npm.cmd install
if errorlevel 1 goto installfailed
goto ready

:installfailed
echo.
echo   [!] ההתקנה נכשלה. בדקו חיבור לאינטרנט ונסו שוב.
echo.
pause
exit /b 1

:ready
set FAILS=0

:run
rem Seconds before and after the run. A worker that stayed up for a while
rem and then crashed must not count toward the give-up limit, or a restart
rem weeks from now would stop the loop. ToFileTimeUtc rather than
rem -UFormat, which formats differently across PowerShell versions; only
rem the difference between the two readings matters here.
set T0=0
set T1=0
set RAN=0
for /f %%i in ('powershell -NoProfile -Command "[int]((Get-Date).ToFileTimeUtc()/10000000)" 2^>nul') do set T0=%%i

call npm.cmd run social-worker

for /f %%i in ('powershell -NoProfile -Command "[int]((Get-Date).ToFileTimeUtc()/10000000)" 2^>nul') do set T1=%%i
set /a RAN=%T1%-%T0%

if %RAN% GEQ 60 set FAILS=0
set /a FAILS=%FAILS%+1
if %FAILS% GEQ 5 goto giveup

echo.
echo   ה-worker נעצר. מפעיל אותו מחדש בעוד 10 שניות...
timeout /t 10 >nul
goto run

:giveup
echo.
echo   [!] ה-worker נעצר 5 פעמים ברצף מיד אחרי ההפעלה.
echo       כנראה חסרה הגדרה או שאין חיבור לאינטרנט.
echo       צלמו את השורות שלמעלה ושלחו אותן - שם כתוב מה חסר.
echo.
pause
exit /b 1
