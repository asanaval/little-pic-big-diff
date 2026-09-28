@echo off
REM Brings this copy of the app up to date with the template (the OneDrive working copy): the
REM app's own files, never the gallery's content. Copied, overwriting what is here:
REM   - the files at the top of the folder (scripts, requirements.txt, CLAUDE.md), except
REM     copy.bat itself (a batch file overwritten while it runs can break mid-way)
REM   - assets\ and site\, except site\images\, site\thumbs\, site\gallery.jsonc and
REM     site\gallery+.jsonc (each copy has its own images and gallery file)
REM Nothing is deleted here (no /MIR): files that exist only in this copy stay.
set "SRC=%USERPROFILE%\OneDrive\Apps\little-pic-big-diff"
set "DST=%~dp0"
set "DST=%DST:~0,-1%"

REM Run from the template itself (run.bat calls it there too): nothing to copy.
if /i "%SRC%"=="%DST%" (
  echo [copy] skipped: this is the template
  goto :end
)
if not exist "%SRC%\site\" (
  echo [copy] template not found: %SRC%
  exit /b 1
)

echo [copy] %SRC%  =^>  %DST%
robocopy "%SRC%" "%DST%" /XF copy.bat /R:2 /W:1 /NDL /NP /NJH /NJS
if errorlevel 8 goto :failed
robocopy "%SRC%\assets" "%DST%\assets" /E /R:2 /W:1 /NDL /NP /NJH /NJS
if errorlevel 8 goto :failed
robocopy "%SRC%\site" "%DST%\site" /E /XD "%SRC%\site\images" "%SRC%\site\thumbs" /XF gallery.jsonc gallery+.jsonc /R:2 /W:1 /NDL /NP /NJH /NJS
if errorlevel 8 goto :failed
echo [copy] done
goto :end

:failed
echo [copy] FAILED ^(robocopy exit %ERRORLEVEL%^)
exit /b 1

:end
REM exit code 0: robocopy's 1-7 mean success, and run.bat stops on a non-zero code.
if not "%~1"=="" exit /b 0
echo.
pause
