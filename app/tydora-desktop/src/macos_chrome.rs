//! macOS 窗口圆角。
//!
//! 注意：不要对承载 WKWebView 的 contentView 使用 `masksToBounds=true`——
//! 原生层裁剪与 CSS `overflow+radius` 一样会干扰选区高亮（幽灵蓝块）。
//! 视觉圆角改由前端 `html.platform-macos #root { clip-path }` 负责。

use tauri::WebviewWindow;

/// 与前端历史 CSS `#root { border-radius: 12px }` 对齐（仅作文档/兼容常量）。
pub const WINDOW_CORNER_RADIUS: f64 = 12.0;

/// 历史 API：曾对 contentView 设置 CALayer 圆角裁剪。
/// 现改为空操作，避免 masksToBounds 触发 WKWebView 幽灵选区。
pub fn apply_native_corner_radius(_window: &WebviewWindow, _radius: f64) {
    // 有意留空：圆角视觉由 CSS clip-path 处理，见 src/global.css。
}

/// 所有 macOS 窗口创建成功后的收尾（当前无原生裁剪副作用）。
pub fn finish_macos_window(window: &WebviewWindow) {
    apply_native_corner_radius(window, WINDOW_CORNER_RADIUS);
}
