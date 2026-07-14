import { useState, useCallback, useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors } from "@tauri-apps/api/window";
import { clampWindowToMonitor } from "../services/windowState";
import { listen } from "@tauri-apps/api/event";
import MindmapView from "./MindmapView";
import "./MindmapWindow.css";

const MINDMAP_CONTENT_KEY = "zmd-mindmap-content";
const MINDMAP_WINDOW_STATE_KEY = "zmd-mindmap-window-state";

export default function MindmapWindow() {
  const [content, setContent] = useState(() => {
    try {
      return localStorage.getItem(MINDMAP_CONTENT_KEY) || "# 思维导图\n\n等待内容加载...";
    } catch {
      return "# 思维导图\n\n等待内容加载...";
    }
  });

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
            await win.setSize(new LogicalSize(clamped.width, clamped.height));
            await win.setPosition(new LogicalPosition(clamped.x, clamped.y));
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

  // Ctrl+W 关闭思维导图窗口
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: 'middle', marginTop: -1 }}>
            <circle cx="6" cy="5" r="2.5" />
            <circle cx="18" cy="4" r="2" />
            <circle cx="15" cy="11" r="2" />
            <circle cx="6" cy="18" r="3" />
            <line x1="8.2" y1="6.5" x2="16" y2="4.8" />
            <line x1="8.2" y1="7" x2="13.2" y2="10.2" />
            <line x1="6" y1="10.5" x2="6" y2="15" />
          </svg>
          思维导图
        </span>
        <div className="mindmap-window-controls">
          <button className="mindmap-window-btn" onClick={handleMinimize} title="最小化">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="mindmap-window-btn" onClick={handleToggleMaximize} title="最大化">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1" y="1" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="mindmap-window-btn mindmap-window-close" onClick={handleClose} title="关闭">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mindmap-window-content">
        <MindmapView content={content} />
      </div>
    </div>
  );
}
