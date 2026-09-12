//! CLI 业务实现。
//!
//! 设计参考：见 docs/cli-implementation-plan.md
//!
//! ## 业务逻辑复用层（2026-09-07 起）
//!
//! vault 扫描、frontmatter 解析、note id/title/slug 解析等纯逻辑已抽离
//! 到 `app/tydora-core/` crate（详见 `docs/cli-implementation-plan.md`）。
//! 本文件保留 CLI 特有的：
//!
//! - 数据模型（VaultOverview / NotebookInfo / NoteInfo / NoteShow /
//!   Created / Deleted / Edited / Wrote）
//! - 4 档 Unix 退出码语义（errors::CliError 桥接 tydora_core::CoreError）
//! - 写路径命令（cmd_create / cmd_delete / cmd_edit / cmd_write）
//! - time helpers（now_rfc3339 / format_unix_seconds_as_rfc3339）—— 待
//!   抽到 `tydora_core::time`（Phase 6+）
//! - trash 路径 hash 逻辑（cmd_delete）
//!
//! ## Phase 1 vs. Phase 2 兼容
//!
//! Phase 1 三件套（list_notebooks / list_notes / show_note）继续保留但
//! 底层改用 `tydora_core::vault::scan_vault` + `tydora_core::frontmatter::split`。
//! Phase 2 的 cmd_* 函数也复用 `tydora_core::note::{resolve_note_path,
//! resolve_notebook_dir, slugify_filename}`。
//!
//! ## id 策略
//!
//! Tydora 没有集中式 GUID，用"vault-relative path"做笔记名（参考
//! `src/services/index-builder.ts::toNoteName`）。CLI 一致：
//!
//! - `show <id>` 中 id = 文件相对 vault 的 POSIX 风格路径，**不含 .md 后缀**
//! - 大小写敏感
//!
//! ## 与 Tydora GUI 的一致性
//!
//! - 扫描跳过 `.` 开头的隐藏目录/文件（与 `vault-file-scanner.ts:58` 对齐，由
//!   `tydora_core::vault::scan_vault` 实现）
//! - frontmatter 解析对齐 `src/Editor/frontmatter.ts::parseFrontmatter`
//! - title 解析对齐 `LocalGraph.tsx` 顺序：frontmatter.title → 首 H1 → 文件 stem

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::{CliError, CliResult};
use crate::paths;
// 业务逻辑复用层（vault 扫描 / frontmatter / note id 解析）。
use tydora_core::{frontmatter, note, vault};

// ============================================================================
// 数据模型（CLI 私有，与 MCP 输出 schema 保持一致）
// ============================================================================

/// 顶层汇报单元：vault 概览。
#[derive(Debug, Serialize, Deserialize)]
pub struct VaultOverview {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub notebooks: Vec<NotebookInfo>,
}

