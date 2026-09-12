//! MCP e2e 集成测试（Phase 4）。
//!
//! 设计参考：docs/mcp-implementation-plan.md §9
//!
//! 方式：spawn `tydora-cli mcp`，向 stdin 写 NDJSON、按行读 stdout 断言。
//! 不引入任何测试框架（与 cli_smoke.rs 同风格）。
//!
//! 注意：MCP 语法层拒绝 `--vault`，vault 由服务器进程 env（$TYDORA_VAULT）
//! 钉死 —— 测试统一用 env 注入 fixture vault。

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};

use serde_json::{json, Value};

const LATEST: &str = "2025-06-18";

// ----------------------------------------------------------------------------
// fixture & session helpers
// ----------------------------------------------------------------------------

fn make_fixture_vault() -> tempfile::TempDir {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    let inbox = root.join("inbox");
    std::fs::create_dir_all(&inbox).unwrap();
    std::fs::write(
        inbox.join("welcome.md"),
        "---\ntitle: 欢迎\ntags: [intro]\n---\n\n# 隐藏 H1\n\nbody text here\n",
    )
    .unwrap();
    let notes = root.join("notes");
    std::fs::create_dir_all(&notes).unwrap();
    std::fs::write(notes.join("daily.md"), "---\ntitle: Daily\n---\n\n# Daily\n\nbody\n").unwrap();
    dir
}

struct McpSession {
    stdin: ChildStdin,
    reader: BufReader<std::process::ChildStdout>,
    child: Child,
    next_id: u64,
}

impl McpSession {
    fn start(vault: &Path, extra_args: &[&str]) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_tydora-cli"))
            .arg("mcp")
            .args(extra_args)
            .env("TYDORA_VAULT", vault)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn tydora mcp");
        let stdin = child.stdin.take().expect("stdin piped");
        let reader = BufReader::new(child.stdout.take().expect("stdout piped"));
        Self {
            stdin,
            reader,
            child,
            next_id: 1,
        }
    }

    fn send(&mut self, value: &Value) {
        let line = serde_json::to_string(value).unwrap();
        writeln!(self.stdin, "{line}").expect("write to mcp stdin");
        self.stdin.flush().expect("flush mcp stdin");
    }

    /// 发送请求并读取响应（跳过任何插入的行，直到 id 匹配）。
    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}));
        self.read_response(id)
    }

    /// 读一行响应（不校验 id，用于 id=null 的协议错误响应）。
    fn read_line_raw(&mut self) -> Value {
        let mut line = String::new();
        self.reader.read_line(&mut line).expect("read mcp stdout");
        assert!(!line.is_empty(), "mcp server closed stdout unexpectedly");
        serde_json::from_str(line.trim())
            .unwrap_or_else(|e| panic!("mcp response not valid JSON: {e}; line: {line}"))
    }

    fn read_response(&mut self, id: u64) -> Value {
        loop {
            let mut line = String::new();
            self.reader.read_line(&mut line).expect("read mcp stdout");
            assert!(!line.is_empty(), "mcp server closed stdout unexpectedly");
            let v: Value = serde_json::from_str(line.trim())
                .unwrap_or_else(|e| panic!("mcp response not valid JSON: {e}; line: {line}"));
            if v.get("id").and_then(Value::as_u64) == Some(id) {
                return v;
            }
        }
    }

    fn shutdown(mut self) -> i32 {
        drop(self.stdin); // 关 stdin → 服务器 EOF 退出
        self.child.wait().expect("wait mcp server").code().unwrap_or(-1)
    }
}

fn initialize(s: &mut McpSession) -> Value {
    s.request(
        "initialize",
        json!({
            "protocolVersion": LATEST,
            "capabilities": {},
            "clientInfo": {"name": "tydora-mcp-e2e", "version": "0"}
        }),
    )
}

fn call(s: &mut McpSession, syntax: &str) -> (bool, Option<Value>, String) {
    call_with_stdin(s, syntax, None)
}

