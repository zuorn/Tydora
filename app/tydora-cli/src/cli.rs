//! CLI argv 解析（clap builder 风格）。
//!
//! 设计参考：`D:\code\flowix\app\flowix-cli\src\cli.rs`
//!
//! ## 子命令（Phase 1）
//!
//! - `notebooks` (alias `nb`)           列出 vault 下所有 notebook
//! - `list <notebook>` (alias `ls`)     列出某 notebook 下的笔记
//! - `show <id>` (alias `s`)            读取并打印一条笔记（frontmatter + body）
//! - `completion <shell>`               输出 bash/zsh/fish 补全脚本（Phase 3 充实）
//!
//! ## 全局 flag
//!
//! - `--json` / `-j`                    全局 JSON 输出
//! - `--version` / `-V`                 打印版本（来自 Cargo workspace.package.version）
//! - `--help` / `-h`                    打印完整帮助树（自绘，含 CJK）
//!
//! ## Phase 2+ 才实现的子命令
//!
//! - `create` / `delete` / `edit` / `write` / `search`
//! - `publish`（Tydora 独有）
//! - `mcp`（MCP over stdio）

use clap::{Arg, ArgAction, Command};

/// CLI 顶层命令枚举，clap 解析后映射到这里。
///
/// 注意：`Cli` 名字刻意不带 `enum`，因为它承载"全局 flag + 子命令"两层。
/// 设计选择：直接用 `CliMatches`（一个 struct）比 enum 简单，避免子命令枚举膨胀。
#[derive(Debug, Clone)]
pub struct Cli {
    pub global: GlobalFlags,
    pub command: CommandKind,
}

#[derive(Debug, Clone, Default)]
pub struct GlobalFlags {
    pub json: bool,
    pub vault: Option<std::path::PathBuf>,
}

/// 子命令类型。Phase 1 只实现 `Notebooks`/`List`/`Show`/`Completion`，
/// 其余为占位（dispatch 时返回 Usage 错误）。
#[derive(Debug, Clone)]
pub enum CommandKind {
    Notebooks,
    List { notebook: String },
    Show { id: String },
    Completion { shell: String },

    // Phase 2+ 占位
    Create { notebook: String },
    Delete { id: String },
    Edit { id: String, old: Option<String>, new: Option<String>, new_stdin: bool, dry_run: bool },
    Write { id: String, dry_run: bool },
    Search { query: String, notebook: Option<String>, limit: Option<usize> },
    Publish,
    Mcp,
}

/// 显示在 help 与错误信息里的二进制名。
/// 与 Cargo.toml [[bin]] name 区分：这是终端用户敲的命令。
pub const DISPLAY_BIN: &str = "tydora";

impl Cli {
    /// 从 `std::env::args_os()` 解析。
    pub fn parse_from_env() -> Result<Self, crate::errors::CliError> {
        // clap builder 期望 argv[0] 是 binary 路径，把它原样传过去。
        let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
        Self::parse(args)
    }

