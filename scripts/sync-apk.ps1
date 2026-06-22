# sync-apk.ps1
# Copies the latest debug APK from Android build output into the frontend
# public/downloads folder and updates the version metadata JSON.
#
# Usage (from project root):
#   powershell -ExecutionPolicy Bypass -File scripts/sync-apk.ps1
#
# Run this AFTER: ./gradlew clean assembleDebug (in the android/ directory)
# Then commit and push — Vercel/Render will serve the new APK automatically.

param(
  [string]$ApkSource = "android\app\build\outputs\apk\debug\app-debug.apk",
  [string]$ApkDest   = "frontend\public\downloads\trade-with-tayyab-v1.1.apk",
  [string]$VersionJson = "frontend\public\downloads\apk-version.json"
)

Set-Location $PSScriptRoot\..

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Trade With Tayyab — APK Sync Script  " -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Verify source APK exists
if (-not (Test-Path $ApkSource)) {
  Write-Host "❌  APK not found at: $ApkSource" -ForegroundColor Red
  Write-Host "   Run './gradlew clean assembleDebug' inside the android/ folder first." -ForegroundColor Yellow
  exit 1
}

$srcFile = Get-Item $ApkSource
Write-Host "✅  Source APK found:" -ForegroundColor Green
Write-Host "    Path    : $($srcFile.FullName)"
Write-Host "    Size    : $([math]::Round($srcFile.Length / 1MB, 2)) MB"
Write-Host "    Modified: $($srcFile.LastWriteTime)"

# 2. Check if destination is already up-to-date (same size = skip copy)
if (Test-Path $ApkDest) {
  $dstFile = Get-Item $ApkDest
  if ($srcFile.Length -eq $dstFile.Length -and $srcFile.LastWriteTime -le $dstFile.LastWriteTime) {
    Write-Host "`nℹ️  Destination is already up-to-date (same size). No copy needed." -ForegroundColor Yellow
  } else {
    Write-Host "`n⬆️  Updating APK (old size: $([math]::Round($dstFile.Length/1MB,2)) MB → new: $([math]::Round($srcFile.Length/1MB,2)) MB)" -ForegroundColor Yellow
    Copy-Item $ApkSource -Destination $ApkDest -Force
    Write-Host "✅  APK copied to: $ApkDest" -ForegroundColor Green
  }
} else {
  New-Item -ItemType Directory -Path (Split-Path $ApkDest) -Force | Out-Null
  Copy-Item $ApkSource -Destination $ApkDest -Force
  Write-Host "✅  APK copied to: $ApkDest" -ForegroundColor Green
}

# 3. Read versionCode and versionName from build.gradle
$buildGradle = Get-Content "android\app\build.gradle" -Raw
$versionCode = [regex]::Match($buildGradle, 'versionCode\s+(\d+)').Groups[1].Value
$versionName = [regex]::Match($buildGradle, 'versionName\s+"([^"]+)"').Groups[1].Value
$fileSize    = "$([math]::Round((Get-Item $ApkDest).Length / 1MB, 2)) MB"
$updatedAt   = (Get-Date).ToString("yyyy-MM-dd")

# 4. Write version JSON
$versionData = @{
  versionCode = [int]$versionCode
  versionName = $versionName
  appId       = "com.TradewithTayyab.app"
  fileName    = "trade-with-tayyab.apk"
  fileSize    = $fileSize
  updatedAt   = $updatedAt
} | ConvertTo-Json -Depth 2

Set-Content -Path $VersionJson -Value $versionData -Encoding UTF8
Write-Host "✅  Version JSON updated: versionCode=$versionCode  versionName=$versionName" -ForegroundColor Green

# 5. Summary
$destFile = Get-Item $ApkDest
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Sync Complete!" -ForegroundColor Green
Write-Host "  APK  : $($destFile.FullName)"
Write-Host "  Size : $([math]::Round($destFile.Length/1MB,2)) MB"
Write-Host "  Ver  : $versionName (code $versionCode)"
Write-Host "========================================`n" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. git add frontend/public/downloads/" -ForegroundColor Gray
Write-Host "  2. git commit -m 'chore: update APK to v$versionName'" -ForegroundColor Gray
Write-Host "  3. git push" -ForegroundColor Gray
Write-Host "  → Vercel will deploy the new APK automatically.`n" -ForegroundColor Gray