fn call_with_stdin(s: &mut McpSession, syntax: &str, stdin: Option<&str>) -> (bool, Option<Value>, String) {
    let mut arguments = json!({ "syntax": syntax });
    if let Some(b) = stdin {
        arguments["stdin"] = json!(b);
    }
    let resp = s.request("tools/call", json!({ "name": "tydora_note", "arguments": arguments }));
    let result = resp.get("result").expect("tools/call must return result").clone();
    let is_error = result.get("isError").and_then(Value::as_bool).unwrap_or(false);
    let text = result["content"][0]["text"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let structured = result.get("structuredContent").cloned();
    (is_error, structured, text)
}

fn tool_text(s: &mut McpSession, syntax: &str) -> String {
    let (is_error, _, text) = call(s, syntax);
    assert!(!is_error, "tool call should succeed: {syntax} → {text}");
    text
}

fn tool_error_text(s: &mut McpSession, syntax: &str) -> String {
    let (is_error, _, text) = call(s, syntax);
    assert!(is_error, "tool call should fail: {syntax} → {text}");
    text
}

// ----------------------------------------------------------------------------
// 用例
// ----------------------------------------------------------------------------

#[test]
fn handshake_ok() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    let resp = initialize(&mut s);
    let result = resp.get("result").expect("initialize result");
    assert_eq!(
        result["serverInfo"]["name"], "tydora",
        "serverInfo.name"
    );
    assert_eq!(
        result["capabilities"]["tools"]["listChanged"], false,
        "capabilities.tools"
    );
    assert!(result["protocolVersion"].is_string());
    s.shutdown();
}

#[test]
fn protocol_version_echo_and_fallback() {
    let dir = make_fixture_vault();

    // 支持集内：原样回显
    let mut s = McpSession::start(dir.path(), &[]);
    let resp = s.request(
        "initialize",
        json!({"protocolVersion": "2025-03-26", "capabilities": {}}),
    );
    assert_eq!(resp["result"]["protocolVersion"], "2025-03-26");
    s.shutdown();

    // 不在支持集：回落最新版
    let mut s = McpSession::start(dir.path(), &[]);
    let resp = s.request(
        "initialize",
        json!({"protocolVersion": "1999-01-01", "capabilities": {}}),
    );
    assert_eq!(resp["result"]["protocolVersion"], LATEST);
    s.shutdown();
}

#[test]
fn ping_returns_empty_result() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    let resp = s.request("ping", json!({}));
    assert_eq!(resp["result"], json!({}));
    s.shutdown();
}

#[test]
fn tools_list_single_tool() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let resp = s.request("tools/list", json!({}));
    let tools = resp["result"]["tools"].as_array().expect("tools array");
    assert_eq!(tools.len(), 1, "exactly one tool");
    assert_eq!(tools[0]["name"], "tydora_note");
    assert_eq!(
        tools[0]["inputSchema"]["required"],
        json!(["syntax"]),
        "syntax is required"
    );
    assert!(tools[0]["inputSchema"]["properties"]["stdin"].is_object());
    s.shutdown();
}

#[test]
fn call_show_roundtrip() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let (_, structured, _) = call(&mut s, "show notes/daily");
    let sc = structured.expect("structuredContent present");
    assert_eq!(sc["schema"], "tydora.note.v1");
    assert_eq!(sc["title"], "Daily");
    assert!(sc["body"].as_str().unwrap().contains("body"));
    s.shutdown();
}

#[test]
fn call_search_and_notebooks() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);

    let text = tool_text(&mut s, "notebooks");
    let v: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(v["schema"], "tydora.vault.v1");

    let (_, structured, _) = call(&mut s, "search body --limit 1");
    let sc = structured.expect("search structured");
    assert_eq!(sc["schema"], "tydora.search.v1");
    assert_eq!(sc["results"].as_array().unwrap().len(), 1);
    s.shutdown();
}

#[test]
fn json_output_is_forced() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    // syntax 里不带 --json，返回仍必须是可解析的 JSON schema
    let text = tool_text(&mut s, "list inbox");
    let v: Value = serde_json::from_str(&text).expect("forced --json");
    assert_eq!(v["schema"], "tydora.notebook.v1");
    s.shutdown();
}

#[test]
fn reject_shell_metacharacters() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    for syntax in [
        "show \"a;b\"",
        "show \"a|b\"",
        "show \"a&b\"",
        "search \"$(whoami)\"",
        "show \"a`b\"",
        "show \"a>b\"",
    ] {
        let text = tool_error_text(&mut s, syntax);
        assert!(text.contains("not allowed"), "({syntax}) → {text}");
    }
    s.shutdown();
}

#[test]
fn reject_vault_flag() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let text = tool_error_text(&mut s, "show x --vault C:/Windows");
    assert!(text.to_lowercase().contains("vault"), "→ {text}");
    let text = tool_error_text(&mut s, "show x --vault=C:/Windows");
    assert!(text.to_lowercase().contains("vault"), "→ {text}");
    s.shutdown();
}

#[test]
fn reject_unknown_command() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let text = tool_error_text(&mut s, "publish");
    assert!(text.contains("not allowed"), "→ {text}");
    let text = tool_error_text(&mut s, "completion bash");
    assert!(text.contains("not allowed"), "→ {text}");
    s.shutdown();
}

#[test]
fn reject_unclosed_quote() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let text = tool_error_text(&mut s, "search \"abc");
    assert!(text.contains("syntax parse error"), "→ {text}");
    s.shutdown();
}

