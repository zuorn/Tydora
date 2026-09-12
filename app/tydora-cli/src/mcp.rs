//! MCP（Model Context Protocol）over stdio 服务器。
//!
//! 设计文档：docs/mcp-implementation-plan.md（Phase 4）
//!
//! ## 架构
//!
//! `tydora mcp` 进入 NDJSON（换行分隔 JSON）请求循环：
//!
//! ```text
//! MCP 客户端 ── JSON-RPC 2.0（一行一条）──▶ mcp.rs 协议层
//!   tools/call {"syntax": "search \"x\" --limit 5", "stdin": "..."}
//!     └─ 受限语法解析（shell-words 分词 → 白名单 → 黑名单 → argv）
//!         └─ Cli::parse(argv) ──▶ dispatch_to(缓冲) ──▶ store/publish
//!             └─ 结果（tydora.<model>.v1 JSON）→ structuredContent + text
//! ```
//!
//! ## 关键不变量
//!
//! - **stdout 是协议专线**：所有响应经 `serde_json::to_string`（紧凑序列化，
//!   天然无裸换行）+ 单个 `\n`。命令结果写进内存缓冲，绝不直接碰 stdout。
//! - **vault 钉死**：`--vault` 在语法白名单层被拒绝（含 `--vault=PATH` 形式），
//!   vault 由服务器进程环境（`$TYDORA_VAULT` 等）决定。
//! - **不 spawn shell**：语法经过白名单后直接转 argv 调 `Cli::parse`，
//!   无任何 shell 参与。
//! - **零新增依赖**：协议层只用 `serde_json` + `shell_words`（均为既有依赖）。
//!
//! ## 错误两层
//!
//! - 协议错误（JSON-RPC error）：非法 JSON / 未知方法 / batch / 非法请求
//! - 工具错误（`isError: true`）：白名单拒绝、Usage/NotFound/Io、命令失败
//!   ——业务失败对 Agent 可见可自纠，不升格为协议故障。

use std::io::{BufRead, Write};

use serde_json::{json, Value};

use crate::cli::Cli;
use crate::errors::CliError;
use crate::store::BodySource;

/// MCP 协议版本支持集（2025-06-18 与 2025-03-26 在 tools 能力上无差异）。
const SUPPORTED_PROTOCOL_VERSIONS: [&str; 2] = ["2025-03-26", "2025-06-18"];
/// 客户端不支持时的回落版本。
const LATEST_PROTOCOL_VERSION: &str = "2025-06-18";
/// 单条入站消息上限（字节）。
const MAX_MESSAGE_BYTES: usize = 10 * 1024 * 1024;
/// 单条 syntax 上限（字节）。
const MAX_SYNTAX_BYTES: usize = 4 * 1024;
/// 唯一工具名。
pub(crate) const TOOL_NAME: &str = "tydora_note";

#[derive(Debug, Clone, Copy, Default)]
pub struct McpOptions {
    /// 只暴露读命令（notebooks / list / show / search）
    pub read_only: bool,
    /// 额外暴露 publish（默认关：spawn 外部 Node 构建进程）
    pub allow_publish: bool,
}

// ============================================================================
// 服务器主循环
// ============================================================================

/// MCP over stdio 主循环。读到 EOF（客户端关 stdin）后正常返回。
pub fn run_server(opts: McpOptions) -> crate::errors::CliResult<()> {
    let stdin = std::io::stdin();
    let mut reader = stdin.lock();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();

    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            // EOF：客户端关闭 stdin → 正常退出
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.len() > MAX_MESSAGE_BYTES {
            let resp = error_response(&Value::Null, -32600, "request exceeds size limit");
            write_message(&mut out, &resp)?;
            continue;
        }

        let mut buf = Vec::new();
        handle_line(trimmed, &opts, &mut buf)?;
        if !buf.is_empty() {
            out.write_all(&buf)?;
            out.flush()?;
        }
    }
    Ok(())
}

