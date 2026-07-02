import { useState, useCallback, useRef, useEffect, useMemo, Component } from "react";
import { getCurrentWindow, availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { TipTapEditor as Editor, type EditorHandle, type EditorMode, MODE_LABELS } from "./Editor";
import Sidebar, { VaultInfo } from "./Sidebar";
import FilePreview from "./FilePreview";
import QuickOpen from "./QuickOpen";
import CommandPalette from "./CommandPalette";
import { useTheme } from "./themes";
import { ConfirmDialog } from "./ConfirmDialog";
import { emit, listen } from "@tauri-apps/api/event";
import { loadImageSettings, type ImageSettings } from "./ImageManager";
import { loadEditorSettings, type EditorSettings, EDITOR_SETTINGS_KEY, SHORTCUTS_KEY } from "./Settings";
import { checkForUpdate, downloadAndInstall, relaunchApp, type UpdateInfo } from "./Updater";
import { LinkIndexService } from "./LinkIndexService";
import { WikiLinkAutocomplete } from "./WikiLinkAutocomplete";
import { GraphView } from "./GraphView";
import { useVaultWatcher } from "./useVaultWatcher";
import PublishPanel from "./PublishPanel";
import "./App.css";
import "./FilePreview.css";
import "./WikiLink.css";

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

function App({ initialFilePath }: { initialFilePath?: string | null }) {
  const { theme } = useTheme();
  const initialContent = "# 欢迎使用 Tydora ✨\n\n开始编写你的 Markdown...\n";
  const [content, setContent] = useState(initialContent);
  const [fileName, setFileName] = useState<string | null>(null);
  const [modified, setModified] = useState(false);
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => loadEditorSettings());
  const [viewMode, setViewMode] = useState<EditorMode>(editorSettings.defaultMode);
  const [typewriterMode, setTypewriterMode] = useState(editorSettings.typewriterMode);
  const [wordCount, setWordCount] = useState(0);

  // 应用编辑器字体和字号设置
  useEffect(() => {
    const applySettings = () => {
      try {
        const raw = localStorage.getItem("zmd-general-settings");
        if (raw) {
          const settings = JSON.parse(raw);
          if (settings.editorFont) {
            document.documentElement.style.setProperty("--editor-font", settings.editorFont);
            // 按需加载 LXGW WenKai 字体
            if (settings.editorFont.includes("LXGW WenKai") && !document.getElementById("lxgw-wenkai-font")) {
              const link = document.createElement("link");
              link.id = "lxgw-wenkai-font";
              link.rel = "stylesheet";
              link.href = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css";
              document.head.appendChild(link);
            }
          }
          if (settings.fontSize) {
            document.documentElement.style.setProperty("--editor-font-size", settings.fontSize + "px");
          }
        }
      } catch {}
    };
    applySettings();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "zmd-general-settings") applySettings();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // 监听编辑器设置变化（设置窗口保存后实时生效）
  useEffect(() => {
    const handleEditorStorage = (e: StorageEvent) => {
      if (e.key === EDITOR_SETTINGS_KEY) {
        const newSettings = loadEditorSettings();
        setEditorSettings(newSettings);
        setViewMode(newSettings.defaultMode);
        setTypewriterMode(newSettings.typewriterMode);
      }
    };
    window.addEventListener("storage", handleEditorStorage);
    return () => window.removeEventListener("storage", handleEditorStorage);
  }, []);
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
  const [sidebarOpen, setSidebarOpen] = useState(!initialFilePath);
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

  // 图像设置状态
  const [imageSettings] = useState<ImageSettings>(() => loadImageSettings());

  // 命令面板状态
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // WikiLink 自动补全状态
  const [wikiAutocompleteVisible, setWikiAutocompleteVisible] = useState(false);
  const [wikiAutocompleteQuery, setWikiAutocompleteQuery] = useState('');
  const [wikiAutocompletePosition, setWikiAutocompletePosition] = useState<{ x: number; y: number } | null>(null);

  // 知识图谱状态
  const [graphViewOpen, setGraphViewOpen] = useState(false);

  // 发布状态
  const [publishOpen, setPublishOpen] = useState(false);

  // 更新状态
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });

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

  // 构建链接索引
  useEffect(() => {
    if (activeVaultIndex >= 0) {
      const vaultPath = vaults[activeVaultIndex]?.path;
      if (vaultPath) {
        LinkIndexService.buildIndex(vaultPath).then(() => {
          try {
            localStorage.setItem("zmd-link-index", LinkIndexService.serialize());
          } catch { /* 忽略存储错误 */ }
        });
      }
    }
  }, [activeVaultIndex, vaults]);

  // 文件监听：外部文件变化时自动更新索引
  const [, forceIndexRerender] = useState(0);
  const vaultPath = activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null;
  useVaultWatcher(vaultPath, useCallback(() => forceIndexRerender(n => n + 1), []));

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  // 启动时自动检查更新
  useEffect(() => {
    checkForUpdate().then((info) => {
      if (info) setUpdateInfo(info);
    }).catch(() => {});
  }, []);

  // 新窗口：打开指定文件
  useEffect(() => {
    if (!initialFilePath) return;
    const matchingVaultIndex = vaults.findIndex((v) =>
      initialFilePath.startsWith(v.path),
    );
    if (matchingVaultIndex >= 0) {
      setActiveVaultIndex(matchingVaultIndex);
    }
    readTextFile(initialFilePath)
      .then((text) => {
        savedContentRef.current = text;
        setContent(text);
        setFileName(initialFilePath);
        setModified(false);
      })
      .catch((e) => {
        console.error("打开文件失败:", e);
      });
  }, []);

  // 侧栏宽度变化后通知编辑器重新计算尺寸
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
    if (!(window as any).__TAURI_INTERNALS__) return;
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

  const handleUpdateDownload = useCallback(async () => {
    if (!updateInfo) return;
    setUpdateDownloading(true);
    setUpdateProgress({ downloaded: 0, total: null });
    try {
      await downloadAndInstall((downloaded, contentLength) => {
        setUpdateProgress({ downloaded, total: contentLength });
      });
      await relaunchApp();
    } catch (e) {
      console.error("更新失败:", e);
      setUpdateDownloading(false);
    }
  }, [updateInfo]);

  // Debounced mindmap sync to avoid flooding IPC on every keystroke
  const mindmapSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncMindmapContent = useCallback((value: string) => {
    if (mindmapSyncTimerRef.current) clearTimeout(mindmapSyncTimerRef.current);
    mindmapSyncTimerRef.current = setTimeout(() => {
      localStorage.setItem("zmd-mindmap-content", value);
      emit("mindmap-content-update", { content: value }).catch(() => {});
    }, 500);
  }, []);

  const handleChange = useCallback((value: string) => {
    setContent(value);
    setModified(value !== savedContentRef.current);
    // Clear search highlights when user edits
    editorHandleRef.current?.clearHighlight();
    // Sync content to mindmap window if open
    syncMindmapContent(value);
  }, [syncMindmapContent]);

  // 用 ref 保存最新值，避免 Ctrl+S 回调频繁重建
  const contentRef = useRef(content);
  const fileNameRef = useRef(fileName);
  const modifiedRef = useRef(modified);
  contentRef.current = content;
  fileNameRef.current = fileName;
  modifiedRef.current = modified;

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
      // 更新链接索引
      const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
      if (activeVault) {
        LinkIndexService.updateFileLinks(path, activeVault.path);
        try { localStorage.setItem("zmd-link-index", LinkIndexService.serialize()); } catch {}
      }
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

  // 自动保存：内容变化且有已保存的文件路径时，延迟 1 秒自动写入
  useEffect(() => {
    if (!modified || !fileNameRef.current) return;
    const timer = setTimeout(async () => {
      try {
        const raw = localStorage.getItem("zmd-general-settings");
        if (!raw) return;
        const settings = JSON.parse(raw);
        if (!settings.autoSave) return;
        const path = fileNameRef.current;
        if (!path) return;
        await writeTextFile(path, contentRef.current);
        savedContentRef.current = contentRef.current;
        setModified(false);
        // 更新链接索引
        const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
        if (activeVault) {
          LinkIndexService.updateFileLinks(path, activeVault.path);
          try { localStorage.setItem("zmd-link-index", LinkIndexService.serialize()); } catch {}
        }
      } catch (e) {
        console.error("自动保存失败:", e);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [content, modified]);

  // Ctrl+O 快速打开文件
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        if (activeVaultIndex >= 0) {
          setCommandPaletteOpen(false);
          setQuickOpenOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeVaultIndex]);

  // Ctrl+P 命令面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setQuickOpenOpen(false);
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Ctrl+G 知识图谱
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault();
        setGraphViewOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  const handleSelectFile = useCallback((path: string, line?: number, query?: string) => {
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
      pendingLineRef.current = line ?? null;
      pendingQueryRef.current = query ?? null;
      setSaveConfirmOpen(true);
    } else {
      openFile(path, line, query);
    }
  }, [modified]);

  const openFile = useCallback(async (path: string, line?: number, query?: string) => {
    try {
      const text = await readTextFile(path);
      savedContentRef.current = text;
      setContent(text);
      setFileName(path);
      setModified(false);
      setPreviewFilePath(null); // 关闭预览模式

      // 跳转到指定行并高亮搜索结果
      if (line != null || query) {
        if (query) {
          editorHandleRef.current?.highlightSearch(query);
        }
        if (line != null) {
          setTimeout(() => editorHandleRef.current?.scrollToLine(line), 350);
        }
      }

      // 跳转到指定标题
      const heading = pendingHeadingRef.current;
      if (heading) {
        pendingHeadingRef.current = null;
        setTimeout(() => editorHandleRef.current?.scrollToHeading(heading, 0), 350);
      }

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
      const line = pendingLineRef.current;
      const query = pendingQueryRef.current;
      pendingLineRef.current = null;
      pendingQueryRef.current = null;
      openFile(pendingFilePath, line ?? undefined, query ?? undefined);
      setPendingFilePath(null);
    }
  }, [fileName, content, pendingFilePath, openFile]);

  const handleSaveCancel = useCallback(() => {
    setSaveConfirmOpen(false);
    if (pendingFilePath) {
      const line = pendingLineRef.current;
      const query = pendingQueryRef.current;
      pendingLineRef.current = null;
      pendingQueryRef.current = null;
      openFile(pendingFilePath, line ?? undefined, query ?? undefined);
      setPendingFilePath(null);
    }
  }, [pendingFilePath, openFile]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleNewWindow = useCallback(async (filePath: string) => {
    try {
      const el = document.querySelector('.editor-container');
      const width = el ? el.clientWidth : 800;
      const height = el ? el.clientHeight : 600;
      await invoke("open_file_in_new_window", {
        filePath,
        width,
        height,
      });
    } catch (err) {
      console.error("打开新窗口失败:", err);
    }
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

  // Ctrl+W 关闭窗口
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        const win = getCurrentWindow();
        const label = win.label;
        if (label === "settings" || label === "mindmap") {
          win.close();
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const toggleTypewriterMode = useCallback(() => {
    setTypewriterMode((prev) => !prev);
  }, []);

  // Ctrl+Alt+T 打字机模式
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key === "t") {
        e.preventDefault();
        toggleTypewriterMode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleTypewriterMode]);

  // 模式循环切换（底部栏按钮用）
  const cycleMode = useCallback(() => {
    setViewMode((prev) => (prev === "ir" ? "sv" : "ir"));
  }, []);

  // Ctrl+/ 模式切换（ir ↔ sv）
  const toggleIrSv = useCallback(() => {
    setViewMode((prev) => (prev === "ir" ? "sv" : "ir"));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        toggleIrSv();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleIrSv]);

  // Ctrl+T 插入表格
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        editorHandleRef.current?.executeCommand("table");
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // 行内代码快捷键（从 localStorage 读取）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      let shortcutKeys = ["Ctrl", "H"];
      try {
        const saved = localStorage.getItem(SHORTCUTS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const item = parsed.find((s: { id: string }) => s.id === "inline-code");
          if (item) shortcutKeys = item.keys;
        }
      } catch {}
      const key = shortcutKeys.join("+").toLowerCase();
      const eventKey = `${e.ctrlKey || e.metaKey ? "ctrl+" : ""}${e.altKey ? "alt+" : ""}${e.shiftKey ? "shift+" : ""}${e.key.toLowerCase()}`;
      if (eventKey === key) {
        e.preventDefault();
        editorHandleRef.current?.executeCommand("inline-code");
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // Ctrl+M 打开思维导图
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        e.preventDefault();
        localStorage.setItem("zmd-mindmap-content", contentRef.current);
        invoke("open_mindmap_window");
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // 监听 wikilink 点击
  useEffect(() => {
    const handleWikiLinkClick = (e: Event) => {
      const customEvent = e as CustomEvent<{ noteName: string; heading?: string }>;
      const { noteName, heading } = customEvent.detail;

      // 查找目标文件
      const targetPath = LinkIndexService.findFileByNoteName(noteName);

      if (targetPath) {
        // 文件存在，跳转
        if (heading) {
          pendingHeadingRef.current = heading;
        }
        handleSelectFile(targetPath);
      } else {
        // 占位链接：创建新笔记
        const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
        if (activeVault) {
          const newPath = `${activeVault.path}/${noteName}.md`;
          writeTextFile(newPath, `# ${noteName}\n`).then(() => {
            LinkIndexService.updateFileLinks(newPath, activeVault.path);
            handleSelectFile(newPath);
          });
        }
      }
    };

    window.addEventListener('wiki-link-click', handleWikiLinkClick);
    return () => window.removeEventListener('wiki-link-click', handleWikiLinkClick);
  }, [activeVaultIndex, vaults, handleSelectFile]);

  // 监听其他窗口的打开文件请求（如关系图谱窗口点击节点）
  useEffect(() => {
    const unlisten = listen<{ path: string }>("open-file", (event) => {
      handleSelectFile(event.payload.path);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [handleSelectFile]);

  // 监听 wikilink 自动补全触发
  useEffect(() => {
    const handleWikiLinkTrigger = (e: Event) => {
      const customEvent = e as CustomEvent<{ query: string; position: { x: number; y: number } }>;
      const { query, position } = customEvent.detail;
      setWikiAutocompleteQuery(query);
      setWikiAutocompletePosition(position);
      setWikiAutocompleteVisible(true);
    };

    window.addEventListener('wiki-link-trigger', handleWikiLinkTrigger);
    return () => window.removeEventListener('wiki-link-trigger', handleWikiLinkTrigger);
  }, []);

  // WikiLink 自动补全选中回调
  const handleWikiAutocompleteSelect = useCallback((noteName: string) => {
    setWikiAutocompleteVisible(false);
    // 使用 Selection API 在编辑器中直接替换文本，避免 setValue 滚动到顶部
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent || '';
    const offset = range.startOffset;
    // 向前找到 [[
    const before = text.slice(0, offset);
    const lastOpen = before.lastIndexOf('[[');
    if (lastOpen < 0) return;

    // 选中从 [[ 开始到光标位置的文本
    const startNode = node;
    const startOffset = lastOpen;
    const endNode = node;
    const endOffset = offset;

    // 删除选区内容并插入完整的 [[noteName]]
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    range.deleteContents();
    range.insertNode(document.createTextNode(`[[${noteName}]]`));

    // 移动光标到插入文本之后
    range.setStartAfter(range.endContainer);
    range.setEndAfter(range.endContainer);
    sel.removeAllRanges();
    sel.addRange(range);

    // 兜底：直接通过 editorHandle 获取内容并同步 React 状态
    // 确保 content 和 modified 状态被更新
    const val = editorHandleRef.current?.getValue();
    if (val !== undefined) {
      handleChange(val);
    }
  }, [handleChange]);

  const handleWikiAutocompleteClose = useCallback(() => {
    setWikiAutocompleteVisible(false);
  }, []);

  // ── 大纲点击跳转 ──
  const handleSelectHeading = useCallback((_level: number, text: string, line: number) => {
    editorHandleRef.current?.scrollToHeading(text, line);
  }, []);

  // ── Refs ──

  const editorHandleRef = useRef<EditorHandle>(null);
  // 用于跟踪已加载文件的内容原文，避免把"打开新文件"误判为修改
  const savedContentRef = useRef<string>(initialContent);
  const pendingLineRef = useRef<number | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const pendingHeadingRef = useRef<string | null>(null);
  const title = fileName ? fileName.split(/[/\\]/).pop() || "untitled.md" : "Tydora";

  // ── 命令面板命令列表 ──
  const commands = useMemo(() => [
    // 文件操作
    { id: "save", label: "保存文件", category: "文件", shortcut: "Ctrl+S", action: handleSave },
    { id: "open", label: "打开文件", category: "文件", shortcut: "Ctrl+O", action: () => { if (activeVaultIndex >= 0) setQuickOpenOpen(true); } },
    { id: "new-window", label: "新窗口打开", category: "文件", action: () => { if (fileName) handleNewWindow(fileName); } },

    // 编辑操作
    { id: "undo", label: "撤销", category: "编辑", shortcut: "Ctrl+Z", action: () => document.execCommand("undo") },
    { id: "redo", label: "重做", category: "编辑", shortcut: "Ctrl+Y", action: () => document.execCommand("redo") },

    // 视图操作
    { id: "toggle-sidebar", label: "切换侧栏", category: "视图", shortcut: "Ctrl+B", action: handleSidebarToggle },
    { id: "toggle-mode", label: "切换编辑模式", category: "视图", shortcut: "Ctrl+/", action: cycleMode },
    { id: "toggle-typewriter", label: "切换打字机模式", category: "视图", shortcut: "Ctrl+Alt+T", action: toggleTypewriterMode },
    { id: "open-mindmap", label: "打开思维导图", category: "视图", shortcut: "Ctrl+M", action: () => {
      localStorage.setItem("zmd-mindmap-content", content);
      invoke("open_mindmap_window");
    }},
    { id: "open-graph", label: "打开知识图谱", category: "视图", action: () => setGraphViewOpen(true) },
    { id: "publish", label: "发布为网站", category: "工具", action: () => setPublishOpen(true) },

    // 编辑模式
    { id: "mode-ir", label: viewMode === "ir" ? "即时渲染模式 ✓" : "切换到即时渲染模式", category: "模式", aliases: ["ir", "即时渲染", "编辑模式"], action: () => setViewMode("ir") },
    { id: "mode-sv", label: viewMode === "sv" ? "源码模式 ✓" : "切换到源码模式", category: "模式", aliases: ["sv", "源码", "source", "编辑模式"], action: () => setViewMode("sv") },

    // 格式化
    { id: "bold", label: "加粗", category: "格式", shortcut: "Ctrl+B", action: () => editorHandleRef.current?.executeCommand("bold") },
    { id: "italic", label: "斜体", category: "格式", shortcut: "Ctrl+I", action: () => editorHandleRef.current?.executeCommand("italic") },
    { id: "strike", label: "删除线", category: "格式", shortcut: "Ctrl+D", action: () => editorHandleRef.current?.executeCommand("strike") },
    { id: "inline-code", label: "行内代码", category: "格式", shortcut: "Ctrl+G", action: () => editorHandleRef.current?.executeCommand("inline-code") },
    { id: "code-block", label: "代码块", category: "格式", shortcut: "Ctrl+U", action: () => editorHandleRef.current?.executeCommand("code") },
    { id: "link", label: "超链接", category: "格式", shortcut: "Ctrl+K", action: () => editorHandleRef.current?.executeCommand("link") },
    { id: "quote", label: "引用", category: "格式", shortcut: "Ctrl+;", action: () => editorHandleRef.current?.executeCommand("quote") },
    { id: "hr", label: "水平分割线", category: "格式", shortcut: "Ctrl+Shift+H", action: () => editorHandleRef.current?.executeCommand("line") },
    { id: "table", label: "表格", category: "格式", shortcut: "Ctrl+T", action: () => editorHandleRef.current?.executeCommand("table") },

    // 列表
    { id: "unordered-list", label: "无序列表", category: "列表", shortcut: "Ctrl+L", action: () => editorHandleRef.current?.executeCommand("list") },
    { id: "ordered-list", label: "有序列表", category: "列表", shortcut: "Ctrl+O", action: () => editorHandleRef.current?.executeCommand("ordered-list") },
    { id: "check-list", label: "任务列表", category: "列表", shortcut: "Ctrl+J", action: () => editorHandleRef.current?.executeCommand("check") },

    // 标题
    { id: "heading-1", label: "一级标题", category: "标题", shortcut: "Ctrl+Alt+1", action: () => editorHandleRef.current?.executeCommand("heading-1") },
    { id: "heading-2", label: "二级标题", category: "标题", shortcut: "Ctrl+Alt+2", action: () => editorHandleRef.current?.executeCommand("heading-2") },
    { id: "heading-3", label: "三级标题", category: "标题", shortcut: "Ctrl+Alt+3", action: () => editorHandleRef.current?.executeCommand("heading-3") },
    { id: "heading-4", label: "四级标题", category: "标题", shortcut: "Ctrl+Alt+4", action: () => editorHandleRef.current?.executeCommand("heading-4") },
    { id: "heading-5", label: "五级标题", category: "标题", shortcut: "Ctrl+Alt+5", action: () => editorHandleRef.current?.executeCommand("heading-5") },
    { id: "heading-6", label: "六级标题", category: "标题", shortcut: "Ctrl+Alt+6", action: () => editorHandleRef.current?.executeCommand("heading-6") },
    { id: "paragraph", label: "段落", category: "标题", action: () => editorHandleRef.current?.executeCommand("paragraph") },

    // 插入
    { id: "upload", label: "插入图像", category: "插入", action: () => editorHandleRef.current?.executeCommand("upload") },
    { id: "footnotes", label: "插入脚注", category: "插入", action: () => editorHandleRef.current?.executeCommand("footnotes") },
    { id: "toc", label: "插入目录", category: "插入", action: () => editorHandleRef.current?.executeCommand("toc") },
    { id: "math", label: "插入公式", category: "插入", action: () => editorHandleRef.current?.executeCommand("math") },

    // 窗口操作
    { id: "minimize", label: "最小化窗口", category: "窗口", action: handleMinimize },
    { id: "maximize", label: "最大化窗口", category: "窗口", action: handleToggleMaximize },
    { id: "close", label: "关闭窗口", category: "窗口", action: handleClose },

    // 设置
    { id: "open-settings", label: "打开设置", category: "设置", action: () => invoke("open_settings_window") },
    { id: "settings-general", label: "通用设置", category: "设置", aliases: ["通用", "general"], action: () => { localStorage.setItem("zmd-settings-initial-tab", "general"); invoke("open_settings_window"); } },
    { id: "settings-theme", label: "主题设置", category: "设置", aliases: ["主题", "theme", "颜色", "外观"], action: () => { localStorage.setItem("zmd-settings-initial-tab", "theme"); invoke("open_settings_window"); } },
    { id: "settings-shortcuts", label: "快捷键设置", category: "设置", aliases: ["快捷键", "shortcuts", "键盘"], action: () => { localStorage.setItem("zmd-settings-initial-tab", "shortcuts"); invoke("open_settings_window"); } },
    { id: "settings-editor", label: "编辑器设置", category: "设置", aliases: ["编辑器", "editor"], action: () => { localStorage.setItem("zmd-settings-initial-tab", "editor"); invoke("open_settings_window"); } },
    { id: "settings-mindmap", label: "思维导图设置", category: "设置", aliases: ["思维导图", "mindmap"], action: () => { localStorage.setItem("zmd-settings-initial-tab", "mindmap"); invoke("open_settings_window"); } },
    { id: "settings-graph", label: "关系图谱设置", category: "设置", aliases: ["图谱", "graph", "关系"], action: () => { localStorage.setItem("zmd-settings-initial-tab", "graph"); invoke("open_settings_window"); } },
    { id: "settings-image", label: "图像设置", category: "设置", aliases: ["图像", "image", "图片"], action: () => { localStorage.setItem("zmd-settings-initial-tab", "image"); invoke("open_settings_window"); } },
    { id: "settings-about", label: "关于", category: "设置", aliases: ["about", "版本"], action: () => { localStorage.setItem("zmd-settings-initial-tab", "about"); invoke("open_settings_window"); } },
  ], [handleSave, activeVaultIndex, fileName, handleNewWindow, handleSidebarToggle, cycleMode, handleMinimize, handleToggleMaximize, handleClose, setViewMode, viewMode]);

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
          onNewWindow={handleNewWindow}
          onPublish={() => setPublishOpen(true)}
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
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {sidebarOpen ? (
                    <>
                      <rect x="1.5" y="1.5" width="15" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" />
                      <rect x="2.5" y="2.5" width="5" height="13" rx="1" fill="currentColor" opacity="0.25" />
                      <line x1="7.5" y1="2.5" x2="7.5" y2="15.5" stroke="currentColor" strokeWidth="1.2" />
                    </>
                  ) : (
                    <>
                      <rect x="1.5" y="1.5" width="15" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" />
                      <line x1="7.5" y1="2.5" x2="7.5" y2="15.5" stroke="currentColor" strokeWidth="1.2" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            <span className="editor-file-name" title={fileName || "Tydora"}>
              {title}
              {modified && <span className="editor-modified-dot">●</span>}
            </span>
            {updateInfo && !updateDownloading && (
              <button className="update-btn" onClick={handleUpdateDownload} title={`有新版本 v${updateInfo.version}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>v{updateInfo.version}</span>
              </button>
            )}
            {updateDownloading && (
              <div className="update-progress">
                <div className="update-progress-text">
                  下载中...{updateProgress.total ? ` ${Math.round(updateProgress.downloaded / updateProgress.total * 100)}%` : ""}
                </div>
                {updateProgress.total && (
                  <div className="update-progress-bar">
                    <div className="update-progress-fill" style={{ width: `${Math.round(updateProgress.downloaded / updateProgress.total * 100)}%` }} />
                  </div>
                )}
              </div>
            )}
            <div className="window-controls">
              <button className="window-control-btn" title="打开思维导图" onClick={() => {
                localStorage.setItem("zmd-mindmap-content", content);
                invoke("open_mindmap_window");
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4a1 1 0 0 1 0 2h-2.7a7.4 7.4 0 0 0-7.2 6H20a1 1 0 0 1 0 2h-9.9a7.4 7.4 0 0 0 7.2 6H20a1 1 0 0 1 0 2h-2.7a9.4 9.4 0 0 1-9.2-8H4a1 1 0 0 1 0-2h4.1a9.4 9.4 0 0 1 9.2-8H20z" />
                </svg>
              </button>
              <button className="window-control-btn" title="打开关系图谱" onClick={() => invoke("open_graph_window")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="3" />
                  <circle cx="4" cy="19" r="3" />
                  <circle cx="20" cy="19" r="3" />
                  <line x1="9.5" y1="6.5" x2="5.5" y2="16.5" />
                  <line x1="14.5" y1="6.5" x2="18.5" y2="16.5" />
                  <line x1="7" y1="19" x2="17" y2="19" />
                </svg>
              </button>
              <div className="window-controls-divider" />
              <button className="window-control-btn" onClick={handleMinimize} title="最小化">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button className="window-control-btn" onClick={handleToggleMaximize} title="最大化">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <rect x="1" y="1" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button className="window-control-btn window-control-close" onClick={handleClose} title="关闭">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
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
                <Editor
                  ref={editorHandleRef}
                  value={content}
                  onChange={handleChange}
                  mode={viewMode}
                  theme={theme}
                  typewriterMode={typewriterMode}
                  editorSettings={editorSettings}
                  imageSettings={imageSettings}
                  currentFilePath={fileName}
                  activeVaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null}
                  onWordCount={setWordCount}
                />
                {/* 欢迎提示 */}
                {!fileName && content === initialContent && (
                  <div className="welcome-overlay">
                    <div className="welcome-hint">
                      <div className="welcome-hint-icon">⌨️</div>
                      <div className="welcome-hint-item">
                        <kbd>Ctrl + O</kbd> 打开文件
                      </div>
                      <div className="welcome-hint-item">
                        <kbd>Ctrl + P</kbd> 命令面板
                      </div>
                    </div>
                  </div>
                )}
              </EditorErrorBoundary>
            )}
          </div>

          {/* 底部栏 */}
          <div className="editor-bottombar">
            <button
              className="editor-mode-toggle source-mode-toggle"
              onClick={cycleMode}
              title={`当前: ${MODE_LABELS[viewMode]}，点击切换模式 (Ctrl+/)`}
            >
              {MODE_LABELS[viewMode]}
            </button>
            <button
              className={`typewriter-indicator ${typewriterMode ? 'active' : ''}`}
              onClick={toggleTypewriterMode}
              title={typewriterMode ? "打字机模式已开启，点击关闭" : "点击开启打字机模式"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 7h14v12H5z" />
                <path d="M9 4h6v3H9z" />
                <circle cx="9" cy="13" r="1" fill="currentColor" />
                <circle cx="12" cy="13" r="1" fill="currentColor" />
                <circle cx="15" cy="13" r="1" fill="currentColor" />
                <line x1="10" y1="17" x2="14" y2="17" />
              </svg>
            </button>
            <span className="editor-word-count">
              {wordCount} 字
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

      {/* 命令面板 */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />

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

      {/* WikiLink 自动补全 */}
      {wikiAutocompleteVisible && (
        <WikiLinkAutocomplete
          query={wikiAutocompleteQuery}
          position={wikiAutocompletePosition}
          onSelect={handleWikiAutocompleteSelect}
          onClose={handleWikiAutocompleteClose}
        />
      )}

      {/* 知识图谱 */}
      {graphViewOpen && (
        <GraphView
          vaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null}
          onSelectNote={handleSelectFile}
          onClose={() => setGraphViewOpen(false)}
        />
      )}

      {/* 发布面板 */}
      {publishOpen && (
        <PublishPanel
          vaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
