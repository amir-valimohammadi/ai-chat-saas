param(
    [switch]$DownloadBundledBrowser
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Installing Playwright runner dependencies..." -ForegroundColor Cyan
npm install

$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) }

$edgePaths = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) }

if ($chromePaths.Count -gt 0) {
    Write-Host "Google Chrome detected: $($chromePaths[0])" -ForegroundColor Green
    Write-Host "Use QA_BROWSER_CHANNEL=chrome in backend\.env" -ForegroundColor Green
} elseif ($edgePaths.Count -gt 0) {
    Write-Host "Microsoft Edge detected: $($edgePaths[0])" -ForegroundColor Green
    Write-Host "Use QA_BROWSER_CHANNEL=msedge in backend\.env" -ForegroundColor Green
} else {
    Write-Warning "Chrome or Edge was not detected in standard Windows locations."
    Write-Host "Set QA_BROWSER_EXECUTABLE_PATH manually, or rerun with -DownloadBundledBrowser." -ForegroundColor Yellow
}

if ($DownloadBundledBrowser) {
    Write-Host "Downloading Playwright Chromium..." -ForegroundColor Cyan
    npx playwright install chromium
} else {
    Write-Host "Skipping Playwright Chromium download; the runner will use installed Chrome/Edge." -ForegroundColor Cyan
}

Write-Host "Browser QA runner dependencies are ready." -ForegroundColor Green
