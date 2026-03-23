@echo off
setlocal enabledelayedexpansion

:: ============================================================================
::  Route Core -- Fool-Proof Build Script
::  Cable Harness Design & Management Platform
:: ============================================================================
::
::  Usage:
::    build_app.bat              Build everything (default)
::    build_app.bat all          Build everything
::    build_app.bat core         Build core package only
::    build_app.bat server       Build server package only
::    build_app.bat web          Build web frontend only
::    build_app.bat desktop      Build Electrobun desktop app
::    build_app.bat test         Run all tests
::    build_app.bat clean        Clean all build artifacts
::    build_app.bat dev          Start dev servers (API + Web)
::    build_app.bat help         Show this help
::
:: ============================================================================

title Route Core -- Build

:: ── Colors & Symbols ──
set "GREEN=[32m"
set "RED=[31m"
set "YELLOW=[33m"
set "CYAN=[36m"
set "BOLD=[1m"
set "RESET=[0m"

:: ── Resolve project root (where this script lives) ──
set "ROOT=%~dp0"
:: Remove trailing backslash
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

pushd "%ROOT%"

:: ── Parse argument ──
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=all"
set "TARGET=%TARGET: =%"

:: ── Route to handler ──
if /i "%TARGET%"=="help"    goto :ShowHelp
if /i "%TARGET%"=="--help"  goto :ShowHelp
if /i "%TARGET%"=="-h"      goto :ShowHelp
if /i "%TARGET%"=="/?"      goto :ShowHelp
if /i "%TARGET%"=="all"     goto :BuildAll
if /i "%TARGET%"=="core"    goto :BuildCore
if /i "%TARGET%"=="server"  goto :BuildServer
if /i "%TARGET%"=="web"     goto :BuildWeb
if /i "%TARGET%"=="desktop" goto :BuildDesktop
if /i "%TARGET%"=="test"    goto :RunTests
if /i "%TARGET%"=="clean"   goto :Clean
if /i "%TARGET%"=="dev"     goto :Dev

echo %RED%ERROR: Unknown target "%TARGET%"%RESET%
echo.
goto :ShowHelp

:: ============================================================================
::  HELP
:: ============================================================================
:ShowHelp
echo.
echo %BOLD%%CYAN%Route Core -- Build Script%RESET%
echo.
echo %BOLD%Usage:%RESET%  build_app.bat [target]
echo.
echo %BOLD%Targets:%RESET%
echo   all        Build everything: core ^> server ^> web  %YELLOW%(default)%RESET%
echo   core       Build @route-core/core only
echo   server     Build @route-core/server only (builds core first)
echo   web        Build @route-core/web only (builds core first)
echo   desktop    Build Electrobun desktop app (requires Bun)
echo   test       Run all tests
echo   clean      Remove dist/ and coverage/ from all packages
echo   dev        Start API server + Web dev server
echo   help       Show this help message
echo.
goto :End

:: ============================================================================
::  PREFLIGHT CHECKS
:: ============================================================================
:PreflightChecks
echo.
echo %BOLD%%CYAN%========================================%RESET%
echo %BOLD%%CYAN%  Route Core -- Preflight Checks%RESET%
echo %BOLD%%CYAN%========================================%RESET%
echo.

:: ── Check Node.js ──
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%FATAL: Node.js is not installed or not in PATH.%RESET%
    echo.
    echo   Download from: https://nodejs.org/
    echo   Required version: 18.0.0 or later
    echo.
    goto :Fail
)

:: ── Check Node.js version ──
for /f "tokens=1 delims=v" %%v in ('node -v 2^>nul') do set "NODE_RAW=%%v"
for /f "tokens=1 delims=v." %%m in ('node -v 2^>nul') do set "NODE_MAJOR=%%m"
:: Strip the leading 'v' if present
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if %NODE_MAJOR% lss 18 (
    echo %RED%FATAL: Node.js version too old. Found v%NODE_RAW%, need ^>=18.0.0%RESET%
    echo.
    echo   Download latest LTS from: https://nodejs.org/
    echo.
    goto :Fail
)
echo   %GREEN%[OK]%RESET%  Node.js %CYAN%v%NODE_RAW%%RESET%

