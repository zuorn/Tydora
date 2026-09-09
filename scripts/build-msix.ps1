#Requires -Version 5.1
<#
.SYNOPSIS
  构建 Tydora 的 MSIX 包。

.DESCRIPTION
  1. 读取 VERSION 文件得到 4 段版本号
  2. 用 tauri build --no-bundle 编译出原始 exe（前端已内嵌）
  3. 把 exe + 图标 + 处理后的 AppxManifest.xml 整理到暂存目录
  4. 调用 Windows SDK 的 MakeAppx.exe 打包成 .msix

  两种模式：
  - 商店模式：提供了 PackageIdentityName + Publisher（参数或环境变量），生成未签名 MSIX
    （商店会在认证时签名，因此提交的包不需要签名）。
  - 本地模式：未提供身份标识，使用默认（Name=Tydora, Publisher=CN=Tydora），
    自动创建自签名证书并签名，产物可用 Add-AppxPackage 本地安装测试。
    此包不能提交到微软商店。

.PARAMETER PackageIdentityName
  商店分配的包标识名（Partner Center > Product identity > Package/Identity/Name）。
  未传则读取环境变量 MSSTORE_PACKAGE_IDENTITY_NAME；都没有则进入本地模式。

.PARAMETER Publisher
  商店分配的发布者（形如 CN=...）。
  未传则读取环境变量 MSSTORE_PUBLISHER；都没有则进入本地模式。

.PARAMETER Version
  覆盖版本号。默认读取仓库根的 VERSION 文件并补成 4 段。

.PARAMETER SkipBuild
  跳过 tauri build，直接用已存在的 exe 打包（本地快速测试用）。

.PARAMETER NoSign
  本地模式下跳过签名（未签名的 MSIX 无法用 Add-AppxPackage 安装）。

.EXAMPLE
  ./scripts/build-msix.ps1
  ./scripts/build-msix.ps1 -PackageIdentityName "1234567890.Tydora" -Publisher "CN=ABCD-1234"
#>
[CmdletBinding()]
param(
    [string]$PackageIdentityName = $env:MSSTORE_PACKAGE_IDENTITY_NAME,
    [string]$Publisher = $env:MSSTORE_PUBLISHER,
    [string]$PublisherDisplayName = $env:MSSTORE_PUBLISHER_DISPLAY_NAME,
    [string]$Version,
    [switch]$SkipBuild,
    [switch]$NoSign
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# ── 0. 模式判定 ───────────────────────────────────────────────────────────
$storeMode = [bool]$PackageIdentityName -and [bool]$Publisher
if (-not $storeMode) {
    $PackageIdentityName = "Tydora"
    $Publisher = "CN=Tydora"
    if (-not $PublisherDisplayName) { $PublisherDisplayName = "Tydora" }
    Write-Warning "未提供 MSSTORE_PACKAGE_IDENTITY_NAME / MSSTORE_PUBLISHER → 本地测试模式（Name=Tydora, Publisher=CN=Tydora）。"
    Write-Warning "此 MSIX 仅可用于本地安装测试，不能提交到微软商店。"
}
elseif (-not $PublisherDisplayName) {
    if ($Publisher -match '^CN="?([^",]+)"?') {
        $PublisherDisplayName = $Matches[1]
    }
    else {
        $PublisherDisplayName = $Publisher
    }
    Write-Warning "未指定 PublisherDisplayName，按 Publisher 的 CN 值推导：$PublisherDisplayName（如不对请用 -PublisherDisplayName 或 env:MSSTORE_PUBLISHER_DISPLAY_NAME 覆盖）"
}

# ── 1. 版本号 ─────────────────────────────────────────────────────────────
if (-not $Version) {
    $Version = (Get-Content "$repoRoot/VERSION" -Raw).Trim()
}
$parts = $Version.Split('.')
if ($parts.Count -eq 3) {
    $Version = "$Version.0"
}
elseif ($parts.Count -lt 3 -or $parts.Count -gt 4) {
    throw "VERSION 必须是 3 或 4 段（X.Y.Z[.W]），当前：$Version"
}
foreach ($p in $parts) {
    # ⚠️ 必须显式转 int 再比较：PS 5.1 中 '8' -gt 65535 会把右侧转成字符串
    # 做字典序比较（'8' > '65535' 为真），导致 0.1.8/0.1.9 等版本误报
    if ($p -notmatch '^\d+$') { throw "版本段必须是非负整数：'$p'（完整版本：$Version）" }
    if ([int]$p -gt 65535) { throw "MSIX 版本每段不能超过 65535：$Version" }
}
Write-Host "MSIX version: $Version" -ForegroundColor Cyan
Write-Host "Identity Name:        $PackageIdentityName"
Write-Host "Publisher:            $Publisher"
Write-Host "PublisherDisplayName: $PublisherDisplayName"
Write-Host "Mode:                 $(if ($storeMode) {'Store (unsigned)'} else {'Local (self-signed)'})"

# ── 2. 编译 Tauri（仅 exe，不打包安装器）─────────────────────────────────
if (-not $SkipBuild) {
    Write-Host "`n==> Building Tauri app (--no-bundle)..." -ForegroundColor Green
    npm run tauri -- build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "tauri build 失败（exit $LASTEXITCODE）" }
}