/// 处理一条入站消息。有响应时写入 `out`（紧凑 JSON + '\n'），
/// 通知类消息不写任何内容。
fn handle_line(line: &str, opts: &McpOptions, out: &mut Vec<u8>) -> crate::errors::CliResult<()> {
    let msg: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => {
            let resp = error_response(&Value::Null, -32700, &format!("parse error: {e}"));
            write_message(out, &resp)?;
            return Ok(());
        }
    };

    // JSON-RPC 2.0 结构校验
    if msg.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        let id = msg.get("id").cloned().unwrap_or(Value::Null);
        let resp = error_response(&id, -32600, "invalid request: jsonrpc must be \"2.0\"");
        write_message(out, &resp)?;
        return Ok(());
    }
    let Some(method) = msg.get("method").and_then(Value::as_str) else {
        let id = msg.get("id").cloned().unwrap_or(Value::Null);
        let resp = error_response(&id, -32600, "invalid request: missing method");
        write_message(out, &resp)?;
        return Ok(());
    };
    let id = msg.get("id").cloned();

    // 通知（无 id）：不回复。initialized / cancelled 静默接受，未知通知忽略。
    let Some(id) = id else {
        return Ok(());
    };

    let result: Result<Value, (i64, String)> = match method {
        "initialize" => Ok(initialize_result(msg.get("params"))),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": [tool_definition()] })),
        "tools/call" => {
            // 工具失败也走 Ok(isError=true)——业务失败对 Agent 可见可自纠，
            // 不升格为协议错误
            Ok(call_tool(msg.get("params"), opts))
        }
        "notifications/initialized" | "notifications/cancelled" => {
            // 带了 id 的通知按协议错误处理（通知不应有 id）
            Err((-32600, format!("'{method}' is a notification and must not carry an id")))
        }
        other => Err((-32601, format!("method not found: {other}"))),
    };

    let resp = match result {
        Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err((code, message)) => error_response(&id, code, &message),
    };
    write_message(out, &resp)
}

/// 紧凑序列化 + 换行写入。紧凑序列化保证消息内无裸换行（NDJSON 帧约束）。
fn write_message<W: std::io::Write>(out: &mut W, msg: &Value) -> crate::errors::CliResult<()> {
    let mut s = serde_json::to_string(msg)
        .map_err(|e| CliError::Other(format!("serialize response: {e}")))?;
    s.push('\n');
    out.write_all(s.as_bytes()).map_err(CliError::Io)?;
    Ok(())
}

fn error_response(id: &Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message }
    })
}

// ============================================================================
// 方法实现
// ============================================================================

/// initialize：版本协商 + 能力声明 + serverInfo。
fn initialize_result(params: Option<&Value>) -> Value {
    let requested = params
        .and_then(|p| p.get("protocolVersion"))
        .and_then(Value::as_str)
        .unwrap_or(LATEST_PROTOCOL_VERSION);
    let negotiated = if SUPPORTED_PROTOCOL_VERSIONS.contains(&requested) {
        requested
    } else {
        LATEST_PROTOCOL_VERSION
    };
    json!({
        "protocolVersion": negotiated,
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": {
            "name": "tydora",
            "version": env!("CARGO_PKG_VERSION")
        }
    })
}

/// tools/list 返回的唯一工具定义。
fn tool_definition() -> Value {
    json!({
        "name": TOOL_NAME,
        "description": TOOL_DESCRIPTION,
        "inputSchema": {
            "type": "object",
            "properties": {
                "syntax": {
                    "type": "string",
                    "description": "Restricted tydora CLI syntax. Tip: run notebooks/list first, then show; add --dry-run to preview edits. Shell metacharacters and --vault are rejected."
                },
                "stdin": {
                    "type": "string",
                    "description": "Body for create/write, or replacement text for edit --new-stdin. Plain data; metacharacters allowed here."
                }
            },
            "required": ["syntax"]
        }
    })
}

