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

fn cache_path_for_url(url: &str, cache_dir: &std::path::PathBuf) -> std::path::PathBuf {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    let hash = format!("{:016x}", hasher.finish());
    cache_dir.join(&hash)
}

fn guess_content_type(url: &str) -> &str {
    let lower = url.to_lowercase();
    if lower.ends_with(".png") || lower.contains(".png?") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.contains(".jpg?") || lower.contains(".jpeg?") {
        "image/jpeg"
    } else if lower.ends_with(".gif") || lower.contains(".gif?") {
        "image/gif"
    } else if lower.ends_with(".webp") || lower.contains(".webp?") {
        "image/webp"
    } else if lower.ends_with(".svg") || lower.contains(".svg?") {
        "image/svg+xml"
    } else {
        "image/png"
    }
}

#[tauri::command]
pub async fn fetch_remote_image(
    url: String,
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
    let cached = cache_path_for_url(&url, &cache_dir);

    if cached.exists() {
        if let Ok(bytes) = std::fs::read(&cached) {
            let content_type = guess_content_type(&url);
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return Ok(format!("data:{};base64,{}", content_type, encoded));
        }
    }

    let client = {
        let state = state.client.lock().map_err(|e| e.to_string())?;
        state.clone()
    };
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let _ = std::fs::write(&cached, &bytes);

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, encoded))
}
