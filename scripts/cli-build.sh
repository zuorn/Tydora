#!/usr/bin/env bash
# 构建 tydora-cli 单原生二进制。
#
# 设计参考：见 docs/cli-implementation-plan.md
#
# 用法：
#   scripts/cli-build.sh                            # 单 host release（默认）
#   scripts/cli-build.sh --debug                    # 单 host debug（与 --all-* 互斥）
#   scripts/cli-build.sh --host-only                # 单 host，等价于不加 flag（明确）
#   scripts/cli-build.sh --all-unix                 # 三平台 release（CI 用）
#   scripts/cli-build.sh --all-windows              # Windows + Linux release
#   ...
#
# 后续分发：
#   产物落到 app/tydora-cli/binaries/<TARGET>/tydora-cli[.exe]
#   同时按 Tauri externalBin 约定复制到 app/tydora-desktop/binaries/：
#     tydora-cli-<triple>[.exe]   （tauri build / dev / NSIS 打包用）
#     tydora-cli[.exe]            （开发期手工调用的裸名副本）
#   externalBin 已在 app/tydora-desktop/tauri.conf.json 的 bundle.externalBin 声明，
#   tauri 的 beforeBuildCommand / beforeDevCommand 会先跑 npm run build:cli。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/app"
CLI_DIR="$APP_DIR/tydora-cli"
OUT_DIR="$CLI_DIR/binaries"
DESKTOP_BIN_DIR="$APP_DIR/tydora-desktop/binaries"

PROFILE="release"
# cargo 的 debug profile 名叫 `dev`（`debug` 是保留字），产物目录仍是 target/debug
CARGO_PROFILE="release"
OUT_SUBDIR="release"
BUILD_MODE="host"

# 解析参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)       PROFILE="debug"; OUT_SUBDIR="debug"; CARGO_PROFILE="dev"; shift ;;
    --host-only)   BUILD_MODE="host";            shift ;;
    --all-unix)    BUILD_MODE="all-unix";        shift ;;
    --all-windows) BUILD_MODE="all-windows";     shift ;;
    --all-macos)   BUILD_MODE="all-macos";       shift ;;
    --all)         BUILD_MODE="all";             shift ;;
    -h|--help)
      sed -n '2,40p' "$0"; exit 0 ;;
    *)             echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# --debug 与多平台互斥
if [[ "$BUILD_MODE" != "host" && "$PROFILE" == "debug" ]]; then
  echo "error: --debug and --$BUILD_MODE are mutually exclusive" >&2
  exit 2
fi

# 决定 triple 列表
case "$BUILD_MODE" in
  host)
    # cargo 自动用 rustc -vV 报告的 host triple
    TRIPLES=()
    ;;
  all-unix)
    TRIPLES=(x86_64-unknown-linux-gnu x86_64-apple-darwin aarch64-apple-darwin)
    ;;
  all-windows)
    TRIPLES=(x86_64-pc-windows-msvc aarch64-pc-windows-msvc)
    ;;
  all-macos)
    TRIPLES=(x86_64-apple-darwin aarch64-apple-darwin)
    ;;
  all)
    TRIPLES=(x86_64-unknown-linux-gnu x86_64-apple-darwin aarch64-apple-darwin x86_64-pc-windows-msvc)
    ;;
  *)
    echo "internal: unknown mode $BUILD_MODE" >&2; exit 2 ;;
esac

# Tauri v2 externalBin hook：beforeBuildCommand / beforeDevCommand 场景下
# Tauri 会注入 TAURI_ENV_TARGET_TRIPLE（macOS 交叉编译时 ≠ host triple）。
# 此时必须按目标 triple 构建，忽略 host / --all-* 模式。
if [[ -n "${TAURI_ENV_TARGET_TRIPLE:-}" ]]; then
  TRIPLES=("$TAURI_ENV_TARGET_TRIPLE")
fi

