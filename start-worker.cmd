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
rem A restart must NOT pass through :ready, which zeroes the failure counter.
rem With every restart now going through :update, that reset would run each
rem time round and :giveup could never be reached - a worker crashing in a
rem loop would restart for ever instead of stopping and saying what is wrong.
if "%RESTART%"=="1" goto run
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
rem Captured before anything else: a `for /f` resets errorlevel.
set EXITCODE=%errorlevel%

for /f %%i in ('powershell -NoProfile -Command "[int]((Get-Date).ToFileTimeUtc()/10000000)" 2^>nul') do set T1=%%i
set /a RAN=%T1%-%T0%

rem The worker stood down because another window is already running it.
rem Nothing is broken, so restarting would only fight the live one.
if "%EXITCODE%"=="3" goto alreadyrunning

rem The worker saw a newer version waiting and stood down so this file can
rem install it. Back to :update, not :run - :run would start the SAME code
rem again and the worker would stand down again, forever. This is the whole
rem point of the exit code: the update step above already knows how to pull
rem and install, it simply never got a chance while the worker was alive.
rem
rem FAILS is reset because a planned restart is not a crash. Without this, five
rem updates in an evening would trip the give-up limit and stop publishing.
if "%EXITCODE%"=="4" goto updaterestart

rem Nothing else gets here without having run, so from this point the failure
rem counter is about crashes only.

if %RAN% GEQ 60 set FAILS=0
set /a FAILS=%FAILS%+1
if %FAILS% GEQ 5 goto giveup

rem Longer than LIVE_WORKER_MS in worker/social-worker.ts, so a worker that
rem really did crash is not mistaken for the window that is still open.
echo.
echo   ה-worker נעצר. בודק עדכון ומפעיל אותו מחדש בעוד 30 שניות...
timeout /t 30 >nul
rem EVERY restart goes through the update step, not just a planned one.
rem
rem The worker checks for a newer version itself, but only from version 3.12
rem onward - and a machine running anything older has no way to ever get it,
rem because the code that does the updating is the code that is missing. That
rem is a dead end reachable only by walking to the machine, which is exactly
rem what this whole mechanism exists to avoid.
rem
rem Pulling on every restart closes it: any exit at all - a crash, a Facebook
rem timeout, a reboot - picks up whatever is waiting. An update that fails is
rem reported and ignored, same as at startup.
set RESTART=1
goto update

:updaterestart
echo.
echo   ירדה גרסה חדשה. מתקין ומפעיל מחדש...
echo.
set FAILS=0
set RESTART=1
goto update

:alreadyrunning
echo.
echo   אפשר לסגור את החלון הזה - הפרסום ממשיך בחלון השני.
echo.
pause
exit /b 0

:giveup
echo.
echo   [!] ה-worker נעצר 5 פעמים ברצף מיד אחרי ההפעלה.
echo       כנראה חסרה הגדרה או שאין חיבור לאינטרנט.
echo       צלמו את השורות שלמעלה ושלחו אותן - שם כתוב מה חסר.
echo.
pause
exit /b 1
