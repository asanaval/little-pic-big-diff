@echo off
REM Copies everything from the OneDrive working copy of site\ over this folder's site\,
REM overwriting files that are already there. Files that exist only here are left alone:
REM this updates what the source holds, it does not purge (no /MIR).
set "SRC=%USERPROFILE%\OneDrive\Apps\little-pic-big-diff\site"
set "DST=%~dp0site"

REM Run from the OneDrive working copy itself (run.bat calls it there too): nothing to copy.
if /i "%SRC%"=="%DST%" (
  echo [copy] skipped: this is the source folder
  goto :end
)
if not exist "%SRC%\" (
  echo [copy] source not found: %SRC%
  exit /b 1
)
if not exist "%DST%\" mkdir "%DST%"

echo [copy] %SRC%  =^>  %DST%
robocopy "%SRC%" "%DST%" /E /R:2 /W:1 /NDL /NP
if errorlevel 8 (
  echo [copy] FAILED ^(robocopy exit %ERRORLEVEL%^)
  exit /b 1
)
echo [copy] done
:end
REM exit code 0: robocopy's 1-7 mean success, and run.bat stops on a non-zero code.
if not "%~1"=="" exit /b 0
echo.
pause
