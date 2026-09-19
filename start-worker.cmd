@echo off
rem cmd.exe decodes the rest of this file with the console codepage that was
rem active when it opened the file, so a `chcp 65001` further down comes too
rem late and the Hebrew below prints as mojibake. Re-run once in a fresh cmd
rem that already has UTF-8 set, and every line after this decodes correctly.
if "%~1"=="--utf8" goto main
chcp 65001 >nul
cmd /c "%~f0" --utf8
exit /b %errorlevel%
:main

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
goto update

:nonode
echo   [!] לא מצאתי Node.js על המחשב.
echo       התקינו מהאתר https://nodejs.org ואז הריצו את הקובץ הזה שוב.
echo.
pause
exit /b 1

rem Pull the latest version before starting. Forgetting to run
rem update-social.cmd first is not a mistake the owner should be able to make:
rem the worker ran happily on an old build while the fix sat in the repository,
rem and the only clue was a version number in a line of log. An update that
rem fails (no internet, a diverged branch) is reported and then ignored - the
rem worker still starts on the version already on disk, because not publishing
rem is worse than publishing from yesterday's code.
:update
where git >nul 2>&1
if errorlevel 1 goto deps
echo   בודק אם יש גרסה חדשה...
set BEFORE=
set AFTER=
for /f %%i in ('git rev-parse HEAD 2^>nul') do set BEFORE=%%i
rem next dev rewrites AGENTS.md and CLAUDE.md, and both are tracked, so park
rem local changes instead of letting the pull refuse. -u leaves .env.local be.
git diff --quiet
if errorlevel 1 git stash push -u -m "auto-stash before worker start" >nul 2>&1
git pull --ff-only >nul 2>&1
if errorlevel 1 goto updatefailed
for /f %%i in ('git rev-parse HEAD 2^>nul') do set AFTER=%%i
if "%BEFORE%"=="%AFTER%" goto uptodate
echo   ירדה גרסה חדשה. מתקין רכיבים...
echo.
call npm.cmd install
if errorlevel 1 goto installfailed
goto version

:uptodate
echo   הגרסה מעודכנת.
goto version

:updatefailed
echo   [i] לא הצלחתי לבדוק עדכון - ממשיך עם הגרסה שכבר במחשב.
goto version

:version
for /f %%i in ('git rev-parse --short HEAD 2^>nul') do echo   גרסה: %%i
echo.

:deps
if not exist node_modules goto install
goto ready

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
rem weeks from now would stop the loop. ToFileTimeUtc rather than -UFormat,
rem which formats differently across PowerShell versions; only the
rem difference between the two readings matters here.
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