const TOOL_DESCRIPTION: &str = "Operate on the Tydora Markdown vault. \
Allowed commands:\n\
- notebooks\n\
- list <notebook>\n\
- show <id>\n\
- search <query> [--notebook N] [--limit N]   (case-insensitive substring)\n\
- create <notebook>        (body from the `stdin` field)\n\
- edit <id> --old T (--new T | --new-stdin) [--dry-run]\n\
- write <id> [--dry-run]   (full body from the `stdin` field)\n\
- delete <id>              (moved to trash, recoverable)\n\
All results are versioned JSON (tydora.<model>.v1). The `id` is the note path \
relative to the vault root without the .md extension.";

// ============================================================================
// tools/call
// ============================================================================

/// 执行一次工具调用。永远返回 result 形态（可能 isError: true）。
fn call_tool(params: Option<&Value>, opts: &McpOptions) -> Value {
    let arguments = match params.and_then(|p| p.get("arguments")) {
        Some(a) if a.is_object() => a,
        _ => return tool_error("tools/call: missing `arguments` object (see inputSchema)"),
    };

    let name = params
        .and_then(|p| p.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if name != TOOL_NAME {
        return tool_error(format!("unknown tool '{name}'; the server exposes exactly one tool: '{TOOL_NAME}'"));
    }

    let syntax = arguments.get("syntax").and_then(Value::as_str);
    let Some(syntax) = syntax else {
        return tool_error(format!(
            "missing required field `syntax` (string). Example: {{\"syntax\": \"search \\\"query\\\" --limit 5\"}}"
        ));
    };
    if syntax.len() > MAX_SYNTAX_BYTES {
        return tool_error(format!(
            "syntax exceeds {} bytes limit",
            MAX_SYNTAX_BYTES
        ));
    }

    // stdin 字段：写命令的 body（CLI stdin 的协议内替身）
    let stdin_body = arguments
        .get("stdin")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    // ---- 受限语法解析（方案 §4.4 五步中的 3/4 步）----
    let tokens = match tokenize(syntax) {
        Ok(t) => t,
        Err(msg) => return tool_error(msg),
    };
    if let Err(msg) = validate_tokens(&tokens, opts) {
        return tool_error(msg);
    }

    // ---- argv 组装 + 复用 CLI 解析与分派 ----
    let mut argv: Vec<String> = vec!["tydora".into(), "--json".into()];
    argv.extend(tokens);

    let cli = match Cli::parse(argv) {
        Ok(c) => c,
        Err(e) => return tool_error(e.to_string()),
    };

    let mut buffer: Vec<u8> = Vec::new();
    let body_src = BodySource::Buffer(stdin_body);
    match crate::dispatch::dispatch_to(cli, &mut buffer, &body_src) {
        Ok(()) => {
            let text = String::from_utf8_lossy(&buffer).trim_end().to_string();
            let structured = serde_json::from_str::<Value>(&text).ok().filter(|v| v.is_object());
            let mut result = json!({
                "content": [{ "type": "text", "text": text }],
                "isError": false
            });
            if let Some(sc) = structured {
                result["structuredContent"] = sc;
            }
            result
        }
        Err(e) => tool_error(e.to_string()),
    }
}

fn tool_error(msg: impl Into<String>) -> Value {
    json!({
        "content": [{ "type": "text", "text": msg.into() }],
        "isError": true
    })
}

// ============================================================================
// 受限语法解析器（方案 §4.3 / §4.4）
// ============================================================================

/// 命令白名单：命令名 + 各自允许的 flag（canonical 名，不含 alias）。
struct CmdSpec {
    name: &'static str,
    flags: &'static [&'static str],
}

