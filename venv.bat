@echo off
REM Called by prepare.bat and serve.bat: makes sure %USERPROFILE%\venvs\little-pic-big-diff exists
REM and matches requirements.txt, then sets PY to that venv's python.exe. A copy of
REM ..\common\venv.bat, kept here so this folder works on its own.
setlocal
set APP=little-pic-big-diff
set VENV=%USERPROFILE%\venvs\%APP%
set REQ=%~dp0requirements.txt
set STAMP=%VENV%\requirements.installed

if not exist "%VENV%\Scripts\python.exe" (
  echo [venv] creating %VENV% ...
  python -m venv "%VENV%" || (echo [venv] FAILED to create the venv & exit /b 1)
)
if not exist "%STAMP%" goto :install
for /f %%N in ('powershell -NoProfile -Command "if ((Get-Item '%REQ%').LastWriteTime -gt (Get-Item '%STAMP%').LastWriteTime) {1} else {0}"') do set NEWER=%%N
if "%NEWER%"=="0" goto :done

:install
echo [venv] installing requirements for %APP% ...
"%VENV%\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r "%REQ%" || (echo [venv] FAILED to install requirements & exit /b 1)
copy /y nul "%STAMP%" >nul

:done
endlocal & set "PY=%VENV%\Scripts\python.exe"
exit /b 0
