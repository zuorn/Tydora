//! 命令分派。
//!
//! 设计参考：`D:\code\flowix\app\flowix-cli\src\dispatch.rs`
//!
//! 原则：
//! - Phase 1 的命令是真实实现；Phase 2+ 的占位命令返回 `Usage` 错误（明确告诉用户还没实现）。
//! - 所有输出走 `output::*`，不直接 `println!`。

use crate::cli::{Cli, CommandKind};
use crate::errors::CliResult;
use crate::store;
use crate::output;

pub fn dispatch(cli: Cli) -> CliResult<()> {
    // vault 解析顺序：
    //   1. 命令行 --vault PATH（来自 cli.global.vault）
    //   2. $TYDORA_VAULT 环境变量
    // store 函数内部会再叠加 cwd/.tydora 与 ~/.tydora/vaults/default 兜底。
    let explicit: Option<&std::path::Path> = cli.global.vault.as_deref();
    // 我们这里不再读 $TYDORA_VAULT —— store::paths::resolve_vault() 已经按
    // "参数 > env > 约定 cwd > 默认 vault" 的顺序做了完整解析。

    match cli.command {
        CommandKind::Notebooks => {
            let res = store::list_notebooks(explicit)?;
            output::emit_notebooks(&res, cli.global.json)?;
        }
        CommandKind::List { notebook } => {
            let res = store::list_notes(&notebook, explicit)?;
            output::emit_notes(&res, cli.global.json)?;
        }
        CommandKind::Show { id } => {
            let res = store::show_note(&id, explicit)?;
            output::emit_note(&res, cli.global.json)?;
        }
        CommandKind::Completion { shell } => {
            // Phase 3 实现，先给 Usage 错误
            output::emit_stderr_warn(&format!("completion <{shell}> not implemented yet (Phase 3)"));
            return Err(crate::errors::CliError::Usage(
                "completion is planned for Phase 3".into(),
            ));
        }

        CommandKind::Create { notebook } => {
            let res = store::cmd_create(&notebook, explicit)?;
            output::emit_created(&res, cli.global.json)?;
        }
        CommandKind::Delete { id } => {
            let res = store::cmd_delete(&id, explicit)?;
            output::emit_deleted(&res, cli.global.json)?;
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
            )?;
            output::emit_edited(&res, cli.global.json)?;
        }
        CommandKind::Write { id, dry_run } => {
            let res = store::cmd_write(&id, explicit, dry_run)?;
            output::emit_wrote(&res, cli.global.json)?;
        }
        CommandKind::Search { query, .. } => {
            output::emit_stderr_warn(&format!("search <{query}> not implemented yet (Phase 3)"));
            return Err(crate::errors::CliError::Usage("search planned for Phase 3".into()));
        }
        CommandKind::Publish => {
            return Err(crate::errors::CliError::Usage(
                "publish planned for Phase 3".into(),
            ));
        }
        CommandKind::Mcp => {
            return Err(crate::errors::CliError::Usage(
                "mcp planned for Phase 4".into(),
            ));
        }
    }
    Ok(())
}
