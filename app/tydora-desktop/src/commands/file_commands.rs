use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryWithMeta {
    pub name: String,
    pub is_directory: bool,
    pub is_file: bool,
    pub mtime: Option<f64>,
    pub ctime: Option<f64>,
}

#[tauri::command]
pub fn list_dir_with_meta(dir_path: String) -> Result<Vec<DirEntryWithMeta>, String> {
    let path = std::path::Path::new(&dir_path);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let metadata = std::fs::metadata(entry.path()).ok();
        let mtime = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as f64);
        let ctime = metadata
            .as_ref()
            .and_then(|m| m.created().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as f64);
        entries.push(DirEntryWithMeta {
            name: entry.file_name().to_string_lossy().to_string(),
            is_directory: file_type.is_dir(),
            is_file: file_type.is_file(),
            mtime,
            ctime,
        });
    }
    Ok(entries)
}
