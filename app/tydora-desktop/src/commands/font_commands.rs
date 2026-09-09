use fontdb::Database;
use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontInfo {
    /// CSS font-family 可用的族名
    pub family: String,
    /// 是否为等宽字体（用于代码字体优先展示）
    pub monospaced: bool,
}

/// 列出本机已安装字体（按族名去重、排序）。
#[tauri::command]
pub fn list_system_fonts() -> Vec<SystemFontInfo> {
    let mut db = Database::new();
    db.load_system_fonts();

    let mut seen: HashSet<String> = HashSet::new();
    let mut fonts: Vec<SystemFontInfo> = Vec::new();

    for face in db.faces() {
        let Some((name, _)) = face.families.first() else {
            continue;
        };
        if name.is_empty() || name.starts_with('.') {
            continue;
        }
        // 同一族名只保留一条；若任一 face 为 monospaced，标记为等宽
        if !seen.insert(name.clone()) {
            if face.monospaced {
                if let Some(existing) = fonts.iter_mut().find(|f| f.family == *name) {
                    existing.monospaced = true;
                }
            }
            continue;
        }
        fonts.push(SystemFontInfo {
            family: name.clone(),
            monospaced: face.monospaced,
        });
    }

    fonts.sort_by(|a, b| {
        a.family
            .to_lowercase()
            .cmp(&b.family.to_lowercase())
    });
    fonts
}