# MSVC 环境（仅 Windows 平台需要）。
# 本机 work-around：VS 18 BuildTools 不在默认 PATH，且 Git Bash 的 `link`
# 是 coreutils 不是 MSVC linker，所以要显式注入 LIB/INCLUDE。
# 目录不存在时（GitHub runner / 其它机器）不注入，交给 cargo/vswhere 自动发现。
MSVC_ENV=""
case "$(uname -s 2>/dev/null || echo Windows)" in
  MINGW*|CYGWIN*|MSYS*|Windows*)
    MSVC="C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231"
    WIN_KITS="C:\Program Files (x86)\Windows Kits\10"
    SDK_VER="10.0.26100.0"
    if [[ -d "$MSVC" && -d "$WIN_KITS/Lib/$SDK_VER" ]]; then
      MSVC_ENV="LIB=\"$(cygpath -w "$MSVC/bin/Hostx64/x64")\\..\\..\\lib\\x64;$(cygpath -w "$WIN_KITS/Lib/$SDK_VER/um/x64")\\;$(cygpath -w "$WIN_KITS/Lib/$SDK_VER/ucrt/x64")\" INCLUDE=\"$(cygpath -w "$MSVC/include")\\;$(cygpath -w "$WIN_KITS/Include/$SDK_VER/ucrt")\\;$(cygpath -w "$WIN_KITS/Include/$SDK_VER/shared")\\;$(cygpath -w "$WIN_KITS/Include/$SDK_VER/um")\""
    fi
    ;;
esac

mkdir -p "$OUT_DIR" "$DESKTOP_BIN_DIR"

copy_to_binaries() {
  local src="$1" target_triple="$2"
  local bin_name="tydora-cli"
  if [[ "$target_triple" == *windows* ]]; then bin_name="tydora-cli.exe"; fi
  local dest_dir="$OUT_DIR/$target_triple"
  mkdir -p "$dest_dir"
  install -m 0755 "$src" "$dest_dir/$bin_name"

  # Tauri externalBin 约定：binaries/tydora-cli-<triple>[.exe]（tauri.conf.json 同级）
  install -m 0755 "$src" "$DESKTOP_BIN_DIR/tydora-cli-$target_triple${bin_name#tydora-cli}"
  # 裸名副本：开发期手工调用 / 兼容旧的 dev sidecar 路径
  install -m 0755 "$src" "$DESKTOP_BIN_DIR/$bin_name"

  # macOS：去 quarantine xattr（DMG 拷贝时常见）
  if [[ "$(uname)" == "Darwin" && "$target_triple" == *apple* ]]; then
    xattr -dr com.apple.quarantine "$dest_dir/$bin_name" 2>/dev/null || true
  fi

  echo "  → $dest_dir/$bin_name"
  echo "  → $DESKTOP_BIN_DIR/tydora-cli-$target_triple${bin_name#tydora-cli}"
}

# host mode：cargo 自动选 target
if [[ "$BUILD_MODE" == "host" && ${#TRIPLES[@]} -eq 0 ]]; then
  echo "[cli-build] Building host ($PROFILE)..."
  if [[ -n "$MSVC_ENV" ]]; then
    (cd "$APP_DIR" && eval "$MSVC_ENV" cargo build --profile "$CARGO_PROFILE" --bin tydora-cli)
  else
    (cd "$APP_DIR" && cargo build --profile "$CARGO_PROFILE" --bin tydora-cli)
  fi
  HOST_TRIPLE="$(rustc -vV | sed -n 's|host: ||p')"
  SRC="$APP_DIR/../target/$OUT_SUBDIR/tydora-cli"
  if [[ "$(uname -s 2>/dev/null || echo Windows)" == *MINGW* ]]; then SRC="${SRC}.exe"; fi
  copy_to_binaries "$SRC" "$HOST_TRIPLE"
fi

# 多平台 / externalBin hook mode
for triple in "${TRIPLES[@]:-}"; do
  [[ -z "${triple:-}" ]] && continue
  echo "[cli-build] Building $triple ($PROFILE)..."
  if [[ -n "$MSVC_ENV" ]]; then
    (cd "$APP_DIR" && eval "$MSVC_ENV" cargo build --profile "$CARGO_PROFILE" --target "$triple" --bin tydora-cli)
  else
    (cd "$APP_DIR" && cargo build --profile "$CARGO_PROFILE" --target "$triple" --bin tydora-cli)
  fi
  src="$APP_DIR/../target/$triple/$OUT_SUBDIR/tydora-cli"
  if [[ "$triple" == *windows* ]]; then src="${src}.exe"; fi
  copy_to_binaries "$src" "$triple"
done

echo "[cli-build] done."
