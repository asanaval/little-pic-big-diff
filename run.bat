@echo off
REM copy.bat (site\ from the OneDrive working copy), prepare.bat (gallery.jsonc + thumbnails
REM from site\images), then serve.bat (local preview). Stops when copy or prepare fails.
call "%~dp0copy.bat" chained || exit /b
call "%~dp0prepare.bat" chained || exit /b
call "%~dp0serve.bat"
