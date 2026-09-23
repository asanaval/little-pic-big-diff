@echo off
REM Updates site\gallery.jsonc and thumbnails from the folders in site\images.
REM Waits for a key at the end, except when called with an argument (run.bat does that).
call "%~dp0venv.bat" || exit /b
"%PY%" "%~dp0generate.py"
if not "%~1"=="" exit /b
echo.
pause
