param([string]$BaseUrl = 'http://localhost:8080/api')
$ErrorActionPreference='Stop'
$rand=[guid]::NewGuid().ToString('N').Substring(0,10)
$email="n3smoke_$rand@example.com"
$pass='TestPassword123!'
function Request($method,$path,$body,$token) {
 $h=@{}
 if ($token) {$h['Authorization']="Bearer $token"}
 $opts=@{ Method=$method;Uri="$BaseUrl$path";Headers=$h;ErrorAction='Stop' }
 if ($null -ne $body) {$opts['ContentType']='application/json'; $opts['Body']=($body|ConvertTo-Json -Depth 60 -Compress)}
 return Invoke-RestMethod @opts
}
$auth=Request POST /auth/register @{email=$email;password=$pass;displayName='N3 Smoke'} $null
if (-not $auth.accessToken -or -not $auth.refreshToken) {throw 'Registration failed'}
$login=Request POST /auth/login @{email=$email;password=$pass} $null
$bearer=$login.accessToken
$p=Request POST /projects @{name='Smoke Project';canvasWidth=1280;canvasHeight=720;background='#FFFFFF'} $bearer
if ($p.name -ne 'Smoke Project' -or $p.canvasWidth -ne 1280) {throw 'Project create failed'}
$s=Request PUT "/projects/$($p.id)/state" @{schemaVersion=1;canvas=@{width=1280;height=720};objects=@(@{type='rect';left=10;top=10});activeFilters=@()} $bearer
if ($s.stateVersion -lt 2) {throw 'State version did not increment'}
$r=Request GET "/projects/$($p.id)/state" $null $bearer
if ($r.objects.Count -ne 1) {throw 'State did not round-trip'}
$page=Request GET '/projects?page=0&size=5&sort=UPDATED_DESC' $null $bearer
if ($page.totalElements -lt 1) {throw 'Pagination failed'}
$refresh=Request POST /auth/refresh @{refreshToken=$login.refreshToken} $null
if (-not $refresh.accessToken -or $refresh.accessToken -eq $login.accessToken) {throw 'Refresh rotation did not generate a new access token'}
Request POST /auth/logout @{refreshToken=$refresh.refreshToken} $refresh.accessToken | Out-Null
Write-Host "PASS N3 smoke: register/login/project/save/load/page/refresh/logout; created project $($p.id)" -ForegroundColor Green
