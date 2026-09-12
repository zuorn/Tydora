//! CLI 冒烟测试（Phase 1 范围）。
//!
//! 设计参考：见 docs/cli-implementation-plan.md
//!
//! ## 覆盖范围
//!
//! - 4 档退出码（0 / 1 / 2 / 3）
//! - `--version` / `-h` / 缺 subcommand
//! - 三个只读子命令（notebooks / list / show）的输出 schema
//! - `--json` 输出能被 serde_json 解析
//! - 中文 frontmatter title 正确提取
//! - 不存在的 notebook / id 返回 NotFound（exit 3）

use std::fs;
use std::path::Path;

use assert_cmd::Command;
use predicates::prelude::*;
use tempfile::TempDir;

/// 在临时目录建一个最小 vault，目录结构：
///
/// test-vault/
/// ├── inbox/
/// │   └── welcome.md        （有 frontmatter，title 中文）
/// ├── notes/
/// │   └── daily.md          （有 frontmatter，title 英文）
/// ├── scratch.md            （无 frontmatter，靠 H1 提 title）
/// └── .hidden/secret.md     （隐藏目录，必须被跳过）
fn make_fixture_vault() -> TempDir {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();

    let inbox = root.join("inbox");
    let notes = root.join("notes");
    fs::create_dir_all(&inbox).unwrap();
    fs::create_dir_all(&notes).unwrap();

    fs::write(
        inbox.join("welcome.md"),
        "---\ntitle: 欢迎使用 Tydora\ntags: [intro]\n---\n\n# 隐藏的 H1\n\nbody\n",
    )
    .unwrap();
    fs::write(
        notes.join("daily.md"),
        // 注意：这里故意让 "Daily" 在 frontmatter 与 H1 各出现一次，便于
        // edit_old_match_multiple_times_returns_usage_error 测试断言"非唯一"。
        "---\ntitle: Daily\n---\n\n# Daily\n\nbody\n",
    )
    .unwrap();
    fs::write(
        root.join("scratch.md"),
        "# H1 Scratch\n\nno frontmatter\n",
    )
    .unwrap();

    // 隐藏目录：扫描必须跳过
    let hidden = root.join(".hidden");
    fs::create_dir_all(&hidden).unwrap();
    fs::write(hidden.join("secret.md"), "---\ntitle: should-not-appear\n---\n").unwrap();

    dir
}

fn tydora_cli() -> Command {
    // 调试构建已经在 cargo test 期间就绪
    Command::cargo_bin("tydora-cli").expect("tydora-cli binary not built")
}

// ----------------------------------------------------------------------------
// exit code & help / version
// ----------------------------------------------------------------------------

#[test]
fn version_prints_and_exits_0() {
    tydora_cli()
        .arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::starts_with("tydora "));
}

#[test]
fn short_help_exits_0() {
    tydora_cli()
        .arg("-h")
        .assert()
        .success()
        .stdout(predicate::str::contains("Usage:"));
}

#[test]
fn missing_subcommand_exits_with_usage_error() {
    tydora_cli()
        .assert()
        .failure()
        .stderr(predicate::str::contains("usage:"));
}

#[test]
fn invalid_subcommand_exits_with_usage_error() {
    tydora_cli()
        .arg("bogus")
        .assert()
        .failure();
}

// ----------------------------------------------------------------------------
// notebooks（基本结构 + JSON 解析）
// ----------------------------------------------------------------------------

