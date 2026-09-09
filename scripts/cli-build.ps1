# 构建 tydora-cli 单原生二进制（Windows 版）。
#
# 等价于 scripts/cli-build.sh，但通过 cmd / bash 转发到 Git Bash 跑。
# 调用方可以在 PowerShell / cmd / Git Bash 里都用。
#
# 用法同 cli-build.sh：
#   .\scripts\cli-build.ps1                     # host release
#   .\scripts\cli-build.ps1 -Debug              # host debug
#   .\scripts\cli-build.ps1 -AllWindows         # x64 + arm64 Windows

[CmdletBinding()]
param(
    [switch]$Debug,
    [switch]$HostOnly,
    [switch]$AllUnix,
    [switch]$AllWindows,
    [switch]$AllMacos,
    [switch]$All
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot "scripts/cli-build.sh"

if (-not (Test-Path $scriptPath)) {
    throw "scripts/cli-build.sh not found at $scriptPath"
}

# 找 bash：优先 Git Bash（VS Code 安装），回退到任意 bash。
$bash = $null
foreach ($candidate in @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe",
    (Get-Command bash.exe -ErrorAction SilentlyContinue).Source
)) {
    if ($candidate -and (Test-Path $candidate)) { $bash = $candidate; break }
}
if (-not $bash) {
    throw "no bash.exe found. Install Git for Windows."
}

$args = @()
if ($Debug)       { $args += "--debug" }
if ($HostOnly)    { $args += "--host-only" }
if ($AllUnix)     { $args += "--all-unix" }
if ($AllWindows)  { $args += "--all-windows" }
if ($AllMacos)    { $args += "--all-macos" }
if ($All)         { $args += "--all" }

Write-Host "[cli-build] forwarding to bash: $bash $scriptPath $($args -join ' ')" -ForegroundColor Cyan
& $bash $scriptPath @args
exit $LASTEXITCODE
