@echo off
REM Updates site\gallery.jsonc, thumbnails and previews from the folders in site\images.
call "%~dp0venv.bat" || exit /b
"%PY%" "%~dp0generate.py"
echo.
pause