#[test]
fn notebooks_human_lists_top_level_dirs_plus_root() {
    let dir = make_fixture_vault();
    let out = tydora_cli()
        .args(["--vault", dir.path().to_str().unwrap(), "notebooks"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let s = String::from_utf8(out).unwrap();
    assert!(s.contains("(root)"), "human notebooks must include (root):\n{s}");
    assert!(s.contains("inbox"), "human notebooks must list 'inbox':\n{s}");
    assert!(s.contains("notes"), "human notebooks must list 'notes':\n{s}");
    assert!(!s.contains(".hidden"), ".hidden must be skipped:\n{s}");
}

#[test]
fn notebooks_json_schema_versioned_and_parseable() {
    let dir = make_fixture_vault();
    let out = tydora_cli()
        .args(["--vault", dir.path().to_str().unwrap(), "notebooks", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let v: serde_json::Value = serde_json::from_slice(&out).expect("valid json");
    assert_eq!(v["schema"], "tydora.vault.v1");
    let notebooks = v["notebooks"].as_array().expect("notebooks array");
    let names: Vec<&str> = notebooks
        .iter()
        .map(|n| n["name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"inbox"));
    assert!(names.contains(&"notes"));
    assert!(names.contains(&"(root)"));
}

// ----------------------------------------------------------------------------
// list
// ----------------------------------------------------------------------------

#[test]
fn list_unknown_notebook_exits_3_notfound() {
    let dir = make_fixture_vault();
    tydora_cli()
        .args(["--vault", dir.path().to_str().unwrap(), "list", "no-such-notebook"])
        .assert()
        .failure()
        .code(3);
}

#[test]
fn list_inbox_returns_notes_with_chinese_title_from_frontmatter() {
    let dir = make_fixture_vault();
    let out = tydora_cli()
        .args([
            "--vault",
            dir.path().to_str().unwrap(),
            "list",
            "inbox",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(v["schema"], "tydora.notebook.v1");
    let notes = v["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0]["id"], "inbox/welcome");
    // 中文 title 必须从 frontmatter 提取
    assert_eq!(notes[0]["title"], "欢迎使用 Tydora");
}

#[test]
fn list_scratch_root_uses_h1_when_no_frontmatter() {
    let dir = make_fixture_vault();
    let out = tydora_cli()
        .args([
            "--vault",
            dir.path().to_str().unwrap(),
            "list",
            "(root)",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
    let notes = v["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 1, "scratch.md is the only root-level .md");
    assert_eq!(notes[0]["title"], "H1 Scratch");
}

// ----------------------------------------------------------------------------
// show
// ----------------------------------------------------------------------------

#[test]
fn show_existing_returns_frontmatter_and_body() {
    let dir = make_fixture_vault();
    let out = tydora_cli()
        .args([
            "--vault",
            dir.path().to_str().unwrap(),
            "show",
            "inbox/welcome",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(v["schema"], "tydora.note.v1");
    assert_eq!(v["id"], "inbox/welcome");
    assert_eq!(v["title"], "欢迎使用 Tydora");
    assert_eq!(v["notebook"], "inbox");

    // frontmatter 解析成功（key=value 对象）
    let fm = v["frontmatter"].as_object().unwrap();
    assert_eq!(fm.get("title").and_then(|x| x.as_str()), Some("欢迎使用 Tydora"));

    // body 包含 `# 隐藏的 H1` —— 注意：H1 是 fallback，不是 frontmatter.title 已用
    let body = v["body"].as_str().unwrap();
    assert!(body.contains("# 隐藏的 H1"));
}

#[test]
fn show_missing_returns_3_notfound() {
    let dir = make_fixture_vault();
    tydora_cli()
        .args([
            "--vault",
            dir.path().to_str().unwrap(),
            "show",
            "does-not-exist",
        ])
        .assert()
        .failure()
        .code(3);
}

#[test]
fn show_rejects_path_traversal() {
    let dir = make_fixture_vault();
    // 即使 vault root 没东西，路径遍历也应该被 Usage 拒绝（exit 2）
    tydora_cli()
        .args([
            "--vault",
            dir.path().to_str().unwrap(),
            "show",
            "../etc/passwd",
        ])
        .assert()
        .failure()
        .code(2);
}

// ----------------------------------------------------------------------------
// Phase 2 占位命令：明确返回 Usage 错误（exit 2），不静默通过
// ----------------------------------------------------------------------------

#[test]
fn create_stub_returns_usage_error() {
    let dir = make_fixture_vault();
    tydora_cli()
        .args([
            "--vault",
            dir.path().to_str().unwrap(),
            "create",
            "no-such-notebook",
        ])
        .assert()
        .failure()
        .code(3); // Phase 2: create 找不到 notebook → NotFound（exit 3）而非 Usage 2
}

#[test]
fn mcp_with_closed_stdin_exits_zero() {
    // `tydora mcp` 是 MCP over stdio 服务器（Phase 4）：
    // stdin 立即关闭 → EOF → 服务器正常退出（exit 0），不输出任何内容。
    let dir = make_fixture_vault();
    tydora_cli()
        .args(["--vault", dir.path().to_str().unwrap(), "mcp"])
        .write_stdin("")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success();
}

// ----------------------------------------------------------------------------
// Phase 2：write path（create / edit / write / delete）
// ----------------------------------------------------------------------------

/// 将 stdin 喂进 assert_cmd（用 `write_stdin` 而不是 arg）。
/// 同时支持 stdin heredoc — Cargo 不直接支持，从 `std::env::temp_dir()` 创。
///
/// `body` 直接写到一个 pipe stdin，给 assert_cmd 用。
fn cli_write_body<'a>(cmd: &'a mut Command, body: &str) -> &'a mut Command {
    cmd.arg("--vault").arg("ignored-for-stub").arg("ignored-sub").write_stdin(body).timeout(std::time::Duration::from_secs(10))
    // 实际下面每个写命令 test 单独构造 vault + 单独的 stdin；这里只是占位。
}

#[test]
fn create_reads_body_from_stdin_and_makes_file_visible() {
    let dir = make_fixture_vault();
    let body = "# Pinned Note\n\nbody of pinned.\n";
    let out = tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("create")
        .arg("inbox")
        .write_stdin(body)
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let s = String::from_utf8(out).unwrap();
    assert!(s.contains("Created:"), "human output: {s}");
    assert!(s.contains("Pinned"), "title echoes from H1: {s}");

    // 新建的文件确实落在磁盘上
    let created = dir.path().join("inbox");
    let files: Vec<_> = std::fs::read_dir(&created)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    assert!(
        files.iter().any(|n| n.ends_with(".md")),
        "inbox should contain a .md file, got {files:?}"
    );

    // JSON shape
    let json_out = tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("create")
        .arg("inbox")
        .arg("--json")
        .write_stdin("# json-test\nbody\n")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let v: serde_json::Value = serde_json::from_slice(&json_out).expect("create --json");
    assert_eq!(v["schema"], "tydora.create.v1");
    assert_eq!(v["title"], "json-test");
}

#[test]
fn create_with_empty_stdin_returns_usage_error() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("create")
        .arg("inbox")
        .write_stdin("")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(2);
}

#[test]
fn edit_unique_old_writes_replacement() {
    let dir = make_fixture_vault();
    let target = dir.path().join("notes").join("daily.md");
    let before = std::fs::read_to_string(&target).unwrap();
    assert!(before.contains("body"), "fixture must contain 'body'");

    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("edit")
        .arg("notes/daily")
        .arg("--old")
        .arg("body\n") // 只匹配 body 段，frontmatter 不命中
        .arg("--new")
        .arg("replaced body\n")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success();

    let after = std::fs::read_to_string(&target).unwrap();
    // new body substring 必须包含
    assert!(after.contains("replaced body"), "after edit: {after}");
    // 老 substr 仅在新 substr 前被视为"在原位被替换"——文件**应该**还包含 "body"
    // 字样（"replaced body" 包含 "body"），所以更可靠的判断是"replaced"在文件出现
    // 且 frontmatter.title 仍为 "Daily"（未受影响）。
    assert!(after.contains("replaced"), "must contain replacement: {after}");
    // frontmatter 没动（replacen 严格 1 次，且不在 frontmatter 段）
    assert!(
        after.contains("title: Daily"),
        "frontmatter preserved: {after}"
    );
}

#[test]
fn edit_dry_run_does_not_modify_file() {
    let dir = make_fixture_vault();
    let target = dir.path().join("notes").join("daily.md");
    let before = std::fs::read_to_string(&target).unwrap();

    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("edit")
        .arg("notes/daily")
        .arg("--old")
        .arg("body\n")
        .arg("--new")
        .arg("never-written")
        .arg("--dry-run")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success();

    let after = std::fs::read_to_string(&target).unwrap();
    assert_eq!(before, after, "dry-run must not touch the file");
}

#[test]
fn edit_old_match_zero_times_returns_usage_error() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("edit")
        .arg("notes/daily")
        .arg("--old")
        .arg("absolutely-not-in-file")
        .arg("--new")
        .arg("anything")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(2)
        .stderr(predicate::str::contains("not found"));
}

#[test]
fn edit_old_match_multiple_times_returns_usage_error() {
    let dir = make_fixture_vault();
    // 多次命中：在 fixture 的 body 和 frontmatter 中各出现一次 "title"
    // （title 字段值与 H1 文本都含 "Daily"）
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("edit")
        .arg("notes/daily")
        .arg("--old")
        .arg("Daily")
        .arg("--new")
        .arg("NewTitle")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(2)
        .stderr(predicate::str::contains("not unique"));
}

#[test]
fn edit_new_stdin_writes() {
    let dir = make_fixture_vault();
    let target = dir.path().join("notes").join("daily.md");
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("edit")
        .arg("notes/daily")
        .arg("--old")
        .arg("body\n")
        .arg("--new-stdin")
        .write_stdin("stdin-replacement")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success();

    let after = std::fs::read_to_string(&target).unwrap();
    assert!(after.contains("stdin-replacement"));
}

#[test]
fn edit_with_both_new_and_new_stdin_returns_usage() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("edit")
        .arg("notes/daily")
        .arg("--old")
        .arg("body")
        .arg("--new")
        .arg("inline")
        .arg("--new-stdin")
        .write_stdin("fromstdin")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(2);
}

#[test]
fn write_overwrites_entire_file_from_stdin() {
    let dir = make_fixture_vault();
    let target = dir.path().join("notes").join("daily.md");
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("write")
        .arg("notes/daily")
        .write_stdin("totally new body\n")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success();

    let after = std::fs::read_to_string(&target).unwrap();
    assert!(after.starts_with("totally new body"), "after write: {after}");
    assert!(!after.contains("title:"), "frontmatter should be gone: {after}");
}

#[test]
fn write_dry_run_does_not_modify_file() {
    let dir = make_fixture_vault();
    let target = dir.path().join("notes").join("daily.md");
    let before = std::fs::read_to_string(&target).unwrap();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("write")
        .arg("notes/daily")
        .arg("--dry-run")
        .write_stdin("never written\n")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success();

    let after = std::fs::read_to_string(&target).unwrap();
    assert_eq!(before, after, "dry-run write must not touch the file");
}

#[test]
fn delete_moves_note_to_trash_and_removes_from_vault() {
    let dir = make_fixture_vault();
    let target = dir.path().join("notes").join("daily.md");
    assert!(target.exists(), "fixture must have notes/daily.md");

    // 从第一层（tydora_home/trash）递归找 *.md，验证 trash 里出现了新文件。
    // 注意：不能假设 trash 根存在，要 tolerate Ok(NOT_FOUND)。
    let trash_root = tydora_home_trash_root();
    let _ = std::fs::remove_dir_all(&trash_root);
    std::fs::create_dir_all(&trash_root).expect("create trash root");

    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("delete")
        .arg("notes/daily")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success();

    assert!(!target.exists(), "delete must remove the original");

    // 递归找 `notes_daily-<ts>.md`
    let mut trash_hits = Vec::new();
    fn walk(p: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        // tolerate permission errors / 等异常
        let entries = match std::fs::read_dir(p) {
            Ok(rd) => rd,
            Err(_) => return,
        };
        for e in entries.flatten() {
            let path = e.path();
            let file_type = e.file_type().ok();
            if file_type.map(|t| t.is_dir()).unwrap_or(false) {
                walk(&path, out);
            } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if ext == "md" {
                    out.push(path);
                }
            }
        }
    }
    walk(&trash_root, &mut trash_hits);
    let names: Vec<String> = trash_hits
        .iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
        .collect();
    assert!(
        names.iter().any(|n| n.starts_with("notes_daily-") && n.ends_with(".md")),
        "trash should hold notes_daily-<ts>.md, found {names:?}"
    );
}

#[test]
fn delete_missing_note_returns_3_notfound() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("delete")
        .arg("notes/nonexistent")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(3);
}

#[test]
fn delete_with_path_traversal_returns_2_usage() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("delete")
        .arg("../etc/passwd")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(2);
}

/// 返回 $TYDORA_HOME/.tydora/trash，与 production [`tydora_home()`] 完全对齐：
/// 1. $TYDORA_HOME env（直接为 home）
/// 2. $HOME（POSIX `/c/Users/...`）优先于 $USERPROFILE
/// 3. fallback 当前目录 `.tydora`
///
/// 必须与 production 同步调整；优先级不一致 → 测试找不到 production 落盘的 trash。
fn tydora_home_trash_root() -> std::path::PathBuf {
    let home = std::env::var_os("TYDORA_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .or_else(|| std::env::var_os("USERPROFILE"))
                .map(std::path::PathBuf::from)
        })
        .unwrap_or_else(|| std::path::PathBuf::from(".tydora"));
    home.join(".tydora").join("trash")
}

#[allow(dead_code)]
fn _unused(_: &Path) {}

// ----------------------------------------------------------------------------
// Phase 3：search
// ----------------------------------------------------------------------------

use serde_json::Value;

#[test]
fn search_finds_query_and_reports_schema() {
    let dir = make_fixture_vault();
    let output = tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("search")
        .arg("body")
        .arg("--json")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let v: Value = serde_json::from_slice(&output).expect("stdout must be valid JSON");
    assert_eq!(v["schema"], "tydora.search.v1");
    assert_eq!(v["query"], "body");
    let results = v["results"].as_array().expect("results array");
    let ids: Vec<&str> = results.iter().map(|r| r["id"].as_str().unwrap()).collect();
    assert!(ids.contains(&"notes/daily"), "ids: {ids:?}");
    assert!(ids.contains(&"inbox/welcome"), "ids: {ids:?}");
    // 每个命中带 1-based 行号
    let daily = results.iter().find(|r| r["id"] == "notes/daily").unwrap();
    assert!(daily["match_count"].as_u64().unwrap() >= 1);
    assert!(daily["lines"][0]["line"].as_u64().unwrap() >= 1);
}

#[test]
fn search_is_case_insensitive() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("search")
        .arg("BODY")
        .arg("--json")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .stdout(predicate::str::contains("notes/daily"));
}

#[test]
fn search_skips_hidden_directories() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("search")
        .arg("should-not-appear")
        .arg("--json")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .stdout(predicate::str::contains("\"results\": []"));
}

#[test]
fn search_notebook_filter_restricts_scope() {
    let dir = make_fixture_vault();
    // "body" 同时在 inbox/welcome 与 notes/daily；限定 inbox 后只剩 welcome
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("search")
        .arg("body")
        .arg("--notebook")
        .arg("inbox")
        .arg("--json")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .stdout(
            predicate::str::contains("inbox/welcome")
                .and(predicate::str::contains("notes/daily").not()),
        );
}

#[test]
fn search_unknown_notebook_returns_3_notfound() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("search")
        .arg("body")
        .arg("--notebook")
        .arg("no-such-nb")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(3);
}

#[test]
fn search_empty_query_returns_usage_error() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("search")
        .arg("   ")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(2);
}

#[test]
fn search_limit_caps_file_count() {
    let dir = make_fixture_vault();
    let output = tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("search")
        .arg("body")
        .arg("--limit")
        .arg("1")
        .arg("--json")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let v: Value = serde_json::from_slice(&output).expect("valid JSON");
    let results = v["results"].as_array().unwrap();
    assert_eq!(results.len(), 1, "--limit 1 must cap files at 1");
    assert_eq!(v["truncated"], true, "truncated must be true when capped");
}

// ----------------------------------------------------------------------------
// Phase 3：completion
// ----------------------------------------------------------------------------

#[test]
fn completion_bash_emits_script() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("completion")
        .arg("bash")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .stdout(predicate::str::contains("tydora"));
}

