use std::process::Command;
use tauri::{Manager, WebviewWindowBuilder};
use serde::Serialize;

/// URL 百分号解码，将 %XX 转换为对应字节，最终返回解码后的字符串
fn percent_decode(s: &str) -> String {
    let mut bytes = Vec::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                bytes.push(byte);
            } else {
                bytes.push(b'%');
                bytes.extend_from_slice(hex.as_bytes());
            }
        } else {
            let mut buf = [0u8; 4];
            bytes.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// 返回 Markdown 文件的默认内容
#[tauri::command]
fn get_default_content() -> String {
    String::new()
}

/// 获取应用版本号
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 主题信息
#[derive(Serialize)]
struct ThemeInfo {
    name: String,
    file_path: String,
}

/// 获取默认主题目录路径（%LOCALAPPDATA%/Tydora/themes）
#[tauri::command]
fn get_default_theme_dir(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map(|p| p.join("themes"))
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).ok();
    Ok(path.to_string_lossy().to_string())
}

/// 读取主题目录中的所有 CSS 文件（主题列表）
#[tauri::command]
fn list_themes(theme_dir: String) -> Result<Vec<ThemeInfo>, String> {
    let dir = std::path::Path::new(&theme_dir);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut themes = vec![];
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) == Some("css") {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();
            themes.push(ThemeInfo {
                name,
                file_path: path.to_string_lossy().to_string(),
            });
        }
    }
    Ok(themes)
}

/// 打开设置窗口
#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    let label = "settings";

    // Check if settings window already exists, if so just focus it
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let settings_window = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("index.html?window=settings".into()),
    )
    .title("设置")
    .inner_size(800.0, 600.0)
    .min_inner_size(600.0, 400.0)
    .visible(false)
    .decorations(false)
    .resizable(true)
    .build();

    match settings_window {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 在新窗口中打开文件
#[tauri::command]
async fn open_file_in_new_window(
    app: tauri::AppHandle,
    file_path: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    let encoded_path = file_path.replace('\\', "/");
    let file_name = file_path
        .split('\\')
        .last()
        .or_else(|| file_path.split('/').last())
        .unwrap_or("untitled");

    let label = format!(
        "editor-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let url = format!("index.html?window=editor&file={}", encoded_path);
    let title = format!("{} - Tydora", file_name);

    let window = WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title(&title)
    .inner_size(width.unwrap_or(1200.0), height.unwrap_or(800.0))
    .min_inner_size(600.0, 400.0)
    .center()
    .decorations(false)
    .resizable(true)
    .build();

    match window {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 打开思维导图窗口
#[tauri::command]
async fn open_mindmap_window(
    app: tauri::AppHandle,
) -> Result<(), String> {
    let label = "mindmap";

    // Check if mindmap window already exists, if so just focus it
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url = "index.html?window=mindmap";

    let window = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title("思维导图 - Tydora")
    .inner_size(900.0, 600.0)
    .min_inner_size(400.0, 300.0)
    .decorations(false)
    .resizable(true)
    .build();

    match window {
        Ok(_win) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 在系统文件管理器中打开文件位置并选中文件
#[tauri::command]
fn open_file_location(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .args(["/select,", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let dir = std::path::Path::new(&file_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| file_path.clone());
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 在系统文件管理器中打开目录
#[tauri::command]
fn open_directory(dir_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&dir_path);
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(&dir_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&dir_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 将源目录中的所有主题 CSS 文件拷贝到目标目录
#[tauri::command]
fn copy_themes(from_dir: String, to_dir: String) -> Result<u32, String> {
    let src = std::path::Path::new(&from_dir);
    let dst = std::path::Path::new(&to_dir);

    if !src.exists() {
        return Ok(0);
    }

    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;

    let mut count = 0u32;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) == Some("css") {
            let file_name = path.file_name().ok_or("invalid file name")?;
            let dest_path = dst.join(file_name);
            std::fs::copy(&path, &dest_path).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    Ok(count)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .register_uri_scheme_protocol("local-file", |_ctx, request| {
            // request.uri().path() 返回类似 "/D%3A%2Fpath%2Fto%2Ffile.png" 的路径
            // 跳过开头的 "/" 并进行百分号解码
            let encoded_path = &request.uri().path()[1..];
            let path = percent_decode(encoded_path);
            if let Ok(data) = std::fs::read(&path) {
                tauri::http::Response::builder()
                    .status(200)
                    .body(data)
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_default_content,
            get_app_version,
            get_default_theme_dir,
            list_themes,
            open_settings_window,
            open_file_in_new_window,
            open_file_location,
            open_directory,
            copy_themes,
            open_mindmap_window,
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
