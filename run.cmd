@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo RouteCore requires Node.js 22 or newer.
  exit /b 1
)

for /f %%V in ('node -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR (
  echo RouteCore could not determine the installed Node.js version.
  exit /b 1
)
if !NODE_MAJOR! LSS 22 (
  for /f %%V in ('node --version') do set "NODE_VERSION=%%V"
  echo RouteCore requires Node.js 22 or newer; found !NODE_VERSION!.
  exit /b 1
)

if not defined ROUTECORE_HOME set "ROUTECORE_HOME=%ROOT%data"
if not exist "%ROUTECORE_HOME%" mkdir "%ROUTECORE_HOME%"

if exist "%ROOT%RouteCore-Demonstration.routecore" (
  node "%ROOT%apps\studio\server\main.mjs" --open --project "%ROOT%RouteCore-Demonstration.routecore" %*
) else (
  node "%ROOT%apps\studio\server\main.mjs" --open %*
)
endlocal
