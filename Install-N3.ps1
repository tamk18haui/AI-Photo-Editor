param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [switch]$Apply,
  [switch]$ReplaceExisting
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Join-Path $PSScriptRoot 'backend'
$targetRoot = Join-Path $RepoRoot 'backend'
if (-not (Test-Path (Join-Path $RepoRoot '.git'))) { throw "Cannot find repository .git at $RepoRoot" }
if (-not (Test-Path $targetRoot)) { if (-not $Apply) { Write-Host 'PREVIEW: backend/ will be created' -ForegroundColor Yellow } else { New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null } }
$branch = (git -C $RepoRoot branch --show-current).Trim()
if ($branch -ne 'feature/n3-backend-core') { throw "Current branch is '$branch', expected 'feature/n3-backend-core'. Switch branch first!" }
$files = @(Get-ChildItem -Path $sourceRoot -File -Recurse)
$conflicts = @()
foreach ($f in $files) {
 $relative = $f.FullName.Substring($sourceRoot.Length).TrimStart('\','/')
 $to = Join-Path $targetRoot $relative
 if ((Test-Path $to) -and ((Get-FileHash $f.FullName -Algorithm SHA256).Hash -ne (Get-FileHash $to -Algorithm SHA256).Hash)) {
  $conflicts += $relative
 }
}
Write-Host "Branch: $branch | Files: $($files.Count) | Existing file conflicts: $($conflicts.Count)"
foreach ($name in $conflicts) { Write-Host "CONFLICT: $name" -ForegroundColor Yellow }
if (-not $Apply) { Write-Host 'PREVIEW ONLY. Rerun with -Apply to copy; use -ReplaceExisting only after reviewing conflicts.'; exit 0 }
if ($conflicts.Count -gt 0 -and -not $ReplaceExisting) { throw 'Stopped BEFORE copying. Merge conflicts or rerun with -ReplaceExisting after review.' }
$timestamp = Get-Date -Format 'yyyyMMddHHmmss'
$backupRoot = "${RepoRoot}-N3-backups\$timestamp\backend"
foreach ($f in $files) {
 $relative = $f.FullName.Substring($sourceRoot.Length).TrimStart('\','/')
 $to = Join-Path $targetRoot $relative
 if ((Test-Path $to) -and ((Get-FileHash $f.FullName -Algorithm SHA256).Hash -eq (Get-FileHash $to -Algorithm SHA256).Hash)) { continue }
 if (Test-Path $to) {
  $backup = Join-Path $backupRoot $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $backup -Parent) | Out-Null
  Copy-Item $to $backup -Force
  Write-Host "BACKUP $backup" -ForegroundColor Cyan
 }
 New-Item -ItemType Directory -Force -Path (Split-Path $to -Parent) | Out-Null
 Copy-Item $f.FullName $to -Force
 Write-Host "COPIED $relative" -ForegroundColor Green
}
Write-Host 'Completed. Review: git status; configure env; run mvn test before commit.' -ForegroundColor Green
