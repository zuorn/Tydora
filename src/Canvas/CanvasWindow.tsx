import { useState, useCallback, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ReactFlowProvider } from '@xyflow/react';

import CanvasView from './CanvasView';
import CanvasSettings from './CanvasSettings';
import { useCanvasStore } from './canvas-store';
import './canvas.css';

const CANVAS_STORAGE_KEY = 'zmd-canvas-file-path';

export default function CanvasWindow() {
  const [canvasTitle, setCanvasTitle] = useState('白板');
  const [showSettings, setShowSettings] = useState(false);
  const { loadCanvas, saveCanvas, filePath, isModified } = useCanvasStore();

  // Load canvas file from URL params or localStorage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const canvasFile = urlParams.get('file');

    if (canvasFile) {
      const vaultPath = urlParams.get('vault') || '';
      loadCanvas(canvasFile, vaultPath);
      setCanvasTitle(canvasFile.split(/[/\\]/).pop() || '白板');
    } else {
      // Try to load last opened canvas from localStorage
      const savedPath = localStorage.getItem(CANVAS_STORAGE_KEY);
      if (savedPath) {
        loadCanvas(savedPath, '');
        setCanvasTitle(savedPath.split(/[/\\]/).pop() || '白板');
      }
    }
  }, [loadCanvas]);

  // Listen for canvas-file-open events from main window
  useEffect(() => {
    const unlisten = listen<{ path: string }>('canvas-file-open', async (event) => {
      const filePath = event.payload.path;
      await loadCanvas(filePath, '');
      setCanvasTitle(filePath.split(/[/\\]/).pop() || '白板');
      localStorage.setItem(CANVAS_STORAGE_KEY, filePath);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadCanvas]);

  // Save to localStorage when filePath changes
  useEffect(() => {
    if (filePath) {
      localStorage.setItem(CANVAS_STORAGE_KEY, filePath);
      setCanvasTitle(filePath.split(/[/\\]/).pop() || '白板');
    }
  }, [filePath]);

  // Window controls
  const handleClose = useCallback(async () => {
    if (isModified) {
      await saveCanvas();
    }
    await getCurrentWindow().close();
  }, [isModified, saveCanvas]);

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

  // Ctrl+S save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCanvas();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveCanvas]);

  // Ctrl+W close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  // Ctrl+N new canvas
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        useCanvasStore.getState().clearCanvas();
        setCanvasTitle('未命名白板');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Save As
  const handleSaveAs = useCallback(async () => {
    try {
      const filePath = await save({
        filters: [{ name: 'Canvas', extensions: ['canvas'] }],
        defaultPath: 'untitled.canvas',
      });
      if (filePath) {
        await saveCanvas();
        useCanvasStore.setState({ filePath });
        localStorage.setItem(CANVAS_STORAGE_KEY, filePath);
      }
    } catch (err) {
      console.error('Save As failed:', err);
    }
  }, [saveCanvas]);

  // Open canvas file
  const handleOpen = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Canvas', extensions: ['canvas'] }],
        multiple: false,
      });
      if (selected) {
        const path = selected as string;
        await loadCanvas(path, '');
        localStorage.setItem(CANVAS_STORAGE_KEY, path);
      }
    } catch (err) {
      console.error('Open failed:', err);
    }
  }, [loadCanvas]);

  // Get save status for traffic light
  const saveStatus = isModified ? "modified" : "saved";

  return (
    <div className="canvas-window">
      <div className="canvas-window-titlebar" data-tauri-drag-region>
        <span className="canvas-window-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: 'middle', marginTop: -1 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          <span className={`traffic-light traffic-light--${saveStatus}`} />
          {canvasTitle}
        </span>
        <div className="canvas-window-controls">
          <button className="canvas-window-btn" onClick={handleOpen} title="打开画布 (Ctrl+O)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button className="canvas-window-btn" onClick={handleSaveAs} title="另存为 (Ctrl+Shift+S)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </button>
          <button className="canvas-window-btn" onClick={() => setShowSettings(true)} title="白板设置">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div className="canvas-window-divider" />
          <button className="canvas-window-btn" onClick={handleMinimize} title="最小化">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="canvas-window-btn" onClick={handleToggleMaximize} title="最大化">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1" y="1" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="canvas-window-btn canvas-window-close" onClick={handleClose} title="关闭">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="canvas-window-content">
        <ReactFlowProvider>
          <CanvasView />
        </ReactFlowProvider>
      </div>

      <CanvasSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