# ── 3. 定位构建产物 exe ───────────────────────────────────────────────────
# target 统一在仓库根 target/（app/.cargo/config.toml 的 target-dir="../target"）；
# `tauri build` 会把 cargo 产物（bin 名 tydora-desktop）改名为 productName=Tydora.exe。
$releaseDir = "$repoRoot/target/release"
# tauri build 通常会把主二进制改名为 productName（Tydora.exe）；--no-bundle 时
# 也可能保留 cargo 原名 tydora-desktop.exe，两个都探测。
$appExe = Join-Path $releaseDir "Tydora.exe"
if (-not (Test-Path $appExe)) {
    $appExe = Join-Path $releaseDir "tydora-desktop.exe"
}
if (-not (Test-Path $appExe)) {
    # 兜底：取 release 目录下最大的 exe（排除构建工具）
    $candidates = Get-ChildItem -Path "$releaseDir/*.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -gt 1MB } |
        Sort-Object Length -Descending
    if (-not $candidates) { throw "在 $releaseDir 找不到 app exe" }
    $appExe = $candidates[0].FullName
    Write-Host "exe 名称不是 Tydora.exe / tydora-desktop.exe，使用：$appExe"
}
$exeName = Split-Path $appExe -Leaf
Write-Host "App exe: $appExe ($([math]::Round((Get-Item $appExe).Length / 1MB, 2)) MB)"

# ── 4. 准备暂存目录 ───────────────────────────────────────────────────────
$staging = "$repoRoot/target/msix-staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path "$staging/Assets" -Force | Out-Null

# ── 5. 生成 AppxManifest.xml（替换占位符）─────────────────────────────────
# 用 String.Replace 而非 -replace，避免 Publisher（形如 CN=...）里的字符被当作正则
# ⚠️ 必须显式按 UTF-8 读取：PS 5.1 的 Get-Content -Raw 在文件无 BOM 时会按系统
# 默认编码（中文 Windows 为 GBK/936）读取，导致 UTF-8 中文被错误解码——
# 特别是「宁」字 UTF-8 末字节 0x81 会与下一个字符 '<'(0x3C) 组成 GBK 字符，
# 吃掉 '</PublisherDisplayName>' 的 '<'，触发 MakeAppx C00CEE3B schema 错误。
$manifestTemplate = [System.IO.File]::ReadAllText(
    "$repoRoot/app/tydora-desktop/msix/AppxManifest.xml",
    [System.Text.Encoding]::UTF8
)
$manifest = $manifestTemplate
$manifest = $manifest.Replace('{{PACKAGE_IDENTITY_NAME}}', $PackageIdentityName)
$manifest = $manifest.Replace('{{PUBLISHER}}', $Publisher)
$manifest = $manifest.Replace('{{PUBLISHER_DISPLAY_NAME}}', $PublisherDisplayName)
$manifest = $manifest.Replace('{{VERSION}}', $Version)

