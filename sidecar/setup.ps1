# FairDraw poller 一键配置：交互录入小号 → 生成 accounts.json → 上传 VPS → 启动服务
# 用法: powershell -ExecutionPolicy Bypass -File sidecar\setup.ps1
param(
    [string]$VpsHost = "ubuntu@92.5.46.148",
    [string]$Key     = "vps\ssh-key-2026-11-02.key",
    [string]$OutFile = "accounts.json"
)

$accounts = @()
Write-Host "录入 X 小号（name 随意起名；username 填 @handle；totp 可空）。name 留空结束。" -ForegroundColor Cyan
while ($true) {
    $name = Read-Host "`nname（如 acct1，留空结束）"
    if (-not $name) { break }
    $user = Read-Host "username（@handle）"
    $pass = Read-Host "password" -AsSecureString
    $totp = Read-Host "totp Base32（没有直接回车）"

    $a = [ordered]@{
        name     = $name
        username = $user.TrimStart('@')
        password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                       [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass))
    }
    if ($totp) { $a.totp = ($totp -replace '\s', '').ToUpper() }
    $accounts += $a
}
if ($accounts.Count -eq 0) { Write-Host "没录账号，退出"; exit 1 }

$accounts | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $OutFile
Write-Host "`n✓ $OutFile 写好（$($accounts.Count) 个账号）" -ForegroundColor Green

# 如果本地还有手动导出的 cookies_export\*.json，一并带上
$extra = @()
if (Test-Path "cookies_export") { $extra = Get-ChildItem cookies_export -Filter *.json | ForEach-Object FullName }

Write-Host "上传到 VPS..." -ForegroundColor Cyan
scp -o BatchMode=yes -i $Key $OutFile "${VpsHost}:~/fairdraw-poller/"
if ($extra) { scp -o BatchMode=yes -i $Key @extra "${VpsHost}:~/fairdraw-poller/cookies/" }
if ($LASTEXITCODE -ne 0) { Write-Host "scp 失败"; exit 1 }

Write-Host "启动服务..." -ForegroundColor Cyan
ssh -o BatchMode=yes -i $Key $VpsHost "chmod 600 ~/fairdraw-poller/accounts.json; sudo systemctl restart fairdraw-poller; sleep 12; journalctl -u fairdraw-poller -n 40 --no-pager"
