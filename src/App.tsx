import { useState, useCallback, useRef, useEffect, Component } from "react";
import { getCurrentWindow, availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import VditorEditor, { VditorEditorHandle, MODE_LABELS, EditorMode } from "./VditorEditor";
import Sidebar, { VaultInfo } from "./Sidebar";
import FilePreview from "./FilePreview";
import QuickOpen from "./QuickOpen";
import { useTheme } from "./themes";
import { ConfirmDialog } from "./ConfirmDialog";
import "./App.css";
import "./vditor-theme.css";
import "./FilePreview.css";

// 错误边界：防止编辑器错误导致整个页面空白
class EditorErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="editor-panel" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-secondary)", flexDirection: "column", gap: 8,
        }}>
          <p>❌ 编辑器组件错误</p>
          <p style={{ fontSize: 12, maxWidth: 400, textAlign: "center", wordBreak: "break-all" }}>
            {this.state.error}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const VAULTS_KEY = "zmd-vaults";
const ACTIVE_VAULT_KEY = "zmd-active-vault";
const SIDEBAR_WIDTH_KEY = "zmd-sidebar-width";
const WINDOW_STATE_KEY = "zmd-window-state";
const RECENT_FILES_KEY = "zmd-recent-files";

// 最近访问文件的最大数量
const MAX_RECENT_FILES = 20;

// 判断文件是否为可编辑的文本文件
function isEditableFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const editableExts = [
    "md", "markdown", "txt", "json", "js", "ts", "tsx", "jsx",
    "html", "css", "scss", "less", "xml", "yaml", "yml",
    "py", "rs", "go", "java", "c", "cpp", "h", "hpp",
    "sh", "bash", "zsh", "bat", "ps1",
    "toml", "ini", "cfg", "conf", "log",
    "vue", "svelte", "astro",
  ];
  return editableExts.includes(ext);
}