#[test]
fn clap_usage_error_is_tool_error() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    // 笔记存在但参数校验失败 → CliError::Usage（exit 2）→ isError=true 而非协议错误
    let (is_error, structured, text) = call(&mut s, "edit notes/daily --new x");
    assert!(is_error, "→ {text}");
    assert!(structured.is_none(), "errors carry no structuredContent");
    assert!(text.contains("usage"), "→ {text}");
    s.shutdown();
}

#[test]
fn not_found_is_tool_error_not_protocol_error() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let resp = s.request(
        "tools/call",
        json!({"name": "tydora_note", "arguments": {"syntax": "show no-such-note"}}),
    );
    // 必须是正常 JSON-RPC 响应（isError=true），不是 {"error": ...}
    assert!(resp.get("error").is_none(), "must not be a protocol error");
    assert_eq!(resp["result"]["isError"], true);
    assert!(resp["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("not found"));
    s.shutdown();
}

#[test]
fn stdin_field_used_by_create_and_edit() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);

    // create：body 来自 stdin 字段
    let (_, structured, _) =
        call_with_stdin(&mut s, "create inbox", Some("# From MCP\n\nmcp body\n"));
    let sc = structured.expect("create structured");
    assert_eq!(sc["schema"], "tydora.create.v1");
    let created_id = sc["id"].as_str().unwrap().to_string();
    let created_path = PathBuf::from(sc["path"].as_str().unwrap());
    assert!(created_path.exists(), "created file must exist");

    // edit --new-stdin：替换文本来自 stdin 字段
    let (is_error, structured, text) = call_with_stdin(
        &mut s,
        &format!("edit {created_id} --old \"mcp body\" --new-stdin"),
        Some("replaced via stdin field"),
    );
    assert!(!is_error, "edit failed: {text}");
    let sc = structured.unwrap_or_else(|| panic!("edit structured missing; text: {text}"));
    assert_eq!(sc["schema"], "tydora.edit.v1");
    let after = std::fs::read_to_string(&created_path).unwrap();
    assert!(after.contains("replaced via stdin field"));
    s.shutdown();
}

#[test]
fn read_only_flag_blocks_write() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &["--read-only"]);
    initialize(&mut s);
    let text = tool_error_text(&mut s, "delete notes/daily");
    assert!(text.contains("read-only"), "→ {text}");
    let text = tool_error_text(&mut s, "create inbox");
    assert!(text.contains("read-only"), "→ {text}");
    // 读命令仍可用
    let text = tool_text(&mut s, "show notes/daily");
    assert!(text.contains("tydora.note.v1"));
    s.shutdown();
}

#[test]
fn parse_error_is_protocol_error() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    writeln!(s.stdin, "{{bad json").unwrap();
    s.stdin.flush().unwrap();
    // 非法 JSON 无 id 可回显 → 服务器回 id=null 的协议错误，读单行断言
    let resp = s.read_line_raw();
    assert_eq!(resp["error"]["code"], -32700);
    s.shutdown();
}

#[test]
fn unknown_method_is_protocol_error() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let resp = s.request("resources/list", json!({}));
    assert_eq!(resp["error"]["code"], -32601);
    s.shutdown();
}

#[test]
fn notifications_get_no_response() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    // 通知（无 id）不应产生任何响应行；紧随的请求应直接拿到自己的响应
    s.send(&json!({"jsonrpc": "2.0", "method": "notifications/initialized"}));
    let resp = s.request("ping", json!({}));
    assert_eq!(resp["result"], json!({}));
    s.shutdown();
}

#[test]
fn eof_exits_zero() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let code = s.shutdown();
    assert_eq!(code, 0, "server must exit 0 on stdin EOF");
}

#[test]
fn every_response_is_single_line_json() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    // 连续多请求（含含换行的 body），所有响应行都必须是单行合法 JSON
    call_with_stdin(&mut s, "create inbox", Some("# Multi\n\nline1\nline2\n"));
    let resp = s.request("tools/list", json!({}));
    assert!(resp.get("result").is_some());
    s.shutdown();
}

#[test]
fn write_via_stdin_field_respects_dry_run() {
    let dir = make_fixture_vault();
    let mut s = McpSession::start(dir.path(), &[]);
    initialize(&mut s);
    let (_, structured, _) =
        call_with_stdin(&mut s, "write notes/daily --dry-run", Some("never written"));
    assert_eq!(structured.expect("write structured")["dry_run"], true);
    let content = std::fs::read_to_string(dir.path().join("notes").join("daily.md")).unwrap();
    assert!(content.contains("title: Daily"), "dry-run must not write");
    s.shutdown();
}
