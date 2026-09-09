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
#   Tauri 桌面端通过 externalBin（app/tydora-desktop/tauri.conf.json）引用 dev
#   模式下的 bin/tydora-cli（symlink/copy）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/app"
CLI_DIR="$APP_DIR/tydora-cli"
OUT_DIR="$CLI_DIR/binaries"

PROFILE="release"
BUILD_MODE="host"

# 解析参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)       PROFILE="debug";              shift ;;
    --host-only)   BUILD_MODE="host";            shift ;;
    --all-unix)    BUILD_MODE="all-unix";        shift ;;
    --all-windows) BUILD_MODE="all-windows";     shift ;;
    --all-macos)   BUILD_MODE="all-macos";       shift ;;
    --all)         BUILD_MODE="all";             shift ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
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

# MSVC 环境（仅 Windows 平台需要）
MSVC_ENV=""
case "$(uname -s 2>/dev/null || echo Windows)" in
  MINGW*|CYGWIN*|MSYS*|Windows*)
    MSVC=("C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231")
    WIN_KITS="C:\Program Files (x86)\Windows Kits\10"
    SDK_VER="10.0.26100.0"
    MSVC_ENV="LIB=\"$(cygpath -w "$MSVC/bin/Hostx64/x64")\\..\\..\\lib\\x64;$(cygpath -w "$WIN_KITS/Lib/$SDK_VER/um/x64")\\;$(cygpath -w "$WIN_KITS/Lib/$SDK_VER/ucrt/x64")\" INCLUDE=\"$(cygpath -w "$MSVC/include")\\;$(cygpath -w "$WIN_KITS/Include/$SDK_VER/ucrt")\\;$(cygpath -w "$WIN_KITS/Include/$SDK_VER/shared")\\;$(cygpath -w "$WIN_KITS/Include/$SDK_VER/um")\""
    ;;
esac

mkdir -p "$OUT_DIR"

copy_to_binaries() {
  local src="$1" target_triple="$2"
  local bin_name="tydora-cli"
  if [[ "$target_triple" == *windows* ]]; then bin_name="tydora-cli.exe"; fi
  local dest_dir="$OUT_DIR/$target_triple"
  mkdir -p "$dest_dir"
  install -m 0755 "$src" "$dest_dir/$bin_name"

  # macOS：去 quarantine xattr（DMG 拷贝时常见）
  if [[ "$(uname)" == "Darwin" && "$target_triple" == *apple* ]]; then
    xattr -dr com.apple.quarantine "$dest_dir/$bin_name" 2>/dev/null || true
  fi

  echo "  → $dest_dir/$bin_name"
}

# host mode：cargo 自动选 target
if [[ "$BUILD_MODE" == "host" ]]; then
  echo "[cli-build] Building host ($PROFILE)..."
  if [[ -n "$MSVC_ENV" ]]; then
    (cd "$APP_DIR" && eval "$MSVC_ENV" cargo build --profile "$PROFILE" --bin tydora-cli)
  else
    (cd "$APP_DIR" && cargo build --profile "$PROFILE" --bin tydora-cli)
  fi
  HOST_TRIPLE="$(rustc -vV | sed -n 's|host: ||p')"
  SRC="$APP_DIR/../target/$PROFILE/tydora-cli"
  if [[ "$(uname -s 2>/dev/null || echo Windows)" == *MINGW* ]]; then SRC="${SRC}.exe"; fi
  copy_to_binaries "$SRC" "$HOST_TRIPLE"

  # dev symlink（仅 host 模式）：让 `cargo tauri dev` 在 app/tydora-desktop/binaries/tydora-cli 找到 sidecar
  if [[ "${TYDORA_TAURI_DEV:-0}" == "1" && -d "$REPO_ROOT/app/tydora-desktop/binaries" ]]; then
    local_link="$REPO_ROOT/app/tydora-desktop/binaries/tydora-cli$([[ "$HOST_TRIPLE" == *windows* ]] && echo .exe)"
    if command -v symlink-target >/dev/null 2>&1 || command -v ln >/dev/null 2>&1; then
      cp -f "$SRC" "$local_link" || true
      echo "  (dev: copied $local_link for cargo tauri dev to discover)"
    fi
  fi
fi

# 多平台 mode
for triple in "${TRIPLES[@]:-}"; do
  echo "[cli-build] Building $triple ($PROFILE)..."
  (cd "$APP_DIR" && cargo build --profile "$PROFILE" --target "$triple" --bin tydora-cli)
  src="$APP_DIR/../target/$triple/$PROFILE/tydora-cli"
  if [[ "$triple" == *windows* ]]; then src="${src}.exe"; fi
  copy_to_binaries "$src" "$triple"
done

echo "[cli-build] done."
