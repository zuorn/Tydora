use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{Emitter, Manager, WebviewWindowBuilder, State};

/// 进程级启动起点，在 `run()` 入口处初始化。
/// 所有 Rust 侧埋点都基于此计算 `ms_since_process_start`，
/// 并通过 `boot-timing` 事件发送给前端，让两条时间轴对齐。
static BOOT_START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

/// 向前端 `boot-timing` 事件发送一条时间戳记录，同时打印到 stderr（Rust 控制台可见）。
/// `ms_since_process_start`：相对进程启动的毫秒数（与 JS 侧收到事件的 performance.now()
///  可以直接比较，差值就是 Rust 阶段完成 → JS 侧事件送达之间的 WebView IPC 延迟）。
fn emit_boot_timing<R: tauri::Runtime, M: tauri::Manager<R> + tauri::Emitter<R>>(app: &M, stage: &str) {
    let t0 = match BOOT_START.get() {
        Some(t) => t,
        None => return,
    };
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    let payload = serde_json::json!({
        "stage": stage,
        "ms_since_process_start": ms,
    });
    eprintln!("[BOOT-RUST] {stage}: {ms:.2} ms");
    let _ = app.emit("boot-timing", &payload);
}

mod commands;

#[cfg(target_os = "macos")]
mod macos_chrome;

/// 窗口创建后的平台收尾。
/// - macOS：原生 chrome 相关收尾
/// - Windows：确保无边框阴影开启（Win11 DWM 系统圆角依赖此路径）
fn finish_platform_window(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    macos_chrome::finish_macos_window(window);
    #[cfg(target_os = "windows")]
    {
        let _ = window.set_shadow(true);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = window;
}
use commands::watcher_commands::{watch_vault, unwatch_vault, WatcherState};
use commands::remote_image::{fetch_remote_image, HttpClientState};
use commands::proxy::{start_proxy_server, fetch_page_title};
use commands::file_commands::list_dir_with_meta;
use commands::terminal_commands::{
    spawn_terminal, write_terminal, resize_terminal, kill_terminal, TerminalManager,
};
use commands::font_commands::list_system_fonts;

struct PreviewServer(Mutex<Option<std::process::Child>>);

/// 通过文件关联（双击 .md 文件）启动时待打开的文件队列。
/// 前端加载完成后通过 `take_pending_files` 主动拉取，
/// 避免固定延迟发事件与前端监听注册之间的竞态导致文件打开为空。
pub struct PendingFiles(Mutex<Vec<String>>);

/// 主窗口即将关闭标记：前端在关闭主窗口前先调用 `notify_main_closing` 置位。
/// 单实例回调据此判断"主窗口正在销毁"，避免向已销毁的窗口句柄调用
/// show/emit 触发 Windows "PostMessage failed（0x80070578 无效的窗口句柄）"。
/// （tauri 2 的 WebviewWindow 没有 is_destroyed() API，窗口 close() 后到
/// 从窗口集合移除之间有一段无法用 get_webview_window 判空的竞态窗口期。）
pub struct MainWindowClosing(std::sync::atomic::AtomicBool);

impl Default for MainWindowClosing {
    fn default() -> Self {
        Self(std::sync::atomic::AtomicBool::new(false))
    }
}

/// 主窗口是否仍然有效（未关闭且未被标记为正在关闭）
fn is_main_window_alive(app: &tauri::AppHandle) -> bool {
    if let Some(state) = app.try_state::<MainWindowClosing>() {
        if state.0.load(std::sync::atomic::Ordering::SeqCst) {
            return false;
        }
    }
    app.get_webview_window("main").is_some()
}

/// 销毁主窗口以外的常驻辅助窗口（设置、管理仓库等）。
/// 设置窗口关闭时走 hide 复用 WebView，必须用 destroy 才能真正释放；
/// 否则主窗口关闭后隐藏的设置窗仍会让进程无法退出。
fn destroy_auxiliary_windows(app: &tauri::AppHandle) {
    for label in ["settings", "vault-manager"] {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.destroy();
        }
    }
}

/// 前端关闭主窗口前调用，通知后端"主窗口即将销毁"。
#[tauri::command]
fn notify_main_closing(app: tauri::AppHandle) {
    if let Some(state) = app.try_state::<MainWindowClosing>() {
        state.0.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    destroy_auxiliary_windows(&app);
}

/// 过滤命令行参数中的 Markdown 文件路径
fn filter_markdown_paths(args: &[String]) -> Vec<String> {
    args.iter()
        .filter(|p| {
            let lower = p.to_lowercase();
            lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".mdx")
        })
        .cloned()
        .collect()
}

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