/// 一个 notebook（= vault 下的一个一级目录）的汇总信息。
#[derive(Debug, Serialize, Deserialize)]
pub struct NotebookInfo {
    pub name: String,
    pub path: PathBuf,
    pub note_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NotebookList {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub notebook: String,
    pub notes: Vec<NoteInfo>,
}

/// 一条笔记的轻量元数据（用于 list / search）。
#[derive(Debug, Serialize, Deserialize)]
pub struct NoteInfo {
    /// 相对 vault 根的 POSIX 风格路径，不含 .md 后缀。如 "subfolder/note"
    pub id: String,
    /// 笔记标题（frontmatter.title → 首 H1 → 文件 stem）
    pub title: String,
    /// 完整磁盘路径
    pub path: PathBuf,
    /// 文件最后修改时间（UTC RFC3339）
    pub mtime: String,
    /// 字节数
    pub size: u64,
}

/// 笔记完整内容：frontmatter 块 + body + 元信息。
#[derive(Debug, Serialize, Deserialize)]
pub struct NoteShow {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub notebook: String,
    pub id: String,
    pub title: String,
    pub path: PathBuf,
    pub frontmatter_yaml: Option<String>,
    pub frontmatter: serde_json::Value,
    pub body: String,
    pub mtime: String,
    pub size: u64,
}

// ============================================================================
// 入口（Phase 1：notebooks / list / show）
// ============================================================================

/// 列出 vault 下所有 notebook（一级目录 + 根上散落的 .md）。
///
/// Tydora 的 vault 扫描器是纯递归的（见 vault-file-scanner.ts:43-77），
/// 没有"notebook"的边界概念。这里为了可读性，把 vault 的**一级目录**
/// 当作 notebook，把根上**未归目录**的 .md 归入一个名为 `"(root)"` 的虚拟
/// notebook，便于 CLI 用户感知"我没把它们放到任何分类"。
pub fn list_notebooks(explicit: Option<&Path>) -> CliResult<VaultOverview> {
    let vault = paths::resolve_vault(explicit)?;
    let scan = vault::scan_vault(&vault)?;

    let mut notebooks: Vec<NotebookInfo> = Vec::new();

    // 1. 根上散落的 .md
    let root_count = scan
        .md_files
        .iter()
        .filter(|p| p.parent() == Some(vault.as_path()))
        .count();
    if root_count > 0 {
        notebooks.push(NotebookInfo {
            name: "(root)".to_string(),
            path: vault.clone(),
            note_count: root_count,
        });
    }

    // 2. 一级子目录：聚合每个 top-level 子目录下的 md_files 数量
    let mut by_top_dir: BTreeMap<PathBuf, usize> = BTreeMap::new();
    for path in &scan.md_files {
        if path.parent() == Some(vault.as_path()) {
            continue;
        }
        if let Ok(rel) = path.strip_prefix(&vault) {
            if let Some(first) = rel.components().next() {
                let top = vault.join(first);
                *by_top_dir.entry(top).or_insert(0) += 1;
            }
        }
    }
    for (path, count) in by_top_dir {
        if count > 0 {
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            notebooks.push(NotebookInfo {
                name,
                path,
                note_count: count,
            });
        }
    }

    // 排序：根在最后（最具体）；其余按名字字典序
    notebooks.sort_by(|a, b| match (a.name.as_str(), b.name.as_str()) {
        ("(root)", _) => Ordering::Greater,
        (_, "(root)") => Ordering::Less,
        (x, y) => x.cmp(y),
    });

    Ok(VaultOverview {
        schema: "tydora.vault.v1",
        vault,
        notebooks,
    })
}

/// 列出某 notebook 下的笔记。
///
/// `notebook` 必须是 vault 下存在的一级目录名；`"root"` / `"(root)"` 表示根上散落的 .md（**不递归**，只看 vault 顶层）。
pub fn list_notes(notebook: &str, explicit: Option<&Path>) -> CliResult<NotebookList> {
    let vault = paths::resolve_vault(explicit)?;

    if notebook == "(root)" || notebook.eq_ignore_ascii_case("root") {
        // root：不递归，仅看 vault 顶层文件。这与历史 CLI 行为对齐；
        // tydora_core::vault::scan_vault 无差别递归，不适合此场景。
        return list_root_notes(&vault, notebook);
    }

    let candidate = vault.join(notebook);
    if !candidate.is_dir() {
        return Err(CliError::NotFound(format!(
            "notebook '{notebook}' not found under {}",
            vault.display()
        )));
    }
    // 普通 notebook：递归扫描 dir 子树
    let scan = vault::scan_vault(&candidate)?;
    let mut notes: Vec<NoteInfo> = Vec::new();
    for path in scan.md_files {
        notes.push(build_note_info(&path, &vault)?);
    }
    notes.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(NotebookList {
        schema: "tydora.notebook.v1",
        vault,
        notebook: notebook.to_string(),
        notes,
    })
}

/// `(root)` 笔记本：**仅**枚举 vault 顶层文件，不递归。
/// 仍复用 [`build_note_info`] 取 metadata + title。
fn list_root_notes(vault: &Path, notebook: &str) -> CliResult<NotebookList> {
    let mut notes: Vec<NoteInfo> = Vec::new();
    for entry in std::fs::read_dir(vault)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if !metadata.is_file() {
            continue;
        }
        let path = entry.path();
        // 复用 vault 模块的扩展名判断（与 vault-file-scanner.ts 行为一致）
        let name = entry.file_name();
        let ext = vault::lower_ext(&name.to_string_lossy());
        if !vault::is_markdown_ext(&ext) {
            continue;
        }
        notes.push(build_note_info(&path, vault)?);
    }
    notes.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(NotebookList {
        schema: "tydora.notebook.v1",
        vault: vault.to_path_buf(),
        notebook: notebook.to_string(),
        notes,
    })
}

