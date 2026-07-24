$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Installing Playwright runner dependencies..." -ForegroundColor Cyan
npm install
Write-Host "Installing Chromium for Playwright..." -ForegroundColor Cyan
npx playwright install chromium
Write-Host "Browser QA runner is ready." -ForegroundColor Green