:: ── Check npm ──
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%FATAL: npm is not installed or not in PATH.%RESET%
    echo   npm ships with Node.js. Reinstall Node.js from https://nodejs.org/
    goto :Fail
)
for /f "delims=" %%v in ('npm -v 2^>nul') do set "NPM_VER=%%v"
echo   %GREEN%[OK]%RESET%  npm    %CYAN%v%NPM_VER%%RESET%

:: ── Check package.json exists ──
if not exist "%ROOT%\package.json" (
    echo %RED%FATAL: package.json not found in %ROOT%%RESET%
    echo   Are you running this from the project root?
    goto :Fail
)
echo   %GREEN%[OK]%RESET%  package.json found

:: ── Check workspace packages exist ──
set "MISSING_PKG="
if not exist "%ROOT%\packages\core\package.json"   set "MISSING_PKG=packages/core"
if not exist "%ROOT%\packages\server\package.json"  set "MISSING_PKG=packages/server"
if not exist "%ROOT%\packages\web\package.json"     set "MISSING_PKG=packages/web"
if defined MISSING_PKG (
    echo %RED%FATAL: Missing workspace package: %MISSING_PKG%%RESET%
    echo   The project structure appears incomplete. Try: git checkout main
    goto :Fail
)
echo   %GREEN%[OK]%RESET%  Workspace packages present

echo.
echo   %GREEN%All preflight checks passed.%RESET%
echo.
goto :eof

:: ============================================================================
::  INSTALL DEPENDENCIES
:: ============================================================================
:InstallDeps
:: Check if node_modules exists; if not, install
if exist "%ROOT%\node_modules" (
    echo   %GREEN%[OK]%RESET%  node_modules found (skipping install^)
    echo         To force reinstall, delete node_modules and re-run.
    goto :eof
)

echo.
echo %BOLD%%YELLOW%  Installing dependencies...%RESET%
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo %RED%FATAL: npm install failed.%RESET%
    echo.
    echo   Troubleshooting:
    echo     1. Check your internet connection
    echo     2. Clear npm cache:  npm cache clean --force
    echo     3. Delete node_modules and package-lock.json, then retry
    echo     4. If behind a proxy, configure npm:  npm config set proxy http://...
    echo.
    goto :Fail
)
echo.
echo   %GREEN%[OK]%RESET%  Dependencies installed
goto :eof

:: ============================================================================
::  BUILD ALL
:: ============================================================================
:BuildAll
call :PreflightChecks
if %errorlevel% neq 0 goto :Fail
call :InstallDeps
if %errorlevel% neq 0 goto :Fail

echo.
echo %BOLD%%CYAN%========================================%RESET%
echo %BOLD%%CYAN%  Building All Packages%RESET%
echo %BOLD%%CYAN%========================================%RESET%
echo.

:: ── Step 1: Core ──
echo %BOLD%[1/3] Building @route-core/core...%RESET%
call npm run build:core
if %errorlevel% neq 0 (
    echo %RED%FATAL: Core build failed.%RESET%
    goto :Fail
)
echo   %GREEN%[OK]%RESET%  Core built successfully
echo.

:: ── Step 2: Server ──
echo %BOLD%[2/3] Building @route-core/server...%RESET%
call npm run build:server
if %errorlevel% neq 0 (
    echo %RED%FATAL: Server build failed.%RESET%
    goto :Fail
)
echo   %GREEN%[OK]%RESET%  Server built successfully
echo.

:: ── Step 3: Web ──
echo %BOLD%[3/3] Building @route-core/web...%RESET%
call npm run build:web
if %errorlevel% neq 0 (
    echo %RED%FATAL: Web build failed.%RESET%
    goto :Fail
)
echo   %GREEN%[OK]%RESET%  Web built successfully
echo.

goto :Success

