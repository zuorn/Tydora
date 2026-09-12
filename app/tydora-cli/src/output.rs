//! `--json` 与人类可读输出的统一 schema。
//!
//! 设计参考：见 docs/cli-implementation-plan.md 与 `fmt.rs`
//!
//! ## Schema 演进规则（与 MCP 衔接）
//!
//! 每个 model 都带 `"schema": "tydora.<model>.v<N>"`，未来 schema 不兼容时
//! 升 v 即可，MCP 与稳定消费者按 v 索引。
//!
//! ## 人类可读输出原则
//!
//! - 颜色：完全不用 ANSI（CI / 截图 / 管道都不会被着色干扰）。
//! - 宽度：不依赖 `crossterm`（保持零非必要依赖）；CJK 宽度通过 [`fmt`]
//!   的简易估算（半角=1，全角=2）。
//! - 退出：所有错误诊断走 stderr，成功结果走 stdout。
//!
//! ## Sink 化（2026-09-11，MCP Phase 4 前置）
//!
//! 所有 `emit_*` 把结果写进调用方提供的 `out: &mut dyn Write` 而不是
//! 直接 `println!`：
//! - CLI 入口传 `stdout.lock()`（行为与 sink 化之前完全一致）
//! - MCP 入口传内存缓冲（stdout 是协议专线，见 docs/mcp-implementation-plan.md §5.1）

use std::io::Write;

use crate::errors::{CliError, CliResult};
use crate::publish::Published;
use crate::store::SearchResults;
use crate::store::{Created, Deleted, Edited, NoteShow, VaultOverview, Wrote};
use crate::fmt::display_width;

/// 单行写出 helper：把 io 错误统一映射为 CliError::Io（exit 5）。
fn wln(out: &mut dyn Write, s: &str) -> CliResult<()> {
    writeln!(out, "{s}").map_err(CliError::Io)
}

pub fn emit_notebooks(overview: &VaultOverview, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(overview)
            .map_err(|e| CliError::Other(format!("serialize notebooks: {e}")))?;
        return wln(out, &s);
    }
    wln(
        out,
        &format!(
            "Vault: {}    ({} notebook{})",
            overview.vault.display(),
            overview.notebooks.len(),
            if overview.notebooks.len() == 1 { "" } else { "s" }
        ),
    )?;
    wln(out, "")?;
    if overview.notebooks.is_empty() {
        return wln(out, "(no notebooks found — vault may be empty or all files are hidden)");
    }
    // 列表视图：name + note_count
    let name_w = overview
        .notebooks
        .iter()
        .map(|n| display_width(&n.name))
        .max()
        .unwrap_or(4)
        .max(4);
    let count_w = overview
        .notebooks
        .iter()
        .map(|n| n.note_count.to_string().chars().count())
        .max()
        .unwrap_or(1)
        .max(1);

    wln(out, &format!("{:<name_w$}  {:>count_w$}  path", "name", "notes"))?;
    wln(
        out,
        &format!("{}  {}  {}", "─".repeat(name_w), "─".repeat(count_w), "────────"),
    )?;
    for nb in &overview.notebooks {
        wln(
            out,
            &format!(
                "{:<name_w$}  {:>count_w$}  {}",
                nb.name,
                nb.note_count,
                nb.path.display()
            ),
        )?;
    }
    Ok(())
}

pub fn emit_notes(list: &crate::store::NotebookList, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(list)
            .map_err(|e| CliError::Other(format!("serialize notes: {e}")))?;
        return wln(out, &s);
    }
    wln(
        out,
        &format!("Notebook: {}  ({})", list.notebook, list.vault.display()),
    )?;
    wln(out, "")?;
    if list.notes.is_empty() {
        return wln(out, "(no notes in this notebook)");
    }
    let id_w = list
        .notes
        .iter()
        .map(|n| display_width(&n.id))
        .max()
        .unwrap_or(2)
        .max(2);
    let title_w = list
        .notes
        .iter()
        .map(|n| display_width(&n.title))
        .max()
        .unwrap_or(5)
        .max(5);

    wln(out, &format!("{:<id_w$}  {:<title_w$}  {:>5}  mtime", "id", "title", "size"))?;
    wln(
        out,
        &format!(
            "{}  {}  {}  {}",
            "─".repeat(id_w),
            "─".repeat(title_w),
            "─────",
            "────────"
        ),
    )?;
    for n in &list.notes {
        wln(
            out,
            &format!(
                "{:<id_w$}  {:<title_w$}  {:>5}  {}",
                n.id,
                n.title,
                format_size(n.size),
                n.mtime
            ),
        )?;
    }
    wln(out, "")?;
    wln(
        out,
        &format!(
            "  total: {} note{}",
            list.notes.len(),
            if list.notes.len() == 1 { "" } else { "s" }
        ),
    )
}

