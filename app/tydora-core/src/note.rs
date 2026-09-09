//! Note id / title / slug 解析与文件级 IO helpers。
//!
//! 设计：所有"看着像 note id 的字符串 → 真实文件路径"的转换都集中在这里。
//! 调用方（CLI 的 `show_note` / `cmd_edit` / `cmd_write` / `cmd_delete`）一律
//! 通过 [`resolve_note_path`]，保证：
//!
//! 1. Path traversal 一律 `Usage` 错（空、`..`、`/`/`\` 开头）
//! 2. 缺扩展名时按优先级尝试 `.md` / `.markdown` / `.mdx`
//! 3. 0 命中返回 `NotFound`
//!
//! Title 提取 [`read_note_title_from_file`] 只读文件前 4096 字节避免大文件 IO，
//! 顺序 `frontmatter.title → 首 H1`，与 GUI 端 `LocalGraph.tsx` 行为对齐。

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::error::{CoreError, CoreResult};
use crate::frontmatter;

/// 把 note id 解析为 vault 内的真实文件路径。
///
/// - `id` 形如 `inbox/welcome`，**不含扩展名**或**含扩展名**两种都接受
/// - 拒绝 `..`、`/`、`\` 开头、空字符串（→ `Usage`）
/// - 缺扩展名依次试 `.md` / `.markdown` / `.mdx`
/// - 全部不存在 → `NotFound`
pub fn resolve_note_path(id: &str, vault: &Path) -> CoreResult<PathBuf> {
    if id.is_empty() || id.contains("..") || id.starts_with('/') || id.starts_with('\\') {
        return Err(CoreError::usage(format!("invalid note id: {id:?}")));
    }
    let raw = id.replace('\\', "/");
    let raw_pb = PathBuf::from(&raw);
    let candidates: Vec<PathBuf> = if raw_pb.extension().is_some() {
        vec![vault.join(&raw)]
    } else {
        vec![
            vault.join(format!("{raw}.md")),
            vault.join(format!("{raw}.markdown")),
            vault.join(format!("{raw}.mdx")),
        ]
    };
    let mut last_tried: Option<PathBuf> = None;
    for c in &candidates {
        last_tried = Some(c.clone());
        if c.is_file() {
            return Ok(c.clone());
        }
    }
    Err(CoreError::not_found(format!(
        "note '{id}' not found (tried: {})",
        last_tried
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<none>".into())
    )))
}

/// 把 notebook 名解析为 vault 内的目录路径。  
///
/// - `(root)` 特殊值 → vault 本身（散落在根目录的 .md 也算"笔记本"）
/// - 非空、拒绝 `..`、`/`、`\` 开头
/// - 目录不存在 → `NotFound`
pub fn resolve_notebook_dir(notebook: &str, vault: &Path) -> CoreResult<PathBuf> {
    if notebook.is_empty()
        || notebook.contains("..")
        || notebook.starts_with('/')
        || notebook.starts_with('\\')
    {
        return Err(CoreError::usage(format!(
            "invalid notebook name: {notebook:?}"
        )));
    }
    if notebook == "(root)" {
        return Ok(vault.to_path_buf());
    }
    let p = vault.join(notebook.replace('\\', "/"));
    if p.is_dir() {
        Ok(p)
    } else {
        Err(CoreError::not_found(format!(
            "notebook '{notebook}' not found at {}",
            p.display()
        )))
    }
}

/// 把任意字符串规整成"文件名安全的 slug"。
///
/// - ASCII alphanumeric / `_` / `-` 保留
/// - 其余字符转 `-`，连续 `-` 合并为单个
/// - 首尾的 `-` / `.` 自动 strip（避免 `..` / `-` 这种无效名）
pub fn slugify_filename(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut prev_dash = false;
    for c in input.chars() {
        let keep = if c.is_alphanumeric() {
            c
        } else if c == '-' || c == '_' {
            c
        } else {
            '-'
        };
        if keep == '-' {
            if !prev_dash && !out.is_empty() {
                out.push('-');
            }
            prev_dash = true;
        } else {
            out.push(keep);
            prev_dash = false;
        }
    }
    while matches!(out.chars().last(), Some('-') | Some('.')) {
        out.pop();
    }
    out
}

/// 从磁盘读取 note 的 title。  
/// 只读前 4096 字节以避免对大文件做无谓 IO；处理顺序：
/// `frontmatter.title → 首 H1 → None`。
///
/// IO 错误（无权限 / 不存在）以 `Err(Io)` 上抛；
/// UTF-8 不合法 → `Err(Parse)`；
/// 全部 fallback 都无 → `Ok(None)`。
pub fn read_note_title_from_file(path: &Path) -> CoreResult<Option<String>> {
    let mut file = fs::File::open(path)?;
    let mut buf = [0u8; 4096];
    let n = file.read(&mut buf)?;
    let head = std::str::from_utf8(&buf[..n])
        .map_err(|e| CoreError::parse(format!("note head is not UTF-8: {e}")))?;
    let fm = frontmatter::split(head);
    Ok(fm.extract_title())
}

