use reqwest::Client;
use std::sync::Mutex;
use tauri::State;
use tauri::Manager;
use base64::Engine;

pub struct HttpClientState {
    pub client: Mutex<Client>,
}

impl HttpClientState {
    pub fn new() -> Self {
        let client = Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .redirect(reqwest::redirect::Policy::limited(10))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        Self {
            client: Mutex::new(client),
        }
    }
}

fn cache_hash_for_url(url: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn cache_paths_for_url(url: &str, cache_dir: &std::path::PathBuf) -> (std::path::PathBuf, std::path::PathBuf) {
    let hash = cache_hash_for_url(url);
    let data_path = cache_dir.join(&hash);
    let type_path = cache_dir.join(format!("{}.type", hash));
    (data_path, type_path)
}

fn guess_content_type(url: &str, bytes: &[u8]) -> String {
    let lower = url.to_lowercase();
    if lower.ends_with(".png") || lower.contains(".png?") {
        return "image/png".to_string();
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.contains(".jpg?") || lower.contains(".jpeg?") {
        return "image/jpeg".to_string();
    } else if lower.ends_with(".gif") || lower.contains(".gif?") {
        return "image/gif".to_string();
    } else if lower.ends_with(".webp") || lower.contains(".webp?") {
        return "image/webp".to_string();
    } else if lower.ends_with(".svg") || lower.contains(".svg?") {
        return "image/svg+xml".to_string();
    }
    // shields.io 等 badge URL 没有扩展名，通过内容魔数判断 SVG
    let start = std::str::from_utf8(&bytes[..bytes.len().min(512)]).unwrap_or("");
    let trimmed = start.trim_start();
    if trimmed.starts_with("<svg")
        || trimmed.starts_with("<?xml")
        || (trimmed.starts_with("<!--") && trimmed.to_lowercase().contains("<svg"))
    {
        return "image/svg+xml".to_string();
    }
    "image/png".to_string()
}

/// 对 URL 中 reqwest 无法解析的非法字符做百分号编码（空格→%20、竖线→%7C）。
/// 已编码的形式（%20/%7C）不含原始字符，不会被二次编码。
fn encode_url_safe(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            ' ' => out.push_str("%20"),
            '|' => out.push_str("%7C"),
            _ => out.push(c),
        }
    }
    out
}

#[tauri::command]
pub async fn fetch_remote_image(
    url: String,
    refresh: Option<bool>,
    state: State<'_, HttpClientState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("cache")
        .join("images");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let (data_path, type_path) = cache_paths_for_url(&url, &cache_dir);

    let refresh = refresh.unwrap_or(false);
    if !refresh && data_path.exists() {
        if let Ok(bytes) = std::fs::read(&data_path) {
            let content_type = if let Ok(ct) = std::fs::read_to_string(&type_path) {
                ct.trim().to_string()
            } else {
                guess_content_type(&url, &bytes)
            };
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return Ok(format!("data:{};base64,{}", content_type, encoded));
        }
    }

    let client = {
        let state = state.client.lock().map_err(|e| e.to_string())?;
        state.clone()
    };
    // 兜底：URL 可能含解码后的空格/竖线（前端已 encodeURI，这里防御漏传场景），
    // reqwest 无法解析含空格的 URL，先编码非法字符。
    let request_url = encode_url_safe(&url);
    let response = client.get(&request_url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} for {}", response.status(), url));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| {
            // data URL 中保留主 MIME 类型即可；charset 等参数对 base64 数据无意义
            s.split(';').next().unwrap_or(s).trim().to_string()
        })
        .unwrap_or_else(|| "image/png".to_string());

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    // 缓存图片数据与对应 MIME 类型，避免 shields.io 等无扩展名 URL 二次读取时类型错误
    let _ = std::fs::write(&data_path, &bytes);
    let _ = std::fs::write(&type_path, &content_type);

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, encoded))
}
