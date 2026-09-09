//! Tydora CLI 库入口。
//!
//! 设计参考：`D:\code\flowix\app\flowix-cli\src\lib.rs` + `dispatch.rs`
//!
//! ## 错误处理原则
//!
//! 任何错误都通过 `CliError` 上抛，由 `main.rs` 决定打印格式与退出码。
//! CLI 的 stdout 永远是干净的（要么是结果，要么是空），
//! stderr 是诊断信息（错误详情、警告、进度）。
//!
//! ## 模块结构
//!
//! - [`cli`]：clap 命令树（argv 解析）
//! - [`dispatch`]：解析后的 `Cli` 枚举分派到具体的 [`store`] 函数
//! - [`store`]：业务实现（直接文件系统 IO；后续 phase 接 tydora_lib）
//! - [`errors`]：`CliError` 4 档错误码 + 映射
//! - [`output`]：`--json` 与人类可读输出的统一 schema
//! - [`paths`]：`$TYDORA_HOME` / `$TYDORA_DATA` 解析
//! - [`fmt`]：终端宽度感知输出（含 CJK）
//!
//! ## `Cli::run()` → `Cli` ⇒ `()`

pub mod cli;
pub mod dispatch;
pub mod errors;
pub mod fmt;
pub mod output;
pub mod paths;
pub mod store;

pub use crate::cli::Cli;
pub use crate::errors::{CliError, CliResult};

/// 解析 argv + 执行命令 + 打印结果的统一入口。
///
/// `main.rs` 调这一个函数拿到 `Result<(), CliError>`，剩下都是它的活。
pub fn run_cli() -> CliResult<()> {
    // 让诊断日志可被 RUST_LOG 控制，默认 warn（CLI 不喧宾夺主）
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn"))
        .try_init();

    // clap 解析 argv
    let cli = Cli::parse_from_env()?;

    // 分派到具体的命令实现
    dispatch::dispatch(cli)?;
    Ok(())
}
