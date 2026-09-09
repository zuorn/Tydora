# 在 PowerShell / cmd 进程里设置 MSVC 构建环境。
#
# 用法（在 Git Bash 里）：
#   source scripts/cli-env.sh   # 导出 LIB / INCLUDE，然后 cargo build
#
# 这个脚本只是给 `cargo test` / `cargo build --bin tydora-cli` 一个 work-around：
# 这台机器装了 MSVC BuildTools 但 MSVC bin 不在默认 PATH，且 PATH 里的 `link`
# 是 Git Bash 自带的 GNU coreutils（创建硬链接用，不是 MSVC linker）。
# 通过 .cargo/config.toml 已经固定 linker 路径，还需要 LIB / INCLUDE 环境变量。
#
# 一旦我们让 `cargo` 通过自己的 vswhere 检测到 MSVC 后能自动设置这些 env，本文件可以删除。

# 用法：
#   eval "$(bash scripts/cli-env.sh)"
# 或手动复制下面三行 export。

MSVC_BIN='C:/Program Files (x86)/Microsoft Visual Studio/18/BuildTools/VC/Tools/MSVC/14.51.36231/bin/Hostx64/x64'
WIN_KITS='C:/Program Files (x86)/Windows Kits/10'
SDK_VER='10.0.26100.0'

cat <<EOF
export LIB="${MSVC_BIN%/bin/Hostx64/x64}/lib/x64;${WIN_KITS}/Lib/${SDK_VER}/um/x64;${WIN_KITS}/Lib/${SDK_VER}/ucrt/x64"
export INCLUDE="${MSVC_BIN%/bin/Hostx64/x64}/include;${WIN_KITS}/Include/${SDK_VER}/ucrt;${WIN_KITS}/Include/${SDK_VER}/shared;${WIN_KITS}/Include/${SDK_VER}/um;${WIN_KITS}/Include/${SDK_VER}/winrt"
EOF
