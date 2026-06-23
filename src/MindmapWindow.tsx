import { useState, useCallback, useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import MindmapView from "./MindmapView";
import "./MindmapWindow.css";

const MINDMAP_CONTENT_KEY = "zmd-mindmap-content";

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
        const stored = localStorage.getItem(MINDMAP_CONTENT_KEY);
        if (stored && stored !== content) {
          setContent(stored);
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [content]);

  const handleClose = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.close();
  }, []);

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
        <span className="mindmap-window-title">思维导图</span>
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
