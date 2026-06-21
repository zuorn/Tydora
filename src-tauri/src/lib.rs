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
    .center()
    .decorations(false)
    .resizable(true)
    .build();

    match settings_window {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
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
