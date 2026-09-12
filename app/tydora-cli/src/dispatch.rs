//! 命令分派。
//!
//! 设计参考：见 docs/cli-implementation-plan.md + docs/mcp-implementation-plan.md
//!
//! 原则：
//! - 所有子命令（mcp 除外）都是真实实现；mcp 子命令进入 MCP over stdio 服务器循环。
//! - 所有输出走 `output::*`，写进调用方提供的 sink（CLI = stdout，MCP = 内存缓冲）。
//! - 不直接 `println!`（`emit_stderr_warn` 的 stderr 诊断除外）。

use std::io::Write;

use crate::cli::{Cli, CommandKind};
use crate::errors::{CliError, CliResult};
use crate::publish;
use crate::store::{self, BodySource};
use crate::output;

/// CLI 入口：stdout + 真实 stdin。
///
/// MCP 子命令不走这里（stdout 会被 mcp.rs 独占，避免 double-lock 死锁），
/// 直接转发到 [`dispatch_to`]。
pub fn dispatch(cli: Cli) -> CliResult<()> {
    if matches!(cli.command, CommandKind::Mcp { .. }) {
        return dispatch_to(cli, &mut std::io::sink(), &BodySource::RealStdin);
    }
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    dispatch_to(cli, &mut lock, &BodySource::RealStdin)
}

/// sink 化的统一分派。
///
/// - `out`：结果输出目标（CLI = stdout.lock；MCP = `Vec<u8>` 缓冲）
/// - `body`：写命令的 body 来源（CLI = RealStdin；MCP = Buffer(tools/call.stdin 字段)）
pub fn dispatch_to(cli: Cli, out: &mut dyn Write, body: &BodySource) -> CliResult<()> {
    // vault 解析顺序：
    //   1. 命令行 --vault PATH（来自 cli.global.vault）
    //   2. $TYDORA_VAULT 环境变量
    // store 函数内部会再叠加 cwd/.tydora 与 ~/.tydora/vaults/default 兜底。
    // MCP 模式下 --vault 在语法白名单层被拒绝，vault 由服务器进程 env 钉死。
    let explicit: Option<&std::path::Path> = cli.global.vault.as_deref();
    let json = cli.global.json;

    match cli.command {
        CommandKind::Notebooks => {
            let res = store::list_notebooks(explicit)?;
            output::emit_notebooks(&res, json, out)?;
        }
        CommandKind::List { notebook } => {
            let res = store::list_notes(&notebook, explicit)?;
            output::emit_notes(&res, json, out)?;
        }
        CommandKind::Show { id } => {
            let res = store::show_note(&id, explicit)?;
            output::emit_note(&res, json, out)?;
        }
        CommandKind::Completion { shell } => {
            // completion 输出的是 shell 脚本（非 JSON schema），
            // 且不在 MCP 白名单内，直接写真实 stdout。
            let _ = out;
            run_completion(&shell)?;
        }

        CommandKind::Create { notebook } => {
            let res = store::cmd_create(&notebook, explicit, body)?;
            output::emit_created(&res, json, out)?;
        }
        CommandKind::Delete { id } => {
            let res = store::cmd_delete(&id, explicit)?;
            output::emit_deleted(&res, json, out)?;
        }
        CommandKind::Edit {
            id,
            old,
            new,
            new_stdin,
            dry_run,
        } => {
            let res = store::cmd_edit(
                &id,
                old.as_deref(),
                new.as_deref(),
                new_stdin,
                dry_run,
                explicit,
                body,
            )?;
            output::emit_edited(&res, json, out)?;
        }
        CommandKind::Write { id, dry_run } => {
            let res = store::cmd_write(&id, explicit, dry_run, body)?;
            output::emit_wrote(&res, json, out)?;
        }
        CommandKind::Search {
            query,
            notebook,
            limit,
        } => {
            let res = store::cmd_search(&query, notebook.as_deref(), limit, explicit)?;
            output::emit_search(&res, json, out)?;
        }
        CommandKind::Publish {
            out: out_dir,
            site_name,
            site_lang,
            site_url,
            base_href,
            build_mode,
        } => {
            let opts = publish::PublishOptions {
                out: out_dir,
                site_name,
                site_lang,
                site_url,
                base_href,
                build_mode,
            };
            let res = publish::cmd_publish(&opts, explicit)?;
            output::emit_published(&res, json, out)?;
            if !res.success {
                return Err(CliError::Other(format!(
                    "markdown-publish exited with code {}",
                    res.exit_code
                        .map(|c| c.to_string())
                        .unwrap_or_else(|| "signal".into())
                )));
            }
        }
        CommandKind::Mcp {
            read_only,
            allow_publish,
        } => {
            // out 被 sink 掉：MCP 的 stdout 是协议专线（mcp.rs 独占）
            let _ = out;
            crate::mcp::run_server(crate::mcp::McpOptions {
                read_only,
                allow_publish,
            })?;
        }
    }
    Ok(())
}

/// `tydora completion <shell>` —— 用 clap_complete 从命令树生成补全脚本。
fn run_completion(shell: &str) -> CliResult<()> {
    use clap_complete::shells::Shell;
    use std::str::FromStr;

    let shell = Shell::from_str(shell).map_err(|_| {
        CliError::Usage(format!(
            "completion: unknown shell '{shell}' (supported: bash, zsh, fish, powershell, elvish)"
        ))
    })?;
    let mut cmd = crate::cli::build_command();
    clap_complete::generate(shell, &mut cmd, crate::cli::DISPLAY_BIN, &mut std::io::stdout());
    Ok(())
}