fn build_note_info(path: &Path, vault: &Path) -> CliResult<NoteInfo> {
    let rel_id = note_id_from_path(path, vault);
    let title = note::read_note_title_from_file(path)?
        .unwrap_or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        });
    let meta = std::fs::metadata(path)?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| format_unix_seconds_as_rfc3339(d.as_secs() as i64))
        .unwrap_or_default();
    Ok(NoteInfo {
        id: rel_id,
        title,
        path: path.to_path_buf(),
        mtime,
        size: meta.len(),
    })
}

/// 读取单条笔记的完整内容。
///
/// `id` 格式与 [`list_notes`] 中 NoteInfo::id 一致：vault 相对 POSIX 路径，
/// 不含 `.md` 后缀。
pub fn show_note(id: &str, explicit: Option<&Path>) -> CliResult<NoteShow> {
    let vault = paths::resolve_vault(explicit)?;
    let path = note::resolve_note_path(id, &vault)?;

    let meta = std::fs::metadata(&path)?;
    let content = std::fs::read_to_string(&path)?;

    // frontmatter 解析走 tydora-core 的简化 YAML 子集
    let fm = frontmatter::split(&content);
    let frontmatter_json = fm.data.clone();
    let body = fm.body.clone();

    // title 提取（对齐 LocalGraph.tsx 顺序）：frontmatter.title → 首 H1 → file stem
    let title = frontmatter_json
        .as_object()
        .and_then(|o| o.get("title"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| extract_first_h1(&body))
        .unwrap_or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        });

    let notebook = path
        .strip_prefix(&vault)
        .ok()
        .and_then(|rel| rel.parent())
        .filter(|p| !p.as_os_str().is_empty())
        .and_then(|p| p.file_name())
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "(root)".into());

    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| format_unix_seconds_as_rfc3339(d.as_secs() as i64))
        .unwrap_or_default();

    Ok(NoteShow {
        schema: "tydora.note.v1",
        vault,
        notebook,
        id: id.to_string(),
        title,
        path,
        frontmatter_yaml: fm.raw,
        frontmatter: frontmatter_json,
        body,
        mtime,
        size: meta.len(),
    })
}

// ============================================================================
// time helpers（暂留在 store.rs；Phase 6+ 抽到 tydora_core::time）
// ============================================================================

/// 从 Unix 秒（i64）生成 RFC3339 UTC 字符串（精度到秒）。
///
/// 标准库无 chrono / time 依赖，自己实现 Gregorian 反推。
fn format_unix_seconds_as_rfc3339(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let secs_in_day = secs.rem_euclid(86_400);
    let hour = (secs_in_day / 3600) as u32;
    let minute = ((secs_in_day % 3600) / 60) as u32;
    let second = (secs_in_day % 60) as u32;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

/// Howard Hinnant 的 civil_from_days 算法（Gregorian）。
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i32 + (era as i32) * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// 当前 UTC RFC3339，秒级精度。
fn now_rfc3339() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    format_unix_seconds_as_rfc3339(secs)
}

// ============================================================================
// Phase 2：write-path 命令
// ============================================================================

