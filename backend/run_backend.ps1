$ErrorActionPreference = "Stop"

$Root = "C:\vibecity.live"
$Backend = Join-Path $Root "backend"
$Py = Join-Path $Root ".venv\Scripts\python.exe"

$Logs = Join-Path $Backend "logs"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

$OutLog = Join-Path $Logs "backend.out.log"
$ErrLog = Join-Path $Logs "backend.err.log"

if (-not (Test-Path $Py)) { throw "venv python not found: $Py" }

Set-Location $Backend

# กันชนกันหลาย instance
$Lock = Join-Path $Logs "backend.lock"
try {
  $fs = [System.IO.File]::Open($Lock, 'OpenOrCreate', 'ReadWrite', 'None')
} catch {
  exit 0
}

# รันแบบไม่ขึ้นหน้าต่าง + log ลงไฟล์
$Args = @(
  "-m","uvicorn","app.main:app",
  "--host","0.0.0.0",
  "--port","8000"
)

# (Optional) auto-restart loop ถ้าหลุด
while ($true) {
  $p = Start-Process -FilePath $Py -ArgumentList $Args `
    -WorkingDirectory $Backend `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -WindowStyle Hidden `
    -PassThru

  $p.WaitForExit()
  Start-Sleep -Seconds 2
}
