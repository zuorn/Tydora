import { useState, useCallback, useRef, useEffect, useMemo, Component } from "react";
import { getCurrentWindow, availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import VditorEditor, { VditorEditorHandle, MODE_LABELS, EditorMode } from "./VditorEditor";
import Sidebar, { VaultInfo } from "./Sidebar";
import FilePreview from "./FilePreview";
import QuickOpen from "./QuickOpen";
import CommandPalette from "./CommandPalette";
import { useTheme } from "./themes";
import { ConfirmDialog } from "./ConfirmDialog";
import { emit } from "@tauri-apps/api/event";
import { loadImageSettings, type ImageSettings } from "./ImageManager";
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

function App({ initialFilePath }: { initialFilePath?: string | null }) {
  const { theme } = useTheme();
  const initialContent = "# 欢迎使用 Tydora ✨\n\n开始编写你的 Markdown...\n";
  const [content, setContent] = useState(initialContent);
  const [fileName, setFileName] = useState<string | null>(null);
  const [modified, setModified] = useState(false);
  const [viewMode, setViewMode] = useState<EditorMode>("ir");
  const [typewriterMode, setTypewriterMode] = useState(false);

  // 应用编辑器字体和字号设置
  useEffect(() => {
    const applySettings = () => {
      try {
        const raw = localStorage.getItem("zmd-general-settings");
        if (raw) {
          const settings = JSON.parse(raw);
          if (settings.editorFont) {
            document.documentElement.style.setProperty("--editor-font", settings.editorFont);
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
        setCommandPaletteOpen(true);
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

  // 模式循环切换
  const cycleMode = useCallback(() => {
    setViewMode((prev) => {
      if (prev === "ir") return "wysiwyg";
      if (prev === "wysiwyg") return "sv";
      return "ir";
    });
  }, []);

  // ── 大纲点击跳转 ──
  const handleSelectHeading = useCallback((_level: number, text: string, line: number) => {
    editorHandleRef.current?.scrollToHeading(text, line);
  }, []);

  // ── Refs ──

  const editorHandleRef = useRef<VditorEditorHandle>(null);
  // 用于跟踪已加载文件的内容原文，避免把"打开新文件"误判为修改
  const savedContentRef = useRef<string>(initialContent);
  const pendingLineRef = useRef<number | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
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
    { id: "toggle-mode", label: "切换编辑模式", category: "视图", action: cycleMode },
    { id: "toggle-typewriter", label: "切换打字机模式", category: "视图", shortcut: "Ctrl+Alt+T", action: toggleTypewriterMode },
    { id: "open-mindmap", label: "打开思维导图", category: "视图", action: () => {
      localStorage.setItem("zmd-mindmap-content", content);
      invoke("open_mindmap_window");
    }},

    // 编辑模式
    { id: "mode-wysiwyg", label: "切换到所见即所得模式", category: "模式", action: () => setViewMode("wysiwyg") },
    { id: "mode-ir", label: "切换到即时渲染模式", category: "模式", action: () => setViewMode("ir") },
    { id: "mode-sv", label: "切换到分屏预览模式", category: "模式", action: () => setViewMode("sv") },

    // 格式化
    { id: "bold", label: "加粗", category: "格式", shortcut: "Ctrl+B", action: () => editorHandleRef.current?.executeCommand("bold") },
    { id: "italic", label: "斜体", category: "格式", shortcut: "Ctrl+I", action: () => editorHandleRef.current?.executeCommand("italic") },
    { id: "strike", label: "删除线", category: "格式", shortcut: "Ctrl+D", action: () => editorHandleRef.current?.executeCommand("strike") },
    { id: "inline-code", label: "行内代码", category: "格式", shortcut: "Ctrl+G", action: () => editorHandleRef.current?.executeCommand("inline-code") },
    { id: "code-block", label: "代码块", category: "格式", shortcut: "Ctrl+U", action: () => editorHandleRef.current?.executeCommand("code") },
    { id: "link", label: "超链接", category: "格式", shortcut: "Ctrl+K", action: () => editorHandleRef.current?.executeCommand("link") },
    { id: "quote", label: "引用", category: "格式", shortcut: "Ctrl+;", action: () => editorHandleRef.current?.executeCommand("quote") },
    { id: "hr", label: "水平分割线", category: "格式", shortcut: "Ctrl+Shift+H", action: () => editorHandleRef.current?.executeCommand("line") },
    { id: "table", label: "表格", category: "格式", shortcut: "Ctrl+M", action: () => editorHandleRef.current?.executeCommand("table") },

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
  ], [handleSave, activeVaultIndex, fileName, handleNewWindow, handleSidebarToggle, cycleMode, handleMinimize, handleToggleMaximize, handleClose, setViewMode]);

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
                      <path d="M4 5h10M4 9h10M4 13h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M2 9l3-2.5v5L2 9z" fill="currentColor"/>
                    </>
                  ) : (
                    <>
                      <path d="M4 5h10M4 9h10M4 13h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M16 9l-3-2.5v5L16 9z" fill="currentColor"/>
                    </>
                  )}
                </svg>
              </button>
              <span className="editor-file-name" title={fileName || "Tydora"}>
                {fileName && <span className="editor-file-icon">📄</span>}
                {title}
                {modified && <span className="editor-modified-dot">●</span>}
              </span>
              {fileName && (
                <button
                  className="mindmap-open-btn"
                  title="打开思维导图"
                  onClick={() => {
                    localStorage.setItem("zmd-mindmap-content", content);
                    invoke("open_mindmap_window");
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 1024 1024" fill="currentColor">
                    <path d="M768 166.4a38.4 38.4 0 0 1 0 76.8h-102.4a268.8 268.8 0 0 0-265.984 230.4H768l3.9424 0.1536a38.4 38.4 0 0 1 0 76.4416l-3.9424 0.1536H399.616A268.8 268.8 0 0 0 665.6 780.8h80.896l3.84 0.2048a38.4 38.4 0 0 1 0 76.4416l-3.8912 0.2048H665.6a345.5488 345.5488 0 0 1-343.3984-307.2H204.8a38.4 38.4 0 0 1 0-76.8h117.4016a345.6 345.6 0 0 1 343.3984-307.2h102.4z" />
                  </svg>
                </button>
              )}
            </div>
            <div className="window-controls">
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
                <VditorEditor
                  ref={editorHandleRef}
                  value={content}
                  onChange={handleChange}
                  mode={viewMode}
                  theme={theme}
                  typewriterMode={typewriterMode}
                  imageSettings={imageSettings}
                  currentFilePath={fileName}
                  activeVaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null}
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
              className="editor-mode-toggle"
              onClick={cycleMode}
              title={`当前: ${MODE_LABELS[viewMode]}，点击切换模式`}
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
    </div>
  );
}

export default App;