#[test]
fn completion_zsh_emits_script() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("completion")
        .arg("zsh")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .success()
        .stdout(predicate::str::contains("#compdef tydora"));
}

#[test]
fn completion_unknown_shell_returns_usage_error() {
    let dir = make_fixture_vault();
    tydora_cli()
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("completion")
        .arg("tcsh")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(2)
        .stderr(predicate::str::contains("unknown shell"));
}

// ----------------------------------------------------------------------------
// Phase 3：publish（launcher 缺失路径——不依赖 Node/markdown-publish）
// ----------------------------------------------------------------------------

#[test]
fn publish_without_launcher_hints_install() {
    let dir = make_fixture_vault();
    // 清空 PATH + 临时目录 cwd（祖先链无 package.json）→ 三级查找全部落空，
    // 稳定命中 "not found → exit 3 + 安装指引" 分支（不真正启动 Node）。
    tydora_cli()
        .env_remove("PATH")
        .env("TMP", dir.path().to_str().unwrap())
        .env("TEMP", dir.path().to_str().unwrap())
        .current_dir(dir.path())
        .arg("--vault")
        .arg(dir.path().to_str().unwrap())
        .arg("publish")
        .timeout(std::time::Duration::from_secs(10))
        .assert()
        .failure()
        .code(3)
        .stderr(predicate::str::contains("npm install -g @abstractwebunit/markdown-publish"));
}

