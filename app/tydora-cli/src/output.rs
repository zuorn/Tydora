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

use crate::errors::{CliError, CliResult};
use crate::store::{Created, Deleted, Edited, NoteShow, VaultOverview, Wrote};
use crate::fmt::display_width;

pub fn emit_notebooks(overview: &VaultOverview, json: bool) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(overview)
            .map_err(|e| CliError::Other(format!("serialize notebooks: {e}")))?;
        println!("{s}");
        return Ok(());
    }
    println!(
        "Vault: {}    ({} notebook{})",
        overview.vault.display(),
        overview.notebooks.len(),
        if overview.notebooks.len() == 1 { "" } else { "s" }
    );
    println!();
    if overview.notebooks.is_empty() {
        println!("(no notebooks found — vault may be empty or all files are hidden)");
        return Ok(());
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

    println!("{:<name_w$}  {:>count_w$}  path", "name", "notes");
    println!("{}  {}  {}", "─".repeat(name_w), "─".repeat(count_w), "────────");
    for nb in &overview.notebooks {
        println!(
            "{:<name_w$}  {:>count_w$}  {}",
            nb.name,
            nb.note_count,
            nb.path.display()
        );
    }
    Ok(())
}

pub fn emit_notes(list: &crate::store::NotebookList, json: bool) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(list)
            .map_err(|e| CliError::Other(format!("serialize notes: {e}")))?;
        println!("{s}");
        return Ok(());
    }
    println!("Notebook: {}  ({})", list.notebook, list.vault.display());
    println!();
    if list.notes.is_empty() {
        println!("(no notes in this notebook)");
        return Ok(());
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

    println!("{:<id_w$}  {:<title_w$}  {:>5}  mtime", "id", "title", "size");
    println!(
        "{}  {}  {}  {}",
        "─".repeat(id_w),
        "─".repeat(title_w),
        "─────",
        "────────"
    );
    for n in &list.notes {
        println!(
            "{:<id_w$}  {:<title_w$}  {:>5}  {}",
            n.id,
            n.title,
            format_size(n.size),
            n.mtime
        );
    }
    println!();
    println!(
        "  total: {} note{}",
        list.notes.len(),
        if list.notes.len() == 1 { "" } else { "s" }
    );
    Ok(())
}

pub fn emit_note(note: &NoteShow, json: bool) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(note)
            .map_err(|e| CliError::Other(format!("serialize note: {e}")))?;
        println!("{s}");
        return Ok(());
    }
    println!("Note:    {}", note.id);
    println!("Title:   {}", note.title);
    println!("Notebook: {}", note.notebook);
    println!("Path:    {}", note.path.display());
    println!("Size:    {} (mtime {})", format_size(note.size), note.mtime);
    println!();
    if !note.frontmatter.is_object() || note.frontmatter.as_object().unwrap().is_empty() {
        println!("─── frontmatter (none) ─────────────────────────────");
    } else {
        println!("─── frontmatter ────────────────────────────────────");
        for (k, v) in note.frontmatter.as_object().unwrap() {
            println!("  {k}: {v}");
        }
        println!("─────────────────────────────────────────────────────");
    }
    println!();
    println!("─── body ──────────────────────────────────────────");
    print!("{}", note.body);
    if !note.body.ends_with('\n') {
        println!();
    }
    println!("─────────────────────────────────────────────────────");
    Ok(())
}

/// 进度/警告/错误信息统一走 stderr（不破坏 stdout pipeline）。
pub fn emit_stderr_warn(msg: &str) {
    eprintln!("tydora: warn: {msg}");
}

// ============================================================================
// Phase 2: write-path 命令输出
// ============================================================================

pub fn emit_created(c: &Created, json: bool) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(c)
            .map_err(|e| CliError::Other(format!("serialize created: {e}")))?;
        println!("{s}");
        return Ok(());
    }
    println!("Created: {}", c.id);
    println!("Title:   {}", c.title);
    println!("Notebook: {}", c.notebook);
    println!("Path:    {}", c.path.display());
    println!("Size:    {}", format_size(c.size));
    Ok(())
}

pub fn emit_deleted(d: &Deleted, json: bool) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(d)
            .map_err(|e| CliError::Other(format!("serialize deleted: {e}")))?;
        println!("{s}");
        return Ok(());
    }
    println!("Deleted (moved to trash): {}", d.id);
    println!("Original:  {}", d.original_path.display());
    println!("Trash:     {}", d.trash_path.display());
    Ok(())
}

pub fn emit_edited(e: &Edited, json: bool) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(e)
            .map_err(|e| CliError::Other(format!("serialize edited: {e}")))?;
        println!("{s}");
        return Ok(());
    }
    if e.dry_run {
        println!("[dry-run] WOULD edit {}", e.id);
        println!("Path:       {}", e.path.display());
        println!(
            "Bytes Δ:    {:+} (new_content {} bytes if written)",
            -e.bytes_delta,
            std::fs::metadata(&e.path)
                .map(|m| (m.len() as i64) + e.bytes_delta)
                .unwrap_or_default()
        );
        println!("Mtime-After: {}", e.mtime_after);
        if let Some(preview) = &e.body_preview {
            println!();
            println!("─── preview ─────────────────────────────────────");
            print!("{preview}");
            if !preview.ends_with('\n') {
                println!();
            }
            println!("─────────────────────────────────────────────────");
        }
    } else {
        println!("Edited:    {}", e.id);
        println!("Path:      {}", e.path.display());
        println!("Bytes Δ:   {:+}", -e.bytes_delta);
        println!("Mtime:     {}", e.mtime_after);
    }
    Ok(())
}

pub fn emit_wrote(w: &Wrote, json: bool) -> CliResult<()> {
    if json {
        let s = serde_json::to_string_pretty(w)
            .map_err(|e| CliError::Other(format!("serialize wrote: {e}")))?;
        println!("{s}");
        return Ok(());
    }
    if w.dry_run {
        println!("[dry-run] WOULD overwrite {} ({} bytes from stdin)", w.id, w.size);
        println!("Path: {}", w.path.display());
    } else {
        println!("Wrote:    {}", w.id);
        println!("Path:     {}", w.path.display());
        println!("Size:     {}", format_size(w.size));
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
