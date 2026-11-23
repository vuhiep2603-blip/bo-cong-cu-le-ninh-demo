@echo off
setlocal
pushd "%~dp0"
set "PY=runtime\python.exe"
if not exist "%PY%" set "PY=runtime\Scripts\python.exe"
if not exist "%PY%" (
  echo Missing runtime\python.exe. See the Windows provisioning guide.
  goto :failed
)
"%PY%" preflight.py
if errorlevel 1 goto :failed
"%PY%" loopback.py --tessdata models\best-int --tesseract runtime\tesseract\tesseract.exe --vietocr models\vietocr --open
exit /b %errorlevel%
:failed
pause
exit /b 1
