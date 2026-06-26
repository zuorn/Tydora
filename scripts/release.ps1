param(
    [string]$Version
)

$ErrorActionPreference = "Stop"

function Ask-Question {
    param([string]$Prompt, [string[]]$Options)
    Write-Host ""
    Write-Host $Prompt -ForegroundColor Cyan
    for ($i = 0; $i -lt $Options.Count; $i++) {
        Write-Host "  [$($i + 1)] $($Options[$i])"
    }
    do {
        $choice = Read-Host "请选择"
    } while ($choice -notmatch '^\d+$' -or [int]$choice -lt 1 -or [int]$choice -gt $Options.Count)
    return [int]$choice - 1
}

# ── 版本号 ──
$confPath = Join-Path $PSScriptRoot "..\src-tauri\tauri.conf.json"
$currentVersion = (Get-Content $confPath -Raw | ConvertFrom-Json).version

if (-not $Version) {
    Write-Host "当前版本: $currentVersion" -ForegroundColor Gray
    $userInput = Read-Host "请输入新版本号 (回车保持当前版本)"
    $Version = if ($userInput) { $userInput } else { $currentVersion }
}
if (-not $Version) {
    Write-Host "版本号不能为空" -ForegroundColor Red
    exit 1
}
$VersionTag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  发布版本: $VersionTag" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# ── 更新 tauri.conf.json 版本号 ──
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$conf.version = $Version
$conf | ConvertTo-Json -Depth 10 | Set-Content $confPath -Encoding UTF8
Write-Host "[1/4] tauri.conf.json 版本号已更新为 $Version" -ForegroundColor Green

# ── 设置签名环境变量 ──
$keyPath = Join-Path $env:USERPROFILE ".tauri\tydora.key"
if (-not (Test-Path $keyPath)) {
    Write-Host "私钥不存在: $KeyPath" -ForegroundColor Red
    exit 1
}
$env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Read-Host "请输入签名密钥密码"

# ── 构建 ──
Write-Host "[2/4] 开始构建..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "..")
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "构建失败" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}
Write-Host "构建完成" -ForegroundColor Green

# ── 查找构建产物 ──
$bundleDir = Join-Path $PSScriptRoot "..\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis"
$exe = Get-ChildItem "$bundleDir\*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$sig = Get-ChildItem "$bundleDir\*.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
$latestJson = Get-ChildItem "$bundleDir\latest.json" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $exe) {
    Write-Host "未找到安装包" -ForegroundColor Red
    exit 1
}

Write-Host "[3/4] 构建产物:" -ForegroundColor Yellow
Write-Host "  $($exe.Name)"
if ($sig) { Write-Host "  $($sig.Name)" }
if ($latestJson) { Write-Host "  $($latestJson.Name)" }

# ── 询问是否上传 ──
$idx = Ask-Question "是否上传到 GitHub Release?" @("上传", "不上传")
if ($idx -ne 0) {
    Write-Host "已跳过上传" -ForegroundColor Gray
    exit 0
}

# ── 创建 Release 并上传 ──
Write-Host "[4/4] 上传到 GitHub Release..." -ForegroundColor Yellow

$tag = $VersionTag
$releaseTitle = "Release $VersionTag"

# 检查 tag 是否已存在，不存在则创建
$existingTag = git tag -l $tag 2>$null
if (-not $existingTag) {
    git tag -a $tag -m "Release $tag"
    git push origin $tag
    Write-Host "  已创建并推送 tag: $tag" -ForegroundColor Green
}

# 创建 release（--draft 可改为正式版）
gh release create $tag $exe.FullName `
    --title $releaseTitle `
    --generate-notes `
    2>&1

# 上传额外文件
if ($sig) {
    gh release upload $tag $sig.FullName --clobber 2>&1
}
if ($latestJson) {
    gh release upload $tag $latestJson.FullName --clobber 2>&1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  发布成功! $VersionTag" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
