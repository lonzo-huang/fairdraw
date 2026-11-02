# FairDraw poller one-shot setup: interactive account entry -> accounts.json
# -> scp to VPS -> restart service -> show logs.
# Usage: powershell -ExecutionPolicy Bypass -File sidecar\setup.ps1
param(
    [string]$VpsHost = "ubuntu@92.5.46.148",
    [string]$Key     = "vps\ssh-key-2026-11-02.key",
    [string]$OutFile = "accounts.json"
)

# key may live at repo-root vps\ while the script runs from sidecar\
if (-not (Test-Path $Key) -and (Test-Path "..\vps")) { $Key = "..\$Key" }
if (-not (Test-Path $Key)) { Write-Host "SSH key not found: $Key"; exit 1 }

$accounts = @()
Write-Host "Enter X accounts. name = any label; username = handle; totp optional. Blank name = done." -ForegroundColor Cyan
while ($true) {
    $name = Read-Host "`nname (e.g. acct1, blank = finish)"
    if (-not $name) { break }
    $user = Read-Host "username (@handle)"
    $pass = Read-Host "password" -AsSecureString
    $totp = Read-Host "totp Base32 (blank = none)"

    $a = [ordered]@{
        name     = $name
        username = $user.TrimStart('@')
        password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                       [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass))
    }
    if ($totp) { $a.totp = ($totp -replace '\s', '').ToUpper() }
    $accounts += $a
}
if ($accounts.Count -eq 0) { Write-Host "no accounts entered, abort"; exit 1 }

if ($accounts.Count -eq 1) { $json = "[" + ($accounts | ConvertTo-Json -Depth 3 -Compress) + "]" }
else { $json = $accounts | ConvertTo-Json -Depth 3 }
[IO.File]::WriteAllText((Resolve-Path .).Path + "\" + $OutFile, $json, (New-Object Text.UTF8Encoding $false))
Write-Host "`nOK $OutFile written ($($accounts.Count) accounts)" -ForegroundColor Green

# Pick up manually exported cookies_export\*.json too, if present.
$extra = @()
if (Test-Path "cookies_export") { $extra = Get-ChildItem cookies_export -Filter *.json | ForEach-Object FullName }

Write-Host "uploading to VPS..." -ForegroundColor Cyan
scp -o BatchMode=yes -i $Key $OutFile "${VpsHost}:~/fairdraw-poller/"
if ($LASTEXITCODE -ne 0) { Write-Host "scp failed"; exit 1 }
if ($extra) { scp -o BatchMode=yes -i $Key @extra "${VpsHost}:~/fairdraw-poller/cookies/" }

Write-Host "restarting service, fetching logs..." -ForegroundColor Cyan
ssh -o BatchMode=yes -i $Key $VpsHost "chmod 600 ~/fairdraw-poller/accounts.json; sudo systemctl restart fairdraw-poller; sleep 12; journalctl -u fairdraw-poller -n 40 --no-pager"
