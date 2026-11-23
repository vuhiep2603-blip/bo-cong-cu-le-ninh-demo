$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path 'wheelhouse' -PathType Container)) {
    throw 'Missing offline wheelhouse. See OCR_STAGE4.md.'
}
if (-not (Test-Path 'runtime\Scripts\python.exe' -PathType Leaf)) {
    py -3.12 -m venv runtime
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the local CPython 3.12 environment.' }
}
& 'runtime\Scripts\python.exe' -m pip install --disable-pip-version-check --no-index --find-links wheelhouse -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Missing or incompatible offline wheel.' }
& 'runtime\Scripts\python.exe' preflight.py
if ($LASTEXITCODE -ne 0) { throw 'Offline preflight failed.' }
Write-Host 'Launch Start-OCR.cmd to open the local browser.'
