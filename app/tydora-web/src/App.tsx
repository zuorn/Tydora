import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, Component, Fragment, lazy, Suspense } from "react";
import { bootStart, bootEnd, bootStamp, bootSummary } from "./boot-timing";
bootStamp("App_module_imported");
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readTextFile, writeTextFile, rename, exists } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { EditorHandle, EditorMode } from "./Editor/types";
import type { CodeMirrorEditorHandle } from "./Editor/CodeMirrorEditor";
import { MODE_LABELS } from "./Editor/types";
// lazy load：TipTap/CodeMirror/Terminal 是重型组件，首次渲染不一定需要
const Editor = lazy(() => import("./Editor/TipTapEditor").then(m => ({ default: m.default })));
const CodeMirrorEditor = lazy(() => import("./Editor/CodeMirrorEditor").then(m => ({ default: m.default })));
const TerminalView = lazy(() => import("./Terminal/TerminalView").then(m => ({ default: m.TerminalView })));
import { killTerminal, unregisterTerminal } from "./Terminal/terminalApi";
import { startTerminalSettingsSync } from "./Terminal/terminal-settings";
import Sidebar, { VaultInfo } from "./Sidebar";
import { FileTreeVim, useWindowNavigation, useVim, useLeader, LeaderMenu } from "./vim";
import { collectPaneIds, findAdjacentPane } from "./vim/panes";
import type { SplitNode, PaneLeaf, SplitGroup } from "./vim/panes";
// 用 Vim HOC 包裹 Sidebar：enabled=false 时透传，零影响
const VimSidebar = FileTreeVim(Sidebar);
import { FilePreview } from "./components";
import { QuickOpen } from "./components";
import { CommandPalette } from "./components";
import { useTheme } from "./themes";
import { ConfirmDialog } from "./components";
import { buildExportArtifact, EXPORT_FORMATS, type ExportFormat, type BuiltArtifact } from "./export";
import { ExportPreviewDialog } from "./components/ExportPreviewDialog";
import { XhsPreviewPanel } from "./export/xiaohongshu";
import { emit, listen } from "@tauri-apps/api/event";
import { loadImageSettings, type ImageSettings } from "./services";
import { loadEditorSettings, type EditorSettings, EDITOR_SETTINGS_KEY, SHORTCUTS_KEY, GRAPH_SETTINGS_KEY, DEFAULT_GRAPH, type SidebarTab, type SidebarTabPlacement, sidebarTabsForSide, DEFAULT_GENERAL } from "./Settings";
import { applyFontSettings } from "./utils/systemFonts";
import { applyMenuDensity, applyEditorSpacingFromSettings, normalizeMenuDensity } from "./utils/menuDensity";
import { checkForUpdate, downloadAndInstall, relaunchApp, exitApp, isPortableVersion, type UpdateInfo } from "./services";
import { LinkIndexService } from "./wikilink";
import { WikiLinkAutocomplete } from "./wikilink";
import { WikiLinkPreview } from "./wikilink";
import { TagAutocomplete, TagIndexService } from "./tags";
import { useCanvasStore } from "./Canvas/canvas-store";
import { useVaultWatcher } from "./services";
import PublishPanel from "./publish/PublishPanel";
import PublishConfigDialog from "./publish/PublishConfigDialog";
import { CONFIG_FILE } from "./publish/PublishService";
import { buildIndexesTogether, persistIndexesToStorage, restoreIndexesFromCache } from "./services/index-builder";

// 关系图谱 / 白板仅在打开时渲染，按需加载（避免 d3、@xyflow 进入首屏 bundle）
const GraphView = lazy(() => import("./graph").then((m) => ({ default: m.GraphView })));
const EmbeddedCanvasView = lazy(async () => {
  const [{ ReactFlowProvider }, { default: CanvasView }] = await Promise.all([
    import("@xyflow/react"),
    import("./Canvas/CanvasView"),
  ]);
  return {
    default: () => (
      <ReactFlowProvider>
        <CanvasView />
      </ReactFlowProvider>
    ),
  };
});
import { BookmarkDialog, BookmarksService } from "./Bookmarks";
import FindReplaceDialog from "./components/FindReplaceDialog";
import "./App.css";
import "./components/FilePreview.css";
import "./wikilink/WikiLink.css";
import "./wikilink/WikiLinkPreview.css";
import "./tags/Tag.css";
import "./tags/TagAutocomplete.css";
import "./components/FindReplaceDialog.css";
import shortcutsConfig from "./config/shortcuts.json";
import { matchShortcut, formatShortcutDisplay, formatShortcutKey, loadShortcuts, getShortcutKeys } from "./Editor/shortcuts";
import { track, trackPageview, hasConsentChoice, isAnalyticsEnabled, setAnalyticsEnabled, ANALYTICS_EVENTS } from "./analytics";
import { ConsentDialog } from "./analytics/ConsentDialog";

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
const RIGHT_SIDEBAR_OPEN_KEY = "zmd-right-sidebar-open";
const RIGHT_SIDEBAR_WIDTH_KEY = "zmd-right-sidebar-width";
const XHS_PREVIEW_WIDTH_KEY = "zmd-xhs-preview-width";
const WINDOW_STATE_KEY = "zmd-window-state";
// 编辑窗口（顶部栏"在新窗口打开"、新窗口打开仓库）使用独立状态 key，
// 避免与主窗口互相覆盖位置/尺寸
const EDITOR_WINDOW_STATE_KEY = "zmd-editor-window-state";
const RECENT_FILES_KEY = "zmd-recent-files";
const PINNED_ITEMS_KEY = "zmd-pinned-toolbar-items";

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

// 判断文件是否为 Markdown 文件
function isMarkdownFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return ["md", "markdown", "mdx"].includes(ext);
}

// 命令面板显示快捷键：优先取 editor / app 配置，并用平台相关符号格式化（macOS：Ctrl→⌘）
function getCommandShortcut(id: string): string | undefined {
  const item = shortcutsConfig.editor.find((s) => s.id === id);
  if (item?.keys?.length) return formatShortcutDisplay(item.keys);
  const appShortcut = shortcutsConfig.app[id as keyof typeof shortcutsConfig.app];
  if (appShortcut) return formatShortcutDisplay(appShortcut);
  const display = (shortcutsConfig.commandDisplay as Record<string, string>)[id];
  if (!display) return undefined;
  // commandDisplay 是 "Ctrl+S" 字符串，拆开后再按平台格式化
  return formatShortcutDisplay(display.split("+"));
}

// ── N 窗格“共享缓冲” + 树形嵌套分屏模型 ──
// FileBuffer：一个打开文件的缓冲（内容 + 已保存快照 + 脏标记）。
// Pane：一个窗格，指向某个 bufferId；多个窗格指向同一 bufferId 即为“同文件同步”视图。
// SplitNode：布局树节点 —— 要么是编辑器叶子（leaf），要么是分屏组（group，含方向和子节点），
//            通过嵌套 group 支持混合方向的分屏（例：左右分屏中的某一边再上下分）。
interface FileBuffer {
  id: string;
  fileName: string | null;
  content: string;
  savedContent: string;
  modified: boolean;
}
interface Pane {
  id: string;
  kind: "editor" | "terminal";
  bufferId?: string;
  terminalId?: string;
  mode: EditorMode;
}
// SplitNode / PaneLeaf / SplitGroup 类型已提取到 src/vim/panes/types.ts

// 生成唯一 id（窗格 / 缓冲 / 分屏组）
const bid = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `buf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const pid = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `pane-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const gid = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `grp-${Date.now()}-${Math.random().toString(36).slice(2)}`);

// ── 布局树工具函数 ──
// 在树中查找指定 paneId 所在的叶子节点路径（父组链 + 叶子本身），返回 {path, leaf}
// path 中的每一项为 {group, childIndex}，从根到目标叶子的路径。
interface TreePathStep { group: SplitGroup; childIndex: number }
function findPaneInTree(root: SplitNode, paneId: string): { path: TreePathStep[]; leaf: PaneLeaf } | null {
  if (root.type === "leaf") return root.paneId === paneId ? { path: [], leaf: root } : null;
  const walk = (node: SplitNode, path: TreePathStep[]): { path: TreePathStep[]; leaf: PaneLeaf } | null => {
    if (node.type === "leaf") return node.paneId === paneId ? { path, leaf: node } : null;
    for (let i = 0; i < node.children.length; i++) {
      const r = walk(node.children[i], [...path, { group: node, childIndex: i }]);
      if (r) return r;
    }
    return null;
  };
  return walk(root, []);
}
// 不可变地按路径替换树中的节点（path = 从根到目标的步骤），返回新树。
function replaceNodeByPath(root: SplitNode, path: TreePathStep[], replacement: SplitNode): SplitNode {
  if (path.length === 0) return replacement;
  const cloneGroup = (g: SplitGroup): SplitGroup => ({ ...g, children: [...g.children] });
  let newRoot = root.type === "group" ? cloneGroup(root) : root;
  let parent: SplitGroup | null = null;
  let current: SplitNode = newRoot;
  for (let i = 0; i < path.length; i++) {
    if (current.type !== "group") break;
    const cloned = cloneGroup(current as SplitGroup);
    if (parent === null) newRoot = cloned;
    else parent.children[path[i - 1].childIndex] = cloned;
    parent = cloned;
    current = cloned.children[path[i].childIndex];
  }
  if (parent) parent.children[path[path.length - 1].childIndex] = replacement;
  return newRoot;
}
// 不可变地更新树中某个 group 内部的 children flexes（按 groupId 查找）。
function updateGroupFlexes(root: SplitNode, groupId: string, patch: (children: SplitNode[]) => SplitNode[]): SplitNode {
  const walk = (n: SplitNode): SplitNode => {
    if (n.type === "leaf") return n;
    if (n.groupId === groupId) return { ...n, children: patch([...n.children]) };
    return { ...n, children: n.children.map(walk) };
  };
  return walk(root);
}
// 在树中找到包含指定 paneId 的 group 链，返回直接父组（如果是嵌套）；用于按钮 active 高亮判断。
function getImmediateParentGroupDir(root: SplitNode, paneId: string): "none" | "lr" | "tb" {
  const r = findPaneInTree(root, paneId);
  if (!r || r.path.length === 0) return "none";
  return r.path[r.path.length - 1].group.dir;
}
// collectPaneIds 已提取到 src/vim/panes/PaneNavigator.ts
// 删除叶子节点并"压缩"只剩 1 个孩子的空组（把唯一孩子上提）。返回 {root, removed, adjacentPaneId}
// adjacentPaneId 用于激活窗格切换：删除后让相邻的窗格获得焦点。
function removePaneAndCollapse(root: SplitNode, paneId: string): { root: SplitNode; removed: boolean; adjacentPaneId: string | null } {
  let adjacent: string | null = null;
  const walk = (n: SplitNode): SplitNode | null => {
    if (n.type === "leaf") return n.paneId === paneId ? null : n;
    const newChildren: SplitNode[] = [];
    let removedIdx = -1;
    for (let i = 0; i < n.children.length; i++) {
      const beforeLen = newChildren.length;
      const c = walk(n.children[i]);
      if (c !== null) newChildren.push(c);
      if (c === null && beforeLen === newChildren.length) removedIdx = i;
    }
    if (removedIdx >= 0) {
      // 找相邻 paneId：优先同级右侧，再同级左侧
      if (removedIdx < n.children.length) {
        const right = n.children[removedIdx];
        if (right && right.type === "leaf") adjacent = right.paneId;
      }
      if (!adjacent && removedIdx - 1 >= 0) {
        const left = n.children[removedIdx - 1];
        if (left && left.type === "leaf") adjacent = left.paneId;
      }
      // 如果上层没找到，递归到 newChildren 中的某个邻居（上提后跨层级相邻，无需额外处理）
    }
    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) {
      // 压缩：单孩子上提，但需要继承被折叠组在其父级槽位上的 flex 比例
      const only = newChildren[0];
      return { ...only, flex: n.flex ?? only.flex };
    }
    return { ...n, children: newChildren };
  };
  const newRoot = walk(root);
  if (newRoot === null) return { root, removed: false, adjacentPaneId: null };
  // 如果没找到该 pane（没删除），保持原 root 不变并报告 removed=false
  const beforeIds = collectPaneIds(root);
  const afterIds = collectPaneIds(newRoot);
  const removed = beforeIds.length !== afterIds.length;
  if (!removed) return { root, removed: false, adjacentPaneId: null };
  // adjacent 为空时：降级取 afterIds 第一个作为邻居（极端兜底：根就是叶子）
  if (!adjacent && newRoot.type === "leaf") adjacent = newRoot.paneId;
  return { root: newRoot, removed: true, adjacentPaneId: adjacent };
}