pub fn emit_note(note: &NoteShow, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(note)
            .map_err(|e| CliError::Other(format!("serialize note: {e}")))?;
        return wln(out, &s);
    }
    wln(out, &format!("Note:    {}", note.id))?;
    wln(out, &format!("Title:   {}", note.title))?;
    wln(out, &format!("Notebook: {}", note.notebook))?;
    wln(out, &format!("Path:    {}", note.path.display()))?;
    wln(
        out,
        &format!("Size:    {} (mtime {})", format_size(note.size), note.mtime),
    )?;
    wln(out, "")?;
    if !note.frontmatter.is_object() || note.frontmatter.as_object().unwrap().is_empty() {
        wln(out, "─── frontmatter (none) ─────────────────────────────")?;
    } else {
        wln(out, "─── frontmatter ────────────────────────────────────")?;
        for (k, v) in note.frontmatter.as_object().unwrap() {
            wln(out, &format!("  {k}: {v}"))?;
        }
        wln(out, "─────────────────────────────────────────────────────")?;
    }
    wln(out, "")?;
    wln(out, "─── body ──────────────────────────────────────────")?;
    // print! 语义（不追加换行）；body 结尾是否补 \n 与 sink 化前一致
    write!(out, "{}", note.body).map_err(CliError::Io)?;
    if !note.body.ends_with('\n') {
        wln(out, "")?;
    }
    wln(out, "─────────────────────────────────────────────────────")
}

/// 进度/警告/错误信息统一走 stderr（不破坏 stdout pipeline）。
/// MCP 模式下 stderr = 服务器日志，客户端可见但不进协议流。
pub fn emit_stderr_warn(msg: &str) {
    eprintln!("tydora: warn: {msg}");
}

// ============================================================================
// Phase 2: write-path 命令输出
// ============================================================================

pub fn emit_created(c: &Created, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(c)
            .map_err(|e| CliError::Other(format!("serialize created: {e}")))?;
        return wln(out, &s);
    }
    wln(out, &format!("Created: {}", c.id))?;
    wln(out, &format!("Title:   {}", c.title))?;
    wln(out, &format!("Notebook: {}", c.notebook))?;
    wln(out, &format!("Path:    {}", c.path.display()))?;
    wln(out, &format!("Size:    {}", format_size(c.size)))
}

pub fn emit_deleted(d: &Deleted, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(d)
            .map_err(|e| CliError::Other(format!("serialize deleted: {e}")))?;
        return wln(out, &s);
    }
    wln(out, &format!("Deleted (moved to trash): {}", d.id))?;
    wln(out, &format!("Original:  {}", d.original_path.display()))?;
    wln(out, &format!("Trash:     {}", d.trash_path.display()))
}

pub fn emit_edited(e: &Edited, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(e)
            .map_err(|e| CliError::Other(format!("serialize edited: {e}")))?;
        return wln(out, &s);
    }
    if e.dry_run {
        wln(out, &format!("[dry-run] WOULD edit {}", e.id))?;
        wln(out, &format!("Path:       {}", e.path.display()))?;
        wln(
            out,
            &format!(
                "Bytes Δ:    {:+} (new_content {} bytes if written)",
                -e.bytes_delta,
                std::fs::metadata(&e.path)
                    .map(|m| (m.len() as i64) + e.bytes_delta)
                    .unwrap_or_default()
            ),
        )?;
        wln(out, &format!("Mtime-After: {}", e.mtime_after))?;
        if let Some(preview) = &e.body_preview {
            wln(out, "")?;
            wln(out, "─── preview ─────────────────────────────────────")?;
            write!(out, "{preview}").map_err(CliError::Io)?;
            if !preview.ends_with('\n') {
                wln(out, "")?;
            }
            wln(out, "─────────────────────────────────────────────────")?;
        }
    } else {
        wln(out, &format!("Edited:    {}", e.id))?;
        wln(out, &format!("Path:      {}", e.path.display()))?;
        wln(out, &format!("Bytes Δ:   {:+}", -e.bytes_delta))?;
        wln(out, &format!("Mtime:     {}", e.mtime_after))?;
    }
    Ok(())
}

