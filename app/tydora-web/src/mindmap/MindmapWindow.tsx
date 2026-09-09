import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors } from "@tauri-apps/api/window";
import { clampWindowToMonitor } from "../services/windowState";
import { listen } from "@tauri-apps/api/event";
import MindmapView, { type MindmapViewHandle } from "./MindmapView";
import { MINDMAP_SETTINGS_KEY, DEFAULT_MINDMAP } from "../Settings";
import { matchShortcut } from "../Editor/shortcuts";
import shortcutsConfig from "../config/shortcuts.json";
import { track, trackPageview, ANALYTICS_EVENTS } from "../analytics";
import "./MindmapWindow.css";

const MINDMAP_CONTENT_KEY = "zmd-mindmap-content";
const MINDMAP_WINDOW_STATE_KEY = "zmd-mindmap-window-state";

function getInitialExpandLevel(): number {
  try {
    const saved = localStorage.getItem(MINDMAP_SETTINGS_KEY);
    return saved ? JSON.parse(saved).initialExpandLevel ?? DEFAULT_MINDMAP.initialExpandLevel : DEFAULT_MINDMAP.initialExpandLevel;
  } catch {
    return DEFAULT_MINDMAP.initialExpandLevel;
  }
}

export default function MindmapWindow() {
  const { t } = useTranslation();
  const [content, setContent] = useState(() => {
    try {
      return localStorage.getItem(MINDMAP_CONTENT_KEY) || `# ${t("mindmapWindow.placeholderTitle")}\n\n${t("mindmapWindow.waitingForContent")}`;
    } catch {
      return `# ${t("mindmapWindow.placeholderTitle")}\n\n${t("mindmapWindow.waitingForContent")}`;
    }
  });

  const [expandLevel, setExpandLevel] = useState(getInitialExpandLevel);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const mindmapViewRef = useRef<MindmapViewHandle>(null);

  // 统计：思维导图窗口打开
  useEffect(() => {
    track(ANALYTICS_EVENTS.MINDMAP_OPEN);
    trackPageview("/app/mindmap");
  }, []);

  // Listen for real-time updates from main window
  useEffect(() => {
    const unlisten = listen<{ content: string }>("mindmap-content-update", (event) => {
      setContent(event.payload.content);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Also poll localStorage in case events are missed
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        // 列表模式下不轮询，避免覆盖列表内容
        const mode = localStorage.getItem("zmd-mindmap-mode");
        if (mode === "list") return;
        const stored = localStorage.getItem(MINDMAP_CONTENT_KEY);
        if (stored && stored !== content) {
          setContent(stored);
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [content]);

  // ── 窗口位置/大小记忆 ──
  const saveWindowStateRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const win = getCurrentWebviewWindow();

    const saveWindowState = async () => {
      try {
        const maximized = await win.isMaximized();
        const state: Record<string, unknown> = { maximized };
        if (!maximized) {
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          state.x = pos.x;
          state.y = pos.y;
          state.width = size.width;
          state.height = size.height;
        }
        localStorage.setItem(MINDMAP_WINDOW_STATE_KEY, JSON.stringify(state));
      } catch {}
    };
    saveWindowStateRef.current = saveWindowState;

    (async () => {
      try {
        const saved = localStorage.getItem(MINDMAP_WINDOW_STATE_KEY);
        if (saved) {
          const state = JSON.parse(saved) as {
            x: number; y: number; width: number; height: number; maximized: boolean;
          };

          const monitors = await availableMonitors();
          if (monitors && monitors.length > 0 && state.width && state.height) {
            const clamped = clampWindowToMonitor(
              { x: state.x ?? 0, y: state.y ?? 0, width: state.width, height: state.height },
              monitors
            );
            await win.setSize(new PhysicalSize(clamped.width, clamped.height));
            await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
            if (state.maximized) {
              await win.maximize();
            }
          }
        }
      } catch {}
      await win.show();
    })();

    let moveTimer: ReturnType<typeof setTimeout>;
    let resizeTimer: ReturnType<typeof setTimeout>;

    const unlistenMove = win.onMoved(() => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(saveWindowState, 300);
    });

    const unlistenResize = win.onResized(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(saveWindowState, 300);
    });

    return () => {
      clearTimeout(moveTimer);
      clearTimeout(resizeTimer);
      unlistenMove.then((fn) => fn()).catch(() => {});
      unlistenResize.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const handleClose = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.close();
  }, []);

  // 关闭窗口快捷键（配置见 src/config/shortcuts.json 的 app.close-window）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchShortcut(e, shortcutsConfig.app["close-window"])) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const handleMinimize = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.minimize();
  }, []);

  const handleExportImage = useCallback(() => {
    window.dispatchEvent(new CustomEvent("mindmap-export"));
  }, []);

  const handleCopyImage = useCallback(() => {
    window.dispatchEvent(new CustomEvent("mindmap-copy-image"));
  }, []);

  // Listen for copy success to show brief feedback
  useEffect(() => {
    const handler = () => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    };
    window.addEventListener("mindmap-copy-success", handler);
    return () => window.removeEventListener("mindmap-copy-success", handler);
  }, []);

  const handleFit = useCallback(() => mindmapViewRef.current?.fit(), []);
  const handleZoomIn = useCallback(() => mindmapViewRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => mindmapViewRef.current?.zoomOut(), []);

  const handleExpandLevelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setExpandLevel(Number(e.target.value));
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    const isMax = await win.isMaximized();
    if (isMax) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }, []);

  return (
    <div className="mindmap-window">
      <div className="mindmap-window-titlebar" data-tauri-drag-region>
        <span className="mindmap-window-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 4a1 1 0 0 1 0 2h-2.7a7.4 7.4 0 0 0-7.2 6H20a1 1 0 0 1 0 2h-9.9a7.4 7.4 0 0 0 7.2 6H20a1 1 0 0 1 0 2h-2.7a9.4 9.4 0 0 1-9.2-8H4a1 1 0 0 1 0-2h4.1a9.4 9.4 0 0 1 9.2-8H20z" />
          </svg>
          {t("mindmapWindow.title")}
        </span>
        <div className="mindmap-window-controls">
          <button className="mindmap-window-btn" onClick={handleExportImage} title={t("settings.mindmap.exportAsImage")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button className="mindmap-window-btn" onClick={handleCopyImage} title={copyFeedback ? (t("settings.mindmap.copyAsImageSuccess") ?? "") : (t("settings.mindmap.copyAsImage") ?? "")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <div className="mindmap-window-separator" />
          <div className="mindmap-window-toolbar">
            <button className="mindmap-toolbar-btn" onClick={handleFit} title={t("mindmapWindow.fitView")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
            <button className="mindmap-toolbar-btn" onClick={handleZoomIn} title={t("mindmapWindow.zoomIn")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
              </svg>
            </button>
            <button className="mindmap-toolbar-btn" onClick={handleZoomOut} title={t("mindmapWindow.zoomOut")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35M8 11h6" />
              </svg>
            </button>
            <div className="mindmap-toolbar-divider" />
            <select
              className="mindmap-toolbar-select"
              value={expandLevel}
              onChange={handleExpandLevelChange}
              title={t("mindmapWindow.expandLevel")}
            >
              <option value={-1}>{t("mindmapWindow.all")}</option>
              <option value={1}>{t("mindmapWindow.level", { level: 1 })}</option>
              <option value={2}>{t("mindmapWindow.level", { level: 2 })}</option>
              <option value={3}>{t("mindmapWindow.level", { level: 3 })}</option>
              <option value={4}>{t("mindmapWindow.level", { level: 4 })}</option>
              <option value={5}>{t("mindmapWindow.level", { level: 5 })}</option>
              <option value={6}>{t("mindmapWindow.level", { level: 6 })}</option>
            </select>
          </div>
          <div className="mindmap-window-separator" />
          <button className="mindmap-window-btn" onClick={handleMinimize} title={t("mindmapWindow.minimize")}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="mindmap-window-btn" onClick={handleToggleMaximize} title={t("mindmapWindow.maximize")}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1" y="1" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="mindmap-window-btn mindmap-window-close" onClick={handleClose} title={t("mindmapWindow.close")}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mindmap-window-content">
        <MindmapView
          ref={mindmapViewRef}
          content={content}
          expandLevel={expandLevel}
          onExpandLevelChange={setExpandLevel}
        />
      </div>
    </div>
  );
}