function App() {
  const { theme } = useTheme();
  const initialContent = "# 欢迎使用 Tydora ✨\n\n开始编写你的 Markdown...\n";
  const [content, setContent] = useState(initialContent);
  const [fileName, setFileName] = useState<string | null>(null);
  const [modified, setModified] = useState(false);
  const [viewMode, setViewMode] = useState<EditorMode>("ir");

  // Sidebar / Vault state
  const [vaults, setVaults] = useState<VaultInfo[]>(() => {
    try {
      const saved = localStorage.getItem(VAULTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeVaultIndex, setActiveVaultIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_VAULT_KEY);
      return saved ? parseInt(saved) : -1;
    } catch {
      return -1;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      return saved ? parseInt(saved) : 260;
    } catch {
      return 260;
    }
  });
  const [treeRefreshKey] = useState(0);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  // 预览模式状态
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);

  // 快速打开文件弹窗状态
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);

  // 最近访问的文件列表（按仓库路径分组）
  const [recentFiles, setRecentFiles] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(RECENT_FILES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Persist recent files
  useEffect(() => {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recentFiles));
  }, [recentFiles]);

  // Persist vaults
  useEffect(() => {
    localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
  }, [vaults]);
  useEffect(() => {
    localStorage.setItem(ACTIVE_VAULT_KEY, String(activeVaultIndex));
  }, [activeVaultIndex]);
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  // 侧栏宽度变化后通知 Vditor 重新计算尺寸
  const notifyResize = useCallback(() => {
    requestAnimationFrame(() => {
      editorHandleRef.current?.resize();
      setTimeout(() => editorHandleRef.current?.resize(), 50);
    });
  }, []);

  useEffect(() => { notifyResize(); }, [sidebarOpen]);
  useEffect(() => { notifyResize(); }, [sidebarWidth]);

  // ── 窗口位置/大小记忆 ──
  const saveWindowStateRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const win = getCurrentWindow();

    // 保存当前窗口状态到 localStorage
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
        localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
      } catch {
        // 忽略保存错误
      }
    };
    saveWindowStateRef.current = saveWindowState;

    // 恢复保存的窗口状态
    (async () => {
      try {
        const saved = localStorage.getItem(WINDOW_STATE_KEY);
        if (!saved) return;
        const state = JSON.parse(saved) as {
          x: number; y: number; width: number; height: number; maximized: boolean;
        };

        // 验证保存的位置是否仍在可见显示器上
        const monitors = await availableMonitors();
        if (monitors && monitors.length > 0) {
          const posValid = monitors.some((m: Monitor) => {
            const { x: mx, y: my } = m.position;
            const { width: mw, height: mh } = m.size;
            // 至少窗口标题栏在显示器范围内（x 允许部分超出）
            return (
              state.x + state.width > mx + 80 &&
              state.x < mx + mw - 80 &&
              state.y + 40 > my &&
              state.y < my + mh
            );
          });
          if (!posValid) return; // 位置不在任何显示器上，使用默认
        }

        // 先设置尺寸再设置位置
        if (state.width && state.height) {
          await win.setSize(new LogicalSize(state.width, state.height));
        }
        if (state.x !== undefined && state.y !== undefined) {
          await win.setPosition(new LogicalPosition(state.x, state.y));
        }
        if (state.maximized) {
          await win.maximize();
        }
      } catch {
        // 恢复失败则使用默认值
      }
    })();

    // 监听移动/缩放事件（防抖保存）
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

  const handleChange = useCallback((value: string) => {
    setContent(value);
    setModified(value !== savedContentRef.current);
  }, []);

  // 用 ref 保存最新值，避免 Ctrl+S 回调频繁重建
  const contentRef = useRef(content);
  const fileNameRef = useRef(fileName);
  contentRef.current = content;
  fileNameRef.current = fileName;

  const handleSave = useCallback(async () => {
    try {
      let path = fileNameRef.current;
      if (!path) {
        const result = await save({
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
          defaultPath: "untitled.md",
        });
        if (!result) return;
        path = result;
        setFileName(path);
      }
      await writeTextFile(path, contentRef.current);
      savedContentRef.current = contentRef.current;
      setModified(false);
    } catch (e) {
      console.error("保存失败:", e);
    }
  }, []);

  // Ctrl+S 保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // Ctrl+O 快速打开文件
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        if (activeVaultIndex >= 0) {
          setQuickOpenOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeVaultIndex]);

  // ── Vault callbacks ──

  const handleNewVault = useCallback((path: string, name: string) => {
    setVaults((prev) => {
      if (prev.some((v) => v.path === path)) return prev;
      const newVaults = [...prev, { name, path }];
      setActiveVaultIndex(newVaults.length - 1);
      return newVaults;
    });
  }, []);

  const handleSwitchVault = useCallback((index: number) => {
    setActiveVaultIndex(index);
  }, []);

  const handleRemoveVault = useCallback((index: number) => {
    setVaults((prev) => prev.filter((_, i) => i !== index));
    setActiveVaultIndex((prev) => {
      if (prev === index) return -1;
      if (prev > index) return prev - 1;
      return prev;
    });
  }, []);

  // ── File tree callbacks ──

  const handleSelectFile = useCallback((path: string) => {
    // 判断文件类型
    const fileName = path.split(/[/\\]/).pop() || path;
    if (!isEditableFile(fileName)) {
      // 非文本文件，直接预览，同时更新 fileName 以显示选中状态
      setFileName(path);
      setPreviewFilePath(path);
      return;
    }

    // 文本文件，检查是否有未保存的修改
    if (modified && fileName) {
      setPendingFilePath(path);
      setSaveConfirmOpen(true);
    } else {
      openFile(path);
    }
  }, [modified]);

  const openFile = useCallback(async (path: string) => {
    try {
      const text = await readTextFile(path);
      savedContentRef.current = text;
      setContent(text);
      setFileName(path);
      setModified(false);
      setPreviewFilePath(null); // 关闭预览模式

      // 更新最近访问文件列表
      const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
      if (activeVault) {
        setRecentFiles((prev) => {
          const vaultPath = activeVault.path;
          const existing = prev[vaultPath] || [];
          // 移除已存在的该文件（避免重复）
          const filtered = existing.filter((p) => p !== path);
          // 将新文件添加到最前面
          const updated = [path, ...filtered].slice(0, MAX_RECENT_FILES);
          return { ...prev, [vaultPath]: updated };
        });
      }
    } catch (e) {
      console.error("打开文件失败:", e);
    }
  }, [activeVaultIndex, vaults]);

  const handleSaveConfirm = useCallback(async () => {
    setSaveConfirmOpen(false);
    if (fileName && content) {
      try {
        await writeTextFile(fileName, content);
      } catch (e) {
        console.error("自动保存失败:", e);
      }
    }
    if (pendingFilePath) {
      openFile(pendingFilePath);
      setPendingFilePath(null);
    }
  }, [fileName, content, pendingFilePath, openFile]);

  const handleSaveCancel = useCallback(() => {
    setSaveConfirmOpen(false);
    if (pendingFilePath) {
      openFile(pendingFilePath);
      setPendingFilePath(null);
    }
  }, [pendingFilePath, openFile]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

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

  const handleClose = useCallback(async () => {
    await saveWindowStateRef.current();
    getCurrentWindow().close();
  }, []);

  // 模式循环切换
  const cycleMode = useCallback(() => {
    setViewMode((prev) => {
      if (prev === "wysiwyg") return "ir";
      if (prev === "ir") return "sv";
      return "wysiwyg";
    });
  }, []);

  // ── 大纲点击跳转 ──
  const handleSelectHeading = useCallback((_level: number, text: string, _line: number) => {
    // 在 Vditor WYSIWYG 渲染区查找匹配的标题元素并滚动到它
    const editorPanel = document.querySelector(".editor-panel");
    if (!editorPanel) return;

    // 尝试 WYSIWYG 模式（标题为真实 h1-h6 元素）
    const reset = editorPanel.querySelector(".vditor-wysiwyg .vditor-reset") as HTMLElement | null;
    if (reset) {
      const headings = reset.querySelectorAll("h1, h2, h3, h4, h5, h6");
      for (const h of headings) {
        if ((h.textContent || "").trim() === text.trim()) {
          h.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
    }

    // 尝试 SV 模式（源码视图，滚动到匹配行）
    const svContainer = editorPanel.querySelector(".vditor-sv .vditor-reset") as HTMLElement | null;
    if (svContainer) {
      const lines = svContainer.querySelectorAll(".vditor-sv__line");
      for (const line of lines) {
        const lineText = (line.textContent || "").trim();
        const hashText = "#".repeat(_level) + " " + text;
        if (lineText.startsWith(hashText) || lineText === text) {
          line.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
    }
  }, []);

  // ── Refs ──

  const editorHandleRef = useRef<VditorEditorHandle>(null);
  // 用于跟踪已加载文件的内容原文，避免把"打开新文件"误判为修改
  const savedContentRef = useRef<string>(initialContent);
  const title = fileName ? fileName.split(/[/\\]/).pop() || "untitled.md" : "Tydora";

  return (
    <div className="app">
      {/* 主内容区：左侧栏 + 编辑区域 */}
      <div className="main-container">
        {/* 左侧栏 */}
        <Sidebar
          vaults={vaults}
          activeVaultIndex={activeVaultIndex}
          currentFilePath={fileName}
          content={content}
          onSelectFile={handleSelectFile}
          onSelectHeading={handleSelectHeading}
          onNewVault={handleNewVault}
          onSwitchVault={handleSwitchVault}
          onRemoveVault={handleRemoveVault}
          collapsed={!sidebarOpen}
          refreshKey={treeRefreshKey}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />

        {/* 编辑区域 */}
        <main className="editor-container">
          {/* 顶部透明栏 */}
          <div className="editor-topbar">
            <div className="editor-topbar-left">
              <button className="sidebar-toggle-btn" onClick={handleSidebarToggle} title={sidebarOpen ? "折叠侧栏" : "展开侧栏"}>
                {sidebarOpen ? "◀" : "▶"}
              </button>
              <span className="editor-file-name" title={fileName || "Tydora"}>
                {fileName && <span className="editor-file-icon">📄</span>}
                {title}
                {modified && <span className="editor-modified-dot">●</span>}
              </span>
            </div>
            <div className="window-controls">
              <button className="window-control-btn" onClick={handleMinimize} title="最小化">
                ─
              </button>
              <button className="window-control-btn" onClick={handleToggleMaximize} title="最大化">
                ▢
              </button>
              <button className="window-control-btn window-control-close" onClick={handleClose} title="关闭">
                ✕
              </button>
            </div>
          </div>

          {/* 编辑器面板 */}
          <div className="editor-panel">
            {previewFilePath ? (
              <FilePreview
                filePath={previewFilePath}
                onBack={() => setPreviewFilePath(null)}
              />
            ) : (
              <EditorErrorBoundary>
                <VditorEditor
                  ref={editorHandleRef}
                  value={content}
                  onChange={handleChange}
                  mode={viewMode}
                  theme={theme}
                />
              </EditorErrorBoundary>
            )}
          </div>

          {/* 底部栏 */}
          <div className="editor-bottombar">
            <button
              className="editor-mode-toggle"
              onClick={cycleMode}
              title={`当前: ${MODE_LABELS[viewMode]}，点击切换模式`}
            >
              {MODE_LABELS[viewMode]}
            </button>
            <span className="editor-word-count">
              {content.length} 字
            </span>
          </div>
        </main>
      </div>

      {/* 快速打开文件弹窗 */}
      {quickOpenOpen && (
        <QuickOpen
          vault={activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null}
          recentFiles={activeVaultIndex >= 0 ? recentFiles[vaults[activeVaultIndex].path] || [] : []}
          currentFilePath={fileName}
          onSelect={(path) => {
            setQuickOpenOpen(false);
            handleSelectFile(path);
          }}
          onClose={() => setQuickOpenOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={saveConfirmOpen}
        title="保存文件"
        message={`文件 "${fileName?.split(/[/\\]/).pop() || ""}" 尚未保存，是否先保存？`}
        type="warning"
        confirmText="保存"
        cancelText="不保存"
        onConfirm={handleSaveConfirm}
        onCancel={handleSaveCancel}
      />
    </div>
  );
}

export default App;