    pub fn parse<I, T>(args: I) -> Result<Self, crate::errors::CliError>
    where
        I: IntoIterator<Item = T>,
        T: Into<std::ffi::OsString> + Clone,
    {
        let cmd = build_command();
        let matches = match cmd.try_get_matches_from(args) {
            Ok(m) => m,
            Err(e) => {
                // clap 4 把 `--help` / `--version` 当作 Display* 错误返回，
                // 由应用层打印并 exit 0；其它 error 走 Usage 退出码 2。
                use clap::error::ErrorKind;
                match e.kind() {
                    ErrorKind::DisplayHelp | ErrorKind::DisplayHelpOnMissingArgumentOrSubcommand => {
                        // std::process::exit 终止进程，避免 main.rs 再对 Usage 错误码做二次处理
                        let _ = e.print();
                        std::process::exit(0);
                    }
                    ErrorKind::DisplayVersion => {
                        let _ = e.print();
                        std::process::exit(0);
                    }
                    _ => {
                        // Usage / ValueValidation / 等其它错误：打印并返回
                        let _ = e.print();
                        return Err(crate::errors::CliError::Usage(e.to_string()));
                    }
                }
            }
        };

        let global = GlobalFlags {
            json: matches.get_flag("json"),
            vault: matches
                .get_one::<String>("vault")
                .map(std::path::PathBuf::from),
        };

        // subcommand_required(true) 由 clap 强制
        let (sub, sub_matches) = matches
            .subcommand()
            .ok_or_else(|| crate::errors::CliError::Usage("missing subcommand".into()))?;

        let command = match sub {
            "notebooks" => CommandKind::Notebooks,
            "nb" => CommandKind::Notebooks,
            "list" | "ls" => {
                let notebook = sub_matches
                    .get_one::<String>("notebook")
                    .cloned()
                    .ok_or_else(|| crate::errors::CliError::Usage("list: missing <notebook>".into()))?;
                CommandKind::List { notebook }
            }
            "show" | "s" => {
                let id = sub_matches
                    .get_one::<String>("id")
                    .cloned()
                    .ok_or_else(|| crate::errors::CliError::Usage("show: missing <id>".into()))?;
                CommandKind::Show { id }
            }
            "completion" => {
                let shell = sub_matches
                    .get_one::<String>("shell")
                    .cloned()
                    .ok_or_else(|| crate::errors::CliError::Usage("completion: missing <shell>".into()))?;
                CommandKind::Completion { shell }
            }
            // Phase 2+ 占位
            "create" | "new" | "c" => {
                let notebook = sub_matches
                    .get_one::<String>("notebook")
                    .cloned()
                    .ok_or_else(|| crate::errors::CliError::Usage("create: missing <notebook>".into()))?;
                CommandKind::Create { notebook }
            }
            "delete" | "rm" => {
                let id = sub_matches
                    .get_one::<String>("id")
                    .cloned()
                    .ok_or_else(|| crate::errors::CliError::Usage("delete: missing <id>".into()))?;
                CommandKind::Delete { id }
            }
            "edit" | "e" => {
                let id = sub_matches
                    .get_one::<String>("id")
                    .cloned()
                    .ok_or_else(|| crate::errors::CliError::Usage("edit: missing <id>".into()))?;
                CommandKind::Edit {
                    id,
                    old: sub_matches.get_one::<String>("old").cloned(),
                    new: sub_matches.get_one::<String>("new").cloned(),
                    new_stdin: sub_matches.get_flag("new-stdin"),
                    dry_run: sub_matches.get_flag("dry-run"),
                }
            }
            "write" | "w" => {
                let id = sub_matches
                    .get_one::<String>("id")
                    .cloned()
                    .ok_or_else(|| crate::errors::CliError::Usage("write: missing <id>".into()))?;
                CommandKind::Write {
                    id,
                    dry_run: sub_matches.get_flag("dry-run"),
                }
            }
            "search" | "q" => {
                let query = sub_matches
                    .get_one::<String>("query")
                    .cloned()
                    .ok_or_else(|| crate::errors::CliError::Usage("search: missing <query>".into()))?;
                CommandKind::Search {
                    query,
                    notebook: sub_matches.get_one::<String>("notebook").cloned(),
                    limit: sub_matches.get_one::<usize>("limit").copied(),
                }
            }
            "publish" => CommandKind::Publish,
            "mcp" => CommandKind::Mcp,
            other => {
                return Err(crate::errors::CliError::Usage(format!(
                    "unknown subcommand: {other}"
                )));
            }
        };

        Ok(Self { global, command })
    }
}

/// 构造 clap `Command` 树（builder 风格）。
///
/// 注意这里只声明"参数形状"，不解析。`Cli::parse` 里调用并拿到
/// `ArgMatches` 后再二次映射到 `CommandKind`。
fn build_command() -> Command {
    Command::new(DISPLAY_BIN)
        .version(env!("CARGO_PKG_VERSION"))
        .about("Tydora CLI — command-line interface for Tydora vaults")
        .long_about(
            "tydora — Terminal/MCP interface for Tydora Markdown vaults.\n\n\
             Quick examples:\n  \
               tydora notebooks\n  \
               tydora ls default\n  \
               tydora show abc123 --json\n\n\
             Default output is human-readable. Pass --json for structured data."
        )
        .arg(
            Arg::new("json")
                .long("json")
                .short('j')
                .help("Emit structured JSON on stdout")
                .global(true)
                .action(ArgAction::SetTrue),
        )
        .arg(
            Arg::new("vault")
                .long("vault")
                .help("Vault root (overrides $TYDORA_VAULT and default discovery)")
                .global(true)
                .value_name("PATH")
                .num_args(1),
        )
        .subcommand_required(true)
        // 故意不开 arg_required_else_help：缺 subcommand 时让 clap 报
        // MissingSubcommand（→ Usage 错误，exit 2），而不是 clap 默认的
        // "显示 help + exit 0"。CLI 期望：缺参数 = 用法错。
        .styles(clap::builder::Styles::styled())
        // 子命令
        .subcommand(notebooks_cmd())
        .subcommand(list_cmd())
        .subcommand(show_cmd())
        .subcommand(completion_cmd())
        // Phase 2 占位（已声明，dispatch 会回 Usage）
        .subcommand(create_cmd())
        .subcommand(delete_cmd())
        .subcommand(edit_cmd())
        .subcommand(write_cmd())
        .subcommand(search_cmd())
        .subcommand(Command::new("publish").about("Publish vault to static site (alias for run_markdown_publish)"))
        .subcommand(Command::new("mcp").about("MCP over stdio (Phase 4)"))
        // clap 自带 --help / --version（在 build_command 顶部 .version(...) 已启用）
}