/// 从磁盘读取整篇 note 的 frontmatter 与 body。
///
/// 不限制大小（与 [`read_note_title_from_file`] 行为不同）。
pub fn read_note(path: &Path) -> CoreResult<frontmatter::Frontmatter> {
    let raw = fs::read_to_string(path)?;
    Ok(frontmatter::split(&raw))
}

/// 原子写：写 `<path>.tmp` 再 rename。失败时旧文件保持原状。
///
/// 用于 [`crate::vault`] 系列将来支持 edit 时复用；当前 CLI 自己实现。
pub fn atomic_write(path: &Path, content: &str) -> CoreResult<()> {
    let tmp = path.with_extension({
        // 给 .md → .md.tmp
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        match ext.is_empty() {
            true => "tmp".into(),
            false => format!("{ext}.tmp"),
        }
    });
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn slugify_handles_spaces_and_collapses_dashes() {
        assert_eq!(slugify_filename("Hello World"), "Hello-World");
        assert_eq!(slugify_filename("a--b---c"), "a-b-c");
        assert_eq!(slugify_filename("中文 title"), "中文-title");
        assert_eq!(slugify_filename("  leading"), "leading");
        assert_eq!(slugify_filename("trailing  "), "trailing");
        assert_eq!(slugify_filename("file.name."), "file-name");
        assert_eq!(slugify_filename("safe_name-1"), "safe_name-1");
    }

    #[test]
    fn resolve_note_path_tries_md_markdown_mdx() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        fs::write(dir.path().join("b.markdown"), "x").unwrap();
        fs::write(dir.path().join("c.mdx"), "x").unwrap();

        assert!(resolve_note_path("a", dir.path()).unwrap().ends_with("a.md"));
        assert!(resolve_note_path("b", dir.path()).unwrap().ends_with("b.markdown"));
        assert!(resolve_note_path("c", dir.path()).unwrap().ends_with("c.mdx"));
        assert!(matches!(
            resolve_note_path("nope", dir.path()),
            Err(CoreError::NotFound(_))
        ));
    }

    #[test]
    fn resolve_note_path_rejects_path_traversal() {
        let dir = tempdir().unwrap();
        for bad in [
            "",
            "../escape",
            "/abs/path",
            "\\abs\\path",
            "good/../../escape",
        ] {
            let r = resolve_note_path(bad, dir.path());
            assert!(matches!(r, Err(CoreError::Usage(_))), "id {bad:?} should be Usage");
        }
    }

    #[test]
    fn resolve_note_path_with_explicit_extension() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();
        fs::write(dir.path().join("subdir").join("explicit.md"), "x").unwrap();
        let p = resolve_note_path("subdir/explicit.md", dir.path()).unwrap();
        assert!(p.ends_with("subdir/explicit.md"));
    }

    #[test]
    fn resolve_notebook_dir_handles_root_and_traversal() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("inbox")).unwrap();

        // (root) → vault 本身
        assert_eq!(
            resolve_notebook_dir("(root)", dir.path()).unwrap(),
            dir.path()
        );
        // 普通 notebook
        assert!(resolve_notebook_dir("inbox", dir.path()).unwrap().ends_with("inbox"));
        // not found
        assert!(matches!(
            resolve_notebook_dir("nope", dir.path()),
            Err(CoreError::NotFound(_))
        ));
        // path traversal
        for bad in ["../escape", "/abs", "\\abs", "good/../bad"] {
            assert!(
                matches!(
                    resolve_notebook_dir(bad, dir.path()),
                    Err(CoreError::Usage(_))
                ),
                "notebook {bad:?} should be Usage"
            );
        }
    }

    #[test]
    fn read_note_title_from_file_falls_back_to_h1() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a.md");
        fs::write(&p, "---\n---\n\n# Heading\n\nbody").unwrap();
        assert_eq!(read_note_title_from_file(&p).unwrap(), Some("Heading".into()));
    }

    #[test]
    fn read_note_title_from_file_returns_none_when_no_title() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a.md");
        fs::write(&p, "no frontmatter, no h1").unwrap();
        assert_eq!(read_note_title_from_file(&p).unwrap(), None);
    }

    #[test]
    fn read_note_title_from_file_truncates_to_4k() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a.md");
        let mut content = String::from("---\ntitle: At Top\n---\n\n# Lost Heading\n");
        content.push_str(&"x".repeat(8192));
        fs::write(&p, &content).unwrap();
        // title 在前 4096 字节内，应被读到
        assert_eq!(
            read_note_title_from_file(&p).unwrap(),
            Some("At Top".into())
        );
    }

    #[test]
    fn atomic_write_replaces_target() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("file.md");
        fs::write(&p, "old").unwrap();
        atomic_write(&p, "new").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "new");
    }
}
