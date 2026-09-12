# ─────────────────────────────────────────────────────────────
# Varuna Ops — Backend Deploy Script
# Usage: .\deploy-backend.ps1 [-Message "your commit message"]
# ─────────────────────────────────────────────────────────────
param([string]$Message = "Update backend")

$EC2_HOST = "13.207.136.167"
$EC2_USER = "ubuntu"
$EC2_KEY  = "$HOME\Downloads\varuna-key-2.pem"

Write-Host "`n[1/3] Pushing to GitHub..." -ForegroundColor Cyan
git add -A
git commit -m $Message
git push
if ($LASTEXITCODE -ne 0) { Write-Host "Git push failed!" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/3] Connecting to EC2 and pulling latest code..." -ForegroundColor Cyan
ssh -i $EC2_KEY "${EC2_USER}@${EC2_HOST}" "cd ~/Varuna-ops && git pull"
if ($LASTEXITCODE -ne 0) { Write-Host "Git pull on EC2 failed!" -ForegroundColor Red; exit 1 }

Write-Host "`n[3/3] Restarting backend..." -ForegroundColor Cyan
ssh -i $EC2_KEY "${EC2_USER}@${EC2_HOST}" "cd ~/Varuna-ops/backend && npm install --omit=dev && pm2 restart varuna-api varuna-worker"
if ($LASTEXITCODE -ne 0) { Write-Host "Restart failed!" -ForegroundColor Red; exit 1 }

Write-Host "`nBackend deployed! https://api.varunaat.in/health" -ForegroundColor Green