const COMMANDS: &[CmdSpec] = &[
    CmdSpec { name: "notebooks", flags: &[] },
    CmdSpec { name: "list", flags: &[] },
    CmdSpec { name: "show", flags: &[] },
    CmdSpec { name: "search", flags: &["--notebook", "-b", "--limit", "-l"] },
    CmdSpec { name: "create", flags: &[] },
    CmdSpec { name: "edit", flags: &["--old", "-o", "--new", "-n", "--new-stdin", "--dry-run"] },
    CmdSpec { name: "write", flags: &["--dry-run"] },
    CmdSpec { name: "delete", flags: &[] },
];
const PUBLISH_SPEC: CmdSpec = CmdSpec {
    name: "publish",
    flags: &["--out", "--site-name", "--site-lang", "--site-url", "--base-href", "--build-mode"],
};
/// 全局允许的 flag（--json 由服务器强制注入，语法里写不写都行）。
const GLOBAL_FLAGS: &[&str] = &["--json", "-j"];

/// 分词后仍禁止出现在 argv token 里的字符（方案 §4.3 字符黑名单）。
/// 引号内的这些字符同样拒绝——唯一豁免是 `stdin` 字段（它永远是数据）。
const FORBIDDEN_CHARS: &[char] = &[
    '|', ';', '&', '>', '<', '`', '$', '(', ')', '{', '}', '[', ']', '!', '*', '?', '~', '#',
];

/// 用 shell-words 分词（处理引号/转义/空格）。
/// 分词失败 = 引号不闭合等，直接拒绝，不做猜测性修复。
fn tokenize(syntax: &str) -> Result<Vec<String>, String> {
    let tokens = shell_words::split(syntax)
        .map_err(|e| format!("syntax parse error: {e}. Close all quotes, e.g. search \"my query\""))?;
    if tokens.is_empty() {
        return Err("syntax is empty; expected a tydora command, e.g. 'notebooks'".into());
    }
    Ok(tokens)
}

