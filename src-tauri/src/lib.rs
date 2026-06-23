use std::process::Command;
use tauri::{Manager, WebviewWindowBuilder};

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

/// 打开设置窗口
#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    let settings_window = WebviewWindowBuilder::new(
        &app,
        "settings",
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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_default_content,
            get_app_version,
            open_settings_window,
            open_file_in_new_window,
            open_file_location,
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