:: ============================================================================
::  BUILD CORE
:: ============================================================================
:BuildCore
call :PreflightChecks
if %errorlevel% neq 0 goto :Fail
call :InstallDeps
if %errorlevel% neq 0 goto :Fail

echo.
echo %BOLD%%CYAN%  Building @route-core/core...%RESET%
echo.
call npm run build:core
if %errorlevel% neq 0 (
    echo %RED%FATAL: Core build failed.%RESET%
    goto :Fail
)
goto :Success

:: ============================================================================
::  BUILD SERVER
:: ============================================================================
:BuildServer
call :PreflightChecks
if %errorlevel% neq 0 goto :Fail
call :InstallDeps
if %errorlevel% neq 0 goto :Fail

echo.
echo %BOLD%%CYAN%  Building @route-core/core (dependency)...%RESET%
call npm run build:core
if %errorlevel% neq 0 (
    echo %RED%FATAL: Core build failed.%RESET%
    goto :Fail
)

echo.
echo %BOLD%%CYAN%  Building @route-core/server...%RESET%
echo.
call npm run build:server
if %errorlevel% neq 0 (
    echo %RED%FATAL: Server build failed.%RESET%
    goto :Fail
)
goto :Success

:: ============================================================================
::  BUILD WEB
:: ============================================================================
:BuildWeb
call :PreflightChecks
if %errorlevel% neq 0 goto :Fail
call :InstallDeps
if %errorlevel% neq 0 goto :Fail

echo.
echo %BOLD%%CYAN%  Building @route-core/core (dependency)...%RESET%
call npm run build:core
if %errorlevel% neq 0 (
    echo %RED%FATAL: Core build failed.%RESET%
    goto :Fail
)

echo.
echo %BOLD%%CYAN%  Building @route-core/web...%RESET%
echo.
call npm run build:web
if %errorlevel% neq 0 (
    echo %RED%FATAL: Web build failed.%RESET%
    goto :Fail
)
goto :Success

:: ============================================================================
::  BUILD DESKTOP
:: ============================================================================
:BuildDesktop
call :PreflightChecks
if %errorlevel% neq 0 goto :Fail
call :InstallDeps
if %errorlevel% neq 0 goto :Fail

:: ── Check Bun ──
where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo %RED%FATAL: Bun is not installed or not in PATH.%RESET%
    echo.
    echo   The desktop app requires Bun. Install it:
    echo     powershell -c "irm bun.sh/install.ps1 | iex"
    echo   Or visit: https://bun.sh/
    echo.
    goto :Fail
)
for /f "delims=" %%v in ('bun -v 2^>nul') do set "BUN_VER=%%v"
echo   %GREEN%[OK]%RESET%  Bun    %CYAN%v%BUN_VER%%RESET%

:: ── Check desktop package exists ──
if not exist "%ROOT%\packages\desktop\package.json" (
    echo %RED%FATAL: packages/desktop/package.json not found.%RESET%
    goto :Fail
)

echo.
echo %BOLD%%CYAN%  Building @route-core/core (dependency)...%RESET%
call npm run build:core
if %errorlevel% neq 0 (
    echo %RED%FATAL: Core build failed.%RESET%
    goto :Fail
)

echo.
echo %BOLD%%CYAN%  Building @route-core/web (dependency for desktop)...%RESET%
pushd "%ROOT%\packages\web"
call npx vite build
set "BUILD_ERR=%errorlevel%"
popd
if %BUILD_ERR% neq 0 (
    echo %RED%FATAL: Web build failed.%RESET%
    goto :Fail
)

echo.
echo %BOLD%%CYAN%  Building @route-core/desktop...%RESET%
echo.
pushd "%ROOT%\packages\desktop"
call bun run build
set "BUILD_ERR=%errorlevel%"
popd
if %BUILD_ERR% neq 0 (
    echo %RED%FATAL: Desktop build failed.%RESET%
    goto :Fail
)
goto :Success

:: ============================================================================
::  RUN TESTS
:: ============================================================================
:RunTests
call :PreflightChecks
if %errorlevel% neq 0 goto :Fail
call :InstallDeps
if %errorlevel% neq 0 goto :Fail

