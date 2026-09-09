//! Vault 扫描。
//!
//! 与 `src/services/vault-file-scanner.ts` 语义对齐：
//!
//! 1. 跳过 `.` 开头的目录与文件（隐藏目录 `.git` `.obsidian` `.trash` 等）
//! 2. 单子目录 IO 错误 **swallow**，不影响整体扫描
//! 3. 三档分类：`md_files` / `canvas_files` / `image_files`
//! 4. `IMAGE_EXTENSIONS` 常量与 TS 端 16 个扩展名列表逐字一致
//!
//! CLI 在做 `notebooks` / `list <notebook>` 时调用此模块产出的
//! `VaultScan`，构造自己的 `VaultOverview` / `NotebookList` 数据模型。

/// Image extensions recognized as inline image embeds (`![[xxx.png]]`)。
///
/// 与 `src/services/vault-file-scanner.ts:12-15` **逐字对齐**，改动时
/// 同步两处，避免"两处列表漂移"（TS 注释明确警告）。
pub const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico", "heic", "heif", "tif",
    "tiff", "apng", "jfif", "pjpeg", "jxl",
];

/// Markdown 扩展名白名单（对齐 vault-file-scanner.ts 的 `ext === "md"`）。  
/// 注意 CLI 此前接受 `md`/`markdown`/`mdx` 三种，tydora-core 严格只收 `md`；  
/// CLI 仍可在调用层做"宽松扩展"以保持后向兼容。
pub fn is_markdown_ext(ext: &str) -> bool {
    ext.eq_ignore_ascii_case("md")
}

pub fn is_canvas_ext(ext: &str) -> bool {
    ext.eq_ignore_ascii_case("canvas")
}

pub fn is_image_ext(ext: &str) -> bool {
    let lower = ext.to_ascii_lowercase();
    IMAGE_EXTENSIONS.iter().any(|e| *e == lower.as_str())
}

/// 取文件名扩展（小写，无点）。空字符串代表无扩展。  
/// 与 TS `lowerExt(name)` 行为一致。
pub fn lower_ext(name: &str) -> String {
    match name.rfind('.') {
        Some(dot) if dot + 1 < name.len() => name[dot + 1..].to_lowercase(),
        _ => String::new(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageFileRef {
    pub path: std::path::PathBuf,
    pub name: String,
}

#[derive(Debug, Default, Clone)]
pub struct VaultScan {
    pub md_files: Vec<std::path::PathBuf>,
    pub canvas_files: Vec<std::path::PathBuf>,
    pub image_files: Vec<ImageFileRef>,
    pub all_files: Vec<std::path::PathBuf>,
}

/// 递归扫描 vault 根目录。  
/// **单子目录 IO 错误 swallow**，与 vault-file-scanner.ts 行为一致。
pub fn scan_vault(vault: &std::path::Path) -> crate::CoreResult<VaultScan> {
    if !vault.is_dir() {
        return Err(crate::error::CoreError::not_found(format!(
            "vault root is not a directory: {}",
            vault.display()
        )));
    }
    let mut out = VaultScan::default();
    walk(vault, &mut out)?;
    Ok(out)
}

fn walk(dir: &std::path::Path, out: &mut VaultScan) -> crate::CoreResult<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(it) => it,
        // 单目录错误 swallow（对齐 TS），但 vault 根找不到不算
        Err(_) if dir.is_dir() => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // 单 entry 错误 swallow
        };
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            walk(&path, out)?;
        } else if metadata.is_file() {
            out.all_files.push(path.clone());
            let ext = lower_ext(&name_str);
            if is_markdown_ext(&ext) {
                out.md_files.push(path);
            } else if is_canvas_ext(&ext) {
                out.canvas_files.push(path);
            } else if is_image_ext(&ext) {
                out.image_files.push(ImageFileRef {
                    path,
                    name: name_str.into_owned(),
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn lower_ext_handles_no_ext_and_dot_files() {
        assert_eq!(lower_ext("foo.md"), "md");
        assert_eq!(lower_ext("FOO.MD"), "md");
        assert_eq!(lower_ext("foo.tar.gz"), "gz");
        // 对齐 TS vault-file-scanner.ts 的 lowerExt：`.hidden` 在 caller 已被
        // `starts_with(".")` 过滤；lower_ext 单独跑时返回 `"hidden"`。
        assert_eq!(lower_ext(".hidden"), "hidden");
        assert_eq!(lower_ext("foo"), "");
    }

    #[test]
    fn image_extensions_align_with_ts() {
        // 抽一组 TS 列表里较特殊的，确认包含
        assert!(is_image_ext("png"));
        assert!(is_image_ext("PNG"));
        assert!(is_image_ext("jxl"));
        assert!(!is_image_ext("exe"));
        assert!(!is_image_ext(""));
    }

    #[test]
    fn scan_vault_skips_hidden_dirs_and_classifies() {
        let dir = tempdir().unwrap();
        // notes/daily.md
        fs::create_dir(dir.path().join("notes")).unwrap();
        fs::write(dir.path().join("notes").join("daily.md"), "# daily\n").unwrap();
        // .obsidian/dummy.md（应跳过）
        fs::create_dir(dir.path().join(".obsidian")).unwrap();
        fs::write(dir.path().join(".obsidian").join("dummy.md"), "x").unwrap();
        // image.png
        fs::write(dir.path().join("hero.png"), [0u8; 4]).unwrap();
        // canvas file
        fs::write(dir.path().join("board.canvas"), "{}").unwrap();

        let scan = scan_vault(dir.path()).unwrap();
        let names: Vec<String> = scan
            .md_files
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["daily.md".to_string()]);

        let images: Vec<String> = scan
            .image_files
            .iter()
            .map(|im| im.name.clone())
            .collect();
        assert!(images.iter().any(|n| n == "hero.png"));

        assert!(scan.canvas_files.iter().any(|p| p.ends_with("board.canvas")));
        assert_eq!(scan.all_files.len(), 3); // daily.md, hero.png, board.canvas
    }

    #[test]
    fn scan_vault_root_missing_returns_not_found() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("nope");
        let err = scan_vault(&missing).unwrap_err();
        assert!(matches!(err, crate::CoreError::NotFound(_)));
    }
}