pub fn emit_wrote(w: &Wrote, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(w)
            .map_err(|e| CliError::Other(format!("serialize wrote: {e}")))?;
        return wln(out, &s);
    }
    if w.dry_run {
        wln(
            out,
            &format!("[dry-run] WOULD overwrite {} ({} bytes from stdin)", w.id, w.size),
        )?;
        wln(out, &format!("Path: {}", w.path.display()))
    } else {
        wln(out, &format!("Wrote:    {}", w.id))?;
        wln(out, &format!("Path:     {}", w.path.display()))?;
        wln(out, &format!("Size:     {}", format_size(w.size)))
    }
}

// ============================================================================
// Phase 3: search / publish 输出
// ============================================================================

/// 人类可读视图里每个文件最多展示的命中行数（JSON 里是全量样本行）。
const SEARCH_PREVIEW_LINES: usize = 5;

pub fn emit_search(res: &SearchResults, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(res)
            .map_err(|e| CliError::Other(format!("serialize search: {e}")))?;
        return wln(out, &s);
    }
    match &res.notebook {
        Some(nb) => wln(
            out,
            &format!(
                "Search: \"{}\"  in notebook '{}'  ({})",
                res.query, nb, res.vault.display()
            ),
        )?,
        None => wln(
            out,
            &format!("Search: \"{}\"  ({})", res.query, res.vault.display()),
        )?,
    }
    wln(out, "")?;
    if res.results.is_empty() {
        wln(out, "(no matches)")?;
        if res.truncated {
            wln(out, "(results were truncated by --limit; there are more files)")?;
        }
        return Ok(());
    }
    let id_w = res
        .results
        .iter()
        .map(|h| display_width(&h.id))
        .max()
        .unwrap_or(2)
        .max(2);
    let count_w = res
        .results
        .iter()
        .map(|h| h.match_count.to_string().chars().count())
        .max()
        .unwrap_or(1)
        .max(1);

    wln(out, &format!("{:<id_w$}  {:>count_w$}  title", "id", "lines"))?;
    wln(
        out,
        &format!("{}  {}  {}", "─".repeat(id_w), "─".repeat(count_w), "─────"),
    )?;
    for hit in &res.results {
        wln(
            out,
            &format!(
                "{:<id_w$}  {:>count_w$}  {}",
                hit.id,
                hit.match_count,
                if hit.title.is_empty() { "-" } else { &hit.title }
            ),
        )?;
        for line in hit.lines.iter().take(SEARCH_PREVIEW_LINES) {
            wln(
                out,
                &format!("    {:>5}: {}", line.line, line.text),
            )?;
        }
        if hit.lines.len() > SEARCH_PREVIEW_LINES || hit.lines_truncated {
            wln(
                out,
                &format!(
                    "    … {} more matching line(s) not shown (--json for the full sample)",
                    hit.match_count.saturating_sub(SEARCH_PREVIEW_LINES.min(hit.lines.len()))
                ),
            )?;
        }
    }
    wln(out, "")?;
    wln(
        out,
        &format!(
            "  {} match(es) in {} file(s){}",
            res.total_matches,
            res.results.len(),
            if res.truncated { " (truncated by --limit)" } else { "" }
        ),
    )
}

pub fn emit_published(p: &Published, json: bool, out: &mut dyn Write) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(p)
            .map_err(|e| CliError::Other(format!("serialize published: {e}")))?;
        return wln(out, &s);
    }
    if p.success {
        wln(out, &format!("Published: {}", p.vault.display()))?;
        wln(out, &format!("Output:    {}", p.out_dir.display()))?;
        wln(out, &format!("Launcher:  {}", p.launcher))?;
        if !p.stdout.trim().is_empty() {
            wln(out, "")?;
            wln(out, "─── markdown-publish output ────────────────────────")?;
            wln(out, p.stdout.trim_end())?;
        }
    } else {
        wln(out, &format!("Publish FAILED: {}", p.vault.display()))?;
        wln(out, &format!("Output:    {}", p.out_dir.display()))?;
        wln(out, &format!("Exit code: {:?}", p.exit_code))?;
        if !p.stderr.trim().is_empty() {
            wln(out, "")?;
            wln(out, "─── stderr ─────────────────────────────────────────")?;
            wln(out, p.stderr.trim_end())?;
        }
        if !p.stdout.trim().is_empty() {
            wln(out, "")?;
            wln(out, "─── stdout (tail) ──────────────────────────────────")?;
            wln(out, p.stdout.trim_end())?;
        }
    }
    Ok(())
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    if bytes >= MB {
        format!("{:.1}M", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1}K", bytes as f64 / KB as f64)
    } else {
        format!("{bytes}B")
    }
}
