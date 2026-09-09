//! 路径与环境变量解析。
//!
//! 设计参考：见 docs/cli-implementation-plan.md
//!
//! ## 解析优先级（覆盖式）
//!
//! 1. 命令行参数 `--vault <path>` 显式指定（最高优先级）
//! 2. 环境变量 `TYDORA_VAULT`
//! 3. 当前工作目录下是否有 `.tydora/` 目录（约定俗成的"工作 vault"）
//! 4. `~/.tydora/vaults/default/`（默认 vault，仅提供 hint；不存在则报错）
//!
//! 数据目录（trash、index、cache）：
//!   `$TYDORA_HOME` 或 `~/.tydora/`，可通过 `$TYDORA_DATA` 覆盖。

use std::path::{Path, PathBuf};

/// 解析 vault 根目录（包含若干 notebook 子目录）。
///
/// 调用方提供"用户意愿"的来源（参数或环境变量），本函数决定最终路径。
/// 不做目录创建 —— 调用方负责报错。
pub fn resolve_vault(explicit: Option<&Path>) -> crate::errors::CliResult<PathBuf> {
    if let Some(p) = explicit {
        return Ok(p.to_path_buf());
    }
    if let Ok(env) = std::env::var("TYDORA_VAULT") {
        let p = PathBuf::from(env);
        if !p.as_os_str().is_empty() {
            return Ok(p);
        }
    }
    // 工作目录下的约定 vault
    let cwd_vault = std::env::current_dir()?.join(".tydora");
    if cwd_vault.is_dir() {
        return Ok(cwd_vault);
    }
    // 用户默认 vault
    if let Some(home) = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
    {
        let default = PathBuf::from(home).join(".tydora").join("vaults").join("default");
        if default.is_dir() {
            return Ok(default);
        }
    }
    Err(crate::errors::CliError::NotFound(
        "no Tydora vault resolved: pass --vault, set $TYDORA_VAULT, or create ~/.tydora/vaults/default".into(),
    ))
}

/// Tydora 主配置/数据目录。
/// 默认 `$HOME/.tydora`（或 `%USERPROFILE%\.tydora`），可被 `$TYDORA_HOME` 覆盖。
pub fn tydora_home() -> crate::errors::CliResult<PathBuf> {
    if let Ok(env) = std::env::var("TYDORA_HOME") {
        return Ok(PathBuf::from(env));
    }
    if let Some(home) = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
    {
        return Ok(PathBuf::from(home).join(".tydora"));
    }
    Err(crate::errors::CliError::Other(
        "cannot resolve Tydora home: $HOME / $USERPROFILE unset".into(),
    ))
}