/// `tydora create <notebook>` —— 从 stdin 读 body 新建一条笔记。
///
/// 流程：
/// 1. 解析 vault + notebook
/// 2. stdin 读 body
/// 3. title：frontmatter.title → 首 `# ...` H1 → `untitled-yyyymmdd`
/// 4. id（基本 slug）：先 `slugify(title)`，再加 `-2`/`-3`... 直到不冲突
/// 5. 写 frontmatter + body 到 `<notebook_dir>/<slug>.md`
///
/// 自动加的 frontmatter 字段：
/// - `title`（用户给的就用用户给的，否则从 H1 取，再否则 untitled）
/// - `created`（当前 UTC RFC3339）
/// - `tags: []`
///
/// 不自动覆盖或合并已有 frontmatter——一律以 **新建** frontmatter 起步。
pub fn cmd_create(notebook: &str, explicit: Option<&Path>, body: &BodySource) -> CliResult<Created> {
    let vault = paths::resolve_vault(explicit)?;
    let dir = note::resolve_notebook_dir(notebook, &vault)?;
    let raw_body = read_body(body)?;
    if raw_body.is_empty() {
        return Err(CliError::Usage(
            "create: stdin body is empty (provide at least a header)".into(),
        ));
    }

    // 拆 frontmatter / body（frontmatter.ts 对齐）
    let parsed = frontmatter::split(&raw_body);

    // 用我们已有的简化 parser 拿标量键值（保有"用户原始 YAML 字面"作为新建对象）
    let mut fm: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
    if let Some(y) = &parsed.raw {
        for line in y.lines() {
            if let Some((k, v)) = parse_simple_kv(line) {
                fm.insert(
                    k.to_string(),
                    v.trim()
                        .trim_matches(|c| c == '"' || c == '\'')
                        .to_string(),
                );
            }
        }
    }

    // title 优先级：frontmatter.title → 首 H1 → 兜底
    let title = fm
        .get("title")
        .cloned()
        .or_else(|| extract_first_h1(&parsed.body))
        .unwrap_or_else(|| {
            format!(
                "untitled-{}",
                now_rfc3339().get(..10).unwrap_or("unknown")
            )
        });

    // id 候选：slug + 后缀
    let base_slug = note::slugify_filename(&title);
    let base_slug = if base_slug.is_empty() {
        format!(
            "untitled-{}",
            now_rfc3339().get(..10).unwrap_or("note")
        )
    } else {
        base_slug
    };
    let mut id = base_slug.clone();
    for n in 2..u32::MAX {
        let candidate = dir.join(format!("{id}.md"));
        if !candidate.exists() {
            break;
        }
        id = format!("{base_slug}-{n}");
    }

    // 组装 frontmatter：保留用户传入的字段 + 注入 created + tags
    fm.entry("title".into()).or_insert(title.clone());
    fm.entry("created".into()).or_insert(now_rfc3339());
    if !fm.contains_key("tags") {
        fm.insert("tags".into(), "[]".into());
    }
    let yaml = fm
        .iter()
        .map(|(k, v)| format!("{k}: {v}"))
        .collect::<Vec<_>>()
        .join("\n");

    let final_body = format!("---\n{yaml}\n---\n\n{}", parsed.body);
    let final_path = dir.join(format!("{id}.md"));

    // 原子写：写临时文件 + rename（避免半截写入）
    let tmp_path = dir.join(format!(".{id}.md.tmp"));
    std::fs::write(&tmp_path, &final_body)?;
    std::fs::rename(&tmp_path, &final_path)?;

    let meta = std::fs::metadata(&final_path)?;
    let created_id = note_id_from_path(&final_path, &vault);
    Ok(Created {
        schema: "tydora.create.v1",
        vault,
        notebook: notebook.to_string(),
        // id 约定与 show/edit 一致：vault 相对 POSIX 路径，不含 .md 后缀
        // （修复：此前返回纯 slug，导致 create 的 id 不能直接喂给 show/edit）
        id: created_id,
        title,
        path: final_path,
        size: meta.len(),
    })
}

/// `tydora delete <id>` —— 把笔记移到 trash，原位不删（可恢复）。
///
/// trash 位置：`$TYDORA_HOME/trash/vaults/<vault-hash8>/<id>-<unix-ts>.md`
/// - vault-hash8 = stable hash of vault absolute path 前 8 位 hex
/// - 时间戳用 Unix 秒（秒级精度，足够区分同 id 短时间内多次删除）
///
/// 若 trash 目录不存在则 mkdir_p 创建。原子 rename。
pub fn cmd_delete(id: &str, explicit: Option<&Path>) -> CliResult<Deleted> {
    let vault = paths::resolve_vault(explicit)?;
    let path = note::resolve_note_path(id, &vault)?;
    let rel_id = note_id_from_path(&path, &vault);
    let rel_id_flat = rel_id.replace('/', "_").replace('\\', "_");

    let home = paths::tydora_home()?;
    let vault_key = vault
        .canonicalize()
        .unwrap_or_else(|_| vault.clone())
        .to_string_lossy()
        .into_owned();
    let vault_hash8 = {
        let h = format!("{:x}", simple_hash(&vault_key));
        h.get(..8).map(|s| s.to_string()).unwrap_or_else(|| h.clone())
    };
    let trash_dir = home.join("trash").join("vaults").join(vault_hash8);
    std::fs::create_dir_all(&trash_dir)?;
    let unix_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let trash_path = trash_dir.join(format!("{rel_id_flat}-{unix_ts}.md"));

    std::fs::rename(&path, &trash_path)?;

    Ok(Deleted {
        schema: "tydora.delete.v1",
        vault,
        id: id.to_string(),
        original_path: path,
        trash_path,
    })
}

