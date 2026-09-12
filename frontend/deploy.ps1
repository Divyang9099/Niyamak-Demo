# ─────────────────────────────────────────────────────────────
# Varuna Ops — Frontend Deploy Script
# Usage: .\deploy.ps1
# Requires: curl (built into Windows 10+)
# ─────────────────────────────────────────────────────────────

$FTP_HOST   = "ftp.varunaat.in"
$FTP_USER   = "varunaat"
$FTP_PASS   = "Varuna@11223344"
$REMOTE_DIR = "/public_html/app.varunaat.in"
$VITE_API_URL = "https://api.varunaat.in/api/v1"

if (-not $FTP_PASS) {
    $secure = Read-Host "Enter cPanel/FTP password" -AsSecureString
    $FTP_PASS = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
}

Write-Host "`n[1/4] Building frontend..." -ForegroundColor Cyan
$env:VITE_API_URL = $VITE_API_URL
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/4] Creating archive..." -ForegroundColor Cyan
$archive = "dist.tar.gz"
tar -czf $archive -C dist .
Write-Host "Archive size: $((Get-Item $archive).Length / 1MB -as [int]) MB"

Write-Host "`n[3/4] Uploading archive + extract.php to $FTP_HOST..." -ForegroundColor Cyan

# Upload the dist archive
curl.exe -T $archive "ftp://${FTP_HOST}${REMOTE_DIR}/${archive}" --user "${FTP_USER}:${FTP_PASS}" --ftp-create-dirs
if ($LASTEXITCODE -ne 0) { Write-Host "Archive upload failed!" -ForegroundColor Red; exit 1 }

# Always re-upload extract.php so it is never lost after an extraction
$extractPhpPath = Join-Path $PSScriptRoot "extract.php"
curl.exe -T $extractPhpPath "ftp://${FTP_HOST}${REMOTE_DIR}/extract.php" --user "${FTP_USER}:${FTP_PASS}"
if ($LASTEXITCODE -ne 0) { Write-Host "extract.php upload failed!" -ForegroundColor Red; exit 1 }

Write-Host "`n[4/4] Extracting on server..." -ForegroundColor Cyan
# -k skips SSL cert verification for our own cPanel host (avoids curl error 35)
$result = curl.exe -k -s "https://app.varunaat.in/extract.php?secret=varuna2026"
Write-Host $result

if ($result -notmatch '"success":true') {
    Write-Host "Extraction may have failed - check the response above." -ForegroundColor Yellow
} else {
    Write-Host "`nDeploy complete! https://app.varunaat.in" -ForegroundColor Green
}
