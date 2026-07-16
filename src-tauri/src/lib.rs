use std::fs;
use std::process::Command;
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewWindowBuilder, State};

mod commands;
use commands::watcher_commands::{watch_vault, unwatch_vault, WatcherState};
use commands::remote_image::{fetch_remote_image, HttpClientState};
use commands::proxy::start_proxy_server;

struct PreviewServer(Mutex<Option<std::process::Child>>);

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

/// URL 百分号编码，将路径中的特殊字符编码为 %XX 格式，
/// 确保路径可以安全地出现在 URL 查询字符串中
fn percent_encode_path(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            // 保留字母、数字、安全符号和路径分隔符
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~'
            | b'/' | b'\\' | b':' => {
                result.push(byte as char);
            }
            // 空格编码为 %20
            b' ' => {
                result.push_str("%20");
            }
            // 其他字符统一百分号编码
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

/// 返回 Markdown 文件的默认内容
#[tauri::command]
fn get_default_content() -> String {
    String::new()
}

/// 获取应用版本号（从 tauri.conf.json 读取，单一版本源）
#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
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

    // 对文件路径进行 URL 编码，确保特殊字符（#、&、空格、中文等）不会破坏查询字符串
    // 先将反斜杠转为正斜杠，使其在 URL 中更规范
    let safe_path = file_path.replace('\\', "/");
    let encoded_path = percent_encode_path(&safe_path);
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
        Ok(_) => {
            let app_handle = app.clone();
            let fp = file_path.clone();
            let lbl = label.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let _ = app_handle.emit_to(&lbl, "open-file", &fp);
            });
            Ok(())
        }
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
    .visible(false)
    .decorations(false)
    .resizable(true)
    .build();

    match window {
        Ok(_win) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 打开关系图谱窗口
#[tauri::command]
async fn open_graph_window(
    app: tauri::AppHandle,
) -> Result<(), String> {
    let label = "graph";

    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url = "index.html?window=graph";

    let window = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title("关系图谱 - Tydora")
    .inner_size(1000.0, 700.0)
    .min_inner_size(500.0, 400.0)
    .visible(false)
    .decorations(false)
    .resizable(true)
    .build();

    match window {
        Ok(_win) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 打开白板窗口
#[tauri::command]
async fn open_canvas_window(
    app: tauri::AppHandle,
    canvas_path: Option<String>,
) -> Result<(), String> {
    let label = "canvas";

    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let mut url = "index.html?window=canvas".to_string();
    if let Some(path) = &canvas_path {
        let safe_path = path.replace('\\', "/");
        let encoded_path = percent_encode_path(&safe_path);
        url = format!("{}&file={}", url, encoded_path);
    }

    let window = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title("白板 - Tydora")
    .inner_size(1200.0, 800.0)
    .min_inner_size(500.0, 400.0)
    .visible(false)
    .decorations(false)
    .resizable(true)
    .build();

    match window {
        Ok(_win) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 在新窗口中打开白板（非单例，可同时打开多个）
#[tauri::command]
async fn open_canvas_in_new_window(
    app: tauri::AppHandle,
    canvas_path: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    let file_name = canvas_path
        .split('\\')
        .last()
        .or_else(|| canvas_path.split('/').last())
        .unwrap_or("untitled");

    let label = format!(
        "canvas-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let safe_path = canvas_path.replace('\\', "/");
    let encoded_path = percent_encode_path(&safe_path);
    let url = format!("index.html?window=canvas&file={}", encoded_path);
    let title = format!("{} - Tydora", file_name);

    let window = WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title(&title)
    .inner_size(width.unwrap_or(1200.0), height.unwrap_or(800.0))
    .min_inner_size(500.0, 400.0)
    .center()
    .decorations(false)
    .resizable(true)
    .build();

    match window {
        Ok(_) => {
            let app_handle = app.clone();
            let cp = canvas_path.clone();
            let lbl = label.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let _ = app_handle.emit_to(&lbl, "canvas-file-open", &cp);
            });
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// 打开管理仓库窗口
#[tauri::command]
async fn open_vault_manager_window(app: tauri::AppHandle) -> Result<(), String> {
    let label = "vault-manager";

    // 如果窗口已存在，直接聚焦
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("index.html?window=vault-manager".into()),
    )
    .title("管理仓库")
    .inner_size(950.0, 700.0)
    .min_inner_size(700.0, 500.0)
    .center()
    .visible(false)
    .decorations(false)
    .resizable(true)
    .build();

    match window {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 关闭所有编辑器窗口（保留主窗口）
#[tauri::command]
async fn close_all_editor_windows(app: tauri::AppHandle) -> Result<(), String> {
    let windows = app.webview_windows();
    for (label, window) in windows {
        // 保留主窗口、设置窗口、管理仓库窗口
        if label == "main" || label == "settings" || label == "vault-manager" {
            continue;
        }
        let _ = window.close();
    }
    Ok(())
}

/// 在新窗口中打开仓库
#[tauri::command]
async fn open_vault_in_new_window(app: tauri::AppHandle, vault_path: String) -> Result<(), String> {
    // 先关闭所有编辑器窗口
    let windows = app.webview_windows();
    for (label, window) in windows {
        if label == "main" || label == "settings" || label == "vault-manager" {
            continue;
        }
        let _ = window.close();
    }

    // 获取仓库名称
    let vault_name = std::path::Path::new(&vault_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "untitled".to_string());

    let label = format!(
        "editor-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let safe_path = vault_path.replace('\\', "/");
    let encoded_path = percent_encode_path(&safe_path);
    let url = format!("index.html?window=editor&vault={}", encoded_path);
    let title = format!("{} - Tydora", vault_name);

    let window = WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title(&title)
    .inner_size(1200.0, 800.0)
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

/// 递归复制目录
fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {}", e))?;
    for entry in fs::read_dir(src).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    Ok(())
}

/// 移动仓库 - 将源目录内容复制到目标目录
#[tauri::command]
async fn move_vault(source: String, destination: String) -> Result<(), String> {
    let src = std::path::Path::new(&source);
    let dst = std::path::Path::new(&destination);

    if !src.exists() {
        return Err("源目录不存在".to_string());
    }
    if dst.exists() {
        return Err("目标目录已存在".to_string());
    }

    copy_dir_all(src, dst)
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

/// 用系统默认程序打开文件（HTML 用浏览器，图片用默认查看器）
#[tauri::command]
fn open_file(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 用系统默认浏览器打开 URL
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 获取当前工作目录
#[tauri::command]
fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// 执行 markdown-publish CLI 构建静态网站
#[tauri::command]
async fn run_markdown_publish(
    vault_dir: String,
    out_dir: String,
    config: String,
) -> Result<String, String> {
    // 解析配置获取 siteName 等参数
    let config_json: serde_json::Value = serde_json::from_str(&config).unwrap_or(serde_json::Value::Null);

    let mut args = vec![
        "build".to_string(),
        "--vault".to_string(),
        vault_dir.clone(),
        "--out".to_string(),
        out_dir.clone(),
    ];

    // 添加可选参数
    if let Some(site_name) = config_json.get("siteName").and_then(|v| v.as_str()) {
        args.push("--site-name".to_string());
        args.push(site_name.to_string());
    }
    if let Some(site_lang) = config_json.get("siteLang").and_then(|v| v.as_str()) {
        args.push("--site-lang".to_string());
        args.push(site_lang.to_string());
    }
    if let Some(site_url) = config_json.get("siteUrl").and_then(|v| v.as_str()) {
        if !site_url.is_empty() {
            args.push("--site-url".to_string());
            args.push(site_url.to_string());
        }
    }
    if let Some(base_href) = config_json.get("baseHref").and_then(|v| v.as_str()) {
        args.push("--base-href".to_string());
        args.push(base_href.to_string());
    }
    if let Some(build_mode) = config_json.get("buildMode").and_then(|v| v.as_str()) {
        args.push("--build-mode".to_string());
        args.push(build_mode.to_string());
    }

    // 获取当前工作目录，构建 CLI 脚本路径
    // Tauri 的 cwd 是 src-tauri 目录，需要往上一级找到项目根目录
    let cwd = std::env::current_dir()
        .map_err(|e| format!("获取当前目录失败: {}", e))?;

    let project_root = cwd.parent().unwrap_or(&cwd);

    let cli_path = project_root.join("node_modules")
        .join("@abstractwebunit")
        .join("markdown-publish")
        .join("tools")
        .join("cli")
        .join("cli.mjs");

    if !cli_path.exists() {
        return Err(format!("找不到 CLI 脚本: {}", cli_path.display()));
    }

    let output = Command::new("node")
        .arg(cli_path.to_str().unwrap_or_default())
        .args(&args)
        .output()
        .map_err(|e| format!("启动 markdown-publish 失败: {}", e))?;

    if output.status.success() {
        // 构建完成后执行 postbuild 脚本（注入落地页样式等）
        let postbuild_script = project_root.join("website").join("postbuild.mjs");
        if postbuild_script.exists() {
            let _ = Command::new("node")
                .arg(postbuild_script.to_str().unwrap_or_default())
                .output();
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("markdown-publish 执行失败:\n{}\n{}", stdout, stderr))
    }
}

/// 使用 Node.js 内置 HTTP 服务器预览静态网站
#[tauri::command]
async fn preview_site(dir: String, state: State<'_, PreviewServer>) -> Result<String, String> {
    // 先关闭已有的服务器
    {
        let mut guard = state.0.lock().unwrap();
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    let dir_path = std::path::Path::new(&dir);
    if !dir_path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    // 在输出目录中创建服务器脚本，使用 __dirname 获取正确路径
    // 使用 .cjs 扩展名，因为 package.json 有 "type": "module"
    let script_path = dir_path.join("__preview_server.cjs");

    let server_script = r#"
const http = require('http');
const fs = require('fs');
const path = require('path');

// 使用脚本所在目录作为服务器根目录
const DIR = __dirname;
const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

function findFile(urlPath) {
    // 对于 /、/index.html、/index，优先查找 index/index.html
    if (urlPath === '/' || urlPath === '/index.html' || urlPath === '/index') {
        const indexDir = path.join(DIR, 'index', 'index.html');
        if (fs.existsSync(indexDir) && fs.statSync(indexDir).isFile()) {
            return indexDir;
        }
    }

    // 直接路径
    let fullPath = path.join(DIR, urlPath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
    }

    // 添加 .html
    fullPath = path.join(DIR, urlPath + '.html');
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
    }

    // 添加 /index.html
    fullPath = path.join(DIR, urlPath, 'index.html');
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
    }

    return null;
}

const server = http.createServer((req, res) => {
    try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath === '/') urlPath = '/index.html';

        const filePath = findFile(urlPath);

        if (!filePath) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    } catch (e) {
        res.writeHead(500);
        res.end('Server Error');
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('Preview: http://127.0.0.1:' + PORT);
});
"#;

    fs::write(&script_path, server_script)
        .map_err(|e| format!("创建脚本失败: {}", e))?;

    // 启动服务器并保存进程句柄
    let child = Command::new("node")
        .arg(script_path.to_str().unwrap_or_default())
        .spawn()
        .map_err(|e| format!("启动服务器失败: {}", e))?;

    {
        let mut guard = state.0.lock().unwrap();
        *guard = Some(child);
    }

    // 等待服务器启动
    std::thread::sleep(std::time::Duration::from_secs(1));

    let url = "http://127.0.0.1:3000".to_string();

    // 打开浏览器
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open")
            .arg(&url)
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open")
            .arg(&url)
            .spawn();
    }

    Ok(url)
}

/// 停止预览服务器
#[tauri::command]
async fn stop_preview(state: State<'_, PreviewServer>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
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
                // 根据文件扩展名设置 Content-Type
                let content_type = match path.to_lowercase().as_str() {
                    p if p.ends_with(".png") => "image/png",
                    p if p.ends_with(".jpg") || p.ends_with(".jpeg") => "image/jpeg",
                    p if p.ends_with(".gif") => "image/gif",
                    p if p.ends_with(".webp") => "image/webp",
                    p if p.ends_with(".svg") => "image/svg+xml",
                    p if p.ends_with(".bmp") => "image/bmp",
                    p if p.ends_with(".ico") => "image/x-icon",
                    p if p.ends_with(".avif") => "image/avif",
                    _ => "application/octet-stream",
                };
                tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", content_type)
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
            get_cwd,
            open_settings_window,
            open_file_in_new_window,
            open_file_location,
            open_file,
            open_url,
            open_directory,
            open_mindmap_window,
            open_graph_window,
            open_canvas_window,
            open_canvas_in_new_window,
            open_vault_manager_window,
            close_all_editor_windows,
            open_vault_in_new_window,
            move_vault,
            watch_vault,
            unwatch_vault,
            run_markdown_publish,
            preview_site,
            stop_preview,
            fetch_remote_image,
            start_proxy_server
        ])
        .setup(|app| {
            // 初始化文件监听器状态
            app.manage(WatcherState(std::sync::Mutex::new(None)));
            app.manage(PreviewServer(std::sync::Mutex::new(None)));
            app.manage(HttpClientState::new());

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