/// `tydora edit <id> --old T [--new T|--new-stdin]` —— 精确字符串替换。
///
/// 限制：
/// - `--old` 在文件中**恰好 1 处**匹配，否则 `Usage` 错
/// - `--new` 与 `--new-stdin` 二选一必填
/// - `--dry-run` 不实际写文件
pub fn cmd_edit(
    id: &str,
    old: Option<&str>,
    new_inline: Option<&str>,
    new_from_stdin: bool,
    dry_run: bool,
    explicit: Option<&Path>,
    body: &BodySource,
) -> CliResult<Edited> {
    let vault = paths::resolve_vault(explicit)?;
    let path = note::resolve_note_path(id, &vault)?;

    // 参数校验
    let old = match old {
        Some(s) => s,
        None => return Err(CliError::Usage("edit: --old <TEXT> is required".into())),
    };
    let new = if let Some(s) = new_inline {
        if new_from_stdin {
            return Err(CliError::Usage(
                "edit: pass either --new or --new-stdin, not both".into(),
            ));
        }
        s.to_string()
    } else if new_from_stdin {
        read_body(body)?
    } else {
        return Err(CliError::Usage(
            "edit: pass either --new <TEXT> or --new-stdin".into(),
        ));
    };

    let content = std::fs::read_to_string(&path)?;

    // 唯一匹配
    let count = content.matches(old).count();
    if count == 0 {
        return Err(CliError::Usage(format!(
            "edit: --old not found in note '{id}'"
        )));
    }
    if count > 1 {
        return Err(CliError::Usage(format!(
            "edit: --old is not unique (matched {count} times in '{id}'); add more context"
        )));
    }

    let new_content = content.replacen(old, &new, 1);

    let bytes_before = content.len() as i64;
    let bytes_after = new_content.len() as i64;
    let bytes_delta = bytes_after - bytes_before;

    if !dry_run {
        let tmp = path.with_extension("md.tmp");
        std::fs::write(&tmp, &new_content)?;
        std::fs::rename(&tmp, &path)?;
    }

    let mtime_after = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| format_unix_seconds_as_rfc3339(d.as_secs() as i64))
        .unwrap_or_default();

    Ok(Edited {
        schema: "tydora.edit.v1",
        vault,
        id: id.to_string(),
        path,
        dry_run,
        bytes_delta,
        mtime_after,
        body_preview: if dry_run { Some(new_content) } else { None },
    })
}

/// `tydora write <id>` —— 从 stdin 覆盖整篇笔记。
///
/// 若 stdin 为空且非 dry-run 报错（避免误覆盖）。
pub fn cmd_write(id: &str, explicit: Option<&Path>, dry_run: bool, body: &BodySource) -> CliResult<Wrote> {
    let vault = paths::resolve_vault(explicit)?;
    let path = note::resolve_note_path(id, &vault)?;
    let new_body = read_body(body)?;
    if new_body.is_empty() && !dry_run {
        return Err(CliError::Usage(
            "write: stdin body is empty; refusing to overwrite".into(),
        ));
    }

    let bytes = new_body.as_bytes().len() as u64;

    if !dry_run {
        let tmp = path.with_extension("md.tmp");
        std::fs::write(&tmp, &new_body)?;
        std::fs::rename(&tmp, &path)?;
    }

    Ok(Wrote {
        schema: "tydora.write.v1",
        vault,
        id: id.to_string(),
        path,
        dry_run,
        size: bytes,
    })
}

// ============================================================================
// Phase 3：search（全文检索）
// ============================================================================