/// 取出通过文件关联启动时待打开的文件（取出后清空，避免重复打开）
#[tauri::command]
fn take_pending_files(state: State<'_, PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// 快速检查是否有待打开的文件（不取数据，仅判断是否为空）。
/// 比 take_pending_files 更轻量（不移动 Vec 内存），前端用于首渲染前
/// 判断"要不要显示欢迎页"：若队列有文件 → 显示纯白等待（不闪现欢迎卡片）。
#[tauri::command]
fn has_pending_files(state: State<'_, PendingFiles>) -> bool {
    !state.0.lock().unwrap().is_empty()
}

/// 获取应用版本号（从 tauri.conf.json 读取，单一版本源）
#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

/// 是否使用透明窗口。
/// - macOS / Linux：透明 + 前端 CSS 裁圆角（macOS 另需 macOSPrivateApi）
/// - Windows：不透明，交给 Win11 DWM 做系统原生圆角（transparent 会破坏 DWM 圆角）
fn window_transparent() -> bool {
    !cfg!(target_os = "windows")
}

/// 窗口背景色。
/// - 透明平台：全透明，配合 CSS 圆角
/// - Windows：不透明（默认主题 mint 白底），避免 WebView2 首帧黑闪，并让 DWM 能裁系统圆角
fn window_bg() -> tauri::utils::config::Color {
    if cfg!(target_os = "windows") {
        tauri::utils::config::Color(255, 255, 255, 255)
    } else {
        tauri::utils::config::Color(0, 0, 0, 0)
    }
}

/// macOS Overlay 标题栏（隐藏标题文字 + Overlay + 红绿灯位置）。
/// `hidden_title` / `title_bar_style` / `traffic_light_position` 均为 macOS-only API。
trait MacOsChrome<'a, R: tauri::Runtime, M: Manager<R>> {
    fn macos_overlay_chrome(self) -> WebviewWindowBuilder<'a, R, M>;
}

