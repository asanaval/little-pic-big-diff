@echo off
REM Local preview at http://localhost:8137 (the site cannot load gallery.jsonc from a file:// address).
call "%~dp0venv.bat" || exit /b
start "" http://localhost:8137
"%PY%" "%~dp0serve.py" 8137
