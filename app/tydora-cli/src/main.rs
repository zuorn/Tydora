// Tydora CLI 二进制入口。
//
// 设计参考：见 docs/cli-implementation-plan.md
//   - Windows 上启动即把 console codepage 切到 UTF-8
//   - main() -> ExitCode，4 档错误码（2 用法 / 3 找不到 / 5 IO / 1 其他）
//   - 不带 windows_subsystem = "windows" 属性 —— CLI 必须能看到 stdout/stderr

use std::process::ExitCode;

fn main() -> ExitCode {
    // 在解析参数前就切 codepage，避免第一批 ASCII 输出走默认 codepage。
    ensure_utf8_console();

    // 子命令分派与错误处理在 lib.rs 里
    match tydora_cli::run_cli() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            // 错误信息走 stderr，CLI 的 --json 输出不会脏
            eprintln!("tydora: {e}");
            ExitCode::from(e.exit_code())
        }
    }
}

/// 在 Windows 上把 console 的 input/output codepage 都切到 UTF-8 (65001)。
///
/// 中文 Windows 默认是 GBK (936)，Rust 的 std::io 在 Windows 上按 OEM/ANSI
/// codepage 读写 console，会把 stdout 上的中文写到 UTF-8 buffer 后再按 GBK
/// 翻回终端，导致中文字符显示成「口口口」或乱码。
///
/// 切到 UTF-8 后所有 std::println! 输出的 UTF-8 字节流直接到终端，中文正确。
///
/// ⚠️ 已知边界：
///   - PowerShell 5.1 的内置管道对象有时会把 stdout 强制按 ASCII 序列化（尤其
///     `tydora ... | Out-File` 等场景），这是 PS 的传输层问题，本程序无法在
///     输出端修复。调用方需提前 `chcp 65001 > $null` 或使用 `Out-File -Encoding utf8`。
///   - 这只解决输出；输入（stdin）走 `read_to_end` 时按 UTF-8 解码，与
///     `SetConsoleCP(65001)` 对齐。PowerShell `Read-Host` 仍可能强转，需调用方注意。
#[cfg(windows)]
fn ensure_utf8_console() {
    use windows_sys::Win32::Foundation::BOOL;
    use windows_sys::Win32::System::Console::{
        GetConsoleOutputCP, GetConsoleCP, SetConsoleCP, SetConsoleOutputCP,
    };
    // 0xFDE9 = 65001 (UTF-8)
    const CP_UTF8: u32 = 65001;
    unsafe {
        // 仅在当前不是 UTF-8 时切换（减少每次启动的开销与潜在副作用）
        if GetConsoleOutputCP() != CP_UTF8 {
            let _ = SetConsoleOutputCP(CP_UTF8);
        }
        if GetConsoleCP() != CP_UTF8 {
            let _ = SetConsoleCP(CP_UTF8);
        }
        // 抑制 dead_code 警告：BOOL 类型在此处用作占位
        let _: BOOL = 1;
    }
}

#[cfg(not(windows))]
fn ensure_utf8_console() {
    // macOS / Linux：默认 UTF-8，无需切换
}
