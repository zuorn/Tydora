#!/usr/bin/env bash
#
# 把 packaging/aur 下的两个 PKGBUILD 同步到指定版本（默认读仓库根的 VERSION），
# 重新下载三个源并写入 sha256，最后重新生成 .SRCINFO。
#
# 用法（在 Arch 上）：
#   bash packaging/aur/bump.sh            # 版本取自 ../../VERSION
#   bash packaging/aur/bump.sh 0.3.4      # 显式指定版本
#
# 前置条件：上游 GitHub 已经发布了对应 tag 与 release 资产（两个 .deb），
# 否则 curl 会 404 失败退出，不会写坏 PKGBUILD。
#
# 说明：脚本只改 pkgver / pkgrel / sha256sums*，source 行里用的是 $pkgver
# 变量，不需要手改。pkgrel 一律归 1（新 pkgver 的第一次构建）。
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GITHUB="https://github.com/zuorn/Tydora"

if [[ -f "$REPO_ROOT/VERSION" ]]; then
  DEFAULT_VER="$(tr -d '[:space:]' < "$REPO_ROOT/VERSION")"
else
  DEFAULT_VER=""
fi

NEW_VER="${1:-$DEFAULT_VER}"
if [[ ! "$NEW_VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo "用法：bash packaging/aur/bump.sh [x.y.z]（当前 VERSION：${DEFAULT_VER:-缺失}）" >&2
  exit 1
fi

for tool in curl sed sha256sum; do
  command -v "$tool" >/dev/null || { echo "缺少命令：$tool" >&2; exit 1; }
done

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 下载并输出 sha256。curl -f 保证 404 / 500 直接失败，而不是把错误页当源码。
fetch_sha256() {
  local url="$1" out="$2" sha
  printf '  ↓ %s\n' "$url" >&2
  curl -fsSL --retry 3 --connect-timeout 20 --max-time 600 -o "$TMP_DIR/$out" "$url"
  sha="$(sha256sum "$TMP_DIR/$out" | cut -d' ' -f1)"
  printf '    %12d bytes  %s\n' "$(stat -c %s "$TMP_DIR/$out")" "$sha" >&2
  printf '%s' "$sha"
}

echo "[bump] 目标版本：$NEW_VER"

echo "[bump] 1/2 tydora（源码包）"
src_sha="$(fetch_sha256 "$GITHUB/archive/refs/tags/v$NEW_VER.tar.gz" src.tar.gz)"
sed -i \
  -e "s|^pkgver=.*|pkgver=$NEW_VER|" \
  -e "s|^pkgrel=.*|pkgrel=1|" \
  -e "s|^sha256sums=.*|sha256sums=('$src_sha')|" \
  "$SCRIPT_DIR/tydora/PKGBUILD"

echo "[bump] 2/2 tydora-bin（预编译包）"
amd_sha="$(fetch_sha256 "$GITHUB/releases/download/v$NEW_VER/03-Tydora_${NEW_VER}_amd64.deb" amd64.deb)"
arm_sha="$(fetch_sha256 "$GITHUB/releases/download/v$NEW_VER/03-Tydora_${NEW_VER}_arm64.deb" arm64.deb)"
sed -i \
  -e "s|^pkgver=.*|pkgver=$NEW_VER|" \
  -e "s|^pkgrel=.*|pkgrel=1|" \
  -e "s|^sha256sums_x86_64=.*|sha256sums_x86_64=('$amd_sha')|" \
  -e "s|^sha256sums_aarch64=.*|sha256sums_aarch64=('$arm_sha')|" \
  "$SCRIPT_DIR/tydora-bin/PKGBUILD"

echo
echo "[bump] 已写入："
grep -H -E '^(pkgver|pkgrel|sha256sums)' "$SCRIPT_DIR/tydora/PKGBUILD" | sed 's|'"$SCRIPT_DIR"'/||'
grep -H -E '^(pkgver|pkgrel|sha256sums_)' "$SCRIPT_DIR/tydora-bin/PKGBUILD" | sed 's|'"$SCRIPT_DIR"'/||'

if command -v makepkg >/dev/null; then
  for pkg in tydora tydora-bin; do
    ( cd "$SCRIPT_DIR/$pkg" && makepkg --printsrcinfo > .SRCINFO )
    echo "[bump] 已重新生成 $pkg/.SRCINFO"
  done
else
  echo "[bump] 未找到 makepkg（非 Arch 环境）：.SRCINFO 没有更新。" >&2
  echo "       请在 Arch 上重跑本脚本，或直接发布（publish.sh 会用 makepkg 重新生成）。" >&2
fi

echo
echo "[bump] 完成。下一步："
echo "  bash $SCRIPT_DIR/publish.sh --dry-run    # 看 diff"
echo "  bash $SCRIPT_DIR/publish.sh              # 推送到 AUR"
