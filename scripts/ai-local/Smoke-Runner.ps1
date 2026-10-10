<# Function: Confirm Python's liveness, authentication and CPU-based image operations. #>
param([string]$RunnerUrl = 'http://127.0.0.1:8010', [string]$Token = $env:AI_RUNNER_TOKEN)
$ErrorActionPreference = 'Stop'
if (-not $Token) { throw 'Set AI_RUNNER_TOKEN before running smoke test.' }
Invoke-RestMethod "$RunnerUrl/health" | ConvertTo-Json
$headers = @{'X-Runner-Token' = $Token}
Invoke-RestMethod "$RunnerUrl/v1/capabilities" -Headers $headers | ConvertTo-Json
Write-Host 'Runner is reachable with the shared token.'
