import { useState, useCallback, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { LinkIndexService } from "../wikilink";
import { useVaultWatcher } from "../services";
import { GraphView } from "./GraphView";
import "./GraphWindow.css";

interface VaultInfo {
  name: string;
  path: string;
}

export default function GraphWindow() {
  const [vaults] = useState<VaultInfo[]>(() => {
    try {
      const raw = localStorage.getItem("zmd-vaults");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [activeVaultIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("zmd-active-vault");
      return saved ? parseInt(saved) : -1;
    } catch {
      return -1;
    }
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const vaultPath = activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null;

  // 同步加载：优先从 localStorage 读取索引（~1ms），立即可用
  useEffect(() => {
    if (!vaultPath) return;

    const cached = localStorage.getItem("zmd-link-index");
    if (cached) {
      LinkIndexService.deserialize(cached);
      setRefreshKey(n => n + 1);
    }

    // 后台异步刷新索引（确保数据最新）
    LinkIndexService.buildIndex(vaultPath).then(() => {
      setRefreshKey(n => n + 1);
      try {
        localStorage.setItem("zmd-link-index", LinkIndexService.serialize());
      } catch {}
    });
  }, [vaultPath]);

  useVaultWatcher(vaultPath, useCallback(() => setRefreshKey(n => n + 1), []));

  const handleClose = useCallback(() => {
    getCurrentWindow().close();
  }, []);

  // Ctrl+W 关闭窗口
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const handleMinimize = useCallback(() => {
    getCurrentWindow().minimize();
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    const win = getCurrentWindow();
    const isMax = await win.isMaximized();
    if (isMax) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }, []);

  return (
    <div className="graph-window">
      <div className="graph-window-titlebar" data-tauri-drag-region>
        <span className="graph-window-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: 'middle', marginTop: -1 }}>
            <circle cx="12" cy="5" r="3" />
            <circle cx="4" cy="19" r="3" />
            <circle cx="20" cy="19" r="3" />
            <line x1="9.5" y1="6.5" x2="5.5" y2="16.5" />
            <line x1="14.5" y1="6.5" x2="18.5" y2="16.5" />
            <line x1="7" y1="19" x2="17" y2="19" />
          </svg>
          关系图谱
        </span>
        <div className="graph-window-controls">
          <button className="graph-window-btn" onClick={handleMinimize} title="最小化">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="graph-window-btn" onClick={handleToggleMaximize} title="最大化">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1" y="1" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="graph-window-btn graph-window-close" onClick={handleClose} title="关闭">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="graph-window-content">
        <div className="graph-window-main">
          <GraphView
            vaultPath={vaultPath}
            onSelectNote={(path) => emit("open-file", { path })}
            standalone
            refreshKey={refreshKey}
          />
        </div>
      </div>
    </div>
  );
}
