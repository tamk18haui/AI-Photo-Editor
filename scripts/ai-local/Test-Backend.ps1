<# Function: Compile the integrated Java 21 backend and run JUnit tests. #>
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location (Join-Path $repo 'backend')
try { & .\mvnw.cmd clean test; if ($LASTEXITCODE -ne 0) { throw 'Java tests failed' } }
finally { Pop-Location }