function App({ initialFilePath, initialVaultPath }: { initialFilePath?: string | null; initialVaultPath?: string | null }) {
  bootStart("App_body_to_first_effect");
  bootStamp("App_component_render_enter");

  // 启动早期的快速判断："是否有外部待打开文件（双击 .md 冷启动）"。
  // Rust 的 has_pending_files 仅判断队列是否为空（<5ms），远快于完整的 take_pending_files。
  // 用它来决定首渲染时要不要显示欢迎卡片：
  //   null  = 快查还没回来 → 先显示纯白（不闪现欢迎卡片，避免双击文件时"先欢迎再跳到编辑器"）
  //   true  = 有文件 → 继续保持纯白，直到文件打开完毕
  //   false = 没有文件 → 显示欢迎卡片
  // initialFilePath 是 URL 传入（editor 新窗口），同步已知有文件，直接跳过欢迎。
  const pendingFilesCheckRef = useRef<Promise<boolean> | null>(null);
  if (!initialFilePath && !pendingFilesCheckRef.current && typeof (window as any).__TAURI_INTERNALS__ !== "undefined") {
    pendingFilesCheckRef.current = invoke<boolean>("has_pending_files").catch(() => false);
  }
  const [hasPendingFileResult, setHasPendingFileResult] = useState<boolean | null>(
    initialFilePath ? true : null
  );
  // 第一个 effect：等快查结果返回。useLayoutEffect 早于 paint，但 Promise 本身还是异步。
  // 即便如此，由于首渲染时 state=null 也不显示欢迎，用户不会看到欢迎卡片。
  useLayoutEffect(() => {
    if (initialFilePath) return;
    if (!pendingFilesCheckRef.current) {
      setHasPendingFileResult(false);
      return;
    }
    pendingFilesCheckRef.current.then((v) => setHasPendingFileResult(v));
  }, [initialFilePath]);

  const { theme } = useTheme();
  const { t } = useTranslation();
  // Vim 上下文：用于在全局快捷键（Ctrl+E / Ctrl+H / Ctrl+F / Ctrl+W 等）中判断是否需要让渡给 vim 模态
  const { enabled: vimEnabled, mode: vimMode, conflictKeys: vimConflictKeys, leaderKey: vimLeaderKey, menuTimeout: vimMenuTimeout } = useVim();
  // useRef 存 vim 状态，给 window 级 keydown listener 读取（避免频繁重新注册 listener）
  const vimStateRef = useRef({ enabled: false, mode: "normal" as "normal" | "insert" | "visual", conflictKeys: {} as Record<string, boolean> });
  vimStateRef.current.enabled = vimEnabled;
  vimStateRef.current.mode = vimMode;
  vimStateRef.current.conflictKeys = vimConflictKeys;

  // App 级 Leader 菜单：为欢迎面板/无编辑器场景提供 Leader 菜单支持（TipTapEditor/CodeMirrorEditor 内部各有一套）
  const appLeaderDispatch = (action: string): boolean => {
    if (action.startsWith("app.")) {
      window.dispatchEvent(new CustomEvent("vim-app-action", {
        detail: { action: action.slice("app.".length) },
      }));
      return true;
    }
    return false;
  };
  // appLeader 的声明位置：在 isActiveTerminal/isCurrentFileMarkdown/fileName 之后（见下方）
  /**
   * 在 Vim 开启且当前 vim 模态不是 insert 时，若焦点在编辑器（ProseMirror/CodeMirror）内
   * 或在 vim 管理的富文本节点内，让快捷键让渡给 vim 扩展。
   * 返回 true 表示当前 handler 应该直接退出，不要处理快捷键。
   *
   * 冲突快捷键例外：如果用户在设置中关闭了某个冲突键的让渡（conflictKeys[id] === false），
   * 则该键不接管，App 快捷键照常生效。
   */
  const vimShouldTakeOver = useCallback((e: KeyboardEvent): boolean => {
    if (!vimStateRef.current.enabled) return false;
    if (vimStateRef.current.mode === "insert") return false;
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    // 输入框：不接管（vim 不在这些地方运行）
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return false;
    // 编辑器（ProseMirror cm-editor / CodeMirror .cm-editor / vim-prose 标记 / TipTap .tiptap-editor）
    if (
      target.closest(".cm-editor") ||
      target.closest('[data-pm-focus="true"]') ||
      target.closest(".ProseMirror") ||
      target.closest(".tiptap-editor") ||
      target.closest("[data-vim-mode]")
    ) {
      // 检查冲突键配置：如果用户关闭了该键的让渡，返回 false（App 快捷键生效）
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        const keyId = `ctrl+${e.key.toLowerCase()}`;
        if (keyId in vimStateRef.current.conflictKeys && vimStateRef.current.conflictKeys[keyId] === false) {
          return false;
        }
      }
      return true;
    }
    return false;
  }, []);
  const [saveStatus, setSaveStatus] = useState<"idle" | "modified" | "saved">("idle");
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => loadEditorSettings());
  // ── N 窗格共享缓冲 + 树形嵌套布局 ──
  const initialPaneId = pid();
  const [buffers, setBuffers] = useState<FileBuffer[]>(() => [{ id: bid(), fileName: null, content: "", savedContent: "", modified: false }]);
  const [panes, setPanes] = useState<Pane[]>(() => [{ id: initialPaneId, kind: "editor", bufferId: buffers[0].id, mode: editorSettings.defaultMode }]);
  // 终端会话登记表：terminalId -> { cwd }。PTY 实际由 Rust 端 TerminalManager 持有，
  // 这里仅记录前端需要的信息（工作目录），并在关闭面板且无其他引用时清理条目。
  const [terminals, setTerminals] = useState<Record<string, { id: string; cwd: string }>>({});
  const [activePaneId, setActivePaneId] = useState<string>(() => initialPaneId);
  // 布局树根节点：单窗格时就是一个 PaneLeaf，分屏时会嵌套 SplitGroup
  const [splitLayout, setSplitLayout] = useState<SplitNode>(() => ({ type: "leaf", paneId: initialPaneId, flex: 1 }));
  // 拖拽分割线时临时关闭文本选择
  const [splitResizing, setSplitResizing] = useState(false);

  // 派生：当前激活窗格与其缓冲。content/fileName/modified 保持原名（派生常量），
  // 供所有既有读取点（字数、大纲、链接索引、标题、查找替换、导出等）继续使用。
  // 加兜底空对象，避免极端情况下 panes/buffers 临时为空导致读取 .content/.id 等 undefined 崩溃
  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0] ?? ({ id: initialPaneId, kind: "editor", bufferId: "", mode: editorSettings.defaultMode } as Pane);
  // 当前激活窗格是否为终端（用于隐藏/禁用编辑器专属 UI、放宽分屏守卫等）
  const isActiveTerminal = activePane.kind === "terminal";
  // 布局中是否存在终端窗格：存在时强制走分屏树渲染分支，
  // 避免“仅有终端、无 md 缓冲”时落入欢迎页或 CodeMirrorEditor 兜底。
  const layoutHasTerminal = panes.some((p) => p.kind === "terminal");
  const activeBuffer = buffers.find((b) => b.id === activePane.bufferId) ?? buffers[0] ?? ({ id: "", fileName: null, content: "", savedContent: "", modified: false } as FileBuffer);
  const content = activeBuffer.content;
  const fileName = activeBuffer.fileName;
  const modified = activeBuffer.modified;
  const viewMode: EditorMode = activePane.mode ?? editorSettings.defaultMode;
  const effectiveMode: EditorMode = viewMode;

  // 同步 ref（供在挂载时注册的回调 / 空依赖回调读取最新激活窗格 / 缓冲）
  const activeBufferIdRef = useRef(activeBuffer.id);
  activeBufferIdRef.current = activeBuffer.id;
  const activePaneIdRef = useRef(activePane.id);
  activePaneIdRef.current = activePane.id;
  const buffersRef = useRef(buffers);
  buffersRef.current = buffers;
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;
  const splitLayoutRef = useRef(splitLayout);
  splitLayoutRef.current = splitLayout;
  // 每个分屏组对应的外层 DOM（用于该组内部拖拽计算尺寸）；key = groupId
  const splitGroupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // 每个窗格的编辑器手柄；editorHandleRef 始终指向当前激活窗格的手柄
  const paneHandlesRef = useRef<Record<string, EditorHandle | null>>({});
  const editorHandleRef = useRef<EditorHandle>(null);

  // 更新指定缓冲（patch 可为对象或基于旧值的函数）
  const updateBuffer = useCallback((id: string, patch: Partial<FileBuffer> | ((b: FileBuffer) => Partial<FileBuffer>)) => {
    setBuffers((bs) => bs.map((b) => (b.id === id ? { ...b, ...(typeof patch === "function" ? patch(b) : patch) } : b)));
  }, []);
  // 以下 setter 为兼容包装：操作激活窗格的缓冲，使既有调用点无需改动
  const setContent = useCallback((v: string) => updateBuffer(activeBufferIdRef.current, { content: v }), [updateBuffer]);
  const setFileName = useCallback((v: string | null) => updateBuffer(activeBufferIdRef.current, { fileName: v }), [updateBuffer]);
  const setModified = useCallback((v: boolean) => updateBuffer(activeBufferIdRef.current, { modified: v }), [updateBuffer]);
  // 切换激活窗格的编辑模式（per-pane mode 存于 pane.mode）
  const setViewMode = useCallback((m: EditorMode) => setPanes((ps) => ps.map((p) => (p.id === activePaneIdRef.current ? { ...p, mode: m } : p))), []);
  // 合并读取：此前 7 个 useState 各自独立 localStorage.getItem + JSON.parse 同一个 key，
  // 现在只读一次、解析一次，复用于全部 useState 初始化。
  const generalSettingsRead = useRef(false);
  const generalSettingsRef = useRef<Record<string, any>>({});
  if (!generalSettingsRead.current) {
    generalSettingsRead.current = true;
    try {
      const raw = localStorage.getItem("zmd-general-settings");
      generalSettingsRef.current = raw ? JSON.parse(raw) : {};
    } catch { /* ignore */ }
  }
  const s = generalSettingsRef.current;
  const [typewriterMode, setTypewriterMode] = useState(() => s.typewriterMode ?? false);
  const [previewMaxWidth, setPreviewMaxWidth] = useState(() => s.previewMaxWidth ?? 800);
  const [lineHeight, setLineHeight] = useState(() => s.lineHeight ?? 1.6);
  const [paragraphSpacing, setParagraphSpacing] = useState(() =>
    typeof s.paragraphSpacing === "number" ? s.paragraphSpacing : 0.5,
  );
  const [codeLineHeight, setCodeLineHeight] = useState(() =>
    typeof s.codeLineHeight === "number" ? s.codeLineHeight : 1.5,
  );
  const [irLineNumbers, setIrLineNumbers] = useState(() => s.irLineNumbers ?? true);
  // 双击 .md 文件外部打开时，是否展开侧栏并自动切换到大纲视图（默认开启）
  const [expandOutlineOnOpen, setExpandOutlineOnOpen] = useState(() => s.expandOutlineOnOpen ?? true);
  // 传递给 Sidebar 的"切到大纲"触发器（每次自增促使 Sidebar 切 tab）
  const [outlineTrigger, setOutlineTrigger] = useState(0);
  // Ctrl+滚轮调整字号时的右上角提示（停止滚动 1.5s 后自动消失）
  const [fontSizeToast, setFontSizeToast] = useState<number | null>(null);
  const fontSizeToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [isCurrentFileMarkdown, setIsCurrentFileMarkdown] = useState(true);

  // App 级 Leader 菜单：仅在激活窗格不是编辑器（终端/欢迎面板）时生效，
  // 避免与 TipTap/CodeMirror 内部的 Leader 重复触发（导致 app.* 动作被派发两次互相抵消）
  const appLeader = useLeader({
    enabled: vimEnabled,
    triggerKey: vimLeaderKey,
    timeout: vimMenuTimeout,
    active: vimMode !== "insert" && (isActiveTerminal || !isCurrentFileMarkdown || !fileName),
    dispatchAction: appLeaderDispatch,
  });
  const codeMirrorRef = useRef<CodeMirrorEditorHandle>(null);

  // 匿名统计：首次启动弹窗征得同意后才会上报（未选择前不发送任何数据）
  const [consentVisible, setConsentVisible] = useState<boolean>(() => !hasConsentChoice());

  // 启动埋点：App 组件进入第一个 useEffect = React 完成首次 commit 后
  useEffect(() => {
    bootStamp("App_first_useEffect_fired");
    bootEnd("App_body_to_first_effect");
  }, []);

  // 用户已同意时，上报应用启动事件（仅统计使用情况，不含文件路径/内容等任何数据）
  useEffect(() => {
    if (!consentVisible && isAnalyticsEnabled()) {
      track(ANALYTICS_EVENTS.LAUNCH, {
        language: navigator.language,
      });
      trackPageview("/app/launch");
    }
  }, [consentVisible]);

  // 启动终端设置跨窗口同步：设置窗口修改配色/字体/字号后，主窗口已挂载终端实时热更新。
  useEffect(() => {
    startTerminalSettingsSync();
  }, []);

  const handleConsentDecision = useCallback((granted: boolean) => {
    setAnalyticsEnabled(granted);
    setConsentVisible(false);
  }, []);

  // 书签弹窗状态
  const [bookmarkDialogState, setBookmarkDialogState] = useState<{
    isOpen: boolean;
    filePath: string;
    fileName: string;
    isDirectory: boolean;
  }>({ isOpen: false, filePath: "", fileName: "", isDirectory: false });

  const handleShowBookmarkDialog = useCallback((filePath: string, isDirectory: boolean) => {
    const name = filePath.split(/[/\\]/).pop() || filePath;
    setBookmarkDialogState({ isOpen: true, filePath, fileName: name, isDirectory });
  }, []);

  // 应用编辑器字体和字号设置
  useEffect(() => {
    const applySettings = () => {
      try {
        const raw = localStorage.getItem("zmd-general-settings");
        const settings = raw ? JSON.parse(raw) : {};
        applyFontSettings({
          editorFont: settings.editorFont ?? "system",
          codeFont: settings.codeFont ?? "system",
          codeFontSize:
            typeof settings.codeFontSize === "number" ? settings.codeFontSize : 14,
        });
        if (settings.fontSize) {
          document.documentElement.style.setProperty("--editor-font-size", settings.fontSize + "px");
        }
        if (typeof settings.autoHideTopbar === 'boolean') {
          setAutoHideTopbar(settings.autoHideTopbar);
        }
        if (typeof settings.autoHideTopbarOnCollapse === 'boolean') {
          setAutoHideTopbarOnCollapse(settings.autoHideTopbarOnCollapse);
        }
        if (typeof settings.typewriterMode === 'boolean') {
          setTypewriterMode(settings.typewriterMode);
        }
        if (typeof settings.previewMaxWidth === 'number') {
          setPreviewMaxWidth(settings.previewMaxWidth);
        }
        if (typeof settings.lineHeight === 'number') {
          setLineHeight(settings.lineHeight);
        }
        if (typeof settings.paragraphSpacing === "number") {
          setParagraphSpacing(Math.min(2, Math.max(0, settings.paragraphSpacing)));
        }
        if (typeof settings.codeLineHeight === "number") {
          setCodeLineHeight(Math.min(2.4, Math.max(1.2, settings.codeLineHeight)));
        }
        applyEditorSpacingFromSettings(settings);
        if (typeof settings.irLineNumbers === 'boolean') {
          setIrLineNumbers(settings.irLineNumbers);
        }
        if (typeof settings.expandOutlineOnOpen === 'boolean') {
          setExpandOutlineOnOpen(settings.expandOutlineOnOpen);
        }
        document.documentElement.dataset.codeBlockToolbar =
          settings.codeBlockToolbarStyle === "classic" ? "classic" : "minimal";
        applyMenuDensity(normalizeMenuDensity(settings.menuDensity));
        // 侧栏 tab 分配变更后实时重算左/右栏可见 tab
        const placementSrc = settings.sidebarTabPlacement ?? {};
        const base = { ...DEFAULT_GENERAL.sidebarTabPlacement };
        for (const tab of (["files","search","outline","bookmarks"] as SidebarTab[])) {
          const v = placementSrc[tab];
          if (v === "left" || v === "right") base[tab] = v;
        }
        setSidebarTabPlacement(base);
      } catch {}
    };
    applySettings();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "zmd-general-settings") applySettings();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // 统一的字号提示气泡（编辑器 Ctrl+滚轮 与 终端 Ctrl+滚轮 共用）：
  // 更新右上角显示并在停止滚动 1.5s 后自动消失。
  const showFontSizeToast = (size: number) => {
    setFontSizeToast(size);
    if (fontSizeToastTimerRef.current) clearTimeout(fontSizeToastTimerRef.current);
    fontSizeToastTimerRef.current = setTimeout(() => setFontSizeToast(null), 1500);
  };

  // Ctrl + 滚轮：在编辑区调整字号（范围与设置面板一致 10-24px，持久化到 zmd-general-settings）
  useEffect(() => {
    // 收集事件目标到 .editor-container 之间所有可滚动祖先的当前位置
    const collectScrollLocks = (target: HTMLElement | null) => {
      const locks: { el: HTMLElement; top: number; left: number; height: number }[] = [];
      let el: HTMLElement | null = target;
      while (el) {
        if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
          locks.push({
            el,
            top: el.scrollTop,
            left: el.scrollLeft,
            height: el.scrollHeight,
          });
        }
        if (el.classList.contains("editor-container")) break;
        el = el.parentElement;
      }
      return locks;
    };

    const restoreScrollLocks = (
      locks: { el: HTMLElement; top: number; left: number; height: number }[],
      proportional: boolean,
    ) => {
      for (const lock of locks) {
        if (proportional && lock.height > 0) {
          const ratio = lock.top / lock.height;
          lock.el.scrollTop = ratio * lock.el.scrollHeight;
        } else {
          lock.el.scrollTop = lock.top;
        }
        lock.el.scrollLeft = lock.left;
      }
    };

    // 挂在 document 捕获阶段，确保先于 React Flow / 编辑器滚动处理；
    // 字号变更后还会按比例恢复 scrollTop，避免重排造成“还在滚动”的观感。
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.altKey || e.shiftKey) return;
      const targetEl = e.target as HTMLElement | null;
      if (!targetEl) return;
      const editorRoot = targetEl.closest(".editor-container");
      if (!editorRoot) return;
      if (targetEl.closest(".terminal-pane")) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const locks = collectScrollLocks(targetEl);
      // 冻结 React Flow 视口（画布缩放用 transform，不是 scrollTop）
      const rfViewport = editorRoot.querySelector(".react-flow__viewport") as HTMLElement | null;
      const rfTransform = rfViewport?.style.transform ?? null;

      const dir = e.deltaY < 0 ? 1 : -1; // 向上滚动放大，向下滚动缩小
      let changed = false;
      try {
        const raw = localStorage.getItem("zmd-general-settings");
        const settings = raw ? JSON.parse(raw) : {};
        const current = typeof settings.fontSize === "number" ? settings.fontSize : 16;
        const currentMono =
          typeof settings.codeFontSize === "number" ? settings.codeFontSize : 14;
        const next = Math.min(24, Math.max(10, Math.round(current) + dir));
        const nextMono = Math.min(24, Math.max(10, Math.round(currentMono) + dir));
        if (next !== current || nextMono !== currentMono) {
          settings.fontSize = next;
          settings.codeFontSize = nextMono;
          localStorage.setItem("zmd-general-settings", JSON.stringify(settings));
          document.documentElement.style.setProperty("--editor-font-size", next + "px");
          document.documentElement.style.setProperty("--font-mono-size", nextMono + "px");
          showFontSizeToast(next);
          changed = true;
        }
      } catch {}

      // 先立刻锁回原位置，阻止本轮滚轮改动 scrollTop / 画布 transform
      restoreScrollLocks(locks, false);
      if (rfViewport && rfTransform != null) {
        rfViewport.style.transform = rfTransform;
      }

      // 字号变更引发重排后，按文档比例恢复，避免内容“跳着滚”
      if (changed) {
        requestAnimationFrame(() => {
          restoreScrollLocks(locks, true);
          if (rfViewport && rfTransform != null) {
            rfViewport.style.transform = rfTransform;
          }
        });
      }
    };

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  // 卸载时清理字号提示的自动消失定时器
  useEffect(() => {
    return () => {
      if (fontSizeToastTimerRef.current) clearTimeout(fontSizeToastTimerRef.current);
    };
  }, []);

  // 滚动条自动隐藏：滚动时立即显示，停止滚动 400ms 后快速隐藏
  // 将 data-scrolling 设置在具体的滚动容器上，避免侧栏和编辑器滚动条互相干扰
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let currentTarget: HTMLElement | null = null;

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      // 如果滚动目标变了，清除旧目标的属性
      if (currentTarget && currentTarget !== target) {
        currentTarget.removeAttribute('data-scrolling');
      }
      currentTarget = target;
      target.setAttribute('data-scrolling', '');
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (currentTarget) {
          currentTarget.removeAttribute('data-scrolling');
          currentTarget = null;
        }
      }, 400);
    };
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
      clearTimeout(timer);
    };
  }, []);

  // 监听编辑器设置变化（设置窗口保存后实时生效）
  useEffect(() => {
    const handleEditorStorage = (e: StorageEvent) => {
      if (e.key === EDITOR_SETTINGS_KEY) {
        const newSettings = loadEditorSettings();
        setEditorSettings(newSettings);
        setViewMode(newSettings.defaultMode);
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
  // 外部启动（双击 .md 文件）解析状态：settled = 外部文件二次拉取兜底已完成，
  // 可以最终决定主窗口可见性（避免竞态提前关闭）
  const [externalLaunchSettled, setExternalLaunchSettled] = useState(false);
  const [hasExternalFile, setHasExternalFile] = useState(false);
  const [autoHideTopbar, setAutoHideTopbar] = useState(() => s.autoHideTopbar ?? true);
  const [autoHideTopbarOnCollapse, setAutoHideTopbarOnCollapse] = useState(() => s.autoHideTopbarOnCollapse ?? true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      return saved ? parseInt(saved) : 260;
    } catch {
      return 260;
    }
  });
  // 右侧栏：默认折叠，宽度独立持久化（与左栏解耦）
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RIGHT_SIDEBAR_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY);
      return saved ? parseInt(saved) : 260;
    } catch {
      return 260;
    }
  });
  // 侧栏 tab 分配（与通用设置 zmd-general-settings 同步）
  const [sidebarTabPlacement, setSidebarTabPlacement] = useState<SidebarTabPlacement>(() => {
    try {
      const raw = localStorage.getItem("zmd-general-settings");
      if (!raw) return DEFAULT_GENERAL.sidebarTabPlacement;
      const parsed = JSON.parse(raw);
      const base = { ...DEFAULT_GENERAL.sidebarTabPlacement };
      const src = parsed?.sidebarTabPlacement ?? {};
      for (const tab of (["files","search","outline","bookmarks"] as SidebarTab[])) {
        const v = src[tab];
        if (v === "left" || v === "right") base[tab] = v;
      }
      return base;
    } catch {
      return DEFAULT_GENERAL.sidebarTabPlacement;
    }
  });
  const leftTabs = useMemo<SidebarTab[]>(
    () => sidebarTabsForSide(sidebarTabPlacement, "left"),
    [sidebarTabPlacement],
  );
  const rightTabs = useMemo<SidebarTab[]>(
    () => sidebarTabsForSide(sidebarTabPlacement, "right"),
    [sidebarTabPlacement],
  );

  // 右侧栏 tab 全部移走时，自动关闭右侧栏（否则按钮隐藏但侧栏还显示）
  useEffect(() => {
    if (rightTabs.length === 0 && rightSidebarOpen) {
      setRightSidebarOpen(false);
    }
  }, [rightTabs, rightSidebarOpen]);

  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  // 关闭窗口前的未保存确认
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const closeConfirmOpenRef = useRef(false); // 确认框是否已打开（防止重复弹出）
  const closeAllowRef = useRef(false); // 用户已确认关闭，允许窗口真正关闭
  // 预览模式状态
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);

  // 白板文件路径（在主区域显示白板时设置）
  const [canvasFilePath, setCanvasFilePath] = useState<string | null>(null);

  // 统计：进入白板视图（主窗口内嵌模式；仅 null → 有值 的转换，切换画布文件不重复上报）
  const prevCanvasPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (canvasFilePath && !prevCanvasPathRef.current) {
      track(ANALYTICS_EVENTS.CANVAS_OPEN);
      trackPageview("/app/canvas");
    }
    prevCanvasPathRef.current = canvasFilePath;
  }, [canvasFilePath]);

  // 加载白板文件并同步保存状态到顶部红绿灯
  useEffect(() => {
    if (!canvasFilePath) return;
    const vault = activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path ?? "" : "";
    useCanvasStore.getState().loadCanvas(canvasFilePath, vault);
    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (state.isModified !== prevState.isModified) {
        setSaveStatus(state.isModified ? "modified" : "saved");
      }
    });
    return unsub;
  }, [canvasFilePath, activeVaultIndex, vaults]);

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
  const wikiTriggerEditorPosRef = useRef<number | null>(null);

  // Tag 自动补全状态
  const [tagAutocompleteVisible, setTagAutocompleteVisible] = useState(false);
  const [tagAutocompleteQuery, setTagAutocompleteQuery] = useState('');
  const [tagAutocompletePosition, setTagAutocompletePosition] = useState<{ x: number; y: number } | null>(null);
  const tagTriggerEditorPosRef = useRef<number | null>(null);

  // WikiLink 悬停预览状态（栈，支持嵌套预览）
  const [wikiPreviewStack, setWikiPreviewStack] = useState<Array<{
    noteName: string;
    heading: string | null;
    anchorRect: DOMRect;
    depth: number;
  }>>([]);
  const wikiPreviewDepthRef = useRef(-1);
  const wikiShowTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const wikiHideTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // 当前待显示的预览（鼠标停留延迟未到时），用于鼠标提前离开时取消
  const pendingShowRef = useRef<{ depth: number; timer: ReturnType<typeof setTimeout> } | null>(null);

  // 知识图谱状态
  const [graphViewOpen, setGraphViewOpen] = useState(false);

  // 统计：打开关系图谱（主窗口内嵌模式；新窗口模式由 GraphWindow 上报）
  useEffect(() => {
    if (graphViewOpen) {
      track(ANALYTICS_EVENTS.GRAPH_OPEN);
      trackPageview("/app/graph");
    }
  }, [graphViewOpen]);

  // 发布状态
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishConfigOpen, setPublishConfigOpen] = useState(false);

  // 更新状态
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });

  // 文件导航历史（前进/后退）
  const [fileHistory, setFileHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [showExportFormatPicker, setShowExportFormatPicker] = useState(false);
  const [exportPreview, setExportPreview] = useState<{ format: ExportFormat; artifact: BuiltArtifact } | null>(null);
  const [findReplaceDialogMode, setFindReplaceDialogMode] = useState<"find" | "replace" | null>(null);

  // 小红书图文导出分栏
  const [xhsPreviewOpen, setXhsPreviewOpen] = useState(false);
  const [xhsPreviewWidth, setXhsPreviewWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(XHS_PREVIEW_WIDTH_KEY);
      return saved ? parseInt(saved) : 440;
    } catch {
      return 440;
    }
  });

  // 顶部栏固定项（思维导图、关系图谱、导出）
  const [pinnedItems, setPinnedItems] = useState<{ back: boolean; forward: boolean; mindmap: boolean; graph: boolean; export: boolean; splitLr: boolean; splitTb: boolean }>(() => {
    try {
      const saved = localStorage.getItem(PINNED_ITEMS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { back: !!parsed.back, forward: !!parsed.forward, mindmap: !!parsed.mindmap, graph: !!parsed.graph, export: !!parsed.export, splitLr: !!parsed.splitLr, splitTb: !!parsed.splitTb };
      }
    } catch {
      // ignore
    }
    return { back: false, forward: false, mindmap: false, graph: false, export: false, splitLr: false, splitTb: false };
  });

  // Persist pinned items
  useEffect(() => {
    localStorage.setItem(PINNED_ITEMS_KEY, JSON.stringify(pinnedItems));
  }, [pinnedItems]);

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

  // 关闭"更多"菜单（点击外部）
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
        setShowExportFormatPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreMenuOpen]);

  // Persist vaults
  useEffect(() => {
    localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
  }, [vaults]);
  useEffect(() => {
    localStorage.setItem(ACTIVE_VAULT_KEY, String(activeVaultIndex));
  }, [activeVaultIndex]);

  // 监听管理仓库窗口的变更事件（实时同步）
  useEffect(() => {
    const unlisten = listen<{ vaults: VaultInfo[]; activeIndex: number }>("vaults-changed", (event) => {
      setVaults(event.payload.vaults);
      setActiveVaultIndex(event.payload.activeIndex);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // 根据 initialVaultPath 设置活动仓库
  useEffect(() => {
    if (initialVaultPath && vaults.length > 0) {
      // 标准化路径：去除尾部斜杠，保证跨窗口路径比对可靠
      const normalize = (p: string) => p.replace(/[\\/]+$/, "");
      const target = normalize(initialVaultPath);
      const index = vaults.findIndex(v => normalize(v.path) === target);
      if (index >= 0 && index !== activeVaultIndex) {
        setActiveVaultIndex(index);
      }
    }
  }, [initialVaultPath, vaults]); // eslint-disable-line react-hooks/exhaustive-deps

  // 启动时窗口可见性策略（秒开版）：
  // - 目标：用户点击 exe → 尽可能早看到主窗口（Rust 端 visible=true 已保证创建即显示）
  // - 正常路径（有仓库 / 双击 .md 打开文件）：始终显示主窗口，不做跨窗口跳转
  // - 无仓库且无外部文件：先立即显示主窗口（不阻塞），等 pending files 两次拉取结束后
  //   再异步打开"管理仓库"窗口并隐藏/关闭主窗口，保证"用户始终能看到界面"
  //
  // 关键点：这里**不再依赖 externalLaunchSettled 作为前置条件**（否则被迫等 1.2s 的兜底二次拉取），
  // 而是"先显示再说"——外部文件即便稍后到达也有事件监听 + useLayoutEffect 响应。
  useEffect(() => {
    const win = getCurrentWindow();
    // 1) Rust 端 setup 已经调用了 window.show()（正确尺寸/位置后才显示）。
    //    这里先查 isVisible()，如果窗口已经可见就跳过 show()（避免 ~96ms 的冗余 IPC）。
    //    仅在被插件、最小化恢复等意外隐藏时才兜底调用 show()。
    bootStart("visibility_show_window");
    bootStamp("visibility_show_window_called");
    (async () => {
      try {
        const visible = await win.isVisible();
        bootStamp(`visibility_is_visible_check_${visible}`);
        if (!visible) {
          await win.show();
        }
        bootStamp("visibility_window_shown");
        bootEnd("visibility_show_window");
        setTimeout(() => bootSummary(), 0);
      } catch (e) {
        console.warn("visibility 检查/显示失败（忽略）", e);
      }
    })();

    // 2) 若仓库列表非空 → 直接进入正常路径，完全不等待 pending-files 二次拉取
    if (vaults.length > 0 || !!initialFilePath) {
      return;
    }

    // 3) 无仓库分支：等 externalLaunchSettled 再做决策（防止"没仓库且也没外部文件"时，
    //    管理仓库窗口过早抢焦点、或主窗口短暂出现后立刻消失引起闪烁）。
    //    关键不同：主窗口仍已由上面 show() 显示，用户不会看到黑屏。
    let cancelled = false;
    (async () => {
      // 通过事件订阅 or 轮询 settled：这里直接依赖 React state 的第二次渲染触发。
      // 第一次渲染时 externalLaunchSettled=false，会走到下面的 early return；
      // 当 setState(true) 后 effect 重新运行，此时才进入 settled 分支。
    })();

    if (!externalLaunchSettled) return;
    if (hasExternalFile) return;

    // 4) settled=true 且确实没有任何外部文件 → 打开管理仓库窗口 + 关闭主窗口
    (async () => {
      try {
        bootStart("visibility_no_vault_path");
        bootStamp("visibility_no_vault_before_open_vault_manager");
        await invoke("open_vault_manager_window");
        bootStamp("visibility_no_vault_after_open_vault_manager");
        if (cancelled) return;
        await invoke("notify_main_closing");
        bootStamp("visibility_no_vault_after_notify_closing");
        await win.close();
        bootStamp("visibility_no_vault_after_close");
        bootEnd("visibility_no_vault_path");
      } catch (e) {
        bootStamp("visibility_no_vault_catch_show_fallback");
        bootEnd("visibility_no_vault_path");
        console.error("打开管理仓库窗口失败（主窗口保持可见）", e);
        win.show().catch(() => {});
        bootStamp("visibility_window_shown_via_fallback");
        setTimeout(() => bootSummary(), 0);
      }
    })();

    return () => { cancelled = true; };
  }, [externalLaunchSettled, hasExternalFile, vaults, initialFilePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // 构建链接索引和标签索引（优化版：先缓存恢复 UI → 后台联合构建 → 统一持久化）
  useEffect(() => {
    if (activeVaultIndex < 0) return;
    const vaultPath = vaults[activeVaultIndex]?.path;
    if (!vaultPath) return;

    // 策略 A 第一步：同步加载 localStorage 缓存（毫秒级），让侧栏/反链/标签立即可用
    // 不关心是否成功：失败时 buildIndexesTogether 内部会降级全量构建
    bootStart("index_restore_and_build");
    bootStamp("index_restore_from_cache_start");
    const fromCache = restoreIndexesFromCache();
    bootStamp("index_restore_from_cache_done");

    // 放到下一个 tick 再跑重量级 I/O，让首帧 UI 先渲染完成
    // （避免 useEffect 同步阻塞 React commit 阶段的绘制调度）
    const handle = window.setTimeout(async () => {
      try {
        bootStamp("index_build_start");
        // fromCache 已由上方 restoreIndexesFromCache 确定，传入避免重复读取
        await buildIndexesTogether(vaultPath, { useCache: false, incremental: true, fromCache });
        bootStamp("index_build_done");
      } catch (e) {
        bootStamp("index_build_failed_fallback_start");
        // 新流程失败时安全降级到老的独立 buildIndex 组合，保证功能可用
        console.error("[App] 联合索引构建失败，降级为独立构建", e);
        try {
          await LinkIndexService.buildIndex(vaultPath);
        } catch { /* ignore */ }
        try {
          await TagIndexService.buildIndex(vaultPath);
        } catch { /* ignore */ }
        bootStamp("index_build_failed_fallback_done");
      } finally {
        // 无论新老流程成功与否，最后统一持久化（让下次启动有缓存可用）
        try { persistIndexesToStorage(); } catch { /* ignore */ }
        bootStamp("index_persist_done");
        bootEnd("index_restore_and_build");
        setTimeout(() => bootSummary(), 0);
      }
    }, 0);

    return () => window.clearTimeout(handle);
  }, [activeVaultIndex, vaults]);

  // 文件监听：外部文件变化时自动更新索引，并刷新文件树（结构性变化）
  const [graphRefreshKey, forceIndexRerender] = useState(0);
  const vaultPath = activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null;
  useVaultWatcher(
    vaultPath,
    useCallback(() => forceIndexRerender(n => n + 1), []),
    useCallback(() => setTreeRefreshKey(k => k + 1), []),
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(RIGHT_SIDEBAR_OPEN_KEY, rightSidebarOpen ? "1" : "0");
  }, [rightSidebarOpen]);

  useEffect(() => {
    localStorage.setItem(RIGHT_SIDEBAR_WIDTH_KEY, String(rightSidebarWidth));
  }, [rightSidebarWidth]);

  useEffect(() => {
    localStorage.setItem(XHS_PREVIEW_WIDTH_KEY, String(xhsPreviewWidth));
  }, [xhsPreviewWidth]);

  // 启动后延迟检查更新（不阻塞首屏渲染）
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdate().then((info) => {
        if (info) setUpdateInfo(info);
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // 新窗口：打开指定文件（通过 URL 参数）。内容直接写入激活缓冲，
  // 由 Editor 的 value 同步机制驱动视图（无需手动 setValue 推送）。
  useEffect(() => {
    if (!initialFilePath) return;
    const matchingVaultIndex = vaults.findIndex((v) =>
      initialFilePath.startsWith(v.path),
    );
    if (matchingVaultIndex >= 0) {
      setActiveVaultIndex(matchingVaultIndex);
    }
    // .canvas 文件：在主区域显示白板
    if (initialFilePath.endsWith('.canvas')) {
      setCanvasFilePath(initialFilePath);
      setFileName(initialFilePath);
      setPreviewFilePath(null);
      setModified(false);
      setContent("");
      return;
    }
    readTextFile(initialFilePath)
      .then((text) => {
        updateBuffer(activeBufferIdRef.current, { content: text, fileName: initialFilePath, savedContent: text, modified: false });
        setSaveStatus("idle");
      })
      .catch((e) => {
        console.error(t("app.error.openFileFailed"), e);
        const errText = `> Failed to open file: ${String(e)}\n\nPath: ${initialFilePath}`;
        updateBuffer(activeBufferIdRef.current, { content: errText, fileName: initialFilePath });
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
  useEffect(() => { notifyResize(); }, [rightSidebarOpen]);
  useEffect(() => { notifyResize(); }, [rightSidebarWidth]);

  // 激活窗格变化后自动聚焦该窗格的编辑器（统一处理分屏/关闭/导航/点击等所有场景）。
  // —— 实现思路：不用 React 的 handle，直接模拟 Tab 键的原生焦点遍历：
  //    在 data-pane-id 指向的容器里找 contenteditable / textarea 等可聚焦 DOM 元素，
  //    调用原生 .focus()。这样即使 handle 因组件卸载重挂临时丢失、或聚焦回调没触发，
  //    只要 Tab 能聚焦的 DOM 一出现，就能立刻把焦点落上去。
  // —— 用 requestAnimationFrame 逐帧重试：关闭分屏后布局会压缩重绘，
  //    编辑器组件可能短暂卸载再重挂载，最多重试 30 帧（≈500ms）兜底。
  useEffect(() => {
    const paneId = activePaneId;
    if (!paneId) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30;

    // 按优先级查找可聚焦 DOM：和 Tab 遍历命中的元素一致
    // 1. TipTap: ProseMirror contenteditable
    // 2. CodeMirror: .cm-content / textarea
    // 3. xterm 终端: .xterm textarea
    // 4. 兜底: 任意 contenteditable=true / textarea / input
    const focusableSelectors = [
      '[data-pane-id="' + paneId + '"] .ProseMirror[contenteditable="true"]',
      '[data-pane-id="' + paneId + '"] .cm-content',
      '[data-pane-id="' + paneId + '"] .cm-editor',
      '[data-pane-id="' + paneId + '"] .xterm textarea',
      '[data-pane-id="' + paneId + '"] .terminal-container textarea',
      '[data-pane-id="' + paneId + '"] [contenteditable="true"]',
      '[data-pane-id="' + paneId + '"] textarea',
      '[data-pane-id="' + paneId + '"] input',
    ];

    const tryFocus = () => {
      if (cancelled) return;
      for (const sel of focusableSelectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el && el.isConnected) {
          // 先让浏览器跑默认 scroll，focus 后同步 editorHandleRef（不影响 DOM 聚焦）
          el.focus({ preventScroll: false });
          // 同步 React 侧的 editorHandleRef（不强制，handle 在不在都不影响 DOM 聚焦）
          const h = paneHandlesRef.current[paneId];
          if (h) editorHandleRef.current = h;
          return;
        }
      }
      attempts++;
      if (attempts < maxAttempts) requestAnimationFrame(tryFocus);
    };
    requestAnimationFrame(tryFocus);
    return () => { cancelled = true; };
  }, [activePaneId]);

  // ── 窗口位置/大小记忆 ──
  const saveWindowStateRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    const win = getCurrentWindow();
    // 编辑窗口（window=editor，标签以 "editor-" 开头）使用独立状态 key，
    // 首次打开时不做任何覆盖，保留 Rust 端按编辑区尺寸创建的窗口大小与居中位置
    const isEditorWindow = win.label.startsWith("editor-");
    const stateKey = isEditorWindow ? EDITOR_WINDOW_STATE_KEY : WINDOW_STATE_KEY;

    // 保存当前窗口状态到 localStorage
    const saveWindowState = async () => {
      try {
        const maximized = await win.isMaximized();
        const state: Record<string, unknown> = { maximized };
        if (!maximized) {
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          if (isEditorWindow) {
            // 编辑窗口保存逻辑坐标（物理坐标 / scaleFactor），
            // Rust 创建新窗口时可直接用 position(x, y) 在该位置打开，避免 DPI 偏移
            const scale = await win.scaleFactor();
            state.x = pos.x / scale;
            state.y = pos.y / scale;
            state.width = size.width / scale;
            state.height = size.height / scale;
          } else {
            state.x = pos.x;
            state.y = pos.y;
            state.width = size.width;
            state.height = size.height;
          }
        }
        localStorage.setItem(stateKey, JSON.stringify(state));
      } catch {
        // 忽略保存错误
      }
    };
    saveWindowStateRef.current = saveWindowState;

    // 监听移动/缩放事件（防抖保存）
    // 注：窗口启动时的尺寸/位置恢复由 Rust 端 tauri-plugin-window-state 负责
    // （tauri.conf.json visible=false，setup 前插件恢复 SIZE/POSITION/MAXIMIZED，
    //  setup 里 show()），比 JS 端启动后再恢复快 ~600ms，且完全没有跳动。
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
      // 便携版：后台 cmd 脚本已替换 exe 并接管重启，这里只需退出
      if (await isPortableVersion()) {
        await exitApp();
      } else {
        await relaunchApp();
      }
    } catch (e) {
      console.error(t("settings.about.updateFailed"), e);
      setUpdateDownloading(false);
    }
  }, [updateInfo]);

  // Debounced mindmap sync to avoid flooding IPC on every keystroke
  const mindmapSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncMindmapContent = useCallback((value: string) => {
    if (mindmapSyncTimerRef.current) clearTimeout(mindmapSyncTimerRef.current);
    mindmapSyncTimerRef.current = setTimeout(() => {
      // 列表模式下不覆盖内容
      const mode = localStorage.getItem("zmd-mindmap-mode");
      if (mode === "list") return;
      localStorage.setItem("zmd-mindmap-content", value);
      emit("mindmap-content-update", { content: value }).catch(() => {});
    }, 500);
  }, []);

  // 某窗格内容变更：更新该窗格指向的缓冲（同步窗格共享同一缓冲，TipTap value 同步
  // 不会触发它们的 onChange，仅编辑中的窗格会触发本回调）。激活窗格额外维护
  // 保存状态闪烁、搜索高亮清理、思维导图同步与自动补全光标检查等副作用。
  const handlePaneChange = useCallback((paneId: string, value: string) => {
    const pane = panesRef.current.find((p) => p.id === paneId);
    if (!pane || !pane.bufferId) return;
    const buf = buffersRef.current.find((b) => b.id === pane.bufferId);
    const isModified = value !== (buf?.savedContent ?? value);
    updateBuffer(pane.bufferId, { content: value, modified: isModified });
    if (pane.id === activePaneIdRef.current) {
      setSaveStatus(isModified ? "modified" : "idle");
      // Clear search highlights when user edits
      editorHandleRef.current?.clearHighlight();
      // Sync content to mindmap window if open
      syncMindmapContent(value);

      // 如果 WikiLink 自动补全已打开，检查 [[ 或 【【 是否还在光标附近
      if (wikiAutocompleteVisible) {
        const cursorPos = editorHandleRef.current?.getCursorOffset();
        if (cursorPos !== undefined && cursorPos !== null) {
          const textBefore = value.slice(Math.max(0, cursorPos - 200), cursorPos);
          const hasOpenWikiLink = /\[\[[^\]]*$/.test(textBefore) || /【【[^】]*$/.test(textBefore) || /@\S*$/.test(textBefore);
          if (!hasOpenWikiLink) {
            setWikiAutocompleteVisible(false);
          }
        }
      }

      // 如果 Tag 自动补全已打开，检查 # 是否还在光标附近
      if (tagAutocompleteVisible) {
        const cursorPos = editorHandleRef.current?.getCursorOffset();
        if (cursorPos !== undefined && cursorPos !== null) {
          const textBefore = value.slice(Math.max(0, cursorPos - 200), cursorPos);
          const hasOpenTag = /(^|\s)#[^\s#\]\)\}，,。！？；;：:"'`、/\\]*$/.test(textBefore);
          if (!hasOpenTag) {
            setTagAutocompleteVisible(false);
          }
        }
      }
    }
  }, [syncMindmapContent, updateBuffer, wikiAutocompleteVisible, tagAutocompleteVisible]);

  // 兼容包装：对激活窗格的内容变更（供 CodeMirror / 自动补全选中回调等既有调用点使用）
  const handleChange = useCallback((value: string) => handlePaneChange(activePaneIdRef.current, value), [handlePaneChange]);

  // 用 ref 保存激活缓冲内容最新值，供仅在挂载时注册的快捷键（如思维导图）读取
  const contentRef = useRef(content);
  contentRef.current = content;

  // 保存指定缓冲（默认激活缓冲）。有 fileName 直接写回；新建未保存文件走“另存为”。
  const handleSave = useCallback(async (targetBufferId?: string): Promise<boolean> => {
    const bufId = targetBufferId ?? activeBufferIdRef.current;
    let buf = buffersRef.current.find((b) => b.id === bufId);
    if (!buf) return false;
    try {
      let path = buf.fileName;
      if (!path) {
        // 仅激活缓冲可触发“另存为”
        if (bufId !== activeBufferIdRef.current) return false;
        const result = await save({
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
          defaultPath: "untitled.md",
        });
        if (!result) return false;
        path = result;
        updateBuffer(bufId, { fileName: path });
        buf = buffersRef.current.find((b) => b.id === bufId) ?? buf;
      }
      // 对话框期间内容可能变化，重新读取最新内容
      const latest = buffersRef.current.find((b) => b.id === bufId) ?? buf;
      const contentToWrite = latest.content;
      await writeTextFile(path, contentToWrite);
      updateBuffer(bufId, { savedContent: contentToWrite, modified: false });
      if (bufId === activeBufferIdRef.current) setSaveStatus("saved");
      // 更新链接索引和标签索引
      const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
      if (activeVault) {
        await LinkIndexService.updateFileLinks(path, activeVault.path);
        forceIndexRerender((n) => n + 1);
        TagIndexService.updateFileTags(path, contentToWrite);
        try { localStorage.setItem("zmd-link-index", LinkIndexService.serialize()); } catch {}
      }
      return true;
    } catch (e) {
      console.error(t("app.error.saveFailed"), e);
      return false;
    }
  }, [activeVaultIndex, vaults, t, updateBuffer]);

  // 保存成功后绿灯闪烁效果
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 4000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // Ctrl+S 保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (canvasFilePath) {
          useCanvasStore.getState().saveCanvas();
        } else {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, canvasFilePath]);

  // 自动保存：任意缓冲有未保存修改且有源文件路径时，延迟 1 秒自动写入（debounce）
  useEffect(() => {
    if (!buffers.some((b) => b.modified && b.fileName)) return;
    const timer = setTimeout(async () => {
      try {
        const raw = localStorage.getItem("zmd-general-settings");
        if (!raw) return;
        const settings = JSON.parse(raw);
        if (!settings.autoSave) return;
        const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
        for (const b of buffersRef.current) {
          if (!b.modified || !b.fileName) continue;
          await writeTextFile(b.fileName, b.content);
          updateBuffer(b.id, { savedContent: b.content, modified: false });
          if (b.id === activeBufferIdRef.current) setSaveStatus("saved");
          if (activeVault) {
            await LinkIndexService.updateFileLinks(b.fileName, activeVault.path);
            forceIndexRerender((n) => n + 1);
            TagIndexService.updateFileTags(b.fileName, b.content);
          }
        }
        if (activeVault) {
          try { localStorage.setItem("zmd-link-index", LinkIndexService.serialize()); } catch {}
        }
      } catch (e) {
        console.error(t("app.error.autoSaveFailed"), e);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [buffers, activeVaultIndex, vaults, t, updateBuffer]);

  // Ctrl+O 快速打开文件
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Vim 冲突：Ctrl+O=光标回到跳转列表上一个位置
      if (vimShouldTakeOver(e) && (e.ctrlKey || e.metaKey) && e.key === "o") return;
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
  }, [activeVaultIndex, vimShouldTakeOver]);

  // Ctrl+P 命令面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Vim 冲突：Ctrl+P=向上一行（等同 k，cm-vim 映射）/ 打印键位兼容，normal 态让渡
      if (vimShouldTakeOver(e) && (e.ctrlKey || e.metaKey) && e.key === "p") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setQuickOpenOpen(false);
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [vimShouldTakeOver]);

  // 读取图谱设置
  const getGraphSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem(GRAPH_SETTINGS_KEY);
      return saved ? { ...DEFAULT_GRAPH, ...JSON.parse(saved) } : DEFAULT_GRAPH;
    } catch {
      return DEFAULT_GRAPH;
    }
  }, []);

  // Ctrl+G 知识图谱
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Vim 冲突：Ctrl+G=显示文件信息
      if (vimShouldTakeOver(e) && (e.ctrlKey || e.metaKey) && e.key === "g") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault();
        if (getGraphSettings().openInNewWindow) {
          invoke("open_graph_window");
        } else {
          setGraphViewOpen(prev => !prev);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [vimShouldTakeOver]);

  // ── Vault callbacks ──

  const handleRemoveVault = useCallback((index: number) => {
    setVaults((prev) => prev.filter((_, i) => i !== index));
    setActiveVaultIndex((prev) => {
      if (prev === index) return -1;
      if (prev > index) return prev - 1;
      return prev;
    });
  }, []);

  // ── File tree callbacks ──

  // openFile 在下方声明，handleSelectFile 需在它之前定义；用 ref 转发以避免“先使用后声明”
  const openFileRef = useRef<(path: string, line?: number, query?: string) => Promise<void>>(async () => {});

  const handleSelectFile = useCallback((path: string, line?: number, query?: string) => {
    // 点击文件时关闭关系图谱
    setGraphViewOpen(false);

    // 判断文件类型
    const name = path.split(/[/\\]/).pop() || path;

    // .canvas 文件：在主区域显示白板
    if (name.endsWith('.canvas')) {
      setCanvasFilePath(path);
      setFileName(path);
      setPreviewFilePath(null);
      setModified(false);
      setContent("");
      pushToHistory(path);
      // 打开白板/预览后：焦点回到主编辑器区域（优先激活的 editor pane，兜底 codeMirrorRef）
      setTimeout(() => {
        const editorPane = panesRef.current.find((p) => p.kind === "editor");
        if (editorPane) {
          const h = paneHandlesRef.current[editorPane.id];
          if (h) { h.focus(); editorHandleRef.current = h; return; }
        }
        codeMirrorRef.current?.focus();
      }, 60);
      return;
    }

    if (!isEditableFile(name)) {
      // 非文本文件，直接预览，同时更新 fileName 以显示选中状态
      setFileName(path);
      setPreviewFilePath(path);
      setCanvasFilePath(null);
      pushToHistory(path);
      // 非可编辑文件预览时：同上焦点回编辑器区域
      setTimeout(() => {
        const editorPane = panesRef.current.find((p) => p.kind === "editor");
        if (editorPane) {
          const h = paneHandlesRef.current[editorPane.id];
          if (h) { h.focus(); editorHandleRef.current = h; return; }
        }
        codeMirrorRef.current?.focus();
      }, 60);
      return;
    }

    // 文本文件：若激活缓冲有未保存修改，且该缓冲仅由当前窗格持有，则先确认保存
    const activeBuf = buffersRef.current.find((b) => b.id === activeBufferIdRef.current);
    const soleHolder = !activeBuf || panesRef.current.filter((p) => p.bufferId === activeBuf.id).length <= 1;
    if (activeBuf?.modified && activeBuf.fileName && soleHolder) {
      setPendingFilePath(path);
      pendingLineRef.current = line ?? null;
      pendingQueryRef.current = query ?? null;
      setSaveConfirmOpen(true);
    } else {
      openFileGenerationRef.current++;
      openFileRef.current(path, line, query);
    }
  }, [modified]);

  // 处理系统文件关联打开（双击 .md 文件）：
  // 默认折叠侧栏（与新窗口打开体验一致）；若开启"启动时展开大纲"，则展开侧栏并切到大纲
  const handleExternalOpenFile = useCallback((filePath: string) => {
    if (expandOutlineOnOpen) {
      setSidebarOpen(true);
      setOutlineTrigger((n) => n + 1);
    } else {
      setSidebarOpen(false);
    }

    // 如果文件位于已注册仓库内，激活对应仓库（文件树选中状态、链接索引等随之生效）
    const normalize = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
    const normPath = normalize(filePath);
    const matchingIndex = vaults.findIndex((v) => {
      const vp = normalize(v.path);
      return normPath === vp || normPath.startsWith(vp + "/");
    });
    if (matchingIndex >= 0) {
      setActiveVaultIndex(matchingIndex);
    }

    handleSelectFile(filePath);
  }, [vaults, handleSelectFile, expandOutlineOnOpen]);

  // 拉取并处理外部打开文件队列（双击 .md 文件），返回是否处理了文件。
  // 后端不再定时发事件，改为前端就绪后拉取，彻底消除事件竞态导致的"打开为空"问题
  const processPendingFiles = useCallback(async (): Promise<boolean> => {
    try {
      const files = await invoke<string[]>("take_pending_files");
      // 同时选中多个文件时打开最后一个（与原事件逐个触发、最终显示最后一个的行为一致）
      const last = files[files.length - 1];
      if (last) {
        setHasExternalFile(true);
        handleExternalOpenFile(last);
        return true;
      }
    } catch (e) {
      console.error(t("app.error.openFileFailed"), e);
    }
    return false;
  }, [handleExternalOpenFile, t]);

  // 通过文件关联启动（双击 .md 文件）：冷启动时主动拉取队列，
  // 并延迟二次拉取兜底（应用启动初期的外部打开请求可能落在首次拉取之后、事件监听注册之前）
  // 注意：这个延迟已**不再阻塞窗口显示**（窗口可见性在单独的 effect 中立即执行），
  // 因此这里的 250ms 仅影响"无仓库且无外部文件时"管理仓库窗口出现的时机。
  useEffect(() => {
    if (initialFilePath) {
      // 新窗口模式（window=editor）：文件路径来自 URL 参数，不走外部队列
      bootStamp("external_launch_initial_filepath_skip_queue");
      setExternalLaunchSettled(true);
      return;
    }
    (async () => {
      bootStart("external_launch_pending_queue_fetch");
      bootStamp("external_launch_first_fetch_start");
      const openedFirst = await processPendingFiles();
      bootStamp("external_launch_first_fetch_done");
      if (openedFirst) {
        // 首次已经拿到文件：不再等待第二次兜底拉取，立即 settled
        setExternalLaunchSettled(true);
        bootStamp("external_launch_settled_true");
        bootEnd("external_launch_pending_queue_fetch");
        return;
      }
      // 250ms 兜底（之前是 1200ms）：
      //   - 用户没双击 .md：250ms 后 settled，"无仓库时"才能跳管理窗口
      //   - 用户双击了但 first fetch 竞态漏掉：250ms 内再次拉取到队列
      setTimeout(() => {
        bootStamp("external_launch_second_fetch_start");
        processPendingFiles().then(() => {
          bootStamp("external_launch_second_fetch_done");
          setExternalLaunchSettled(true);
          bootStamp("external_launch_settled_true");
          bootEnd("external_launch_pending_queue_fetch");
        });
      }, 250);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 应用已运行时双击 .md 文件：接收单实例插件转发的外部打开事件，
  // 以队列为准拉取（事件负载仅作兜底），配合后端的延迟二次拉取确保文件不丢失
  useEffect(() => {
    if (initialFilePath) return;
    const unlisten = listen<string>("open-file-external", async (event) => {
      const opened = await processPendingFiles();
      if (!opened) {
        const filePath = typeof event.payload === "string" ? event.payload : String(event.payload ?? "");
        if (filePath) handleExternalOpenFile(filePath);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [processPendingFiles, handleExternalOpenFile]);

  const isNavigatingHistoryRef = useRef(false);

  const pushToHistory = useCallback((path: string) => {
    if (isNavigatingHistoryRef.current) return;
    setFileHistory((prev) => {
      const newHistory = prev.slice(0, historyIndexRef.current + 1);
      newHistory.push(path);
      return newHistory;
    });
    setHistoryIndex((prev) => {
      const next = prev + 1;
      historyIndexRef.current = next;
      return next;
    });
  }, []);

  const openFile = useCallback(async (path: string, line?: number, query?: string) => {
    const myGeneration = openFileGenerationRef.current;
    try {
      setPreviewFilePath(null); // 关闭预览模式
      setCanvasFilePath(null); // 关闭白板模式
      setIsCurrentFileMarkdown(isMarkdownFile(path));

      // 匿名统计：打开文档计为一次页面浏览（不含文件名等隐私信息）
      track(ANALYTICS_EVENTS.FILE_OPEN);
      trackPageview("/file");

      const activePaneObj = panesRef.current.find((p) => p.id === activePaneIdRef.current) ?? panesRef.current[0];
      // 终端激活时，文件应落到编辑器窗格：优先复用已有编辑器窗格，否则在终端旁新建一个
      let targetPaneId = activePaneObj.id;
      let targetBufferId: string | undefined = activePaneObj.bufferId;
      if (activePaneObj.kind === "terminal") {
        const editorPane = panesRef.current.find((p) => p.kind === "editor");
        if (editorPane) {
          targetPaneId = editorPane.id;
          targetBufferId = editorPane.bufferId;
          setActivePaneId(editorPane.id);
        } else {
          const newEditorPane: Pane = { id: pid(), kind: "editor", bufferId: buffersRef.current[0]?.id, mode: editorSettings.defaultMode };
          targetBufferId = newEditorPane.bufferId;
          spawnPaneBeside(activePaneObj.id, newEditorPane, "lr");
          targetPaneId = newEditorPane.id;
          setActivePaneId(newEditorPane.id);
          setTimeout(() => {
            paneHandlesRef.current[newEditorPane.id]?.focus();
          }, 60);
        }
      }
      // 检查目标编辑器窗格的 buffer 是否被多个窗格共享（分屏同步状态）
      const activeBufferHolders = panesRef.current.filter((p) => p.bufferId === targetBufferId).length;
      const isSharedBuffer = activeBufferHolders > 1;
      // 若该文件已在某个缓冲中打开，复用之（同步视图）；否则读取并写入目标缓冲
      const existing = buffersRef.current.find((b) => b.fileName === path);
      if (existing) {
        setPanes((ps) => ps.map((p) => (p.id === targetPaneId ? { ...p, bufferId: existing.id } : p)));
        setSaveStatus("idle");
      } else {
        const text = await readTextFile(path);
        if (openFileGenerationRef.current !== myGeneration) return; // 被更新的文件切换覆盖
        if (isSharedBuffer) {
          // 分屏共享缓冲状态：创建新缓冲并让目标窗格单独指向它，避免同步窗格也被替换
          const newBuf: FileBuffer = { id: bid(), fileName: path, content: text, savedContent: text, modified: false };
          setBuffers((bs) => [...bs, newBuf]);
          setPanes((ps) => ps.map((p) => (p.id === targetPaneId ? { ...p, bufferId: newBuf.id } : p)));
        } else {
          // 非共享缓冲：直接更新目标缓冲内容
          if (targetBufferId) updateBuffer(targetBufferId, { content: text, fileName: path, savedContent: text, modified: false });
        }
        setSaveStatus("idle");
      }

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

      // 更新导航历史（前进/后退导航时不重复入栈）
      if (!isNavigatingHistoryRef.current) {
        pushToHistory(path);
      }
      isNavigatingHistoryRef.current = false;

      // 更新最近访问文件列表
      const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
      if (activeVault) {
        setRecentFiles((prev) => {
          const vaultPath = activeVault.path;
          const existingRecent = prev[vaultPath] || [];
          // 移除已存在的该文件（避免重复）
          const filtered = existingRecent.filter((p) => p !== path);
          // 将新文件添加到最前面
          const updated = [path, ...filtered].slice(0, MAX_RECENT_FILES);
          return { ...prev, [vaultPath]: updated };
        });
      }

      // 文件打开完成后：延迟 focus 到目标编辑器窗格（等 React re-render 完，handle 已注册到 paneHandlesRef）
      setTimeout(() => {
        const h = paneHandlesRef.current[targetPaneId];
        if (h) {
          h.focus();
          if (targetPaneId === activePaneIdRef.current) editorHandleRef.current = h;
        } else {
          // 兜底：单编辑器模式（没有 panes / renderPane），直接 codeMirrorRef
          codeMirrorRef.current?.focus();
        }
      }, 60);
    } catch (e) {
      console.error(t("app.error.openFileFailed"), e);
    }
  }, [activeVaultIndex, vaults, t, updateBuffer]);
  // 转发 openFile 给在上方定义的 handleSelectFile（避免“先使用后声明”）
  openFileRef.current = openFile;

  const openFileByType = useCallback((path: string) => {
    const name = path.split(/[/\\]/).pop() || path;
    if (name.endsWith('.canvas')) {
      setCanvasFilePath(path);
      setFileName(path);
      setPreviewFilePath(null);
      setModified(false);
      setContent("");
    } else if (!isEditableFile(name)) {
      setFileName(path);
      setPreviewFilePath(path);
      setCanvasFilePath(null);
    } else {
      openFile(path);
    }
  }, [openFile]);

  const navigateBack = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    isNavigatingHistoryRef.current = true;
    openFileByType(fileHistory[newIndex]);
  }, [historyIndex, fileHistory, openFileByType]);

  const navigateForward = useCallback(() => {
    if (historyIndex >= fileHistory.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    isNavigatingHistoryRef.current = true;
    openFileByType(fileHistory[newIndex]);
  }, [historyIndex, fileHistory, openFileByType]);

  // 鼠标侧键前进/后退（button 3 = 后退, button 4 = 前进）
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); navigateBack(); }
      if (e.button === 4) { e.preventDefault(); navigateForward(); }
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [navigateBack, navigateForward]);

  const handleSaveConfirm = useCallback(async () => {
    setSaveConfirmOpen(false);
    if (fileName && content) {
      try {
        await writeTextFile(fileName, content);
      } catch (e) {
        console.error(t("app.error.autoSaveFailed"), e);
      }
    }
    if (pendingFilePath) {
      const line = pendingLineRef.current;
      const query = pendingQueryRef.current;
      pendingLineRef.current = null;
      pendingQueryRef.current = null;
      openFileGenerationRef.current++;
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
      openFileGenerationRef.current++;
      openFile(pendingFilePath, line ?? undefined, query ?? undefined);
      setPendingFilePath(null);
    }
  }, [pendingFilePath, openFile]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleRightSidebarToggle = useCallback(() => {
    setRightSidebarOpen((prev) => !prev);
  }, []);

  // 切换侧栏快捷键（从 localStorage 读取，默认值来自 src/config/shortcuts.json）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      let shortcutKeys = shortcutsConfig.editor.find((s) => s.id === "toggle-sidebar")?.keys ?? ["Ctrl", "\\"];
      try {
        const saved = localStorage.getItem(SHORTCUTS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const item = parsed.find((s: { id: string }) => s.id === "toggle-sidebar");
          if (item) shortcutKeys = item.keys;
        }
      } catch {}
      const key = shortcutKeys.join("+").toLowerCase();
      const eventKey = `${e.ctrlKey || e.metaKey ? "ctrl+" : ""}${e.altKey ? "alt+" : ""}${e.shiftKey ? "shift+" : ""}${e.key.toLowerCase()}`;
      if (eventKey === key) {
        e.preventDefault();
        handleSidebarToggle();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [handleSidebarToggle]);

  const handleNewWindow = useCallback(async (filePath: string) => {
    try {
      const el = document.querySelector('.editor-container');
      const width = el ? el.clientWidth : 800;
      const height = el ? el.clientHeight : 600;
      // 读取上次编辑窗口保存的位置，直接在该位置打开窗口（避免先居中再移动的跳动）
      let posX: number | undefined;
      let posY: number | undefined;
      try {
        const saved = localStorage.getItem(EDITOR_WINDOW_STATE_KEY);
        if (saved) {
          const state = JSON.parse(saved) as Record<string, unknown>;
          if (typeof state.x === "number" && typeof state.y === "number") {
            posX = state.x;
            posY = state.y;
          }
        }
      } catch {}
      await invoke("open_file_in_new_window", {
        filePath,
        width,
        height,
        posX,
        posY,
      });
    } catch (err) {
      console.error(t("app.error.openNewWindowFailed"), err);
    }
  }, []);

  // 默认工作目录：当前文件所在目录 > 仓库根目录 > 空串。
  const defaultCwd = useCallback((): string => {
    if (fileName) return fileName.replace(/[/\\][^/\\]*$/, "");
    if (activeVaultIndex >= 0 && vaults[activeVaultIndex]) return vaults[activeVaultIndex].path;
    return "";
  }, [fileName, activeVaultIndex, vaults]);

  // 创建一个终端面板（生成 terminalId 并登记），但不涉及布局插入。
  const makeTerminalPane = useCallback((cwd: string): Pane => {
    const tid = bid();
    const pane: Pane = { id: pid(), kind: "terminal", terminalId: tid, mode: editorSettings.defaultMode };
    setTerminals((prev) => ({ ...prev, [tid]: { id: tid, cwd } }));
    return pane;
  }, [editorSettings.defaultMode]);

  // 在指定激活窗格旁按 dir 方向插入一个新窗格（通用：终端或编辑器均可复用）。
  const spawnPaneBeside = useCallback((activeId: string, newPane: Pane, dir: "lr" | "tb") => {
    setPanes((ps) => [...ps, newPane]);
    const found = findPaneInTree(splitLayoutRef.current, activeId);
    const keepLeaf: PaneLeaf = found ? found.leaf : { type: "leaf", paneId: activeId, flex: 1 };
    const newLeaf: PaneLeaf = { type: "leaf", paneId: newPane.id, flex: 1 };
    const wrapFlex = found?.leaf.flex ?? 1;
    const replacement: SplitGroup = { type: "group", groupId: gid(), dir, flex: wrapFlex, children: [keepLeaf, newLeaf] };
    if (!found) setSplitLayout(replacement);
    else setSplitLayout(replaceNodeByPath(splitLayoutRef.current, found.path, replacement));
  }, []);

  // 入口：新建一个终端面板，置于当前激活窗格旁（默认左右分屏）。
  const handleOpenTerminalPane = useCallback((dir: "lr" | "tb" = "lr") => {
    const activeId = activePaneIdRef.current;
    const cwd = defaultCwd();
    const newPane = makeTerminalPane(cwd);
    spawnPaneBeside(activeId, newPane, dir);
    setActivePaneId(newPane.id);
  }, [defaultCwd, makeTerminalPane, spawnPaneBeside]);

  // 在某终端面板旁再分屏出一个新终端（工具栏"分屏"按钮回调）。
  const handleSplitTerminalBeside = useCallback((paneId: string, dir: "lr" | "tb") => {
    const tid = panesRef.current.find((p) => p.id === paneId)?.terminalId;
    const cwd = (tid && terminalsRef.current[tid]?.cwd) || defaultCwd();
    const newPane = makeTerminalPane(cwd);
    spawnPaneBeside(paneId, newPane, dir);
    setActivePaneId(newPane.id);
  }, [defaultCwd, makeTerminalPane, spawnPaneBeside]);

  // 分屏：在当前激活窗格“当前所在层级”，按指定方向插入一个同步克隆（共享 buffer，编辑联动）。
  // - 单窗格时：根变成 SplitGroup(dir = 点击方向，两孩子 = 原 + 新)。
  // - 已有分屏时：不改变其他区域，只在激活窗格的位置把它替换为新的 SplitGroup(dir)，
  //   例如：左右分屏中激活右边，再点“上下”，结果是 [左不变, 新 Group(tb)[右上, 右下]]。
  const handleSplit = useCallback((dir: "lr" | "tb") => {
    const activeId = activePaneIdRef.current;
    const currentPanes = panesRef.current;
    const active = currentPanes.find((p) => p.id === activeId) ?? currentPanes[0];
    // 终端窗格分屏：新建一个独立的终端置于其旁（不共享 PTY）
    if (active.kind === "terminal") {
      const tid = active.terminalId;
      const cwd = (tid && terminalsRef.current[tid]?.cwd) || defaultCwd();
      const newPane = makeTerminalPane(cwd);
      spawnPaneBeside(activeId, newPane, dir);
      setActivePaneId(newPane.id);
      return;
    }
    // 编辑器窗格：同步克隆（共享 buffer），并入 panes 数组
    const newPane: Pane = { id: pid(), kind: "editor", bufferId: active.bufferId, mode: active.mode };
    setPanes((ps) => [...ps, newPane]);
    // 在布局树中找到激活窗格的位置 → 用新 SplitGroup(dir) 替换该 leaf 自身：
    // 两个孩子：[原 leaf(flex=1), 新 leaf(flex=1)]
    const found = findPaneInTree(splitLayoutRef.current, activeId);
    const oldFlex = found?.leaf.flex ?? 1;
    const newLeafActive: PaneLeaf = { type: "leaf", paneId: activeId, flex: 1 };
    const newLeafClone: PaneLeaf = { type: "leaf", paneId: newPane.id, flex: 1 };
    const replacement: SplitGroup = { type: "group", groupId: gid(), dir, flex: oldFlex, children: [newLeafActive, newLeafClone] };
    if (!found) {
      // 罕见兜底：找不到就根级套一层 group
      setSplitLayout(replacement);
    } else {
      const nextTree = replaceNodeByPath(splitLayoutRef.current, found.path, replacement);
      setSplitLayout(nextTree);
    }
    // 分屏后默认聚焦到新分屏的窗格
    setActivePaneId(newPane.id);
    // 延迟聚焦新窗格的编辑器，等待挂载
    setTimeout(() => {
      paneHandlesRef.current[newPane.id]?.focus();
    }, 60);
  }, [defaultCwd, makeTerminalPane, spawnPaneBeside]);

  // 终端快捷键（Ctrl+`）：toggle —— 无终端则新建；已有终端且当前不在终端则聚焦最近终端；已在终端则无操作。
  const handleToggleTerminal = useCallback(() => {
    const current = panesRef.current.find((p) => p.id === activePaneIdRef.current);
    const hasTerminal = panesRef.current.some((p) => p.kind === "terminal");
    if (!hasTerminal) {
      handleOpenTerminalPane("lr");
      return;
    }
    if (current?.kind === "terminal") return; // 已在终端，无操作
    const tp = panesRef.current.find((p) => p.kind === "terminal");
    if (tp) setActivePaneId(tp.id);
  }, [handleOpenTerminalPane]);

  // 文件树右键“在新面板打开”：
  // - 活动窗格若有同步兄弟（同 buffer 的另一窗格），则把活动窗格切换为新文件（原文件保留在兄弟窗格）；
  // - 否则（活动窗格是该文件唯一持有者）在激活窗格位置以“左右分屏”新插入一个 group 显示新文件（原文件留在活动窗格）。
  // 新文件若已在某缓冲中打开则复用（同步），否则读取后新建缓冲。
  const handleOpenInNewPanel = useCallback(async (path: string) => {
    // 活动窗格必须已是打开的 Markdown 文件
    if (!fileName || !isCurrentFileMarkdown || canvasFilePath || previewFilePath) return;
    const name = path.split(/[/\\]/).pop() || path;
    if (!isMarkdownFile(name)) return; // 仅支持 Markdown 在新面板打开
    try {
      const currentPanes = panesRef.current;
      const activeId = activePaneIdRef.current;
      const active = currentPanes.find((p) => p.id === activeId) ?? currentPanes[0];
      // 准备目标缓冲：复用已打开的同名文件缓冲（同步），否则读取文件新建缓冲
      const existing = buffersRef.current.find((b) => b.fileName === path);
      let bufferId: string;
      if (existing) {
        bufferId = existing.id;
      } else {
        const text = await readTextFile(path);
        const newBuf: FileBuffer = { id: bid(), fileName: path, content: text, savedContent: text, modified: false };
        setBuffers((bs) => [...bs, newBuf]);
        bufferId = newBuf.id;
      }
      // 活动窗格是否与另一窗格共享同一缓冲（即存在同步副本）
      const hasSyncedSibling = currentPanes.some((p) => p.id !== active.id && p.bufferId === active.bufferId);
      let focusPaneId: string;
      if (hasSyncedSibling) {
        // 有同步副本：把活动窗格切换为新文件，原文件保留在兄弟窗格（不新增窗格）
        setPanes((ps) => ps.map((p) => (p.id === active.id ? { ...p, bufferId } : p)));
        focusPaneId = active.id;
      } else {
        // 无同步副本：在激活 leaf 处套一个左右 Group，原 leaf 不变，新 pane 放第二位
        const newPane: Pane = { id: pid(), kind: "editor", bufferId, mode: active.mode };
        setPanes((ps) => [...ps, newPane]);
        const found = findPaneInTree(splitLayoutRef.current, activeId);
        const keepLeaf: PaneLeaf = found ? found.leaf : { type: "leaf", paneId: activeId, flex: 1 };
        const newLeaf: PaneLeaf = { type: "leaf", paneId: newPane.id, flex: 1 };
        // 若激活 leaf 本来就在 lr group 中：直接在其右侧插入新 leaf（保持该组方向）
        const inGroup = found && found.path.length > 0;
        const lastStep = inGroup ? found!.path[found!.path.length - 1] : null;
        if (lastStep && lastStep.group.dir === "lr") {
          // 在同组中，在激活 leaf 之后插入一个兄弟新 leaf
          const siblings = [...lastStep.group.children];
          siblings.splice(lastStep.childIndex + 1, 0, newLeaf);
          const patchedGroup: SplitGroup = { ...lastStep.group, children: siblings };
          const parentPath = found!.path.slice(0, -1);
          setSplitLayout(replaceNodeByPath(splitLayoutRef.current, parentPath, patchedGroup));
        } else {
          // 其他情况（单窗格 / 非 lr 组）：在该 leaf 处新套一层 lr group
          const wrapFlex = found?.leaf.flex ?? 1;
          const replacement: SplitGroup = { type: "group", groupId: gid(), dir: "lr", flex: wrapFlex, children: [keepLeaf, newLeaf] };
          if (!found) setSplitLayout(replacement);
          else setSplitLayout(replaceNodeByPath(splitLayoutRef.current, found.path, replacement));
        }
        setActivePaneId(newPane.id);
        focusPaneId = newPane.id;
      }

      // 匿名统计 + 更新最近访问文件列表
      track(ANALYTICS_EVENTS.FILE_OPEN);
      trackPageview("/file");
      const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
      if (activeVault) {
        setRecentFiles((prev) => {
          const vaultPath = activeVault.path;
          const existingRecent = prev[vaultPath] || [];
          const filtered = existingRecent.filter((p) => p !== path);
          const updated = [path, ...filtered].slice(0, MAX_RECENT_FILES);
          return { ...prev, [vaultPath]: updated };
        });
      }
      // 延迟聚焦目标窗格的编辑器，等待挂载
      setTimeout(() => {
        paneHandlesRef.current[focusPaneId]?.focus();
      }, 60);
    } catch (e) {
      console.error(t("app.error.openFileFailed"), e);
    }
  }, [fileName, isCurrentFileMarkdown, canvasFilePath, previewFilePath, activeVaultIndex, vaults, t]);

  // QuickOpen 的 Ctrl+\ / Ctrl+-：
  // 把选中文件在激活编辑器的指定方向（Ctrl+\ 右侧 / Ctrl+- 下方）分屏打开，
  // 做法：在激活 leaf 位置用一个新的 SplitGroup(dir) 替换该 leaf —— 第一个孩子是原 leaf（保留原内容），
  // 第二个孩子是新 leaf（绑定要打开的新文件）。其他窗格/区域完全不变。
  // 示例：当前 lr[a, b] 且激活 b → Ctrl+- → lr[a, tb[b, c]]（左a不变，右侧变成 b在上 c在下）
  const handleOpenInSplit = useCallback(async (path: string, dir: "lr" | "tb") => {
    // 白板/预览模式不支持分屏打开
    if (canvasFilePath || previewFilePath) return;
    const name = path.split(/[/\\]/).pop() || path;
    if (!isMarkdownFile(name)) return;
    try {
      const activeId = activePaneIdRef.current;
      const currentPanes = panesRef.current;
      const active = currentPanes.find((p) => p.id === activeId) ?? currentPanes[0];

      // 准备新文件的 buffer：复用已打开的同名文件缓冲（同步视图），否则读取新建
      const existing = buffersRef.current.find((b) => b.fileName === path);
      let bufferId: string;
      if (existing) {
        bufferId = existing.id;
      } else {
        const text = await readTextFile(path);
        const newBuf: FileBuffer = { id: bid(), fileName: path, content: text, savedContent: text, modified: false };
        setBuffers((bs) => [...bs, newBuf]);
        bufferId = newBuf.id;
      }

      // 新建 pane 绑定新文件 buffer
      const newPane: Pane = { id: pid(), kind: "editor", bufferId, mode: active.mode };
      setPanes((ps) => [...ps, newPane]);

      // 布局替换：激活 leaf → SplitGroup(dir)[原leaf, 新leaf]，其余完全不动
      const found = findPaneInTree(splitLayoutRef.current, activeId);
      const keepLeaf: PaneLeaf = found ? found.leaf : { type: "leaf", paneId: activeId, flex: 1 };
      const newLeaf: PaneLeaf = { type: "leaf", paneId: newPane.id, flex: 1 };
      const wrapFlex = found?.leaf.flex ?? 1;
      const replacement: SplitGroup = { type: "group", groupId: gid(), dir, flex: wrapFlex, children: [keepLeaf, newLeaf] };
      if (!found) setSplitLayout(replacement);
      else setSplitLayout(replaceNodeByPath(splitLayoutRef.current, found.path, replacement));

      setActivePaneId(newPane.id);

      // 匿名统计 + 更新最近访问文件列表
      track(ANALYTICS_EVENTS.FILE_OPEN);
      trackPageview("/file");
      const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
      if (activeVault) {
        setRecentFiles((prev) => {
          const vaultPath = activeVault.path;
          const existingRecent = prev[vaultPath] || [];
          const filtered = existingRecent.filter((p) => p !== path);
          const updated = [path, ...filtered].slice(0, MAX_RECENT_FILES);
          return { ...prev, [vaultPath]: updated };
        });
      }

      // 延迟聚焦新窗格编辑器，等待挂载
      setTimeout(() => {
        paneHandlesRef.current[newPane.id]?.focus();
      }, 60);
    } catch (e) {
      console.error(t("app.error.openFileFailed"), e);
    }
  }, [canvasFilePath, previewFilePath, activeVaultIndex, vaults, t]);

  // 关闭指定窗格：从布局树移除对应 leaf，并压缩只剩 1 个孩子的空组。
  // 若为激活窗格，焦点切到相邻 leaf；同时清理孤儿缓冲。至少保留一个窗格。
  const closePane = useCallback((paneId: string) => {
    const beforeIds = collectPaneIds(splitLayoutRef.current);
    if (beforeIds.length <= 1) return; // 至少保留一个窗格
    const { root: nextLayout, removed, adjacentPaneId } = removePaneAndCollapse(splitLayoutRef.current, paneId);
    if (!removed) return;
    // 从 panes 数组中移除
    setPanes((ps) => ps.filter((p) => p.id !== paneId));
    setSplitLayout(nextLayout);
    // 若关闭的是激活窗格，焦点切到相邻窗格（由 removePaneAndCollapse 给出的 adjacent）
    if (activePaneIdRef.current === paneId && adjacentPaneId) {
      setActivePaneId(adjacentPaneId);
      editorHandleRef.current = paneHandlesRef.current[adjacentPaneId] ?? null;
      // 延迟聚焦相邻窗格的编辑器/终端，等待布局重新挂载
      setTimeout(() => {
        paneHandlesRef.current[adjacentPaneId]?.focus();
      }, 60);
    }
    // 清理孤儿缓冲：基于同步的 panesRef + remainingPaneIds 先计算仍被引用的 bufferId，
    // 再用函数式 setBuffers 基于最新 panes 二次确认，避免因 setState 时序错删。
    const remainingPaneIds = collectPaneIds(nextLayout);
    const remainingSet = new Set(remainingPaneIds);
    const usedBufferIds = new Set<string>();
    panesRef.current.forEach((p) => {
      if (p.id !== paneId && remainingSet.has(p.id) && p.bufferId) usedBufferIds.add(p.bufferId);
    });
    // 终端会话销毁统一在此显式处理：kill PTY + 注销前端缓冲/监听。
    // 不再依赖 TerminalView 卸载时 kill——分屏等布局变化也会卸载并重挂 TerminalView，
    // 届时进程与屏幕缓冲须保留（按 sessionId 复用），故排除真正关闭时才销毁。
    const remainingTerminalIds = new Set<string>();
    panesRef.current.forEach((p) => {
      if (p.id !== paneId && remainingSet.has(p.id) && p.kind === "terminal" && p.terminalId) {
        remainingTerminalIds.add(p.terminalId);
      }
    });
    const removedPane = panesRef.current.find((p) => p.id === paneId);
    if (removedPane?.kind === "terminal" && removedPane.terminalId) {
      const tid = removedPane.terminalId;
      if (!remainingTerminalIds.has(tid)) {
        killTerminal(tid).catch(() => {});
        unregisterTerminal(tid);
      }
    }
    setTerminals((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((tid) => {
        if (!remainingTerminalIds.has(tid)) delete next[tid];
      });
      return next;
    });
    setBuffers((bs) => {
      // 基于同一时刻的 panes 再次计算，确保批处理中 panes 已变化时不会错删
      const currentPanes = panesRef.current.filter((p) => p.id !== paneId && remainingSet.has(p.id));
      currentPanes.forEach((p) => { if (p.bufferId) usedBufferIds.add(p.bufferId); });
      // 至少保留一个缓冲（兜底，防止 buffers 为空导致派生 activeBuffer undefined 崩溃）
      if (usedBufferIds.size === 0 && bs.length > 0) usedBufferIds.add(bs[0].id);
      return bs.filter((b) => usedBufferIds.has(b.id));
    });
  }, []);

  // 拖拽某个 group 内部相邻两个节点间的分割线，调整二者 flex 比例。
  // groupId：所在分屏组 ID；dividerIndex：该组 children 中第 dividerIndex 与 dividerIndex+1 之间
  const handleSplitResizeDown = useCallback((e: React.MouseEvent, groupId: string, dividerIndex: number) => {
    e.preventDefault();
    const container = splitGroupRefs.current[groupId];
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // 从布局树查找该 group 的 dir
    const findDir = (n: SplitNode): "lr" | "tb" | null => {
      if (n.type === "leaf") return null;
      if (n.groupId === groupId) return n.dir;
      for (const c of n.children) {
        const r = findDir(c);
        if (r) return r;
      }
      return null;
    };
    const dir = findDir(splitLayoutRef.current);
    if (!dir) return;
    const horizontal = dir === "lr";
    const total = horizontal ? rect.width : rect.height;
    const origin = horizontal ? rect.left : rect.top;
    if (total <= 0) return;
    setSplitResizing(true);
    const onMove = (ev: MouseEvent) => {
      const root = splitLayoutRef.current;
      let foundGroup: SplitGroup | null = null;
      const walk = (n: SplitNode) => {
        if (n.type === "group" && n.groupId === groupId) foundGroup = n;
        if (n.type === "group") n.children.forEach(walk);
      };
      walk(root);
      if (!foundGroup) return;
      const groupNode: SplitGroup = foundGroup;
      const children: SplitNode[] = groupNode.children;
      if (dividerIndex < 0 || dividerIndex >= children.length - 1) return;
      const flexes: number[] = children.map((c: SplitNode) => c.flex);
      const flexSum: number = flexes.reduce((a: number, b: number) => a + b, 0) || 1;
      const panePx: number[] = flexes.map((f: number) => (f / flexSum) * total);
      let leftEdge = 0;
      for (let i = 0; i <= dividerIndex; i++) leftEdge += panePx[i];
      const delta = (horizontal ? ev.clientX : ev.clientY) - origin - leftEdge;
      const minPx = 0.1 * total;
      const newA = panePx[dividerIndex] + delta;
      const newB = panePx[dividerIndex + 1] - delta;
      if (newA < minPx || newB < minPx) return;
      panePx[dividerIndex] = newA;
      panePx[dividerIndex + 1] = newB;
      const newFlexes: number[] = panePx.map((px: number) => (px / total) * flexSum);
      setSplitLayout(updateGroupFlexes(root, groupId, (kids) => kids.map((k, i) => ({ ...k, flex: newFlexes[i] ?? 1 }))));
    };
    const onUp = () => {
      setSplitResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // 渲染一个 Markdown 编辑窗格（按 Pane 渲染，分屏时复用）。
  // 每个窗格从其 bufferId 取内容与文件路径；onChange 路由到该窗格的缓冲；
  // 仅激活窗格的字数回调会更新全局 wordCount。ref 按窗格 id 注册到 paneHandlesRef。
  const renderPane = (pane: Pane) => {
    // 终端面板：直接渲染 TerminalView，分屏/关闭由父级回调处理
    if (pane.kind === "terminal" && pane.terminalId) {
      return (
        <Suspense fallback={<div className="editor-panel" />}>
          <TerminalView
            sessionId={pane.terminalId}
            cwd={terminals[pane.terminalId]?.cwd ?? ""}
            theme={theme}
            onSplit={(dir) => handleSplitTerminalBeside(pane.id, dir)}
            onClose={() => closePane(pane.id)}
            onFontSizeChange={showFontSizeToast}
          />
        </Suspense>
      );
    }
    const buf = buffers.find((b) => b.id === pane.bufferId) ?? buffers[0];
    const refCb = (h: EditorHandle | null) => {
      if (h) paneHandlesRef.current[pane.id] = h;
      else delete paneHandlesRef.current[pane.id];
      if (pane.id === activePaneIdRef.current) editorHandleRef.current = h;
    };
    return (
      <EditorErrorBoundary>
        <Suspense fallback={<div className="editor-panel" />}>
          <Editor
            ref={refCb}
            value={buf.content}
            onChange={(v) => handlePaneChange(pane.id, v)}
            mode={pane.mode}
            theme={theme}
            typewriterMode={typewriterMode}
            previewMaxWidth={previewMaxWidth}
            lineHeight={lineHeight}
            paragraphSpacing={paragraphSpacing}
            codeLineHeight={codeLineHeight}
            irLineNumbers={irLineNumbers}
            editorSettings={editorSettings}
            imageSettings={imageSettings}
            currentFilePath={buf.fileName}
            activeVaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null}
            onWordCount={(c) => { if (pane.id === activePaneIdRef.current) setWordCount(c); }}
            active={pane.id === activePaneId}
          />
        </Suspense>
      </EditorErrorBoundary>
    );
  };

  // 顶部栏更多菜单 - 文件操作
  const handleBookmarkCurrentFile = useCallback(() => {
    if (fileName) handleShowBookmarkDialog(fileName, false);
    setMoreMenuOpen(false);
  }, [fileName, handleShowBookmarkDialog]);

  const handleRenameCurrentFile = useCallback(async () => {
    if (!fileName) return;
    const oldName = fileName.split(/[/\\]/).pop() || '';
    const ext = oldName.includes('.') ? `.${oldName.split('.').pop()}` : '.md';
    const baseName = ext === '.md' ? oldName.replace(/\.md$/, '') : oldName.slice(0, oldName.lastIndexOf('.'));
    const newBaseName = window.prompt(t("app.rename.prompt"), baseName);
    if (!newBaseName || newBaseName === baseName) return;
    const parentDir = fileName.replace(/[/\\][^/\\]*$/, '');
    const newPath = `${parentDir}/${newBaseName}${ext}`;
    try {
      // 更新 wiki 链接
      if (!LinkIndexService.isEmpty() && fileName.endsWith('.md')) {
        const vp = activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null;
        if (vp) await LinkIndexService.rewriteWikiLinks(fileName, newPath, vp);
      }
      await rename(fileName, newPath);
      setTreeRefreshKey(k => k + 1);
      handleSelectFile(newPath);
    } catch (err) {
      console.error(t("app.error.renameFailed"), err);
    }
    setMoreMenuOpen(false);
  }, [fileName, handleSelectFile, vaults, activeVaultIndex]);

  const handleCopyRelativePath = useCallback(() => {
    if (!fileName) return;
    const vaultPath = activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null;
    const relativePath = vaultPath
      ? fileName.replace(vaultPath.replace(/\\/g, '/') + '/', '').replace(vaultPath + '\\', '')
      : fileName;
    navigator.clipboard.writeText(relativePath);
    setMoreMenuOpen(false);
  }, [fileName, activeVaultIndex, vaults]);

  const handleCopyAbsolutePath = useCallback(() => {
    if (fileName) navigator.clipboard.writeText(fileName);
    setMoreMenuOpen(false);
  }, [fileName]);

  const handleOpenFileLocation = useCallback(async () => {
    if (!fileName) return;
    try {
      await invoke("open_file_location", { filePath: fileName });
    } catch (err) {
      console.error(t("app.error.openLocationFailed"), err);
    }
    setMoreMenuOpen(false);
  }, [fileName]);

  const handleOpenTerminal = useCallback(async () => {
    // 优先在当前文件所在目录打开终端，无打开文件时用仓库根目录
    const path =
      fileName ||
      (activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null);
    if (!path) return;
    try {
      await invoke("open_in_terminal", { path });
    } catch (err) {
      console.error(t("app.error.openTerminalFailed"), err);
    }
    setMoreMenuOpen(false);
  }, [fileName, activeVaultIndex, vaults]);

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

  // 检查是否有未保存的修改（任意缓冲或内嵌白板）
  const hasUnsavedChanges = useCallback(() => {
    return buffersRef.current.some((b) => b.modified) || useCanvasStore.getState().isModified;
  }, []);

  // 弹出关闭确认对话框（防止重复弹出）
  const promptCloseConfirm = useCallback(() => {
    if (closeConfirmOpenRef.current) return;
    closeConfirmOpenRef.current = true;
    setCloseConfirmOpen(true);
  }, []);

  // 真正执行窗口关闭（用户已在确认框中选择保存或不保存）
  const performClose = useCallback(async () => {
    closeAllowRef.current = true;
    await saveWindowStateRef.current();
    // 关闭主窗口前通知 Rust 标记其即将销毁，避免单实例回调向正在销毁的
    // 窗口发消息触发 "PostMessage failed（0x80070578 无效的窗口句柄）"
    if (getCurrentWindow().label === "main") {
      invoke("notify_main_closing");
    }
    getCurrentWindow().close();
  }, []);

  const handleClose = useCallback(async () => {
    if (hasUnsavedChanges()) {
      promptCloseConfirm();
      return;
    }
    await performClose();
  }, [hasUnsavedChanges, promptCloseConfirm, performClose]);

  // 关闭确认：保存并关闭
  const handleCloseConfirmSave = useCallback(async () => {
    closeConfirmOpenRef.current = false;
    setCloseConfirmOpen(false);
    try {
      const canvasStore = useCanvasStore.getState();
      if (canvasStore.filePath) {
        // 白板模式
        if (canvasStore.isModified) {
          await canvasStore.saveCanvas();
          if (useCanvasStore.getState().isModified) return; // 保存失败，中止关闭
        }
      } else {
        // 文本模式：保存所有已修改的缓冲。
        // 有源文件路径的直接写回；激活缓冲为新建未保存文件（无 fileName）时走另存为。
        for (const b of buffersRef.current) {
          if (!b.modified) continue;
          if (b.fileName) {
            await writeTextFile(b.fileName, b.content);
            updateBuffer(b.id, { savedContent: b.content, modified: false });
          } else if (b.id === activeBufferIdRef.current) {
            // 激活缓冲为新建未保存文件：走另存为对话框
            const ok = await handleSave(b.id);
            if (!ok) return; // 用户取消或保存失败，中止关闭
          }
        }
      }
    } catch (e) {
      return; // 保存异常，中止关闭
    }
    await performClose();
  }, [handleSave, performClose, updateBuffer]);

  // 关闭确认：不保存并关闭
  const handleCloseConfirmDiscard = useCallback(async () => {
    closeConfirmOpenRef.current = false;
    setCloseConfirmOpen(false);
    await performClose();
  }, [performClose]);

  // 关闭确认：取消
  const handleCloseConfirmCancel = useCallback(() => {
    closeConfirmOpenRef.current = false;
    setCloseConfirmOpen(false);
  }, []);

  // 拦截窗口关闭（标题栏 X / 系统关闭）：有未保存修改时弹出确认
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | null = null;
    win
      .onCloseRequested((event) => {
        if (closeAllowRef.current) return; // 用户已确认关闭，放行
        if (!hasUnsavedChanges()) return; // 无未保存修改，正常关闭
        event.preventDefault();
        promptCloseConfirm();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [hasUnsavedChanges, promptCloseConfirm]);

  // 关闭窗口 / 查找 / 替换快捷键（配置见 src/config/shortcuts.json 的 app）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Vim 语义冲突：Ctrl+W=删除前一个 word（insert）/ 操作符前缀（normal 窗格操作）
      // Ctrl+F=整页向下；Ctrl+H=退格（insert）/ 光标左（normal）
      if (vimShouldTakeOver(e) && matchShortcut(e, shortcutsConfig.app["close-window"])) return;
      if (vimShouldTakeOver(e) && matchShortcut(e, shortcutsConfig.app["find"])) return;
      if (vimShouldTakeOver(e) && matchShortcut(e, shortcutsConfig.app["replace"])) return;
      if (matchShortcut(e, shortcutsConfig.app["close-window"])) {
        e.preventDefault();
        const win = getCurrentWindow();
        const label = win.label;
        if (label === "settings" || label === "mindmap") {
          win.close();
        } else {
          // 多面板时优先关闭当前激活面板，仅剩单面板时才走窗口关闭流程
          const paneCount = collectPaneIds(splitLayoutRef.current).length;
          if (paneCount > 1) {
            closePane(activePaneIdRef.current);
          } else {
            handleClose();
          }
        }
      }
      if (matchShortcut(e, shortcutsConfig.app["find"])) {
        e.preventDefault();
        setFindReplaceDialogMode("find");
      }
      if (matchShortcut(e, shortcutsConfig.app["replace"])) {
        e.preventDefault();
        setFindReplaceDialogMode("replace");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose, closePane, vimShouldTakeOver]);

  // Ctrl+,（macOS：⌘+,）切换设置窗口；可在设置-快捷键中自定义
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const keys = getShortcutKeys(loadShortcuts(), "open-settings");
      const fallback = shortcutsConfig.app["open-settings"] ?? ["Ctrl", ","];
      if (!matchShortcut(e, keys.length ? keys : fallback)) return;
      e.preventDefault();
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const existing = await WebviewWindow.getByLabel("settings");
        if (existing) {
          await existing.close();
        } else {
          await invoke("open_settings_window");
        }
      } catch {
        invoke("open_settings_window").catch(() => {});
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleTypewriterMode = useCallback(() => {
    setTypewriterMode((prev: boolean) => !prev);
  }, []);

  // 打字机模式快捷键（配置见 src/config/shortcuts.json 的 app.typewriter）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchShortcut(e, shortcutsConfig.app.typewriter)) {
        e.preventDefault();
        toggleTypewriterMode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleTypewriterMode]);

  // 模式循环切换（底部栏按钮用）：始终切换激活窗格的模式（pane.mode）
  const cycleMode = useCallback(() => {
    setViewMode(viewMode === "ir" ? "sv" : "ir");
  }, [viewMode, setViewMode]);

  // Ctrl+/ 模式切换（ir ↔ sv）
  const toggleIrSv = useCallback(() => {
    setViewMode(viewMode === "ir" ? "sv" : "ir");
  }, [viewMode, setViewMode]);

  // 设置激活窗格的模式，供命令面板/工具栏使用
  const setActiveMode = useCallback((m: EditorMode) => {
    setViewMode(m);
  }, [setViewMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      let shortcutKeys = shortcutsConfig.editor.find((s) => s.id === "toggle-mode")?.keys ?? ["Ctrl", "/"];
      try {
        const saved = localStorage.getItem(SHORTCUTS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const item = parsed.find((s: { id: string }) => s.id === "toggle-mode");
          if (item) shortcutKeys = item.keys;
        }
      } catch {}
      if (matchShortcut(e, shortcutKeys)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleIrSv();
      }
    };
    // 使用捕获阶段，在 ProseMirror 处理之前拦截模式切换快捷键
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [toggleIrSv]);

  // 行内代码快捷键（从 localStorage 读取，默认值来自 src/config/shortcuts.json）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      let shortcutKeys = shortcutsConfig.editor.find((s) => s.id === "inline-code")?.keys ?? ["Ctrl", "E"];
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
      // Vim 冲突：Ctrl+E=向下滚动一行（vim normal）
      if (eventKey === key && vimShouldTakeOver(e)) return;
      if (eventKey === key) {
        e.preventDefault();
        editorHandleRef.current?.executeCommand("inline-code");
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [vimShouldTakeOver]);

  // 打开思维导图快捷键（配置见 src/config/shortcuts.json 的 app.open-mindmap）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchShortcut(e, shortcutsConfig.app["open-mindmap"])) {
        e.preventDefault();
        localStorage.setItem("zmd-mindmap-mode", "document");
        localStorage.setItem("zmd-mindmap-content", contentRef.current);
        invoke("open_mindmap_window");
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // 分屏 / 终端快捷键（配置见 shortcuts.json 的 app.split-lr / split-tb / terminal-new）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchShortcut(e, shortcutsConfig.app["split-lr"])) {
        e.preventDefault();
        // 编辑器（md）或终端窗格均可触发分屏
        if (fileName && isCurrentFileMarkdown) handleSplit("lr");
        else if (isActiveTerminal) handleSplit("lr");
        return;
      }
      if (matchShortcut(e, shortcutsConfig.app["split-tb"])) {
        e.preventDefault();
        if (fileName && isCurrentFileMarkdown) handleSplit("tb");
        else if (isActiveTerminal) handleSplit("tb");
        return;
      }
      if (matchShortcut(e, shortcutsConfig.app["terminal-new"])) {
        e.preventDefault();
        handleToggleTerminal();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSplit, handleToggleTerminal, fileName, isCurrentFileMarkdown, isActiveTerminal]);

  // ── Vim 窗格导航 ──────────────────────────────────────────────────
  // 焦点切换：在扁平 pane 列表中按方向移动
  const focusPane = useCallback((dir: "left" | "down" | "up" | "right") => {
    // 把左侧栏/右侧栏也当窗格处理：根据当前焦点所在区域路由。
    // 约束：左侧栏永远在最左、右侧栏永远在最右（不可越过）。
    const activeEl = document.activeElement as HTMLElement | null;
    const inRightSidebar = !!activeEl?.closest?.(".sidebar.sidebar-right");
    const inLeftSidebar = !inRightSidebar && !!activeEl?.closest?.(".sidebar");

    // 回到编辑器：聚焦最近活跃的编辑器窗格
    const focusActiveEditorPane = () => {
      const id = activePaneIdRef.current;
      if (!id) return;
      editorHandleRef.current = paneHandlesRef.current[id] ?? null;
      // 等 React 渲染完 handle 已注册到 paneHandlesRef
      setTimeout(() => paneHandlesRef.current[id]?.focus(), 60);
    };

    // ── 焦点在右侧栏：只能向左回到编辑器 ──
    if (inRightSidebar) {
      if (dir === "left") focusActiveEditorPane();
      return; // right/up/down 不动（右侧栏已是最右）
    }
    // ── 焦点在左侧栏：只能向右回到编辑器 ──
    if (inLeftSidebar) {
      if (dir === "right") focusActiveEditorPane();
      return; // left/up/down 不动（左侧栏已是最左）
    }

    // ── 焦点在编辑器：tmux 风格方向查找 ──
    const targetId = findAdjacentPane(splitLayoutRef.current, activePaneIdRef.current, dir);
    // 左边界 → 跨界到左侧栏
    if (!targetId && dir === "left") {
      window.dispatchEvent(new CustomEvent("vim-sidebar-focus", { detail: { side: "left" } }));
      return;
    }
    // 右边界 → 跨界到右侧栏
    if (!targetId && dir === "right") {
      window.dispatchEvent(new CustomEvent("vim-sidebar-focus", { detail: { side: "right" } }));
      return;
    }
    if (!targetId) return;
    setActivePaneId(targetId);
    editorHandleRef.current = paneHandlesRef.current[targetId] ?? null;
    setTimeout(() => paneHandlesRef.current[targetId]?.focus(), 60);
  }, []);

  // 移动当前窗格到父组的边缘
  const movePaneToEdge = useCallback((dir: "left" | "down" | "up" | "right") => {
    const activeId = activePaneIdRef.current;
    const found = findPaneInTree(splitLayoutRef.current, activeId);
    if (!found || found.path.length === 0) return; // 根叶子，无法移动

    const lastStep = found.path[found.path.length - 1];
    const parent = lastStep.group;
    const childIdx = lastStep.childIndex;

    // left/up → 移到首，right/down → 移到末
    const targetIdx = dir === "left" || dir === "up" ? 0 : parent.children.length - 1;
    if (childIdx === targetIdx) return; // 已在目标位置

    // 不可变地重排 children
    const newChildren = [...parent.children];
    const [moved] = newChildren.splice(childIdx, 1);
    newChildren.splice(targetIdx, 0, moved);

    // 用 path 到父组的路径替换父组（path.slice(0,-1) 为空时 replaceNodeByPath 直接返回 replacement）
    const newRoot = replaceNodeByPath(
      splitLayoutRef.current,
      found.path.slice(0, -1),
      { ...parent, children: newChildren }
    );
    setSplitLayout(newRoot);
  }, []);

  // Vim Leader 菜单的 app.* 动作分发：监听全局 vim-app-action 事件
  // 用 ref 持有最新 handler，避免每次依赖变化重新注册监听
  const vimAppHandlersRef = useRef<Record<string, () => void>>({});
  vimAppHandlersRef.current = {
    "save": handleSave,
    "toggle-sidebar": () => {
      // Leader+E：打开文件树时切换到 files tab 并聚焦；关闭时仅收起
      if (!sidebarOpen) {
        setSidebarOpen(true);
        window.dispatchEvent(new CustomEvent("vim-sidebar-tab", { detail: { tab: "files" } }));
        // 等 React 渲染完侧栏内容后再聚焦文件树（左栏）
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("vim-sidebar-focus", { detail: { tab: "files", side: "left" } }));
        }, 80);
      } else {
        handleSidebarToggle();
      }
    },
    "toggle-mode": cycleMode,
    "command-palette": () => setCommandPaletteOpen(true),
    "quick-open": () => { if (activeVaultIndex >= 0) setQuickOpenOpen(true); },
    "find": () => {
      // 触发编辑器内查找（模拟 Ctrl+F）
      const editor = document.querySelector(".codemirror-editor") as HTMLElement | null
        || document.querySelector(".tiptap-editor .ProseMirror") as HTMLElement | null;
      editor?.focus();
      requestAnimationFrame(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
      });
    },
    "global-search": () => {
      // 打开侧栏并切换到搜索 tab
      if (!sidebarOpen) handleSidebarToggle();
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("vim-sidebar-tab", { detail: { tab: "search" } }));
      });
    },
    "split-horizontal": () => { if (fileName && isCurrentFileMarkdown) handleSplit("lr"); else if (isActiveTerminal) handleSplit("lr"); },
    "split-vertical": () => { if (fileName && isCurrentFileMarkdown) handleSplit("tb"); else if (isActiveTerminal) handleSplit("tb"); },
    "close-pane": () => closePane(activePaneIdRef.current),
    "focus-editor": () => {
      // 从文件树跳回编辑器：聚焦当前激活窗格的编辑器
      const targetId = activePaneIdRef.current;
      const h = paneHandlesRef.current[targetId];
      if (h) {
        h.focus();
        editorHandleRef.current = h;
      } else {
        codeMirrorRef.current?.focus();
      }
    },
    "focus-left": () => focusPane("left"),
    "focus-down": () => focusPane("down"),
    "focus-up": () => focusPane("up"),
    "focus-right": () => focusPane("right"),
    "move-pane-left": () => movePaneToEdge("left"),
    "move-pane-down": () => movePaneToEdge("down"),
    "move-pane-up": () => movePaneToEdge("up"),
    "move-pane-right": () => movePaneToEdge("right"),
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent).detail;
      vimAppHandlersRef.current[action]?.();
    };
    window.addEventListener("vim-app-action", handler);
    return () => window.removeEventListener("vim-app-action", handler);
  }, []);

  // Vim 文件树动作：refresh / highlight-only / open / open-split-*
  // - highlight-only：仅在 Sidebar 中把路径标为「hover/选中高亮」但不打开文件（用于 j/k 移动光标）
  // - open：调用 handleSelectFile 真正在编辑器中打开文件 / 目录
  // - open-split-lr / open-split-tb：先分屏（水平=lr / 垂直=tb），再把选中文件打开到新窗格
  // - refresh：treeRefreshKey++ 触发侧栏 loadRoot
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ action?: string; path?: string }>).detail ?? {};
      switch (detail.action) {
        case "refresh":
          setTreeRefreshKey((k) => k + 1);
          break;
        case "open":
          if (typeof detail.path === "string" && detail.path) {
            handleSelectFile(detail.path);
          }
          break;
        case "open-split-lr":
        case "open-split-tb": {
          const path = detail.path;
          if (!path) break;
          const dir = detail.action === "open-split-lr" ? "lr" : "tb";
          // 若还没有编辑器窗格（欢迎面板）则直接打开文件，不走分屏
          const hasEditorPane = panesRef.current.some((p) => p.kind === "editor");
          if (!hasEditorPane) {
            handleSelectFile(path);
            break;
          }
          handleSplit(dir);
          // 等新窗格挂载并激活（activePaneId 已切到新窗格）后，在其缓冲中打开目标文件
          setTimeout(() => {
            handleSelectFile(path);
          }, 80);
          break;
        }
      }
    };
    window.addEventListener("vim-sidebar-action", handler);
    return () => window.removeEventListener("vim-sidebar-action", handler);
  }, [handleSelectFile, handleSplit]);

  // Vim 窗口导航：Ctrl+w h/j/k/l 切换焦点
  useWindowNavigation();

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

  // 监听 wikilink 悬停预览（栈式，支持嵌套）
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;

    const showTimers = wikiShowTimersRef.current;
    const hideTimers = wikiHideTimersRef.current;

    // 计算事件来源的深度
    const getDepthFromTarget = (target: HTMLElement | null | undefined): number => {
      if (!target) return -1;
      const link = target.closest?.('a.wiki-link, a[data-note]');
      if (link) {
        const previewEl = link.closest('.wiki-link-preview') as HTMLElement | null;
        if (!previewEl) return 0;
        return parseInt(previewEl.dataset.depth || '0', 10);
      }
      // 检查是否在预览弹窗内
      const preview = target.closest?.('.wiki-link-preview') as HTMLElement | null;
      if (preview) return parseInt(preview.dataset.depth || '0', 10);
      return -1;
    };

    const HOVER_DELAY = 400; // 鼠标需在 wikilink 上停留该毫秒数才显示预览

    const handleHover = (e: Event) => {
      const { noteName, heading, element, depth: eventDepth } = (e as CustomEvent).detail;
      if (!noteName) return;

      // 预览弹窗内的 wiki link 不再触发新的预览，避免嵌套弹框
      if (element && (element as HTMLElement).closest?.('.wiki-link-preview')) return;

      const targetPath = LinkIndexService.findFileByNoteName(noteName);
      if (!targetPath) return;

      const depth = eventDepth ?? 0;
      const showDepth = depth + 1;

      // 取消上一次尚未触发的待显示定时器（鼠标在延迟前离开/切换到其它链接）
      if (pendingShowRef.current) {
        clearTimeout(pendingShowRef.current.timer);
        pendingShowRef.current = null;
      }

      // 清除该深度及更深层次的定时器
      for (const [d, t] of showTimers) { if (d >= showDepth) { clearTimeout(t); showTimers.delete(d); } }
      for (const [d, t] of hideTimers) { if (d >= showDepth) { clearTimeout(t); hideTimers.delete(d); } }

      // 清除更深层次的预览
      setWikiPreviewStack(prev => prev.filter(p => p.depth < showDepth));

      // 延迟显示：鼠标必须停留在 wikilink 上一段时间才弹出预览
      const rect = (element as HTMLElement).getBoundingClientRect();
      const timer = setTimeout(() => {
        pendingShowRef.current = null;
        setWikiPreviewStack(prev => {
          const filtered = prev.filter(p => p.depth < showDepth);
          return [...filtered, { noteName, heading: heading || null, anchorRect: rect, depth: showDepth }];
        });
      }, HOVER_DELAY);
      pendingShowRef.current = { depth: showDepth, timer };
    };

    const handleHoverEnd = (e: Event) => {
      // 优先从 CustomEvent detail 获取 relatedTarget（预览弹窗内链接），
      // 其次从原生 MouseEvent 获取（handlePreviewLeave 传入）
      const detail = (e as CustomEvent).detail;
      const relatedTarget = (detail?.relatedTarget || (e as MouseEvent).relatedTarget) as HTMLElement | null;
      const leavingDepth = getDepthFromTarget(relatedTarget);

      // 鼠标在延迟前离开 wikilink：取消待显示的预览（否则划过后仍会弹出）
      if (pendingShowRef.current) {
        clearTimeout(pendingShowRef.current.timer);
        pendingShowRef.current = null;
      }

      // 鼠标仍在同一深度或更深的预览中 → 不关闭
      if (leavingDepth >= 0 && leavingDepth >= wikiPreviewDepthRef.current) return;

      const currentDepth = wikiPreviewDepthRef.current;
      if (currentDepth < 0) return;

      // 清除显示定时器（下一层预览的定时器）
      const t = showTimers.get(currentDepth + 1);
      if (t) { clearTimeout(t); showTimers.delete(currentDepth + 1); }

      // 延迟关闭当前及更深层次
      const depth = currentDepth; // 捕获当前值，避免定时器回调时引用已变化的 ref
      const timer = setTimeout(() => {
        hideTimers.delete(depth);
        setWikiPreviewStack(prev => prev.filter(p => p.depth < depth));
      }, 350);
      hideTimers.set(depth, timer);
    };

    const handlePreviewEnter = (depth: number) => {
      wikiPreviewDepthRef.current = depth;
      const t = hideTimers.get(depth);
      if (t) { clearTimeout(t); hideTimers.delete(depth); }
    };

    const handlePreviewLeave = (depth: number, e?: MouseEvent) => {
      if (e) {
        const target = e.relatedTarget as HTMLElement | null;
        if (target) {
          const enteringDepth = getDepthFromTarget(target);
          // 不关闭：目标在同一深度或更深的预览中
          if (enteringDepth >= 0 && enteringDepth >= depth) return;
        }
      }

      wikiPreviewDepthRef.current = -1;
      const timer = setTimeout(() => {
        hideTimers.delete(depth);
        setWikiPreviewStack(prev => prev.filter(p => p.depth < depth));
      }, 200);
      hideTimers.set(depth, timer);
    };

    (window as any).__wikiPreviewEnter = handlePreviewEnter;
    (window as any).__wikiPreviewLeave = handlePreviewLeave;

    window.addEventListener("wiki-link-hover", handleHover);
    window.addEventListener("wiki-link-hover-end", handleHoverEnd);

    return () => {
      window.removeEventListener("wiki-link-hover", handleHover);
      window.removeEventListener("wiki-link-hover-end", handleHoverEnd);
      if (pendingShowRef.current) {
        clearTimeout(pendingShowRef.current.timer);
        pendingShowRef.current = null;
      }
      showTimers.forEach(t => clearTimeout(t));
      hideTimers.forEach(t => clearTimeout(t));
      showTimers.clear();
      hideTimers.clear();
      delete (window as any).__wikiPreviewEnter;
      delete (window as any).__wikiPreviewLeave;
    };
  }, []);

  // 滚动或点击外部时关闭预览弹窗
  useEffect(() => {
    const clearPreview = () => {
      setWikiPreviewStack([]);
      wikiPreviewDepthRef.current = -1;
      wikiShowTimersRef.current.forEach(t => clearTimeout(t));
      wikiShowTimersRef.current.clear();
      wikiHideTimersRef.current.forEach(t => clearTimeout(t));
      wikiHideTimersRef.current.clear();
    };

    const handleScroll = () => {
      // 鼠标在预览弹窗上时不关闭
      if (wikiPreviewDepthRef.current >= 0) return;
      if (wikiPreviewStack.length > 0) clearPreview();
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 点击在预览弹窗内 → 不关闭
      if (target.closest('.wiki-link-preview')) return;
      // 点击在编辑器内的 wiki link 上 → 不关闭（由 hover 逻辑处理）
      if (target.closest('a.wiki-link, a[data-note]')) return;
      if (wikiPreviewStack.length > 0) clearPreview();
    };

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    document.addEventListener('mousedown', handleClick, true);
    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('mousedown', handleClick, true);
    };
  }, [wikiPreviewStack.length]);

  // Ctrl+Click wiki-link 在新窗口打开
  useEffect(() => {
    const handleWikiLinkNewWindow = (e: Event) => {
      const customEvent = e as CustomEvent<{ noteName: string; heading?: string }>;
      const { noteName } = customEvent.detail;

      const targetPath = LinkIndexService.findFileByNoteName(noteName);
      if (targetPath) {
        invoke("open_file_in_new_window", { filePath: targetPath });
      }
    };

    window.addEventListener('wiki-link-open-new-window', handleWikiLinkNewWindow);
    return () => window.removeEventListener('wiki-link-open-new-window', handleWikiLinkNewWindow);
  }, []);

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
      const customEvent = e as CustomEvent<{
        query: string;
        editorPosition: number;
        screenPosition: { x: number; y: number } | null;
      }>;
      const { query, editorPosition, screenPosition } = customEvent.detail;
      setWikiAutocompleteQuery(query);
      setWikiAutocompletePosition(screenPosition);
      wikiTriggerEditorPosRef.current = editorPosition;
      setWikiAutocompleteVisible(true);
    };

    window.addEventListener('wiki-link-trigger', handleWikiLinkTrigger);
    return () => window.removeEventListener('wiki-link-trigger', handleWikiLinkTrigger);
  }, []);

  // 监听标签自动补全触发
  useEffect(() => {
    const handleTagTrigger = (e: Event) => {
      const customEvent = e as CustomEvent<{
        query: string;
        editorPosition: number;
        screenPosition: { x: number; y: number } | null;
      }>;
      const { query, editorPosition, screenPosition } = customEvent.detail;
      setTagAutocompleteQuery(query);
      setTagAutocompletePosition(screenPosition);
      tagTriggerEditorPosRef.current = editorPosition;
      setTagAutocompleteVisible(true);
    };

    window.addEventListener('tag-trigger', handleTagTrigger);
    return () => window.removeEventListener('tag-trigger', handleTagTrigger);
  }, []);

  // WikiLink 自动补全选中回调
  const handleWikiAutocompleteSelect = useCallback((noteName: string) => {
    setWikiAutocompleteVisible(false);
    const triggerPos = wikiTriggerEditorPosRef.current;
    if (triggerPos === null) return;

    // 使用编辑器命令替换 [[query → WikiLink 节点
    editorHandleRef.current?.replaceRangeWithWikiLink(triggerPos, noteName);
    wikiTriggerEditorPosRef.current = null;

    // 同步 React 状态
    const val = editorHandleRef.current?.getValue();
    if (val !== undefined) {
      handleChange(val);
    }
  }, [handleChange]);

  const handleWikiAutocompleteClose = useCallback(() => {
    setWikiAutocompleteVisible(false);
  }, []);

  // Tag 自动补全选中回调
  const handleTagAutocompleteSelect = useCallback((tag: string) => {
    setTagAutocompleteVisible(false);
    const triggerPos = tagTriggerEditorPosRef.current;
    if (triggerPos === null) return;

    // 使用编辑器命令替换 #query → Tag 节点
    editorHandleRef.current?.replaceRangeWithTag(triggerPos, tag);
    tagTriggerEditorPosRef.current = null;

    // 同步 React 状态
    const val = editorHandleRef.current?.getValue();
    if (val !== undefined) {
      handleChange(val);
    }
  }, [handleChange]);

  const handleTagAutocompleteClose = useCallback(() => {
    setTagAutocompleteVisible(false);
  }, []);

  // ── 大纲点击跳转 ──
  const handleSelectHeading = useCallback((_level: number, text: string, line: number) => {
    editorHandleRef.current?.scrollToHeading(text, line);
  }, []);

  // ── Refs ──

  const pendingLineRef = useRef<number | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const pendingHeadingRef = useRef<string | null>(null);
  const openFileGenerationRef = useRef(0);
  const title = fileName && typeof fileName === "string" ? fileName.split(/[/\\]/).pop() || "untitled.md" : "Tydora";
  // 标题栏始终反映激活窗格缓冲的文件与保存状态（N 窗格模型下不再区分 A/B）
  const displayedFileName = fileName;
  const displayedTitle = title;
  const displayedSaveStatus = saveStatus;

  // ── 导出 ──
  const handleExport = async (format: ExportFormat) => {
    if (exporting || effectiveMode === "sv") return;
    track(`export.${format}`);
    setShowExportFormatPicker(false);
    setExporting(true);
    try {
      const artifact = await buildExportArtifact(format, {
        getContentElement: () => editorHandleRef.current?.getContentElement() ?? null,
        themeName: theme,
        title: title.replace(/\.[^.]+$/, ""),
      });
      setExportPreview({ format, artifact });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(t("app.export.exportFailed") + msg);
    } finally {
      setExporting(false);
    }
  };
  const handleExportRef = useRef(handleExport);
  handleExportRef.current = handleExport;

  // 打开小红书图文分栏预览（源码模式下自动切到 IR）
  const handleOpenXhs = useCallback(() => {
    if (effectiveMode === "sv") {
      setActiveMode("ir");
    }
    setShowExportFormatPicker(false);
    setXhsPreviewOpen(true);
    track(ANALYTICS_EVENTS.EXPORT_XHS);
  }, [effectiveMode, setActiveMode]);

  // 复制为 Markdown — 直接获取编辑器 Markdown 源码并写入剪贴板，无需预览
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const handleCopyAsMarkdown = useCallback(async () => {
    const markdown = editorHandleRef.current?.getValue();
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      track(ANALYTICS_EVENTS.EXPORT_MARKDOWN);
      setMarkdownCopied(true);
      // 短暂显示"已复制"反馈后关闭弹框
      setTimeout(() => {
        setMarkdownCopied(false);
        setShowExportFormatPicker(false);
      }, 600);
    } catch {
      alert(t("app.export.copyFailed"));
    }
  }, []);

  // 点击"发布网站"：仓库缺少 markdown-publish.config.json 时先弹出配置窗口
  const handlePublish = useCallback(async () => {
    const path = activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null;
    if (!path) {
      setPublishOpen(true);
      return;
    }
    try {
      const configExists = await exists(`${path}/${CONFIG_FILE}`);
      if (configExists) {
        setPublishOpen(true);
      } else {
        setPublishConfigOpen(true);
      }
    } catch {
      setPublishOpen(true);
    }
  }, [activeVaultIndex, vaults]);

  // ── 命令面板命令列表 ──
  const commands = useMemo(() => [
    // 文件操作
    { id: "save", label: t("app.command.labels.saveFile"), category: t("app.command.categories.file"), shortcut: getCommandShortcut("save"), action: handleSave },
    { id: "open", label: t("app.command.labels.openFile"), category: t("app.command.categories.file"), shortcut: getCommandShortcut("open"), action: () => { if (activeVaultIndex >= 0) setQuickOpenOpen(true); } },
    { id: "new-window", label: t("app.command.labels.openInNewWindow"), category: t("app.command.categories.file"), action: () => { if (fileName) handleNewWindow(fileName); } },

    // 编辑操作
    { id: "undo", label: t("app.command.labels.undo"), category: t("app.command.categories.edit"), shortcut: getCommandShortcut("undo"), action: () => editorHandleRef.current?.executeCommand("undo") },
    { id: "redo", label: t("app.command.labels.redo"), category: t("app.command.categories.edit"), shortcut: getCommandShortcut("redo"), action: () => editorHandleRef.current?.executeCommand("redo") },

    // 视图操作
    { id: "toggle-sidebar", label: t("app.command.labels.toggleSidebar"), category: t("app.command.categories.view"), shortcut: getCommandShortcut("toggle-sidebar"), action: handleSidebarToggle },
    { id: "toggle-mode", label: t("app.command.labels.toggleEditMode"), category: t("app.command.categories.view"), shortcut: getCommandShortcut("toggle-mode"), action: cycleMode },
    { id: "toggle-typewriter", label: t("app.command.labels.toggleTypewriter"), category: t("app.command.categories.view"), shortcut: getCommandShortcut("toggle-typewriter"), action: toggleTypewriterMode },
    { id: "split-lr", label: t("app.menu.splitLeftRight"), category: t("app.command.categories.view"), shortcut: getCommandShortcut("split-lr"), aliases: t("app.command.aliases.splitLeftRight").split(", "), action: () => { if (fileName && isCurrentFileMarkdown) handleSplit("lr"); else if (isActiveTerminal) handleSplit("lr"); } },
    { id: "split-tb", label: t("app.menu.splitTopBottom"), category: t("app.command.categories.view"), shortcut: getCommandShortcut("split-tb"), aliases: t("app.command.aliases.splitTopBottom").split(", "), action: () => { if (fileName && isCurrentFileMarkdown) handleSplit("tb"); else if (isActiveTerminal) handleSplit("tb"); } },
    { id: "new-terminal", label: t("app.command.labels.newTerminal"), category: t("app.command.categories.view"), shortcut: getCommandShortcut("terminal-new"), aliases: t("app.command.aliases.newTerminal").split(", "), action: () => handleOpenTerminalPane("lr") },
    { id: "open-mindmap", label: t("app.command.labels.openMindmap"), category: t("app.command.categories.view"), shortcut: getCommandShortcut("open-mindmap"), action: () => {
      localStorage.setItem("zmd-mindmap-mode", "document");
      localStorage.setItem("zmd-mindmap-content", content);
      invoke("open_mindmap_window");
    }},
    { id: "open-graph", label: t("app.command.labels.openGraph"), category: t("app.command.categories.view"), action: () => {
      if (getGraphSettings().openInNewWindow) {
        invoke("open_graph_window");
      } else {
        setGraphViewOpen(true);
      }
    }},
    { id: "open-vault", label: t("app.command.labels.vaultManager"), category: t("app.command.categories.view"), aliases: t("app.command.aliases.vaultManager").split(", "), action: () => invoke("open_vault_manager_window") },
    // 已打开的知识仓库——输入仓库名称即可在新窗口打开
    ...vaults.map((vault) => ({
      id: `open-vault-window-${vault.path}`,
      label: t("app.command.labels.openVaultInNewWindow", { name: vault.name }),
      category: t("app.command.categories.view"),
      aliases: [vault.name],
      action: async () => {
        const win = getCurrentWindow();
        const [size, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
        invoke("open_vault_in_new_window", { vaultPath: vault.path, width: size.width / scale, height: size.height / scale });
      },
    })),
    { id: "publish", label: t("app.command.labels.publishWebsite"), category: t("app.command.categories.tools"), action: handlePublish },
    // 复制和导出 — 通过命令面板直接触发各格式导出/复制
    { id: "copy-markdown", label: t("app.command.labels.copyMarkdown"), category: t("app.command.categories.export"), aliases: t("app.command.aliases.copyMarkdown").split(", "), action: handleCopyAsMarkdown },
    { id: "copy-wechat", label: t("app.command.labels.copyWechat"), category: t("app.command.categories.export"), aliases: t("app.command.aliases.copyWechat").split(", "), action: () => handleExportRef.current("wechat") },
    { id: "export-pdf", label: t("app.command.labels.exportPdf"), category: t("app.command.categories.export"), aliases: t("app.command.aliases.exportPdf").split(", "), action: () => handleExportRef.current("pdf") },
    { id: "export-html", label: t("app.command.labels.exportHtml"), category: t("app.command.categories.export"), aliases: t("app.command.aliases.exportHtml").split(", "), action: () => handleExportRef.current("html") },
    { id: "export-docx", label: t("app.command.labels.exportWord"), category: t("app.command.categories.export"), aliases: t("app.command.aliases.exportWord").split(", "), action: () => handleExportRef.current("docx") },
    { id: "export-png", label: t("app.command.labels.exportImage"), category: t("app.command.categories.export"), aliases: t("app.command.aliases.exportImage").split(", "), action: () => handleExportRef.current("png") },
    { id: "export-xiaohongshu", label: t("app.command.labels.exportXhs"), category: t("app.command.categories.export"), aliases: t("app.command.aliases.exportXhs").split(", "), action: handleOpenXhs },

    // 编辑模式
    { id: "mode-ir", label: viewMode === "ir" ? t("app.command.labels.irModeActive") : t("app.command.labels.irMode"), category: t("app.command.categories.mode"), aliases: t("app.command.aliases.irMode").split(", "), action: () => setActiveMode("ir") },
    { id: "mode-sv", label: viewMode === "sv" ? t("app.command.labels.svModeActive") : t("app.command.labels.svMode"), category: t("app.command.categories.mode"), aliases: t("app.command.aliases.svMode").split(", "), action: () => setActiveMode("sv") },

    // 格式化
    { id: "bold", label: t("app.command.labels.bold"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("bold"), action: () => editorHandleRef.current?.executeCommand("bold") },
    { id: "italic", label: t("app.command.labels.italic"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("italic"), action: () => editorHandleRef.current?.executeCommand("italic") },
    { id: "strike", label: t("app.command.labels.strikethrough"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("strike"), action: () => editorHandleRef.current?.executeCommand("strike") },
    { id: "inline-code", label: t("app.command.labels.inlineCode"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("inline-code"), action: () => editorHandleRef.current?.executeCommand("inline-code") },
    { id: "code-block", label: t("app.command.labels.codeBlock"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("code-block"), action: () => editorHandleRef.current?.executeCommand("code") },
    { id: "link", label: t("app.command.labels.link"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("link"), action: () => editorHandleRef.current?.executeCommand("link") },
    { id: "quote", label: t("app.command.labels.quote"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("quote"), action: () => editorHandleRef.current?.executeCommand("quote") },
    { id: "hr", label: t("app.command.labels.horizontalRule"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("hr"), action: () => editorHandleRef.current?.executeCommand("line") },
    { id: "table", label: t("app.command.labels.table"), category: t("app.command.categories.format"), shortcut: getCommandShortcut("table"), action: () => editorHandleRef.current?.executeCommand("table") },

    // 列表
    { id: "unordered-list", label: t("app.command.labels.unorderedList"), category: t("app.command.categories.list"), shortcut: getCommandShortcut("unordered-list"), action: () => editorHandleRef.current?.executeCommand("list") },
    { id: "ordered-list", label: t("app.command.labels.orderedList"), category: t("app.command.categories.list"), shortcut: getCommandShortcut("ordered-list"), action: () => editorHandleRef.current?.executeCommand("ordered-list") },
    { id: "check-list", label: t("app.command.labels.taskList"), category: t("app.command.categories.list"), shortcut: getCommandShortcut("check-list"), action: () => editorHandleRef.current?.executeCommand("check") },

    // 标题
    { id: "heading-1", label: t("app.command.labels.h1"), category: t("app.command.categories.heading"), shortcut: getCommandShortcut("heading-1"), action: () => editorHandleRef.current?.executeCommand("heading-1") },
    { id: "heading-2", label: t("app.command.labels.h2"), category: t("app.command.categories.heading"), shortcut: getCommandShortcut("heading-2"), action: () => editorHandleRef.current?.executeCommand("heading-2") },
    { id: "heading-3", label: t("app.command.labels.h3"), category: t("app.command.categories.heading"), shortcut: getCommandShortcut("heading-3"), action: () => editorHandleRef.current?.executeCommand("heading-3") },
    { id: "heading-4", label: t("app.command.labels.h4"), category: t("app.command.categories.heading"), shortcut: getCommandShortcut("heading-4"), action: () => editorHandleRef.current?.executeCommand("heading-4") },
    { id: "heading-5", label: t("app.command.labels.h5"), category: t("app.command.categories.heading"), shortcut: getCommandShortcut("heading-5"), action: () => editorHandleRef.current?.executeCommand("heading-5") },
    { id: "heading-6", label: t("app.command.labels.h6"), category: t("app.command.categories.heading"), shortcut: getCommandShortcut("heading-6"), action: () => editorHandleRef.current?.executeCommand("heading-6") },
    { id: "paragraph", label: t("app.command.labels.paragraph"), category: t("app.command.categories.heading"), action: () => editorHandleRef.current?.executeCommand("paragraph") },

    // 插入
    { id: "upload", label: t("app.command.labels.insertImage"), category: t("app.command.categories.insert"), action: () => editorHandleRef.current?.executeCommand("upload") },
    { id: "footnotes", label: t("app.command.labels.insertFootnote"), category: t("app.command.categories.insert"), action: () => editorHandleRef.current?.executeCommand("footnotes") },
    { id: "toc", label: t("app.command.labels.insertToc"), category: t("app.command.categories.insert"), action: () => editorHandleRef.current?.executeCommand("toc") },
    { id: "math", label: t("app.command.labels.insertFormula"), category: t("app.command.categories.insert"), action: () => editorHandleRef.current?.executeCommand("math") },

    // 窗口操作
    { id: "minimize", label: t("app.command.labels.minimizeWindow"), category: t("app.command.categories.window"), action: handleMinimize },
    { id: "maximize", label: t("app.command.labels.maximizeWindow"), category: t("app.command.categories.window"), action: handleToggleMaximize },
    { id: "close", label: t("app.command.labels.closeWindow"), category: t("app.command.categories.window"), action: handleClose },

    // 设置
    { id: "open-settings", label: t("app.command.labels.openSettings"), category: t("app.command.categories.settings"), shortcut: getCommandShortcut("open-settings"), action: async () => {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const existing = await WebviewWindow.getByLabel("settings");
        if (existing) await existing.close();
        else await invoke("open_settings_window");
      } catch {
        invoke("open_settings_window");
      }
    } },
    { id: "settings-general", label: t("app.command.labels.generalSettings"), category: t("app.command.categories.settings"), aliases: t("app.command.aliases.generalSettings").split(", "), action: () => { localStorage.setItem("zmd-settings-initial-tab", "general"); invoke("open_settings_window"); } },
    { id: "settings-theme", label: t("app.command.labels.themeSettings"), category: t("app.command.categories.settings"), aliases: t("app.command.aliases.themeSettings").split(", "), action: () => { localStorage.setItem("zmd-settings-initial-tab", "theme"); invoke("open_settings_window"); } },
    { id: "settings-shortcuts", label: t("app.command.labels.shortcutSettings"), category: t("app.command.categories.settings"), aliases: t("app.command.aliases.shortcutSettings").split(", "), action: () => { localStorage.setItem("zmd-settings-initial-tab", "shortcuts"); invoke("open_settings_window"); } },
    { id: "settings-mindmap", label: t("app.command.labels.mindmapSettings"), category: t("app.command.categories.settings"), aliases: t("app.command.aliases.mindmapSettings").split(", "), action: () => { localStorage.setItem("zmd-settings-initial-tab", "mindmap"); invoke("open_settings_window"); } },
    { id: "settings-graph", label: t("app.command.labels.graphSettings"), category: t("app.command.categories.settings"), aliases: t("app.command.aliases.graphSettings").split(", "), action: () => { localStorage.setItem("zmd-settings-initial-tab", "graph"); invoke("open_settings_window"); } },
    { id: "settings-image", label: t("app.command.labels.imageSettings"), category: t("app.command.categories.settings"), aliases: t("app.command.aliases.imageSettings").split(", "), action: () => { localStorage.setItem("zmd-settings-initial-tab", "image"); invoke("open_settings_window"); } },
    { id: "settings-canvas", label: t("app.command.labels.canvasSettings"), category: t("app.command.categories.settings"), aliases: t("app.command.aliases.canvasSettings").split(", "), action: () => { localStorage.setItem("zmd-settings-initial-tab", "canvas"); invoke("open_settings_window"); } },
    { id: "settings-about", label: t("app.command.labels.about"), category: t("app.command.categories.settings"), aliases: t("app.command.aliases.about").split(", "), action: () => { localStorage.setItem("zmd-settings-initial-tab", "about"); invoke("open_settings_window"); } },
  ], [t, handleSave, activeVaultIndex, fileName, handleNewWindow, handleSidebarToggle, cycleMode, toggleTypewriterMode, handleMinimize, handleToggleMaximize, handleClose, setViewMode, setActiveMode, viewMode, vaults, handleCopyAsMarkdown, content, getGraphSettings, handleOpenXhs, handlePublish]);

  return (
    <div className="app">
      {/* 主内容区：左侧栏 + 编辑区域 */}
      <div className="main-container">
        {/* 左侧栏 */}
        <VimSidebar
          vaults={vaults}
          activeVaultIndex={activeVaultIndex}
          currentFilePath={fileName}
          content={content}
          onSelectFile={handleSelectFile}
          onSelectHeading={handleSelectHeading}
          onRemoveVault={handleRemoveVault}
          onNewWindow={handleNewWindow}
          onOpenInNewPanel={handleOpenInNewPanel}
          canOpenInNewPanel={!!fileName && isCurrentFileMarkdown && !canvasFilePath && !previewFilePath && !graphViewOpen}
          onPublish={handlePublish}
          onSelectVault={setActiveVaultIndex}
          collapsed={!sidebarOpen}
          refreshKey={treeRefreshKey}
          graphRefreshKey={graphRefreshKey}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          onBookmark={handleShowBookmarkDialog}
          outlineTrigger={outlineTrigger}
          side="left"
          tabs={leftTabs}
          onOpenGlobalGraph={() => setGraphViewOpen((prev) => !prev)}
          graphViewOpen={graphViewOpen}
        />

        {/* 编辑区域 */}
        <main className={`editor-container${!sidebarOpen ? " sidebar-is-closed" : ""}${(autoHideTopbar || (!sidebarOpen && autoHideTopbarOnCollapse)) ? " sidebar-collapsed" : ""}`}>
          <div className="editor-topbar-trigger" />
          {/* 顶部透明栏 */}
          <div className="editor-topbar" data-tauri-drag-region="deep">
            <div className="editor-topbar-left" data-tauri-drag-region="false">
              <button className="sidebar-toggle-btn" onClick={handleSidebarToggle} title={sidebarOpen ? t("app.toolbar.collapseSidebar") : t("app.toolbar.expandSidebar")}>
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
              {updateInfo && !updateDownloading && (
                <button className="update-btn" onClick={handleUpdateDownload} title={`New version v${updateInfo.version}`}>
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
                    {t("app.update.downloading")}{updateProgress.total ? ` ${Math.round(updateProgress.downloaded / updateProgress.total * 100)}%` : ""}
                  </div>
                  {updateProgress.total && (
                    <div className="update-progress-bar">
                      <div className="update-progress-fill" style={{ width: `${Math.round(updateProgress.downloaded / updateProgress.total * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <span className="editor-file-name" title={displayedFileName || "Tydora"}>
              {displayedTitle}
              <span className={`traffic-light traffic-light--${displayedFileName ? displayedSaveStatus : "idle"}`} />
            </span>
            <div className="window-controls" data-tauri-drag-region="false">
              {pinnedItems.back && (
                <button
                  className="window-control-btn"
                  title={t("app.menu.back")}
                  disabled={historyIndex <= 0}
                  onClick={() => { if (historyIndex <= 0) return; navigateBack(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}
              {pinnedItems.forward && (
                <button
                  className="window-control-btn"
                  title={t("app.menu.forward")}
                  disabled={historyIndex >= fileHistory.length - 1}
                  onClick={() => { if (historyIndex >= fileHistory.length - 1) return; navigateForward(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
              {pinnedItems.mindmap && (
                <button className="window-control-btn" title={t("app.toolbar.mindmap")} onClick={() => {
                  localStorage.setItem("zmd-mindmap-mode", "document");
                  localStorage.setItem("zmd-mindmap-content", content);
                  invoke("open_mindmap_window");
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4a1 1 0 0 1 0 2h-2.7a7.4 7.4 0 0 0-7.2 6H20a1 1 0 0 1 0 2h-9.9a7.4 7.4 0 0 0 7.2 6H20a1 1 0 0 1 0 2h-2.7a9.4 9.4 0 0 1-9.2-8H4a1 1 0 0 1 0-2h4.1a9.4 9.4 0 0 1 9.2-8H20z" />
                  </svg>
                </button>
              )}
              {pinnedItems.graph && (
                <button className="window-control-btn" title={t("app.toolbar.graph")} onClick={() => {
                  if (getGraphSettings().openInNewWindow) {
                    invoke("open_graph_window");
                  } else {
                    setGraphViewOpen(prev => !prev);
                  }
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="3" />
                    <circle cx="4" cy="19" r="3" />
                    <circle cx="20" cy="19" r="3" />
                    <line x1="9.5" y1="6.5" x2="5.5" y2="16.5" />
                    <line x1="14.5" y1="6.5" x2="18.5" y2="16.5" />
                    <line x1="7" y1="19" x2="17" y2="19" />
                  </svg>
                </button>
              )}
              {pinnedItems.export && (
                <button
                  className="window-control-btn"
                  title={t("app.toolbar.exportAndCopy")}
                  disabled={effectiveMode === "sv" || exporting}
                  onClick={() => {
                    if (effectiveMode === "sv" || exporting) return;
                    track(ANALYTICS_EVENTS.EXPORT_OPEN);
                    setMarkdownCopied(false);
                    setShowExportFormatPicker(true);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
              )}
              {pinnedItems.splitLr && (
                <button
                  className="window-control-btn"
                  title={t("app.menu.splitLeftRight")}
                  disabled={(!fileName || !isCurrentFileMarkdown) && !isActiveTerminal}
                  onClick={() => { if ((!fileName || !isCurrentFileMarkdown) && !isActiveTerminal) return; handleSplit('lr'); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                </button>
              )}
              {pinnedItems.splitTb && (
                <button
                  className="window-control-btn"
                  title={t("app.menu.splitTopBottom")}
                  disabled={(!fileName || !isCurrentFileMarkdown) && !isActiveTerminal}
                  onClick={() => { if ((!fileName || !isCurrentFileMarkdown) && !isActiveTerminal) return; handleSplit('tb'); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                  </svg>
                </button>
              )}
              <div className="editor-topbar-more-wrapper" ref={moreMenuRef} data-tauri-drag-region="false">
                <button className="window-control-btn" title={t("app.toolbar.more")} onClick={() => setMoreMenuOpen((v) => !v)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
                {moreMenuOpen && (
                  <div className="editor-topbar-more-menu">
                    <div
                      className={`editor-topbar-more-menu-item${historyIndex <= 0 ? ' disabled' : ''}`}
                      onClick={() => { setMoreMenuOpen(false); setShowExportFormatPicker(false); navigateBack(); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.back")}</span>
                      <button
                        className={`editor-topbar-more-menu-pin${pinnedItems.back ? ' pinned' : ''}`}
                        title={pinnedItems.back ? t("app.toolbar.unpin") : t("app.toolbar.pinToToolbar")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedItems(prev => ({ ...prev, back: !prev.back }));
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                          {pinnedItems.back && <line x1="2" y1="2" x2="22" y2="22" />}
                        </svg>
                      </button>
                    </div>
                    <div
                      className={`editor-topbar-more-menu-item${historyIndex >= fileHistory.length - 1 ? ' disabled' : ''}`}
                      onClick={() => { setMoreMenuOpen(false); setShowExportFormatPicker(false); navigateForward(); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.forward")}</span>
                      <button
                        className={`editor-topbar-more-menu-pin${pinnedItems.forward ? ' pinned' : ''}`}
                        title={pinnedItems.forward ? t("app.toolbar.unpin") : t("app.toolbar.pinToToolbar")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedItems(prev => ({ ...prev, forward: !prev.forward }));
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                          {pinnedItems.forward && <line x1="2" y1="2" x2="22" y2="22" />}
                        </svg>
                      </button>
                    </div>
                    <div className="editor-topbar-more-menu-divider" />
                    <div
                      className="editor-topbar-more-menu-item"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setFindReplaceDialogMode("find");
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.find")}</span>
                    </div>
                    <div
                      className="editor-topbar-more-menu-item"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setFindReplaceDialogMode("replace");
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 20V4"/>
                        <polyline points="4 8 8 4 12 8"/>
                        <path d="M16 4v16"/>
                        <polyline points="12 16 16 20 20 16"/>
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.replace")}</span>
                    </div>
                    <div className="editor-topbar-more-menu-divider" />
                    <div
                      className={`editor-topbar-more-menu-item${!fileName ? ' disabled' : ''}`}
                      onClick={() => { if (!fileName) return; handleRenameCurrentFile(); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="16 3 21 8 8 21 3 21 3 16" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.rename")}</span>
                    </div>
                    <div
                      className={`editor-topbar-more-menu-item${!fileName ? ' disabled' : ''}`}
                      onClick={() => { if (!fileName) return; handleBookmarkCurrentFile(); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.favorite")}</span>
                    </div>
                    <div
                      className="editor-topbar-more-menu-item"
                      onClick={() => { handleOpenTerminalPane("lr"); setMoreMenuOpen(false); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.newTerminal")}</span>
                    </div>
                    <div className="editor-topbar-more-menu-divider" />
                    <div
                      className={`editor-topbar-more-menu-item${(!fileName || !isCurrentFileMarkdown) && !isActiveTerminal ? ' disabled' : ''}${getImmediateParentGroupDir(splitLayout, activePaneId) === 'lr' ? ' active' : ''}`}
                      onClick={() => { if ((!fileName || !isCurrentFileMarkdown) && !isActiveTerminal) return; handleSplit('lr'); setMoreMenuOpen(false); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <line x1="12" y1="4" x2="12" y2="20" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.splitLeftRight")}</span>
                      <button
                        className={`editor-topbar-more-menu-pin${pinnedItems.splitLr ? ' pinned' : ''}`}
                        title={pinnedItems.splitLr ? t("app.toolbar.unpin") : t("app.toolbar.pinToToolbar")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedItems(prev => ({ ...prev, splitLr: !prev.splitLr }));
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                          {pinnedItems.splitLr && <line x1="2" y1="2" x2="22" y2="22" />}
                        </svg>
                      </button>
                    </div>
                    <div
                      className={`editor-topbar-more-menu-item${(!fileName || !isCurrentFileMarkdown) && !isActiveTerminal ? ' disabled' : ''}${getImmediateParentGroupDir(splitLayout, activePaneId) === 'tb' ? ' active' : ''}`}
                      onClick={() => { if ((!fileName || !isCurrentFileMarkdown) && !isActiveTerminal) return; handleSplit('tb'); setMoreMenuOpen(false); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.splitTopBottom")}</span>
                      <button
                        className={`editor-topbar-more-menu-pin${pinnedItems.splitTb ? ' pinned' : ''}`}
                        title={pinnedItems.splitTb ? t("app.toolbar.unpin") : t("app.toolbar.pinToToolbar")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedItems(prev => ({ ...prev, splitTb: !prev.splitTb }));
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                          {pinnedItems.splitTb && <line x1="2" y1="2" x2="22" y2="22" />}
                        </svg>
                      </button>
                    </div>
                    <div
                      className={`editor-topbar-more-menu-item${!fileName ? ' disabled' : ''}`}
                      onClick={() => { if (!fileName) return; handleNewWindow(fileName); setMoreMenuOpen(false); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="3" width="14.5" height="16" rx="3" />
                        <rect x="7.5" y="6" width="13.5" height="13" rx="3" />
                        <line x1="9.5" y1="15.8" x2="19.5" y2="15.8" strokeWidth="1.5" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.openInNewWindow")}</span>
                    </div>
                    <div className="editor-topbar-more-menu-divider" />
                    <div className={`editor-topbar-more-menu-item has-submenu${!fileName ? ' disabled' : ''}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.copyPath")}</span>
                      <span className="editor-topbar-more-menu-arrow">&#8250;</span>
                      <div className="editor-topbar-more-submenu">
                        <div
                          className="editor-topbar-more-menu-item"
                          onClick={() => { if (fileName) handleCopyRelativePath(); }}
                        >
                          {t("app.menu.relativePath")}
                        </div>
                        <div
                          className="editor-topbar-more-menu-item"
                          onClick={() => { if (fileName) handleCopyAbsolutePath(); }}
                        >
                          {t("app.menu.absolutePath")}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`editor-topbar-more-menu-item${!fileName && !(activeVaultIndex >= 0) ? ' disabled' : ''}`}
                      onClick={() => { if (!fileName && !(activeVaultIndex >= 0)) return; handleOpenTerminal(); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.openInTerminal")}</span>
                    </div>
                    <div
                      className={`editor-topbar-more-menu-item${!fileName ? ' disabled' : ''}`}
                      onClick={() => { if (!fileName) return; handleOpenFileLocation(); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.openInExplorer")}</span>
                    </div>
                    <div className="editor-topbar-more-menu-divider" />
                    <div
                      className="editor-topbar-more-menu-item"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        localStorage.setItem("zmd-mindmap-mode", "document");
                        localStorage.setItem("zmd-mindmap-content", content);
                        invoke("open_mindmap_window");
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 4a1 1 0 0 1 0 2h-2.7a7.4 7.4 0 0 0-7.2 6H20a1 1 0 0 1 0 2h-9.9a7.4 7.4 0 0 0 7.2 6H20a1 1 0 0 1 0 2h-2.7a9.4 9.4 0 0 1-9.2-8H4a1 1 0 0 1 0-2h4.1a9.4 9.4 0 0 1 9.2-8H20z" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.mindmap")}</span>
                      <button
                        className={`editor-topbar-more-menu-pin${pinnedItems.mindmap ? ' pinned' : ''}`}
                        title={pinnedItems.mindmap ? t("app.toolbar.unpin") : t("app.toolbar.pinToToolbar")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedItems(prev => ({ ...prev, mindmap: !prev.mindmap }));
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                          {pinnedItems.mindmap && <line x1="2" y1="2" x2="22" y2="22" />}
                        </svg>
                      </button>
                    </div>
                    <div
                      className="editor-topbar-more-menu-item"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        if (getGraphSettings().openInNewWindow) {
                          invoke("open_graph_window");
                        } else {
                          setGraphViewOpen(prev => !prev);
                        }
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="3" />
                        <circle cx="4" cy="19" r="3" />
                        <circle cx="20" cy="19" r="3" />
                        <line x1="9.5" y1="6.5" x2="5.5" y2="16.5" />
                        <line x1="14.5" y1="6.5" x2="18.5" y2="16.5" />
                        <line x1="7" y1="19" x2="17" y2="19" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{t("app.menu.graph")}</span>
                      <button
                        className={`editor-topbar-more-menu-pin${pinnedItems.graph ? ' pinned' : ''}`}
                        title={pinnedItems.graph ? t("app.toolbar.unpin") : t("app.toolbar.pinToToolbar")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedItems(prev => ({ ...prev, graph: !prev.graph }));
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                          {pinnedItems.graph && <line x1="2" y1="2" x2="22" y2="22" />}
                        </svg>
                      </button>
                    </div>
                    <div
                      className={`editor-topbar-more-menu-item${effectiveMode === "sv" || exporting ? ' disabled' : ''}`}
                      onClick={() => {
                        if (effectiveMode === "sv" || exporting) return;
                        track(ANALYTICS_EVENTS.EXPORT_OPEN);
                        setMoreMenuOpen(false);
                        setMarkdownCopied(false);
                        setShowExportFormatPicker(true);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span className="editor-topbar-more-menu-label">{exporting ? t("app.menu.exporting") : t("app.menu.exportAndCopy")}</span>
                      <button
                        className={`editor-topbar-more-menu-pin${pinnedItems.export ? ' pinned' : ''}`}
                        title={pinnedItems.export ? t("app.toolbar.unpin") : t("app.toolbar.pinToToolbar")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedItems(prev => ({ ...prev, export: !prev.export }));
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22" />
                          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                          {pinnedItems.export && <line x1="2" y1="2" x2="22" y2="22" />}
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* 右侧栏折叠/展开按钮：紧挨"更多"按钮右侧，仅当有 tab 配置在右侧栏时显示 */}
              {rightTabs.length > 0 && (
                <button
                  className="sidebar-toggle-btn"
                  onClick={handleRightSidebarToggle}
                  title={rightSidebarOpen ? t("app.toolbar.collapseRightSidebar") : t("app.toolbar.expandRightSidebar")}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1.5" y="1.5" width="15" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" />
                    {rightSidebarOpen ? (
                      <>
                        <rect x="10.5" y="2.5" width="5" height="13" rx="1" fill="currentColor" opacity="0.25" />
                        <line x1="10.5" y1="2.5" x2="10.5" y2="15.5" stroke="currentColor" strokeWidth="1.2" />
                      </>
                    ) : (
                      <line x1="10.5" y1="2.5" x2="10.5" y2="15.5" stroke="currentColor" strokeWidth="1.2" />
                    )}
                  </svg>
                </button>
              )}
              <div className="window-controls-divider window-controls-native" />
              <button className="window-control-btn window-controls-native" onClick={handleMinimize} title={t("app.toolbar.minimize")}>
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button className="window-control-btn window-controls-native" onClick={handleToggleMaximize} title={t("app.toolbar.maximize")}>
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <rect x="1" y="1" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button className="window-control-btn window-control-close window-controls-native" onClick={handleClose} title={t("app.toolbar.close")}>
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            </div>
          </div>

          {/* 编辑器面板 + 小红书预览分栏 */}
          <div className="editor-body">
          <div className="editor-panel">
            {/* Ctrl+滚轮调整字号时的右上角提示 */}
            {fontSizeToast !== null && (
              <div className="font-size-indicator" role="status" aria-live="polite">
                {t("app.fontSizeToast")} {fontSizeToast}px
              </div>
            )}
            {findReplaceDialogMode && isCurrentFileMarkdown && (
              <FindReplaceDialog
                editorHandle={editorHandleRef.current}
                mode={findReplaceDialogMode}
                onClose={() => setFindReplaceDialogMode(null)}
              />
            )}
            {graphViewOpen ? (
              <div className="graph-view-embedded">
                <Suspense fallback={null}>
                  <GraphView
                    vaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null}
                    onSelectNote={(path) => {
                      setGraphViewOpen(false);
                      handleSelectFile(path);
                    }}
                    standalone
                    refreshKey={graphRefreshKey}
                  />
                </Suspense>
              </div>
            ) : previewFilePath ? (
              <FilePreview
                filePath={previewFilePath}
                onBack={() => setPreviewFilePath(null)}
              />
            ) : canvasFilePath ? (
              <div style={{ width: '100%', height: '100%' }}>
                <Suspense fallback={null}>
                  <EmbeddedCanvasView />
                </Suspense>
              </div>
            ) : !fileName && !content.trim() && !layoutHasTerminal &&
                // initialFilePath / hasExternalFile 明确有文件 → 不显示欢迎
                // hasPendingFileResult === null：快查未返回 → 保持纯白（不闪现欢迎，避免"先欢迎再编辑器"）
                // hasPendingFileResult === true：有文件待处理 → 保持纯白
                // 只有 hasPendingFileResult === false：明确没有文件 → 显示欢迎卡片
                hasPendingFileResult === false &&
                !initialFilePath &&
                !hasExternalFile ? (
              <div className="editor-welcome">
                <div className="welcome-hint">
                  <div className="welcome-hint-item">
                    <span>{t("app.welcome.openFile")}</span>
                    <kbd>{formatShortcutKey("Ctrl")}</kbd>
                    <span>+</span>
                    <kbd>O</kbd>
                  </div>
                  <div className="welcome-hint-item">
                    <span>{t("app.welcome.commandPalette")}</span>
                    <kbd>{formatShortcutKey("Ctrl")}</kbd>
                    <span>+</span>
                    <kbd>P</kbd>
                  </div>
                </div>
              </div>
            ) : isCurrentFileMarkdown || layoutHasTerminal ? (
              // 递归渲染布局树：根若为 leaf 就是单窗格，否则为（嵌套）分屏组。
              (() => {
                const totalPanes = collectPaneIds(splitLayout).length;
                const renderSplitNode = (node: SplitNode, keySeed: string): React.ReactNode => {
                  if (node.type === "leaf") {
                    const pane = panes.find((p) => p.id === node.paneId) ?? panes[0];
                    return (
                      <div
                        key={`leaf-${keySeed}-${node.paneId}`}
                        className={`editor-split-pane${pane.id === activePaneId ? " is-active" : ""}`}
                        data-pane-id={pane.id}
                        style={{ flex: `${node.flex ?? 1} 1 0` }}
                        onFocus={() => {
                          setActivePaneId(pane.id);
                          editorHandleRef.current = paneHandlesRef.current[pane.id] ?? null;
                        }}
                      >
                        {renderPane(pane)}
                        {totalPanes > 1 && (
                          <button
                            className="editor-pane-close"
                            onClick={() => closePane(pane.id)}
                            title={t("app.toolbar.close")}
                            aria-label={t("app.toolbar.close")}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="6" y1="6" x2="18" y2="18" />
                              <line x1="18" y1="6" x2="6" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  }
                  // SplitGroup：渲染一个分屏容器，children 之间放分隔线
                  const group = node;
                  const groupRefCb = (el: HTMLDivElement | null) => {
                    if (el) splitGroupRefs.current[group.groupId] = el;
                    else delete splitGroupRefs.current[group.groupId];
                  };
                  return (
                    <div
                      key={`grp-${keySeed}-${group.groupId}`}
                      ref={groupRefCb}
                      className={`editor-split editor-split-${group.dir}${splitResizing ? " resizing" : ""}`}
                      style={{ flex: `${group.flex ?? 1} 1 0` }}
                    >
                      {group.children.map((child, i) => (
                        <Fragment key={`${group.groupId}-child-${i}`}>
                          {i > 0 && (
                            <div
                              className="editor-split-divider"
                              onMouseDown={(e) => handleSplitResizeDown(e, group.groupId, i - 1)}
                            />
                          )}
                          {renderSplitNode(child, `${keySeed}-${group.groupId}-${i}`)}
                        </Fragment>
                      ))}
                    </div>
                  );
                };
                return renderSplitNode(splitLayout, "root");
              })()
            ) : (
              <EditorErrorBoundary>
                <Suspense fallback={<div className="editor-panel" />}>
                  <CodeMirrorEditor
                    ref={codeMirrorRef}
                    value={content}
                    onChange={handleChange}
                    onWordCount={setWordCount}
                    filePath={fileName}
                  />
                </Suspense>
              </EditorErrorBoundary>
            )}
          </div>

          {xhsPreviewOpen && isCurrentFileMarkdown && panes.length === 1 && !canvasFilePath && !graphViewOpen && !previewFilePath && (
            <XhsPreviewPanel
              title={title.replace(/\.[^.]+$/, "")}
              content={content}
              viewMode={viewMode}
              getContentElement={() => editorHandleRef.current?.getContentElement() ?? null}
              editorTheme={theme}
              width={xhsPreviewWidth}
              onWidthChange={setXhsPreviewWidth}
              onClose={() => setXhsPreviewOpen(false)}
            />
          )}
          </div>

          {/* 底部浮动控件：左下角（Vim 状态徽标 + 模式切换按钮） */}
          {(vimEnabled || (!canvasFilePath && !graphViewOpen && isCurrentFileMarkdown)) && (
            <div className="editor-bottom-controls editor-bottom-left">
              {/* Vim 模式徽标：始终在模式切换按钮的左边；若没有模式按钮则直接在最左边 */}
              {vimEnabled && (() => {
                const badgeLetter =
                  vimMode === "insert" ? "I" :
                  vimMode === "visual" ? "V" : "N";
                const badgeTitle =
                  vimMode === "insert" ? t("app.vimMode.insert", "INSERT 模式") :
                  vimMode === "visual" ? t("app.vimMode.visual", "VISUAL 模式") :
                  t("app.vimMode.normal", "NORMAL 模式");
                const badgeClass =
                  vimMode === "insert" ? "vim-mode-badge vim-mode-badge--insert" :
                  vimMode === "visual" ? "vim-mode-badge vim-mode-badge--visual" :
                  "vim-mode-badge vim-mode-badge--normal";
                return (
                  <span className={badgeClass} title={badgeTitle}>
                    {badgeLetter}
                  </span>
                );
              })()}
              {!canvasFilePath && !graphViewOpen && isCurrentFileMarkdown && (
                <button
                  className="editor-mode-toggle source-mode-toggle"
                  onClick={cycleMode}
                  title={`${MODE_LABELS[effectiveMode]} (Ctrl+/)`}
                >
                  {MODE_LABELS[effectiveMode]}
                </button>
              )}
            </div>
          )}
          {!canvasFilePath && !graphViewOpen && (
          <div className="editor-bottom-controls editor-bottom-right">
            <button
              className={`typewriter-indicator ${typewriterMode ? 'active' : ''}`}
              onClick={toggleTypewriterMode}
              title={typewriterMode ? t("app.typewriter.enabled") : t("app.typewriter.disabled")}
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
              {t("app.wordCount", { count: wordCount })}
            </span>
          </div>
          )}

          {/* App 级 Leader 菜单：欢迎面板 / 无 TipTap/CodeMirror 编辑器时的兜底菜单 */}
          {vimEnabled && (
            <LeaderMenu
              open={appLeader.open}
              items={appLeader.items}
              path={appLeader.path}
            />
          )}
        </main>

        {/* 右侧栏：仅在展开或有 tab 时渲染，避免折叠态占位 */}
        {(rightSidebarOpen || rightTabs.length > 0) && (
          <VimSidebar
            vaults={vaults}
            activeVaultIndex={activeVaultIndex}
            currentFilePath={fileName}
            content={content}
            onSelectFile={handleSelectFile}
            onSelectHeading={handleSelectHeading}
            onRemoveVault={handleRemoveVault}
            onNewWindow={handleNewWindow}
            onOpenInNewPanel={handleOpenInNewPanel}
            canOpenInNewPanel={!!fileName && isCurrentFileMarkdown && !canvasFilePath && !previewFilePath && !graphViewOpen}
            onPublish={handlePublish}
            onSelectVault={setActiveVaultIndex}
            collapsed={!rightSidebarOpen}
            refreshKey={treeRefreshKey}
            graphRefreshKey={graphRefreshKey}
            width={rightSidebarWidth}
            onWidthChange={setRightSidebarWidth}
            onBookmark={handleShowBookmarkDialog}
            outlineTrigger={outlineTrigger}
            side="right"
            tabs={rightTabs}
            onOpenGlobalGraph={() => setGraphViewOpen((prev) => !prev)}
            graphViewOpen={graphViewOpen}
          />
        )}
      </div>

      {/* 快速打开文件弹窗 */}
      {quickOpenOpen && (
        <QuickOpen
          vault={activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null}
          vaults={vaults}
          recentFiles={activeVaultIndex >= 0 ? recentFiles[vaults[activeVaultIndex].path] || [] : []}
          currentFilePath={fileName}
          onSelect={(path) => {
            setQuickOpenOpen(false);
            handleSelectFile(path);
          }}
          onSelectFileInNewWindow={(path) => {
            setQuickOpenOpen(false);
            handleNewWindow(path);
          }}
          onSelectFileInSplitPane={(path, dir) => {
            setQuickOpenOpen(false);
            handleOpenInSplit(path, dir);
          }}
          onSelectVault={async (vaultPath) => {
            setQuickOpenOpen(false);
            const win = getCurrentWindow();
            const [size, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
            invoke("open_vault_in_new_window", { vaultPath, width: size.width / scale, height: size.height / scale });
          }}
          onSelectVaultCurrent={(vaultPath) => {
            setQuickOpenOpen(false);
            const index = vaults.findIndex((v) => v.path === vaultPath);
            if (index >= 0) setActiveVaultIndex(index);
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
        title={t("app.dialog.saveFile")}
        message={t("app.dialog.saveFileMessage", { name: fileName?.split(/[/\\]/).pop() || "" })}
        type="warning"
        confirmText={t("app.dialog.save")}
        cancelText={t("app.dialog.dontSave")}
        onConfirm={handleSaveConfirm}
        onCancel={handleSaveCancel}
      />

      <ConfirmDialog
        isOpen={closeConfirmOpen}
        title={t("app.dialog.unsavedChangesTitle")}
        message={t("app.dialog.unsavedChangesMessage", {
          name: canvasFilePath
            ? canvasFilePath.split(/[/\\]/).pop() || ""
            : fileName?.split(/[/\\]/).pop() || "",
        })}
        type="warning"
        confirmText={t("app.dialog.saveAndClose")}
        cancelText={t("app.dialog.cancel")}
        discardText={t("app.dialog.dontSaveAndClose")}
        discardHint="X"
        onConfirm={handleCloseConfirmSave}
        onCancel={handleCloseConfirmCancel}
        onDiscard={handleCloseConfirmDiscard}
      />

      {showExportFormatPicker && (
        <div className="export-formatpicker-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowExportFormatPicker(false); }}>
          <div className="export-formatpicker-dialog">
            <div className="export-formatpicker-header">
              <span>{t("app.export.title")}</span>
              <button className="export-formatpicker-close" onClick={() => setShowExportFormatPicker(false)}>✕</button>
            </div>
            <div className="export-formatpicker-body">
              {/* 第一行：复制 — Markdown + 公众号 */}
              <button
                className="export-formatpicker-option"
                onClick={handleCopyAsMarkdown}
              >
                <span className="export-formatpicker-option-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <path d="M10 9 L7 9" />
                  </svg>
                </span>
                <span className="export-formatpicker-option-label">Markdown</span>
                <span className="export-formatpicker-option-ext">{markdownCopied ? t("app.dialog.copied") : t("app.dialog.copy")}</span>
              </button>
              <button
                className="export-formatpicker-option"
                onClick={() => handleExport("wechat")}
                disabled={exporting}
              >
                <span className="export-formatpicker-option-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.5 19c3.9 0 7-2.5 7-5.5S12.4 8 8.5 8s-7 2.5-7 5.5c0 1.6.8 3 2.1 4l-.6 1.7 2.1-1.1c1 .4 2.1.6 3.3.6" />
                    <path d="M15.5 14c3.5 0 6.3-2.2 6.3-5S19 4 15.5 4 9.2 6.2 9.2 9c0 1.5.7 2.8 1.9 3.7l-.6 1.8 2-1c.9.3 1.9.5 2.9.5Z" />
                  </svg>
                </span>
                <span className="export-formatpicker-option-label">{t("app.export.wechat")}</span>
                <span className="export-formatpicker-option-ext">{t("app.dialog.copy")}</span>
              </button>
              {/* 分隔线 */}
              <div className="export-formatpicker-separator" />
              {/* 小红书图文：进入右侧分栏实时预览 */}
              <button
                className="export-formatpicker-option export-formatpicker-option-xhs"
                onClick={handleOpenXhs}
                disabled={exporting}
              >
                <span className="export-formatpicker-option-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </span>
                <span className="export-formatpicker-option-label">{t("app.export.xiaohongshu")}</span>
                <span className="export-formatpicker-option-ext">{t("app.export.xhsBadge")}</span>
              </button>
              {/* 第二行起：导出格式 */}
              {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).filter(fmt => fmt !== "wechat").map((fmt) => (
                <button
                  key={fmt}
                  className="export-formatpicker-option"
                  onClick={() => handleExport(fmt)}
                  disabled={exporting}
                >
                  <span className="export-formatpicker-option-icon">
                    {fmt === "pdf" && (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    )}
                    {fmt === "html" && (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                    )}
                    {fmt === "docx" && (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    )}
                    {fmt === "png" && (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )}
                  </span>
                  <span className="export-formatpicker-option-label">{t(`app.export.${fmt}`)}</span>
                  <span className="export-formatpicker-option-ext">.{EXPORT_FORMATS[fmt].ext}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {exportPreview && (
        <ExportPreviewDialog
          format={exportPreview.format}
          artifact={exportPreview.artifact}
          title={title.replace(/\.[^.]+$/, "")}
          onClose={() => setExportPreview(null)}
          onSaveSuccess={(savedPath) => {
            setExportPreview(null);
            invoke("open_file", { filePath: savedPath });
          }}
        />
      )}

      <BookmarkDialog
        isOpen={bookmarkDialogState.isOpen}
        filePath={bookmarkDialogState.filePath}
        fileName={bookmarkDialogState.fileName}
        isDirectory={bookmarkDialogState.isDirectory}
        vaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path ?? "" : ""}
        existingGroups={activeVaultIndex >= 0 ? BookmarksService.getGroupsForVault(vaults[activeVaultIndex]?.path ?? "") : []}
        onSave={(title, groupId) => {
          if (activeVaultIndex >= 0) {
            const vaultPath = vaults[activeVaultIndex]?.path ?? "";
            if (bookmarkDialogState.isOpen) {
              BookmarksService.addBookmark(vaultPath, bookmarkDialogState.filePath, title, groupId);
            }
          }
          setBookmarkDialogState((s) => ({ ...s, isOpen: false }));
        }}
        onCancel={() => setBookmarkDialogState((s) => ({ ...s, isOpen: false }))}
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

      {/* Tag 自动补全 */}
      {tagAutocompleteVisible && (
        <TagAutocomplete
          query={tagAutocompleteQuery}
          position={tagAutocompletePosition}
          onSelect={handleTagAutocompleteSelect}
          onClose={handleTagAutocompleteClose}
        />
      )}

      {/* WikiLink 悬停预览（栈式，支持嵌套） */}
      {wikiPreviewStack.map((preview) => (
        <WikiLinkPreview
          key={`${preview.depth}-${preview.noteName}`}
          noteName={preview.noteName}
          heading={preview.heading}
          anchorRect={preview.anchorRect}
          depth={preview.depth}
          vaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path ?? "" : ""}
          onMouseEnter={() => (window as any).__wikiPreviewEnter?.(preview.depth)}
          onMouseLeave={(e) => (window as any).__wikiPreviewLeave?.(preview.depth, e)}
          onClose={() => setWikiPreviewStack([])}
        />
      ))}

      {/* 发布面板 */}
      {publishOpen && (
        <PublishPanel
          vaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null}
          onClose={() => setPublishOpen(false)}
        />
      )}

      {/* 发布配置弹窗：配置文件缺失时先完成配置 */}
      {publishConfigOpen && (
        <PublishConfigDialog
          vaultPath={activeVaultIndex >= 0 ? vaults[activeVaultIndex]?.path : null}
          onClose={() => setPublishConfigOpen(false)}
          onSaved={() => {
            setPublishConfigOpen(false);
            setPublishOpen(true);
          }}
        />
      )}

      {/* 首次启动：匿名统计同意弹窗 */}
      {consentVisible && <ConsentDialog onDecide={handleConsentDecision} />}
    </div>
  );
}

export default App;