/// 单文件最多收集的匹配行数（防止大文件把 JSON/human 输出撑爆）。
pub const SEARCH_MAX_LINES_PER_FILE: usize = 20;
/// 超过该大小的文件直接跳过（二进制/超大笔记没有 grep 价值）。
const SEARCH_MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResults {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub query: String,
    /// None = 全 vault
    pub notebook: Option<String>,
    /// 匹配行总数（仅统计已扫描文件；limit 截断时不含未扫描部分）
    pub total_matches: usize,
    /// `--limit` 导致仍有未扫描文件时为 true
    pub truncated: bool,
    pub results: Vec<SearchHit>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub path: PathBuf,
    /// 该文件中命中查询的行数
    pub match_count: usize,
    /// 命中行样本（最多 [`SEARCH_MAX_LINES_PER_FILE`] 行）
    pub lines: Vec<SearchLine>,
    /// 命中行数超出 lines 容量时为 true
    pub lines_truncated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchLine {
    /// 1-based 行号
    pub line: u32,
    /// 行内容（去除行尾空白）
    pub text: String,
}

/// `tydora search <query> [--notebook N] [--limit N]` —— 大小写不敏感的全文检索。
///
/// 设计取向（对齐方案 §4.2 的保守范围）：
/// - 子串匹配（不做分词/正则/ripgrep 子进程），大小写不敏感
/// - 扫描范围：默认全 vault 递归；`--notebook <n>` 限定子树；
///   `--notebook (root)` 只看 vault 顶层（与 `list (root)` 语义一致）
/// - 非法 UTF-8 / 超大文件静默跳过（与 vault 扫描的"容错不炸"一致）
/// - `--limit` 限制返回的**文件数**（不是行数）
pub fn cmd_search(
    query: &str,
    notebook: Option<&str>,
    limit: Option<usize>,
    explicit: Option<&Path>,
) -> CliResult<SearchResults> {
    let query = query.trim();
    if query.is_empty() {
        return Err(CliError::Usage("search: <query> must not be empty".into()));
    }
    let vault = paths::resolve_vault(explicit)?;
    let needle = query.to_lowercase();

    // 扫描范围：notebook 子树 / vault 顶层 / 全 vault
    let (scan_root, root_only) = match notebook {
        Some(nb) if nb == "(root)" || nb.eq_ignore_ascii_case("root") => (vault.clone(), true),
        Some(nb) => {
            let dir = vault.join(nb);
            if !dir.is_dir() {
                return Err(CliError::NotFound(format!(
                    "notebook '{nb}' not found under {}",
                    vault.display()
                )));
            }
            (dir, false)
        }
        None => (vault.clone(), false),
    };

    let files: Vec<PathBuf> = if root_only {
        let mut v = Vec::new();
        for entry in std::fs::read_dir(&scan_root)? {
            let entry = entry?;
            if !entry.metadata()?.is_file() {
                continue;
            }
            let name = entry.file_name();
            let ext = vault::lower_ext(&name.to_string_lossy());
            if vault::is_markdown_ext(&ext) {
                v.push(entry.path());
            }
        }
        v
    } else {
        vault::scan_vault(&scan_root)?.md_files
    };

    let max_files = limit.unwrap_or(usize::MAX);
    let mut results: Vec<SearchHit> = Vec::new();
    let mut total_matches = 0usize;
    let mut truncated = false;

    for path in files {
        if results.len() >= max_files {
            truncated = true;
            break;
        }
        // 大文件 / 非 UTF-8：静默跳过（与 vault 扫描容错风格一致）
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        if meta.len() > SEARCH_MAX_FILE_BYTES {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };

        let lower = content.to_lowercase();
        if !lower.contains(&needle) {
            continue;
        }

        let mut lines: Vec<SearchLine> = Vec::new();
        let mut count = 0usize;
        for (i, text) in content.lines().enumerate() {
            if text.to_lowercase().contains(&needle) {
                count += 1;
                if lines.len() < SEARCH_MAX_LINES_PER_FILE {
                    lines.push(SearchLine {
                        line: (i + 1) as u32,
                        text: text.trim_end().to_string(),
                    });
                }
            }
        }
        total_matches += count;

        // title/id 复用 build_note_info，与 list/show 保持同一解析口径
        let info = build_note_info(&path, &vault)?;
        results.push(SearchHit {
            id: info.id,
            title: info.title,
            path,
            match_count: count,
            lines_truncated: count > lines.len(),
            lines,
        });
    }

    results.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(SearchResults {
        schema: "tydora.search.v1",
        vault,
        query: query.to_string(),
        notebook: notebook.map(str::to_string),
        total_matches,
        truncated,
        results,
    })
}

// ============================================================================
// 杂项 helpers
// ============================================================================

/// body 文本的来源（CLI = 真实 stdin；MCP = tools/call 的 `stdin` 字段）。
///
/// 这是 CLI 与 MCP 的唯一语义分叉：MCP 的 stdin 被协议流占用，
/// body 改从 `tools/call` 参数注入（docs/mcp-implementation-plan.md §4.2）。
#[derive(Debug, Clone)]
pub enum BodySource {
    RealStdin,
    Buffer(String),
}

/// 从 body 来源读取文本，剥 UTF-8 BOM，限制 32 MB。
pub(crate) fn read_body(src: &BodySource) -> CliResult<String> {
    match src {
        BodySource::RealStdin => read_stdin_body(),
        BodySource::Buffer(s) => {
            const MAX_BYTES: usize = 32 * 1024 * 1024;
            if s.len() > MAX_BYTES {
                return Err(CliError::Usage(
                    "body exceeds 32 MB limit".into(),
                ));
            }
            // 与 read_stdin_body 对齐：剥 BOM
            let s = s.strip_prefix('\u{FEFF}').unwrap_or(s);
            Ok(s.to_string())
        }
    }
}

/// 从 stdin 读 body，剥 UTF-8 BOM，限制 32 MB 防止意外吞内存。
pub(crate) fn read_stdin_body() -> CliResult<String> {
    use std::io::Read;
    const MAX_BYTES: usize = 32 * 1024 * 1024;
    let mut buf = Vec::new();
    let stdin = std::io::stdin().lock();
    stdin.take(MAX_BYTES as u64).read_to_end(&mut buf)?;
    // 剥 UTF-8 BOM
    if buf.starts_with(&[0xEF, 0xBB, 0xBF]) {
        buf.drain(..3);
    }
    String::from_utf8(buf).map_err(|e| {
        CliError::Other(format!("stdin is not valid UTF-8: {e}"))
    })
}

/// 取 body 中首个 H1 行（`# ...`）的标题文本。  
/// 与 GUI 端 LocalGraph.tsx 行为一致。
fn extract_first_h1(body: &str) -> Option<String> {
    body.lines()
        .find(|l| l.trim_start().starts_with("# "))
        .map(|l| l.trim_start().trim_start_matches("# ").trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 从绝对路径派生 note id（vault 相对 POSIX 路径，不含 .md 后缀）。
///
/// 与 `note::resolve_note_path` 反向：原方法从 id 找 path，本方法从 path 找 id。
/// 路径不存在（如 `(root)` notebook 没归目录）时返回 `path.file_stem()`。
fn note_id_from_path(path: &Path, vault: &Path) -> String {
    path.strip_prefix(vault)
        .ok()
        .map(|p| {
            let mut s = p.to_string_lossy().replace('\\', "/");
            for ext in [".md", ".markdown", ".mdx"] {
                if let Some(stripped) = s.strip_suffix(ext) {
                    s = stripped.to_string();
                    break;
                }
            }
            s
        })
        .unwrap_or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        })
}

/// 简化版 `parse_simple_kv`，cmd_create 在解析用户原 YAML 字面时复用。  
/// 实际"对外"的解析走 `tydora_core::frontmatter::split`，那里有完整单测。
fn parse_simple_kv(line: &str) -> Option<(&str, &str)> {
    let line = line.trim_end();
    let colon = line.find(':')?;
    let key = &line[..colon];
    if key.is_empty() {
        return None;
    }
    let mut chars = key.chars();
    let first = chars.next()?;
    if !(first.is_ascii_alphanumeric() || first == '_') {
        return None;
    }
    for c in chars {
        if !(c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            return None;
        }
    }
    let rest = line[colon + 1..].trim_start();
    if rest.is_empty() {
        return None;
    }
    Some((key, rest))
}

/// 极简字符串 hash（不加密、不安全）。用于 trash 路径的 vault 区分。
/// FNV-1a 64-bit，简单够用。
fn simple_hash(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

// ============================================================================
// Phase 2：write-path 命令结果数据 model（与 emit_* 函数协作）
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct Created {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub notebook: String,
    pub id: String,
    pub title: String,
    pub path: PathBuf,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Deleted {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub id: String,
    pub original_path: PathBuf,
    pub trash_path: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Edited {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub id: String,
    pub path: PathBuf,
    pub dry_run: bool,
    pub bytes_delta: i64,
    pub mtime_after: String,
    /// 仅 dry-run=true 时设置
    pub body_preview: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Wrote {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub id: String,
    pub path: PathBuf,
    pub dry_run: bool,
    pub size: u64,
}