echo.
echo %BOLD%%CYAN%========================================%RESET%
echo %BOLD%%CYAN%  Running Tests%RESET%
echo %BOLD%%CYAN%========================================%RESET%
echo.

:: ── Core Tests ──
echo %BOLD%[1/2] Testing @route-core/core...%RESET%
call npm run test:core
if %errorlevel% neq 0 (
    echo %RED%Core tests FAILED.%RESET%
    goto :Fail
)
echo   %GREEN%[OK]%RESET%  Core tests passed
echo.

:: ── Server Tests ──
echo %BOLD%[2/2] Testing @route-core/server...%RESET%
call npm run test:server
if %errorlevel% neq 0 (
    echo %RED%Server tests FAILED.%RESET%
    goto :Fail
)
echo   %GREEN%[OK]%RESET%  Server tests passed
echo.

goto :Success

:: ============================================================================
::  CLEAN
:: ============================================================================
:Clean
echo.
echo %BOLD%%CYAN%  Cleaning build artifacts...%RESET%
echo.

set "CLEANED=0"

for %%d in (core server web desktop) do (
    if exist "%ROOT%\packages\%%d\dist" (
        rmdir /s /q "%ROOT%\packages\%%d\dist" 2>nul
        echo   Removed packages/%%d/dist
        set /a CLEANED+=1
    )
    if exist "%ROOT%\packages\%%d\coverage" (
        rmdir /s /q "%ROOT%\packages\%%d\coverage" 2>nul
        echo   Removed packages/%%d/coverage
        set /a CLEANED+=1
    )
)

if %CLEANED%==0 (
    echo   Nothing to clean — already clean.
) else (
    echo.
    echo   %GREEN%[OK]%RESET%  Cleaned %CLEANED% directories
)
echo.
goto :End

:: ============================================================================
::  DEV
:: ============================================================================
:Dev
call :PreflightChecks
if %errorlevel% neq 0 goto :Fail
call :InstallDeps
if %errorlevel% neq 0 goto :Fail

:: ── Build core first (server and web depend on it) ──
echo.
echo %BOLD%%CYAN%  Building @route-core/core (dependency)...%RESET%
call npm run build:core
if %errorlevel% neq 0 (
    echo %RED%FATAL: Core build failed.%RESET%
    goto :Fail
)

echo.
echo %BOLD%%CYAN%========================================%RESET%
echo %BOLD%%CYAN%  Starting Development Servers%RESET%
echo %BOLD%%CYAN%========================================%RESET%
echo.
echo   API Server:  %CYAN%http://localhost:3001%RESET%
echo   Web App:     %CYAN%http://localhost:5173%RESET%
echo.
echo   Press %BOLD%Ctrl+C%RESET% in each window to stop.
echo.

:: Start API server in a new window
start "Route Core — API Server (port 3001)" cmd /k "cd /d "%ROOT%" && npm run dev:server"

:: Small delay so the server starts before the frontend
timeout /t 2 /nobreak >nul

:: Start web dev server in a new window
start "Route Core — Web Dev Server (port 5173)" cmd /k "cd /d "%ROOT%" && npm run dev"

echo   %GREEN%[OK]%RESET%  Dev servers launched in separate windows.
echo.
goto :End

:: ============================================================================
::  SUCCESS / FAIL / END
:: ============================================================================
:Success
echo.
echo %BOLD%%GREEN%========================================%RESET%
echo %BOLD%%GREEN%  BUILD SUCCESSFUL%RESET%
echo %BOLD%%GREEN%========================================%RESET%
echo.
goto :End

:Fail
echo.
echo %BOLD%%RED%========================================%RESET%
echo %BOLD%%RED%  BUILD FAILED%RESET%
echo %BOLD%%RED%========================================%RESET%
echo.
echo   Review the errors above, fix, and re-run build_app.bat
echo.
popd
endlocal
exit /b 1

:End
popd
endlocal
exit /b 0