impl<'a, R: tauri::Runtime, M: Manager<R>> MacOsChrome<'a, R, M> for WebviewWindowBuilder<'a, R, M> {
    fn macos_overlay_chrome(self) -> WebviewWindowBuilder<'a, R, M> {
        #[cfg(target_os = "macos")]
        {
            self.hidden_title(true)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .traffic_light_position(tauri::LogicalPosition::new(14.0, 11.0))
        }
        #[cfg(not(target_os = "macos"))]
        {
            self
        }
    }
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

    let builder = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("index.html?window=settings".into()),
    )
    .title("设置")
    .inner_size(800.0, 600.0)
    .min_inner_size(600.0, 400.0)
    .center()
    .visible(false)
    .decorations(cfg!(target_os = "macos"))
    .transparent(window_transparent())
    .macos_overlay_chrome()
    .shadow(true)
    .background_color(window_bg());

    let settings_window = builder.build();

    match settings_window {
        Ok(win) => {
            finish_platform_window(&win);
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// 创建编辑器窗口并在其中打开文件（URL 参数 + 延迟事件双通道）
/// 若提供了上次保存的窗口位置 (pos_x, pos_y)，则直接在该位置打开，否则居中显示
fn spawn_editor_window(
    app: &tauri::AppHandle,
    file_path: &str,
    width: Option<f64>,
    height: Option<f64>,
    pos_x: Option<f64>,
    pos_y: Option<f64>,
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

    let mut builder = WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title(&title)
    .inner_size(width.unwrap_or(1200.0), height.unwrap_or(800.0))
    .min_inner_size(600.0, 400.0)
    .decorations(cfg!(target_os = "macos"))
    .transparent(window_transparent())
    .macos_overlay_chrome()
    .shadow(true)
    .background_color(window_bg());

    // 有上次保存的位置则直接在该位置打开（避免先居中再移动的跳动），否则居中
    // 前端保存的为逻辑坐标（outerPosition / scaleFactor），position 直接接受逻辑坐标
    builder = match (pos_x, pos_y) {
        (Some(px), Some(py)) => builder.position(px, py),
        _ => builder.center(),
    };

    let window = builder.build();

    match window {
        Ok(win) => {
            finish_platform_window(&win);
            let app_handle = app.clone();
            let fp = file_path.to_string();
            let lbl = label.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                // 延迟期间窗口可能已被关闭（关闭后 get_webview_window 返回 None），
                // 向已销毁窗口 emit 会触发 "PostMessage failed（0x80070578 无效的窗口句柄）"
                if app_handle.get_webview_window(&lbl).is_some() {
                    let _ = app_handle.emit_to(&lbl, "open-file", &fp);
                }
            });
            Ok(())
        }
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
    pos_x: Option<f64>,
    pos_y: Option<f64>,
) -> Result<(), String> {
    spawn_editor_window(&app, &file_path, width, height, pos_x, pos_y)
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
    .decorations(cfg!(target_os = "macos"))
    .transparent(window_transparent())
    .macos_overlay_chrome()
    .shadow(true)
    .background_color(window_bg())
    .build();

    match window {
        Ok(win) => {
            finish_platform_window(&win);
            Ok(())
        }
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
    .decorations(cfg!(target_os = "macos"))
    .transparent(window_transparent())
    .macos_overlay_chrome()
    .shadow(true)
    .background_color(window_bg())
    .build();

    match window {
        Ok(win) => {
            finish_platform_window(&win);
            Ok(())
        }
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
    .decorations(cfg!(target_os = "macos"))
    .transparent(window_transparent())
    .macos_overlay_chrome()
    .shadow(true)
    .background_color(window_bg())
    .build();

    match window {
        Ok(win) => {
            finish_platform_window(&win);
            Ok(())
        }
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
    .decorations(cfg!(target_os = "macos"))
    .transparent(window_transparent())
    .macos_overlay_chrome()
    .shadow(true)
    .background_color(window_bg())
    .build();

    match window {
        Ok(win) => {
            finish_platform_window(&win);
            let app_handle = app.clone();
            let cp = canvas_path.clone();
            let lbl = label.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                // 延迟期间窗口可能已被关闭（关闭后 get_webview_window 返回 None），
                // 向已销毁窗口 emit 会触发 "PostMessage failed（0x80070578 无效的窗口句柄）"
                if app_handle.get_webview_window(&lbl).is_some() {
                    let _ = app_handle.emit_to(&lbl, "canvas-file-open", &cp);
                }
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
    .decorations(cfg!(target_os = "macos"))
    .transparent(window_transparent())
    .macos_overlay_chrome()
    .shadow(true)
    .background_color(window_bg())
    .build();

    match window {
        Ok(win) => {
            finish_platform_window(&win);
            Ok(())
        }
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
async fn open_vault_in_new_window(app: tauri::AppHandle, vault_path: String, width: f64, height: f64) -> Result<(), String> {
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
    .inner_size(width, height)
    .min_inner_size(600.0, 400.0)
    .center()
    .decorations(cfg!(target_os = "macos"))
    .transparent(window_transparent())
    .macos_overlay_chrome()
    .shadow(true)
    .background_color(window_bg())
    .build();

    match window {
        Ok(win) => {
            finish_platform_window(&win);
            Ok(())
        }
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

/// 在系统终端中打开指定路径（文件取其所在目录，目录/仓库直接打开）
#[tauri::command]
fn open_in_terminal(path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    let dir = if target.is_dir() {
        target.to_path_buf()
    } else if let Some(parent) = target.parent() {
        parent.to_path_buf()
    } else {
        target.to_path_buf()
    };
    let dir = dir.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        // 优先 Windows Terminal，失败则回退到 cmd（/K 保持窗口打开）
        if Command::new("wt.exe").args(["-d", &dir]).spawn().is_ok() {
            return Ok(());
        }
        Command::new("cmd.exe")
            .current_dir(&dir)
            .arg("/K")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", &dir])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // 依次尝试常见终端模拟器，成功即返回
        let candidates: &[(&str, &str)] = &[
            ("gnome-terminal", "--working-directory"),
            ("konsole", "--workdir"),
            ("xfce4-terminal", "--working-directory"),
            ("x-terminal-emulator", "--working-directory"),
        ];
        for (bin, flag) in candidates {
            if Command::new(bin).args([*flag, &dir]).spawn().is_ok() {
                return Ok(());
            }
        }
        return Err("No terminal emulator found".to_string());
    }
    Ok(())
}

/// 复制文件为 "name copy.ext"，若已存在则自动递增为 "name copy 2.ext"。
/// 返回新文件的完整路径。
#[tauri::command]
fn duplicate_file(path: String) -> Result<String, String> {
    use std::path::Path;
    let src = Path::new(&path);
    if !src.is_file() {
        return Err(format!("Not a file: {path}"));
    }
    let parent = src.parent().unwrap_or(Path::new("."));
    let file_name = src.file_name().and_then(|n| n.to_str()).unwrap_or("copy");
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    let ext = Path::new(file_name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let ext_suffix = if ext.is_empty() { String::new() } else { format!(".{ext}") };

    let mut index = 1u32;
    let dest = loop {
        let name = if index == 1 {
            format!("{stem} copy{ext_suffix}")
        } else {
            format!("{stem} copy {index}{ext_suffix}")
        };
        let candidate = parent.join(&name);
        if !candidate.exists() {
            break candidate;
        }
        index += 1;
    };
    std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg(target_os = "linux")]
/// 向指定剪贴板工具写入 text/uri-list 内容
fn write_uri_list(cmd: &str, args: &[&str], content: &str) -> std::io::Result<bool> {
    use std::io::Write;
    use std::process::{Command as ProcessCommand, Stdio};
    let mut child = ProcessCommand::new(cmd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(content.as_bytes())?;
        stdin.write_all(b"\n")?;
    }
    let status = child.wait()?;
    Ok(status.success())
}

/// 将文件复制到系统剪贴板，以便在系统文件管理器中直接粘贴。
#[tauri::command]
fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Windows：通过 PowerShell Set-Clipboard -Path 将文件作为 FileDropList 写入剪贴板
        let script = format!("Set-Clipboard -Path '{}'", path.replace('\'', "''"));
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    }
    #[cfg(target_os = "macos")]
    {
        // macOS：通过 osascript 将文件写入剪贴板
        let script = format!(
            "set the clipboard to (POSIX file \"{}\")",
            path.replace('"', "\\\"")
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    }
    #[cfg(target_os = "linux")]
    {
        // Linux：写入 text/uri-list（依次尝试 xclip / xsel / wl-copy）
        let uri = format!("file://{}", path);
        let ok = write_uri_list("xclip", &["-selection", "clipboard", "-t", "text/uri-list", "-i"], &uri)
            .or_else(|_| write_uri_list("xsel", &["--clipboard", "--input"], &uri))
            .or_else(|_| write_uri_list("wl-copy", &["--type", "text/uri-list"], &uri))
            .map_err(|e| e.to_string())?;
        if !ok {
            return Err("No clipboard tool available (xclip/xsel/wl-copy)".into());
        }
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

/// 创建/截断导出文件（分块写入第一步）
#[tauri::command]
fn create_export_file(path: String) -> Result<(), String> {
    std::fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 追加写入导出文件（分块写入，避免大字符串通过 IPC 触发 STATUS_HEAP_CORRUPTION）
#[tauri::command]
fn append_export_file(path: String, data: String) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(data.as_bytes()).map_err(|e| e.to_string())
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
    app: tauri::AppHandle,
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

    // 定位 markdown-publish CLI。依次尝试以下来源：
    // 1. 应用资源目录中随安装包打包的 CLI（生产环境优先）
    // 2. 项目 node_modules（开发环境：Tauri 的 cwd 是 src-tauri，往上一级即项目根）
    // 3. 全局 npm 安装的 markdown-publish 命令
    //
    // 用户安装包（NSIS/便携/商店版）不携带 node_modules，前两种途径在生产环境
    // 通常找不到，需要引导用户通过 npm 全局安装 CLI。见下方缺失时的提示。
    let Some(launch) = find_markdown_publish_launcher(&app) else {
        let install_hint = r#"未找到 markdown-publish CLI。

发布网站需要先安装 markdown-publish CLI。请先在电脑上安装 Node.js（https://nodejs.org），
然后在终端中执行以下命令安装：

    npm install -g @abstractwebunit/markdown-publish

安装完成后重启 Tydora 再试。"#;
        return Err(install_hint.to_string());
    };

    let output = Command::new(&launch.program)
        .args(&launch.args)
        .args(&args)
        .output()
        .map_err(|e| format!("启动 markdown-publish 失败（请确认已安装 Node.js）: {}", e))?;

    if output.status.success() {
        // 构建完成后，若在开发环境项目仓库内，执行 postbuild 脚本（注入落地页样式等）
        if let Some(project_root) = current_project_root() {
            let postbuild_script = project_root.join("website").join("postbuild.mjs");
            if postbuild_script.exists() {
                let _ = Command::new("node")
                    .arg(postbuild_script.to_str().unwrap_or_default())
                    .output();
            }
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("markdown-publish 执行失败:\n{}\n{}", stdout, stderr))
    }
}

/// 解析出的 CLI 启动方式：程序名 + 附加参数（如 `node <cli.mjs>` 或全局 `markdown-publish`）
struct MarkdownPublishLauncher {
    program: String,
    args: Vec<std::ffi::OsString>,
}

/// 依次查找 markdown-publish CLI 的可执行启动方式。
/// 返回 None 表示未安装，调用方应引导用户安装。
fn find_markdown_publish_launcher(app: &tauri::AppHandle) -> Option<MarkdownPublishLauncher> {
    // 1. 应用资源目录中随安装包打包的 CLI：resources/markdown-publish/...
    if let Ok(res_dir) = app.path().resource_dir() {
        let bundled = res_dir
            .join("markdown-publish")
            .join("tools")
            .join("cli")
            .join("cli.mjs");
        if bundled.exists() {
            return Some(MarkdownPublishLauncher {
                program: "node".to_string(),
                args: vec![bundled.into_os_string()],
            });
        }
    }

    // 2. 项目 node_modules（开发环境）
    if let Some(project_root) = current_project_root() {
        let local = project_root
            .join("node_modules")
            .join("@abstractwebunit")
            .join("markdown-publish")
            .join("tools")
            .join("cli")
            .join("cli.mjs");
        if local.exists() {
            return Some(MarkdownPublishLauncher {
                program: "node".to_string(),
                args: vec![local.into_os_string()],
            });
        }
    }

    // 3. 全局 npm 安装的 markdown-publish 命令（Windows 下为 markdown-publish.cmd）
    for name in ["markdown-publish", "markdown-publish.cmd", "markdown-publish.exe"] {
        if let Some(path) = find_on_path(name) {
            return Some(MarkdownPublishLauncher {
                program: path.to_string_lossy().into_owned(),
                args: vec![],
            });
        }
    }

    None
}

/// 返回当前工作目录的上一级（项目根目录），用于开发环境下定位 node_modules / postbuild。
fn current_project_root() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    cwd.parent().map(|p| p.to_path_buf())
}

/// 在 PATH 环境变量中查找可执行文件，返回完整路径（Windows 上含 .cmd/.exe 后缀）。
fn find_on_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let cwd = std::env::current_dir().ok();
    for dir in std::env::split_paths(&path_var) {
        for candidate in candidate_bin_paths(&dir, name, cwd.as_deref()) {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn candidate_bin_paths(dir: &Path, name: &str, _cwd: Option<&Path>) -> Vec<PathBuf> {
    let mut out = vec![dir.join(name)];
    if cfg!(windows) {
        out.push(dir.join(format!("{name}.cmd")));
        out.push(dir.join(format!("{name}.exe")));
        out.push(dir.join(format!("{name}.bat")));
    }
    out
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

/// 检测当前是否运行在微软商店（MSIX）安装中。
///
/// MSIX 包总是被系统安装并运行于 `C:\Program Files\WindowsApps` 目录，
/// 该目录只读且由系统（微软商店/Windows Update）托管，应用只能通过商店更新。
/// 若商店版本仍启用内置更新器，下载的 NSIS 安装包会装到其他位置形成第二份副本，
/// 而系统启动时仍解析到 MSIX 注册的旧版本，表现为"更新后重启又回退"。
#[cfg(target_os = "windows")]
fn is_msix() -> bool {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_lowercase().contains("windowsapps"))
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn is_msix() -> bool {
    false
}

/// 当前是否为微软商店（MSIX）版本。
#[tauri::command]
fn is_store_version() -> bool {
    is_msix()
}

/// GitHub 发布信息（商店版切换通道使用）。
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GithubUpdateInfo {
    version: String,
    body: String,
    date: String,
    url: String,
}

#[derive(serde::Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(serde::Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

/// 解析形如 "0.1.7" / "v0.2.0" 的版本号为数字段（最多 4 段）
fn parse_version(s: &str) -> Vec<u64> {
    s.trim()
        .split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty())
        .map(|p| p.parse::<u64>().unwrap_or(0))
        .take(4)
        .collect()
}

/// 比较两个版本号：a > b 返回 Greater
fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let va = parse_version(a);
    let vb = parse_version(b);
    for i in 0..4 {
        let x = va.get(i).copied().unwrap_or(0);
        let y = vb.get(i).copied().unwrap_or(0);
        match x.cmp(&y) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

/// 构建带 User-Agent 的 HTTP 客户端（GitHub API 强制要求）
fn github_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("Tydora/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

/// 检查 GitHub 最新发布版本。仅商店版（MSIX）调用：
/// 当 GitHub 版本高于当前运行版本时返回更新信息（含 NSIS 安装包下载地址），
/// 否则返回 None。非商店版走 tauri updater 插件，不经过此命令。
#[tauri::command]
async fn check_github_update() -> Result<Option<GithubUpdateInfo>, String> {
    let client = github_http_client()?;
    let resp = client
        .get("https://api.github.com/repos/zuorn/Tydora/releases/latest")
        .send()
        .await
        .map_err(|e| format!("请求 GitHub 失败: {e}"))?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let release: GithubRelease = resp
        .json()
        .await
        .map_err(|e| format!("解析 GitHub 响应失败: {e}"))?;

    let version = release.tag_name.trim_start_matches('v').to_string();
    if version.is_empty() {
        return Ok(None);
    }
    // 仅当 GitHub 版本高于当前版本时才提示更新
    if compare_versions(&version, env!("CARGO_PKG_VERSION")) != std::cmp::Ordering::Greater {
        return Ok(None);
    }
    // 挑选 NSIS 安装包（.exe，优先含 "setup"）
    let asset = release
        .assets
        .iter()
        .filter(|a| a.name.to_lowercase().ends_with(".exe"))
        .min_by_key(|a| if a.name.to_lowercase().contains("setup") { 0 } else { 1 })
        .or_else(|| {
            release
                .assets
                .iter()
                .filter(|a| a.name.to_lowercase().ends_with(".exe"))
                .max_by_key(|a| a.name.len())
        });
    let Some(asset) = asset else {
        return Ok(None);
    };

    Ok(Some(GithubUpdateInfo {
        version,
        body: release.body.unwrap_or_default(),
        date: release.published_at.unwrap_or_default(),
        url: asset.browser_download_url.clone(),
    }))
}

/// 从微软商店版切换到 GitHub 版（NSIS）：
/// 1. 下载 NSIS 安装包到临时目录（通过事件报告进度）
/// 2. 生成并启动后台 PowerShell 脚本（隐藏窗口）：
///    等待应用退出 → 先静默安装 GitHub 版 → 安装成功后卸载商店版 → 启动新版
/// 3. 返回后前端退出应用，由后台脚本接管完成切换。
///    由于商店版（MSIX）已被卸载，重新启动的必是 GitHub 版，解决"更新后回退"。
#[tauri::command]
async fn switch_to_github_update(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let client = github_http_client()?;
    let mut resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载安装包失败: {e}"))?;
    let total = resp.content_length();

    let installer_path = std::env::temp_dir().join("tydora-github-setup.exe");
    use std::io::Write;
    let mut file =
        std::fs::File::create(&installer_path).map_err(|e| format!("创建临时文件失败: {e}"))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("下载中断: {e}"))? {
        file.write_all(&chunk).map_err(|e| format!("写入失败: {e}"))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "github-update-progress",
            serde_json::json!({ "downloaded": downloaded, "total": total }),
        );
    }
    file.flush().map_err(|e| format!("写入失败: {e}"))?;
    drop(file);

    // 后台切换脚本（顺序很关键）：
    // 1. 等应用退出（前端已 exit）
    // 2. 先静默安装 GitHub 版（NSIS 装到 %LOCALAPPDATA%\Programs\Tydora）
    // 3. 仅当新版安装成功（exe 存在）才卸载商店版，否则保留商店版避免用户丢失应用
    // 4. 启动新版
    let script = format!(
        "$ErrorActionPreference = 'Continue'\n\
         Start-Sleep -Seconds 3\n\
         Start-Process -FilePath '{installer}' -ArgumentList '/S' -Wait\n\
         $newExe = \"$env:LOCALAPPDATA\\Programs\\Tydora\\Tydora.exe\"\n\
         if (Test-Path $newExe) {{\n\
         \x20   Get-AppxPackage *Tydora* | Remove-AppxPackage\n\
         \x20   Start-Process $newExe\n\
         }}\n",
        installer = installer_path.display()
    );
    let script_path = std::env::temp_dir().join("tydora-switch-to-github.ps1");
    std::fs::write(&script_path, script).map_err(|e| format!("写入脚本失败: {e}"))?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-WindowStyle",
                "Hidden",
                "-File",
            ])
            .arg(&script_path)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("启动切换脚本失败: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = script_path;
    }

    Ok(())
}

/// 当前是否为便携版（zip 解压后直接运行）。
///
/// 判断依据：非商店版（MSIX），且可执行文件不在 NSIS 安装器常用的安装目录
/// （%LOCALAPPDATA%\Tydora、%LOCALAPPDATA%\Programs\Tydora、
/// %ProgramFiles%\Tydora 等）中 → 视为便携版。
#[tauri::command]
fn is_portable_version() -> bool {
    // 商店版（MSIX）不属于便携版
    if is_msix() {
        return false;
    }
    #[cfg(target_os = "windows")]
    {
        let Ok(exe) = std::env::current_exe() else {
            return false;
        };
        let Some(dir) = exe.parent() else {
            return false;
        };
        // 仅当主程序名为 Tydora.exe 时才参与判断，避免误判
        let exe_name = exe
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        if exe_name != "tydora.exe" {
            return false;
        }
        let dir_lower = dir.to_string_lossy().to_lowercase();
        // NSIS 安装器常见的安装目录（默认 installMode=currentUser 装到 LOCALAPPDATA）
        let mut candidates: Vec<String> = Vec::new();
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let local = local.to_lowercase();
            candidates.push(format!("{}\\tydora", local));
            candidates.push(format!("{}\\programs\\tydora", local));
        }
        for key in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(key) {
                candidates.push(format!("{}\\tydora", pf.to_lowercase()));
            }
        }
        // 不在任何安装目录 → 视为便携版
        !candidates.iter().any(|c| dir_lower.starts_with(c.as_str()))
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// 检查 GitHub 最新发布版本（便携版通道）：
/// 当 GitHub 版本高于当前运行版本时返回更新信息（含便携 zip 下载地址），
/// 否则返回 None。便携版不能走内置 updater（其 Windows 更新产物是 NSIS
/// 安装包，会装进系统而非替换便携文件），因此复用 GitHub API 检查。
#[tauri::command]
async fn check_portable_update() -> Result<Option<GithubUpdateInfo>, String> {
    let client = github_http_client()?;
    let resp = client
        .get("https://api.github.com/repos/zuorn/Tydora/releases/latest")
        .send()
        .await
        .map_err(|e| format!("请求 GitHub 失败: {e}"))?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let release: GithubRelease = resp
        .json()
        .await
        .map_err(|e| format!("解析 GitHub 响应失败: {e}"))?;

    let version = release.tag_name.trim_start_matches('v').to_string();
    if version.is_empty() {
        return Ok(None);
    }
    // 仅当 GitHub 版本高于当前版本时才提示更新
    if compare_versions(&version, env!("CARGO_PKG_VERSION")) != std::cmp::Ordering::Greater {
        return Ok(None);
    }
    // 挑选便携版 zip（优先 *_x64_portable.zip）
    let asset = release
        .assets
        .iter()
        .filter(|a| {
            let n = a.name.to_lowercase();
            n.ends_with(".zip") && n.contains("portable")
        })
        .min_by_key(|a| {
            if a.name.to_lowercase().contains("x64") {
                0
            } else {
                1
            }
        });
    let url = match asset {
        Some(a) => a.browser_download_url.clone(),
        // 兜底：按命名规则构造下载地址
        None => format!(
            "https://github.com/zuorn/Tydora/releases/download/v{version}/Tydora_{version}_x64_portable.zip"
        ),
    };

    Ok(Some(GithubUpdateInfo {
        version,
        body: release.body.unwrap_or_default(),
        date: release.published_at.unwrap_or_default(),
        url,
    }))
}

/// 安装便携版更新（便携版通道）：
/// 1. 下载便携 zip 到临时目录（通过事件报告进度）
/// 2. 解压出新的 Tydora.exe 到当前 exe 同目录下的 Tydora.exe.new
/// 3. 生成并启动后台 cmd 脚本（隐藏窗口）：等待应用退出 → 用 .new 覆盖
///    旧 exe → 启动新版 → 清理临时文件与脚本
/// 4. 返回后前端退出应用，由后台脚本接管完成替换。
#[tauri::command]
async fn install_portable_update(
    app: tauri::AppHandle,
    url: String,
    version: String,
) -> Result<(), String> {
    let client = github_http_client()?;
    let mut resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载便携包失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载便携包失败: HTTP {}", resp.status()));
    }
    let total = resp.content_length();

    // 1. 流式下载 zip 到临时目录
    let zip_path = std::env::temp_dir().join(format!("tydora-portable-{version}.zip"));
    use std::io::Write;
    let mut file =
        std::fs::File::create(&zip_path).map_err(|e| format!("创建临时文件失败: {e}"))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("下载中断: {e}"))? {
        file.write_all(&chunk).map_err(|e| format!("写入失败: {e}"))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "portable-update-progress",
            serde_json::json!({ "downloaded": downloaded, "total": total }),
        );
    }
    file.flush().map_err(|e| format!("写入失败: {e}"))?;
    drop(file);

    // 2. 解压出新 exe 到当前 exe 同目录（Tydora.exe.new）
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .ok_or_else(|| "无法定位可执行文件目录".to_string())?;
    let new_exe = exe_dir.join("Tydora.exe.new");

    let zip_file = std::fs::File::open(&zip_path).map_err(|e| format!("打开便携包失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| format!("解析便携包失败: {e}"))?;
    let mut found = false;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("读取便携包失败: {e}"))?;
        if !entry.is_dir() && entry.name().to_lowercase().ends_with(".exe") {
            let mut out =
                std::fs::File::create(&new_exe).map_err(|e| format!("写入新程序失败: {e}"))?;
            std::io::copy(&mut entry, &mut out).map_err(|e| format!("解压新程序失败: {e}"))?;
            out.flush().map_err(|e| format!("写入新程序失败: {e}"))?;
            found = true;
            break;
        }
    }
    let _ = std::fs::remove_file(&zip_path);
    if !found {
        let _ = std::fs::remove_file(&new_exe);
        return Err("便携包中未找到可执行文件".to_string());
    }

    // 3. 生成后台替换脚本：等进程退出 → 覆盖 exe → 启动新版 → 自删
    let script_path = exe_dir.join("update-portable.cmd");
    let script = format!(
        "@echo off\r\n\
         setlocal\r\n\
         :wait\r\n\
         tasklist /FI \"IMAGENAME eq Tydora.exe\" | find /I \"Tydora.exe\" >nul\r\n\
         if not errorlevel 1 (\r\n\
         \x20  ping -n 2 127.0.0.1 >nul\r\n\
         \x20  goto wait\r\n\
         )\r\n\
         copy /Y \"%~dp0Tydora.exe.new\" \"%~dp0Tydora.exe\"\r\n\
         if errorlevel 1 goto fail\r\n\
         del /F /Q \"%~dp0Tydora.exe.new\"\r\n\
         start \"\" \"%~dp0Tydora.exe\"\r\n\
         del /F /Q \"%~f0\"\r\n\
         exit /b 0\r\n\
         :fail\r\n\
         start \"\" \"%~dp0Tydora.exe\"\r\n\
         exit /b 1\r\n"
    );
    std::fs::write(&script_path, script).map_err(|e| format!("写入替换脚本失败: {e}"))?;

    // 4. 隐藏窗口启动后台脚本
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("cmd")
            .args(["/c", "/d"])
            .arg(&script_path)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("启动替换脚本失败: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = script_path;
        let _ = new_exe;
        Err("便携版更新仅支持 Windows".to_string())
    }
}

pub fn run() {
    // 第一行代码：标记"进程进入 Rust run()"起点。
    // （更早的 exe entry / tauri_runtime 初始化无法在此处捕获，但通常 < 20ms）
    let _ = BOOT_START.set(Instant::now());

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                // 窗口可见性由前端启动逻辑控制（无仓库时主窗口隐藏、只显示管理仓库窗口），
                // 因此不恢复/保存可见性状态，避免插件把主窗口强制显示出来。
                // 也不恢复 DECORATIONS：旧会话曾是 decorations:false，恢复后会盖掉
                // macOS Overlay 标题栏，导致系统红绿灯消失。
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        ^ tauri_plugin_window_state::StateFlags::VISIBLE
                        ^ tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 应用已运行时双击 .md 文件：把文件路径转发给主窗口
            let md_paths = filter_markdown_paths(&args);
            if let Some(path) = md_paths.last() {
                // 主窗口可能正在销毁（无仓库时前端已调用 close 并标记
                // MainWindowClosing）。此时调用 show/emit 会触发 Windows
                // "PostMessage failed（0x80070578 无效的窗口句柄）"，
                // 必须先用 is_main_window_alive() 判断窗口是否仍然有效
                if is_main_window_alive(app) {
                    if let Some(win) = app.get_webview_window("main") {
                        // 主窗口可能处于隐藏状态（启动初期或无仓库时），先显示再聚焦，
                        // 确保用户能看到打开的文件
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                        // 同时放入待打开队列：若事件发出时前端监听尚未注册（应用启动初期），
                        // 由前端的延迟二次拉取接管，确保文件不丢失
                        if let Some(state) = app.try_state::<PendingFiles>() {
                            state.0.lock().unwrap().push(path.clone());
                        }
                        let _ = app.emit_to("main", "open-file-external", path);
                    }
                } else {
                    // 主窗口已关闭或正在销毁（仍有其他窗口存活）：在新编辑器窗口中打开文件
                    let _ = spawn_editor_window(app, path, None, None, None, None);
                }
            }
        }))
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
        });

    // 微软商店（MSIX）版本不注册 tauri updater 插件：
    // MSIX 包只读且由系统托管，内置更新器（NSIS）会把新版本装到其他位置形成
    // 第二份副本，重启后系统仍启动商店旧版本。商店版改用自定义 GitHub 切换通道
    // （check_github_update / switch_to_github_update）：下载后先卸载商店版再安装
    // GitHub 版，保证重新打开的就是新版本。非商店版继续使用内置更新器。
    if !is_msix() {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    {
        // builder 构造阶段埋点：此时所有 plugin + single_instance + scheme 都已经配置完毕
        // （但还没有进入 invoke_handler / setup / run 执行阶段）。
        // 通过一个小型 .setup() 包装记录"builder 配置完成"，避免改动原 builder 链结构。
        let _ = BOOT_START.get().map(|t| {
            eprintln!(
                "[BOOT-RUST] builder_configured: {:.2} ms",
                t.elapsed().as_secs_f64() * 1000.0
            );
        });
    }

    builder
        .invoke_handler(tauri::generate_handler![
            get_default_content,
            take_pending_files,
            has_pending_files,
            get_app_version,
            is_store_version,
            is_portable_version,
            check_github_update,
            check_portable_update,
            switch_to_github_update,
            install_portable_update,
            get_cwd,
            open_settings_window,
            open_file_in_new_window,
            open_file_location,
            open_file,
            open_url,
            duplicate_file,
            copy_file_to_clipboard,
            open_directory,
            open_in_terminal,
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
            start_proxy_server,
            fetch_page_title,
            create_export_file,
            append_export_file,
            notify_main_closing,
            list_dir_with_meta,
            spawn_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal,
            list_system_fonts
        ])
        .setup(|app| {
            emit_boot_timing(app, "setup_begin");

            // 初始化文件监听器状态
            app.manage(WatcherState(std::sync::Mutex::new(None)));
            app.manage(PreviewServer(std::sync::Mutex::new(None)));
            app.manage(HttpClientState::new());
            app.manage(PendingFiles(std::sync::Mutex::new(Vec::new())));
            app.manage(MainWindowClosing::default());
            app.manage(TerminalManager::default());
            emit_boot_timing(app, "setup_state_managed");

            // 处理命令行参数（从文件管理器"打开方式"启动时传入的文件路径）：
            // 放入待打开队列，由前端加载完成后通过 take_pending_files 主动拉取
            let args: Vec<String> = std::env::args().collect();
            let file_paths = filter_markdown_paths(&args);
            if !file_paths.is_empty() {
                app.state::<PendingFiles>()
                    .0
                    .lock()
                    .unwrap()
                    .extend(file_paths);
            }
            emit_boot_timing(app, "setup_args_processed");

            // tauri.conf.json 中声明的窗口（含 label="main"）会在 setup 之前由 Tauri
            // runtime 自动创建完成。这里记录"main window handle ready"的时间，
            // 若 handle 不存在则说明 tauri.conf.json 中 windows 配置变更或未生效。
            if app.get_webview_window("main").is_some() {
                emit_boot_timing(app, "main_window_handle_ready");
                // tauri-plugin-window-state 已在 setup 前自动恢复 SIZE/POSITION/MAXIMIZED
                // （StateFlags 里排除了 VISIBLE），所以此时窗口已经是正确尺寸/位置，
                // 只差最后一步 show() → 用户看到的第一帧就是正确大小，完全没有跳动。
                if let Some(window) = app.get_webview_window("main") {
                    // Windows/Linux：配置里为了 macOS Overlay 写了 decorations:true，
                    // 这里在 show 前关掉系统标题栏，改用自定义窗口控件。
                    #[cfg(not(target_os = "macos"))]
                    {
                        let _ = window.set_decorations(false);
                    }
                    // 避免 decorations 切换后未装饰阴影丢失。
                    #[cfg(target_os = "windows")]
                    {
                        let _ = window.set_shadow(true);
                    }
                    // macOS：强制 Overlay 红绿灯（防止旧 window-state 或其它路径关掉 decorations）
                    #[cfg(target_os = "macos")]
                    {
                        let _ = window.set_decorations(true);
                        let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                    }
                    finish_platform_window(&window);
                    let _ = window.show();

                    // 主窗口关闭时同步销毁隐藏的辅助窗口（设置窗 hide 复用场景）
                    let app_handle = app.handle().clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { .. } = event {
                            if let Some(state) = app_handle.try_state::<MainWindowClosing>() {
                                state
                                    .0
                                    .store(true, std::sync::atomic::Ordering::SeqCst);
                            }
                            destroy_auxiliary_windows(&app_handle);
                        }
                    });
                }
                emit_boot_timing(app, "main_window_shown");
            } else {
                eprintln!("[BOOT-RUST] main_window_handle_ready: (NOT FOUND — check tauri.conf.json windows)");
            }

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            emit_boot_timing(app, "setup_ready");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
