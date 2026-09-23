@echo off
REM prepare.bat (gallery.jsonc + thumbnails from site\images), then serve.bat (local preview).
call "%~dp0prepare.bat" chained || exit /b
call "%~dp0serve.bat"
