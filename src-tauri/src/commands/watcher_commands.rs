use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

#[derive(serde::Serialize, Clone)]
struct FsEvent {
    kind: String,
    paths: Vec<String>,
}

/// Start watching a vault directory for file system changes.
#[tauri::command]
pub fn watch_vault(
    path: String,
    app: AppHandle,
    state: State<WatcherState>,
) -> Result<(), String> {
    let app_clone = app.clone();

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            if let Ok(event) = result {
                let kind = format!("{:?}", event.kind);
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .collect();

                let _ = app_clone.emit("vault://changed", FsEvent { kind, paths });
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);

    Ok(())
}

/// Stop watching the vault.
#[tauri::command]
pub fn unwatch_vault(state: State<WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}