# 若 exe 名不是 tydora.exe，同步修改 manifest 里的 Executable
if ($exeName -ne "tydora.exe") {
    $manifest = $manifest.Replace('Executable="tydora.exe"', "Executable=`"$exeName`"")
}

$manifestPath = "$staging/AppxManifest.xml"
[System.IO.File]::WriteAllText($manifestPath, $manifest, (New-Object System.Text.UTF8Encoding($true)))
Write-Host "AppxManifest.xml written"

# ── 6. 复制 exe 和图标 ────────────────────────────────────────────────────
Copy-Item $appExe "$staging/" -Force

$iconSrc = "$repoRoot/app/tydora-desktop/icons"
$icons = @(
    "StoreLogo.png", "Square30x30Logo.png", "Square44x44Logo.png",
    "Square71x71Logo.png", "Square89x89Logo.png", "Square107x107Logo.png",
    "Square142x142Logo.png", "Square150x150Logo.png", "Square284x284Logo.png",
    "Square310x310Logo.png"
)
$copied = 0
foreach ($icon in $icons) {
    $src = Join-Path $iconSrc $icon
    if (Test-Path $src) {
        Copy-Item $src "$staging/Assets/" -Force
        $copied++
    }
}
Write-Host "Copied $copied icons to Assets/"

# ── 7. 定位 Windows SDK 工具（MakeAppx / SignTool）────────────────────────
function Find-SdkTool {
    param([string]$exeName)
    $sdkRoot = "C:\Program Files (x86)\Windows Kits\10"
    if (Test-Path $sdkRoot) {
        $binDirs = Get-ChildItem "$sdkRoot\bin" -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
        foreach ($dir in $binDirs) {
            $candidate = Join-Path $dir.FullName "x64\$exeName"
            if (Test-Path $candidate) { return $candidate }
        }
    }
    return (Get-Command $exeName -ErrorAction SilentlyContinue).Source
}

$makeAppx = Find-SdkTool "makeappx.exe"
if (-not $makeAppx) { throw "找不到 MakeAppx.exe，请安装 Windows SDK（Windows Software Development Kit）。" }
Write-Host "MakeAppx: $makeAppx"

# ── 8. 打包 ───────────────────────────────────────────────────────────────
$outDir = "$repoRoot/target/msix"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$msixName = "Tydora_$($Version)_x64.msix"
$msixPath = Join-Path $outDir $msixName
if (Test-Path $msixPath) { Remove-Item $msixPath -Force }

Write-Host "`n==> Packing MSIX..." -ForegroundColor Green
& $makeAppx pack /d $staging /p $msixPath /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx pack 失败（exit $LASTEXITCODE）" }

Write-Host "`n✓ MSIX 已生成: $msixPath" -ForegroundColor Green
Write-Host "  大小: $([math]::Round((Get-Item $msixPath).Length / 1MB, 2)) MB"

# ── 9. 本地模式：自签名以便 Add-AppxPackage 安装 ─────────────────────────
if (-not $storeMode -and -not $NoSign) {
    Write-Host "`n==> 签名 MSIX（本地测试自签名）..." -ForegroundColor Green
    try {
        # 查找或创建自签名证书（使用者必须与 Publisher 一致）
        $cert = Get-ChildItem "Cert:\CurrentUser\My" -ErrorAction Stop |
            Where-Object { $_.Subject -eq $Publisher } | Select-Object -First 1
        if (-not $cert) {
            Write-Host "创建自签名证书: $Publisher"
            $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher `
                -KeyUsage DigitalSignature -FriendlyName "Tydora Local MSIX" `
                -CertStoreLocation "Cert:\CurrentUser\My" `
                -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
        }

        # 信任该证书：导入 CurrentUser\Root（公开钥，不含私钥）
        $trusted = Get-ChildItem "Cert:\CurrentUser\Root" -ErrorAction Stop |
            Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
        if (-not $trusted) {
            Write-Host "将证书导入 Trusted Root（CurrentUser）以便本地信任..."
            $cerPath = Join-Path $env:TEMP "tydora_local.cer"
            [System.IO.File]::WriteAllBytes($cerPath, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
            Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
            Remove-Item $cerPath -Force
        }

        # 用 SignTool 签名
        $signTool = Find-SdkTool "signtool.exe"
        if (-not $signTool) { throw "找不到 SignTool.exe，请安装 Windows SDK。" }
        Write-Host "SignTool: $signTool"
        & $signTool sign /fd SHA256 /sha1 $cert.Thumbprint $msixPath
        if ($LASTEXITCODE -ne 0) { throw "SignTool 签名失败（exit $LASTEXITCODE）" }
        Write-Host "✓ 已签名（指纹 $($cert.Thumbprint)）" -ForegroundColor Green
        Write-Host "  本地安装: Add-AppxPackage `"$msixPath`"" -ForegroundColor DarkGray
    }
    catch {
        Write-Warning "签名失败（已跳过，MSIX 仍已生成）：$($_.Exception.Message)"
        Write-Warning "未签名的 MSIX 无法用 Add-AppxPackage 安装。请在普通终端（非沙箱）重新运行，或加 -NoSign 跳过此提示。"
    }
}
elseif ($storeMode) {
    Write-Host "商店模式：不签名（商店认证时统一签名）" -ForegroundColor DarkGray
}

# 输出路径供 CI 消费（GITHUB_ENV）
if ($env:GITHUB_ENV) {
    "MSIX_PATH=$msixPath" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding UTF8
    "MSIX_NAME=$msixName" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding UTF8
}

return $msixPath