/// 白名单校验：命令 ∈ 允许集；flag ∈ 该命令允许集 ∪ 全局集；
/// token 黑名单；--vault 恒拒绝。通过后 tokens 可直接拼进 argv（clap 做最终校验）。
fn validate_tokens(tokens: &[String], opts: &McpOptions) -> Result<(), String> {
    let cmd = &tokens[0];
    let spec = COMMANDS
        .iter()
        .find(|c| c.name == cmd)
        .or_else(|| {
            if opts.allow_publish && PUBLISH_SPEC.name == cmd {
                Some(&PUBLISH_SPEC)
            } else {
                None
            }
        });

    let Some(spec) = spec else {
        let mut allowed: Vec<&str> = COMMANDS.iter().map(|c| c.name).collect();
        if opts.allow_publish {
            allowed.push("publish");
        }
        let extra = if opts.read_only {
            " (server is running with --read-only: write commands are disabled)"
        } else {
            ""
        };
        return Err(format!(
            "command '{cmd}' is not allowed{extra}. Allowed commands: {}",
            allowed.join(", ")
        ));
    };

    if opts.read_only && !matches!(spec.name, "notebooks" | "list" | "show" | "search") {
        return Err(format!(
            "command '{}' is not allowed: server is running with --read-only (notebooks/list/show/search only)",
            spec.name
        ));
    }

    for token in tokens {
        if let Some(bad) = token.chars().find(|c| FORBIDDEN_CHARS.contains(c)) {
            return Err(format!(
                "character '{bad}' is not allowed in syntax (shell metacharacters are rejected). \
                 Pass such text via the `stdin` field instead (create/write body, edit --new-stdin)"
            ));
        }
        if token == "--vault" || token.starts_with("--vault=") || token == "-h" || token == "--help"
            || token == "-V" || token == "--version"
        {
            return Err(format!(
                "'{token}' is not allowed through the MCP tool. The vault is pinned by the \
                 server process environment ($TYDORA_VAULT)"
            ));
        }
        if token.starts_with('-') && token != "-" {
            let allowed = spec.flags.iter().chain(GLOBAL_FLAGS.iter()).any(|f| *f == token);
            if !allowed {
                return Err(format!(
                    "flag '{token}' is not allowed for command '{}'. Allowed flags: {}",
                    spec.name,
                    spec.flags
                        .iter()
                        .chain(GLOBAL_FLAGS.iter())
                        .copied()
                        .collect::<Vec<_>>()
                        .join(" ")
                ));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::CommandKind;

    fn ok(syntax: &str) -> Vec<String> {
        tokenize(syntax).unwrap()
    }

    #[test]
    fn tokenize_handles_quotes() {
        assert_eq!(ok("search \"hello world\" --limit 5"), vec!["search", "hello world", "--limit", "5"]);
        assert_eq!(ok("show notes/daily"), vec!["show", "notes/daily"]);
    }

    #[test]
    fn tokenize_rejects_unclosed_quote() {
        assert!(tokenize("search \"abc").is_err());
    }

    #[test]
    fn validate_accepts_known_commands() {
        let opts = McpOptions::default();
        assert!(validate_tokens(&ok("notebooks"), &opts).is_ok());
        assert!(validate_tokens(&ok("search x --limit 3"), &opts).is_ok());
        assert!(validate_tokens(&ok("edit some-id --old a --new b --dry-run"), &opts).is_ok());
        assert!(validate_tokens(&ok("list inbox --json"), &opts).is_ok());
    }

    #[test]
    fn validate_rejects_unknown_command() {
        let opts = McpOptions::default();
        assert!(validate_tokens(&ok("completion bash"), &opts).is_err());
        assert!(validate_tokens(&ok("mcp"), &opts).is_err());
        assert!(validate_tokens(&ok("publish"), &opts).is_err());
        assert!(validate_tokens(&ok("publish --out x"), &McpOptions { read_only: false, allow_publish: true }).is_ok());
    }

    #[test]
    fn validate_rejects_unknown_flag() {
        let opts = McpOptions::default();
        assert!(validate_tokens(&ok("show x --dry-run"), &opts).is_err());
        assert!(validate_tokens(&ok("list x --limit 3"), &opts).is_err());
    }

    #[test]
    fn validate_rejects_vault_and_help() {
        let opts = McpOptions::default();
        assert!(validate_tokens(&ok("show x --vault D:/elsewhere"), &opts).is_err());
        assert!(validate_tokens(&ok("show x --vault=D:/elsewhere"), &opts).is_err());
        assert!(validate_tokens(&ok("show --help"), &opts).is_err());
        assert!(validate_tokens(&ok("--version"), &opts).is_err());
    }

    #[test]
    fn validate_rejects_metacharacters_even_quoted() {
        let opts = McpOptions::default();
        assert!(validate_tokens(&ok("show \"a;b\""), &opts).is_err());
        assert!(validate_tokens(&ok("search \"$(whoami)\""), &opts).is_err());
        assert!(validate_tokens(&ok("search \"a`b\""), &opts).is_err());
        assert!(validate_tokens(&ok("search \"a|b\""), &opts).is_err());
    }

    #[test]
    fn validate_read_only_blocks_write() {
        let opts = McpOptions { read_only: true, allow_publish: false };
        assert!(validate_tokens(&ok("show x"), &opts).is_ok());
        assert!(validate_tokens(&ok("delete x"), &opts).is_err());
        assert!(validate_tokens(&ok("create inbox"), &opts).is_err());
    }

    #[test]
    fn cli_parse_receives_forced_json() {
        // 组装 argv 后 Cli::parse 应产出 --json 全局 flag
        let mut argv = vec!["tydora".to_string(), "--json".to_string()];
        argv.extend(ok("notebooks"));
        let cli = Cli::parse(argv).unwrap();
        assert!(cli.global.json);
        assert!(matches!(cli.command, CommandKind::Notebooks));
    }
}