/// `Arg::new` 接受 `&'static str`，所以所有命令的位置参数名硬编码调用。
/// 这个函数禁用、改用内联 `Arg::new("notebook").required(true)` 即可。
///
/// 保留这个 helper 文档说明。
#[allow(dead_code)]
fn _required_arg_doc_placeholder() {}

fn notebooks_cmd() -> Command {
    Command::new("notebooks")
        .alias("nb")
        .about("List all notebooks in the resolved vault")
}

fn list_cmd() -> Command {
    Command::new("list")
        .alias("ls")
        .about("List notes under <notebook>")
        .arg(Arg::new("notebook").required(true).num_args(1))
}

fn show_cmd() -> Command {
    Command::new("show")
        .alias("s")
        .about("Print a note to stdout (frontmatter + body)")
        .arg(Arg::new("id").required(true).num_args(1))
}

fn completion_cmd() -> Command {
    Command::new("completion")
        .about("Generate shell completion script (bash, zsh, fish)")
        .arg(Arg::new("shell").required(true).num_args(1))
}

fn create_cmd() -> Command {
    Command::new("create")
        .alias("new")
        .alias("c")
        .about("Create a new note under <notebook>; body from stdin, title from frontmatter or first H1")
        .arg(Arg::new("notebook").required(true).num_args(1))
}

fn delete_cmd() -> Command {
    Command::new("delete")
        .alias("rm")
        .about("Move a note to $TYDORA_HOME/trash (recoverable)")
        .arg(Arg::new("id").required(true).num_args(1))
}

fn edit_cmd() -> Command {
    Command::new("edit")
        .alias("e")
        .about("[Phase 2] Edit a note by exact string replace")
        .arg(Arg::new("id").required(true).num_args(1))
        .arg(
            Arg::new("old")
                .long("old")
                .short('o')
                .num_args(1)
                .value_name("TEXT")
                .help("Existing text to replace (must be unique)"),
        )
        .arg(
            Arg::new("new")
                .long("new")
                .short('n')
                .num_args(1)
                .value_name("TEXT")
                .help("Replacement text"),
        )
        .arg(
            Arg::new("new-stdin")
                .long("new-stdin")
                .action(ArgAction::SetTrue)
                .help("Read replacement from stdin (use instead of --new)"),
        )
        .arg(
            Arg::new("dry-run")
                .long("dry-run")
                .action(ArgAction::SetTrue)
                .help("Show the diff and exit without writing"),
        )
}

fn write_cmd() -> Command {
    Command::new("write")
        .alias("w")
        .about("Overwrite a note entirely (full body from stdin)")
        .arg(Arg::new("id").required(true).num_args(1))
        .arg(
            Arg::new("dry-run")
                .long("dry-run")
                .action(ArgAction::SetTrue)
                .help("Validate inputs but do not write to disk"),
        )
}

fn search_cmd() -> Command {
    Command::new("search")
        .alias("q")
        .about("[Phase 3] Full-text search across notes")
        .arg(Arg::new("query").required(true).num_args(1))
        .arg(
            Arg::new("notebook")
                .long("notebook")
                .short('b')
                .num_args(1)
                .help("Restrict to one notebook"),
        )
        .arg(
            Arg::new("limit")
                .long("limit")
                .short('l')
                .num_args(1)
                .value_parser(clap::value_parser!(usize))
                .help("Maximum number of matches"),
        )
}
