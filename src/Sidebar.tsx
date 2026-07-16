import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { readDir, readTextFile, writeTextFile, mkdir, remove, rename, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "./components";
import { UpdateLinkDialog } from "./components";
import { FolderPicker } from "./components";
import { LinkIndexService } from "./wikilink";
import { BookmarksPanel } from "./Bookmarks";
import "./Sidebar.css";

// ── Types ────────────────────────────────────────────────────────────

export interface VaultInfo {
  name: string;
  path: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children: TreeNode[] | null;
  expanded: boolean;
}

interface SidebarProps {
  vaults: VaultInfo[];
  activeVaultIndex: number;
  currentFilePath: string | null;
  content: string;
  onSelectFile: (path: string, line?: number, query?: string) => void;
  onSelectHeading: (level: number, text: string, line: number) => void;
  onRemoveVault: (index: number) => void;
  onNewWindow: (filePath: string) => void;
  onPublish: () => void;
  collapsed: boolean;
  refreshKey: number;
  width: number;
  onWidthChange: (width: number) => void;
  onBookmark: (filePath: string, isDirectory: boolean) => void;
}

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function loadDirectory(dirPath: string): Promise<TreeNode[]> {
  try {
    const entries = await readDir(dirPath);
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = joinPath(dirPath, entry.name);
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory,
        isFile: entry.isFile,
        children: entry.isDirectory ? null : null,
        expanded: false,
      });
    }
    return sortTreeNodes(nodes);
  } catch {
    return [];
  }
}

function pathSep(): string {
  return navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
}

function joinPath(parent: string, child: string): string {
  const sep = pathSep();
  const clean = parent.endsWith("/") || parent.endsWith("\\") ? parent.slice(0, -1) : parent;
  return `${clean}${sep}${child}`;
}

function parentPath(path: string): string {
  const sep = pathSep();
  const idx = path.lastIndexOf(sep);
  return idx > 0 ? path.substring(0, idx) : path;
}

async function uniqueFilePath(dirPath: string, baseName: string, ext: string): Promise<string> {
  const first = joinPath(dirPath, `${baseName}${ext}`);
  if (!(await exists(first))) return first;
  for (let i = 1; ; i++) {
    const candidate = joinPath(dirPath, `${baseName} ${i}${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
}

async function uniqueDirPath(dirPath: string, dirName: string): Promise<string> {
  const first = joinPath(dirPath, dirName);
  if (!(await exists(first))) return first;
  for (let i = 1; ; i++) {
    const candidate = joinPath(dirPath, `${dirName} ${i}`);
    if (!(await exists(candidate))) return candidate;
  }
}

// ── Search ──────────────────────────────────────────────────────────

interface SearchMatch {
  line: number;
  content: string;
}

interface SearchResult {
  path: string;
  fileName: string;
  matches: SearchMatch[];
}

const SEARCHABLE_EXTS = new Set([
  "md", "markdown", "txt", "json", "js", "ts", "tsx", "jsx",
  "html", "css", "scss", "less", "xml", "yaml", "yml",
  "py", "rs", "go", "java", "c", "cpp", "h", "hpp",
  "sh", "bash", "zsh", "bat", "ps1",
  "toml", "ini", "cfg", "conf", "log",
  "vue", "svelte", "astro",
]);

const MAX_RESULTS = 50;
const MAX_FILE_SIZE = 1024 * 1024;
const CONCURRENCY = 12;

// ── File list cache ──
interface FileEntry { path: string; name: string; }
const fileCache = new Map<string, FileEntry[]>();

// ── Expanded state persistence ──
function getExpandedStorageKey(vaultPath: string): string {
  return `zmd-expanded-dirs-${vaultPath}`;
}

function loadExpandedPaths(vaultPath: string): Set<string> {
  try {
    const raw = localStorage.getItem(getExpandedStorageKey(vaultPath));
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    }
  } catch {}
  return new Set();
}

function saveExpandedPaths(vaultPath: string, paths: Set<string>): void {
  try {
    localStorage.setItem(getExpandedStorageKey(vaultPath), JSON.stringify(Array.from(paths)));
  } catch {}
}

async function getFileList(dirPath: string): Promise<FileEntry[]> {
  const cached = fileCache.get(dirPath);
  if (cached) return cached;
  const files: FileEntry[] = [];
  async function walk(dir: string) {
    let entries;
    try { entries = await readDir(dir); } catch { return; }
    const tasks: Promise<void>[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = joinPath(dir, entry.name);
      if (entry.isDirectory) {
        tasks.push(walk(full));
      } else if (entry.isFile) {
        const ext = entry.name.split(".").pop()?.toLowerCase() || "";
        if (SEARCHABLE_EXTS.has(ext)) {
          files.push({ path: full, name: entry.name });
        }
      }
    }
    await Promise.all(tasks);
  }
  await walk(dirPath);
  fileCache.set(dirPath, files);
  return files;
}

function invalidateFileCache(dirPath: string) {
  fileCache.delete(dirPath);
}

async function searchFile(filePath: string, lowerQuery: string): Promise<SearchMatch[] | null> {
  try {
    const content = await readTextFile(filePath);
    if (content.length > MAX_FILE_SIZE) return null;
    const lines = content.split("\n");
    const matches: SearchMatch[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        matches.push({ line: i + 1, content: lines[i].trim() });
        if (matches.length >= 3) break;
      }
    }
    return matches.length > 0 ? matches : null;
  } catch {
    return null;
  }
}

async function searchVaultIncremental(
  vaultPath: string,
  query: string,
  onBatch: (results: SearchResult[]) => void,
  signal: { cancelled: boolean },
): Promise<SearchResult[]> {
  const lowerQuery = query.toLowerCase();
  const files = await getFileList(vaultPath);
  const results: SearchResult[] = [];

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    if (signal.cancelled || results.length >= MAX_RESULTS) break;
    const batch = files.slice(i, i + CONCURRENCY);
    const batchMatches = await Promise.all(
      batch.map((f) => searchFile(f.path, lowerQuery)),
    );
    let changed = false;
    for (let j = 0; j < batch.length; j++) {
      const matches = batchMatches[j];
      if (matches) {
        results.push({ path: batch[j].path, fileName: batch[j].name, matches });
        changed = true;
      }
    }
    if (changed) onBatch([...results]);
  }

  return results;
}

// ── ContextMenu Component ────────────────────────────────────────────

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const rect = menu.getBoundingClientRect();
    const GAP = 4;

    let left = x;
    let top = y;

    if (left + rect.width > window.innerWidth - GAP) {
      left = x - rect.width;
    }
    if (top + rect.height > window.innerHeight - GAP) {
      top = y - rect.height;
    }
    if (left < GAP) left = GAP;
    if (top < GAP) top = GAP;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [x, y]);

  return createPortal(
    <div ref={menuRef} className="context-menu">
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <div className="context-menu-divider" />}
          <div
            className={`context-menu-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ── Context Menu Action Helpers ──────────────────────────────────────

interface FileActions {
  onOpen: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onNewWhiteboard: () => void;
  onSearch: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onOpenLocation: () => void;
  onNewWindow: () => void;
  onBookmark: () => void;
  onMoveTo: () => void;
}

function getFileMenuItems(actions: FileActions): ContextMenuItem[] {
  return [
    { label: "打开", onClick: actions.onOpen },
    { label: "在新窗口中打开", onClick: actions.onNewWindow },
    { label: "收藏", onClick: actions.onBookmark },
    { label: "新建文件", onClick: actions.onNewFile, separator: true },
    { label: "新建白板", onClick: actions.onNewWhiteboard },
    { label: "新建文件夹", onClick: actions.onNewFolder },
    { label: "搜索", onClick: actions.onSearch },
    { label: "重命名", onClick: actions.onRename, separator: true },
    { label: "创建副本", onClick: actions.onDuplicate },
    { label: "移动到...", onClick: actions.onMoveTo },
    { label: "删除", onClick: actions.onDelete, danger: true, separator: true },
    { label: "复制文件路径", onClick: actions.onCopyPath, separator: true },
    { label: "打开文件位置", onClick: actions.onOpenLocation },
  ];
}

function getFolderMenuItems(actions: FileActions): ContextMenuItem[] {
  return [
    { label: "新建文件", onClick: actions.onNewFile },
    { label: "新建白板", onClick: actions.onNewWhiteboard },
    { label: "新建文件夹", onClick: actions.onNewFolder },
    { label: "收藏", onClick: actions.onBookmark },
    { label: "搜索", onClick: actions.onSearch },
    { label: "重命名", onClick: actions.onRename, separator: true },
    { label: "移动到...", onClick: actions.onMoveTo },
    { label: "删除", onClick: actions.onDelete, danger: true, separator: true },
    { label: "复制文件路径", onClick: actions.onCopyPath },
    { label: "打开文件位置", onClick: actions.onOpenLocation },
  ];
}

function getBlankMenuItems(actions: FileActions): ContextMenuItem[] {
  return [
    { label: "新建文件", onClick: actions.onNewFile },
    { label: "新建白板", onClick: actions.onNewWhiteboard },
    { label: "新建文件夹", onClick: actions.onNewFolder },
    { label: "搜索", onClick: actions.onSearch },
    { label: "复制文件路径", onClick: actions.onCopyPath },
    { label: "打开文件位置", onClick: actions.onOpenLocation },
  ];
}

function showDevAlert() {
  alert("此功能开发中");
}

function showToast(message: string) {
  const existing = document.querySelector(".sidebar-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "sidebar-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}

// ── SearchBox Component ─────────────────────────────────────────────

function SearchBar({
  query,
  onQueryChange,
  onClose,
  inputRef,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="sidebar-search-bar">
      <input
        ref={inputRef}
        className="sidebar-search-input"
        type="text"
        placeholder="搜索文件内容..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onQueryChange("");
            onClose();
          }
        }}
      />
      {query && (
        <button
          className="sidebar-search-clear"
          onClick={() => onQueryChange("")}
          title="清除"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function SearchResults({
  vaultPath,
  query,
  onSelectFile,
}: {
  vaultPath: string;
  query: string;
  onSelectFile: (path: string, line?: number, query?: string) => void;
}) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const signalRef = useRef({ cancelled: false });

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    signalRef.current.cancelled = true;
    const signal = { cancelled: false };
    signalRef.current = signal;
    const timer = setTimeout(async () => {
      setSearching(true);
      setResults([]);
      await searchVaultIncremental(vaultPath, query.trim(), (batch) => {
        if (!signal.cancelled) setResults(batch);
      }, signal);
      if (!signal.cancelled) setSearching(false);
    }, 150);
    return () => { clearTimeout(timer); signalRef.current.cancelled = true; };
  }, [query, vaultPath]);

  const highlight = (text: string, q: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="sidebar-search-results">
      {searching && <div className="sidebar-search-status">搜索中...</div>}
      {!searching && results.length === 0 && (
        <div className="sidebar-search-status">未找到匹配结果</div>
      )}
      {!searching && results.map((r) => (
        <div key={r.path} className="sidebar-search-result">
          <div className="sidebar-search-result-name"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign: "-2px", marginRight: 4}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>{r.fileName}</div>
          {r.matches.map((m, i) => (
            <div
              key={i}
              className="sidebar-search-result-line"
              onClick={() => onSelectFile(r.path, m.line, query.trim())}
            >
              <span className="sidebar-search-result-ln">{m.line}</span>
              <span className="sidebar-search-result-text">
                {highlight(m.content, query.trim())}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── TreeNode Component ───────────────────────────────────────────────

function TreeNodeComp({
  node,
  depth,
  activePath,
  onSelect,
  onRefresh,
  onReload,
  rootPath,
  dragOverPath,
  onMouseDown,
  editingPath,
  onStartEdit,
  onFinishEdit,
  onNewWindow,
  onBookmark,
  selectedPaths,
  onMultiSelect,
  lastClickedPathRef,
  onToggleExpand,
  onMoveTo,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
  onReload: (expandPath?: string) => void;
  rootPath: string;
  dragOverPath: string | null;
  onMouseDown: (e: React.MouseEvent, nodePath: string) => void;
  editingPath: string | null;
  onStartEdit: (path: string) => void;
  onFinishEdit: (path: string, newName: string) => void;
  onNewWindow: (filePath: string) => void;
  onBookmark: (filePath: string, isDirectory: boolean) => void;
  selectedPaths: Set<string>;
  onMultiSelect: (paths: string[], mode: 'toggle' | 'range' | 'replace') => void;
  lastClickedPathRef: React.MutableRefObject<string | null>;
  onToggleExpand: (path: string, expanded: boolean) => void;
  onMoveTo: (path: string) => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingPath === node.path;

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      const inp = inputRef.current;
      inp.focus();
      const val = inp.value;
      const dot = val.lastIndexOf(".");
      if (dot > 0) {
        inp.setSelectionRange(0, dot);
      } else {
        inp.select();
      }
    }
  }, [isEditing]);

  const handleToggle = useCallback(async (e: React.MouseEvent) => {
    if (!node.isDirectory) {
      // Shift+click: range select
      if (e.shiftKey) {
        e.preventDefault();
        const allNodes = Array.from(document.querySelectorAll('.tree-node[data-path]'));
        const paths = allNodes.map(n => (n as HTMLElement).dataset.path!);
        const anchor = lastClickedPathRef.current;
        if (anchor) {
          const start = paths.indexOf(anchor);
          const end = paths.indexOf(node.path);
          if (start !== -1 && end !== -1) {
            const [lo, hi] = start < end ? [start, end] : [end, start];
            const range = paths.slice(lo, hi + 1);
            onMultiSelect(range, 'range');
          }
        }
        lastClickedPathRef.current = node.path;
        onSelect(node.path);
        return;
      }
      // Ctrl+click: toggle selection
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onMultiSelect([node.path], 'toggle');
        lastClickedPathRef.current = node.path;
        onSelect(node.path);
        return;
      }
      // Normal click: clear selection
      onMultiSelect([], 'replace');
      lastClickedPathRef.current = node.path;
      onSelect(node.path);
      return;
    }
    // Directory toggle
    if (node.children === null) {
      node.children = await loadDirectory(node.path);
    }
    node.expanded = !node.expanded;
    onToggleExpand(node.path, node.expanded);
    onRefresh();
  }, [node, onSelect, onRefresh, onMultiSelect, lastClickedPathRef, onToggleExpand]);

  // ── Actions ──

  const handleNewFile = useCallback(async () => {
    const targetDir = node.isDirectory ? node.path : parentPath(node.path);
    try {
      const filePath = await uniqueFilePath(targetDir, "untitled", ".md");
      await writeTextFile(filePath, ""); await onReload(targetDir); onStartEdit(filePath);
    } catch (err) { console.error("新建文件失败:", err); }
  }, [node, onReload, onStartEdit]);

  const handleNewFolder = useCallback(async () => {
    const targetDir = node.isDirectory ? node.path : parentPath(node.path);
    try {
      const dirPath = await uniqueDirPath(targetDir, "新建文件夹");
      await mkdir(dirPath); await onReload(targetDir); onStartEdit(dirPath);
    } catch (err) { console.error("新建文件夹失败:", err); }
  }, [node, onReload, onStartEdit]);

  const handleNewWhiteboard = useCallback(async () => {
    const targetDir = node.isDirectory ? node.path : parentPath(node.path);
    try {
      const filePath = await uniqueFilePath(targetDir, "untitled", ".canvas");
      await writeTextFile(filePath, '{"nodes":[],"edges":[]}'); await onReload(targetDir); onStartEdit(filePath);
    } catch (err) { console.error("新建白板失败:", err); }
  }, [node, onReload, onStartEdit]);

  const handleRename = useCallback(async () => {
    onStartEdit(node.path);
  }, [node, onStartEdit]);

  const handleDelete = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleteConfirmOpen(false);
    try {
      const pathsToDelete = selectedPaths.size > 0 && selectedPaths.has(node.path)
        ? Array.from(selectedPaths)
        : [node.path];
      for (const p of pathsToDelete) {
        await remove(p, { recursive: true });
      }
      onMultiSelect([], 'replace');
      onReload();
    } catch (err) { console.error("删除失败:", err); }
  }, [node, onReload, selectedPaths, onMultiSelect]);

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(node.path).then(() => {
      showToast("路径已复制到剪贴板");
    }).catch(() => { prompt("文件路径:", node.path); });
  }, [node]);

  const handleOpenLocation = useCallback(async () => {
    try {
      await invoke("open_file_location", { filePath: node.path });
    } catch (err) {
      console.error("打开文件位置失败:", err);
    }
  }, [node]);

  const actions: FileActions = {
    onOpen: () => handleToggle({} as React.MouseEvent),
    onNewWindow: () => onNewWindow(node.path),
    onNewFile: handleNewFile,
    onNewFolder: handleNewFolder,
    onNewWhiteboard: handleNewWhiteboard,
    onSearch: showDevAlert,
    onRename: handleRename,
    onDuplicate: showDevAlert,
    onDelete: handleDelete,
    onCopyPath: handleCopyPath,
    onOpenLocation: handleOpenLocation,
    onBookmark: () => onBookmark(node.path, node.isDirectory),
    onMoveTo: () => onMoveTo(node.path),
  };

  const menuItems = node.isDirectory
    ? getFolderMenuItems(actions)
    : getFileMenuItems(actions);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const isActive = activePath === node.path;
  const isSelected = selectedPaths.has(node.path);
  const indent = depth * 22;
  const isDragOver = node.isDirectory && dragOverPath === node.path;

  return (
    <div className="tree-branch">
      <div
        ref={nodeRef}
        className={`tree-node${isActive ? " active" : ""}${isSelected ? " selected" : ""}${isDragOver ? " drag-over" : ""}`}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => onMouseDown(e, node.path)}
        title={node.path}
        data-path={node.path}
        data-is-dir={node.isDirectory ? "1" : "0"}
      >
        {node.isDirectory ? (
          <span className={`tree-chevron${node.expanded ? " expanded" : ""}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </span>
        ) : (
          <span className="tree-icon-spacer" />
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            className="tree-name-input"
            defaultValue={node.name}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onFinishEdit(node.path, (e.target as HTMLInputElement).value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onFinishEdit(node.path, node.name);
              }
            }}
            onBlur={(e) => {
              onFinishEdit(node.path, e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-name">{node.name}</span>
        )}
      </div>

      {node.isDirectory && node.expanded && node.children && (
        <div className="tree-children" style={{ '--tree-depth': depth } as React.CSSProperties}>
          {node.children.map((child) => (
            <TreeNodeComp
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onSelect={onSelect}
              onRefresh={onRefresh}
              onReload={onReload}
              rootPath={rootPath}
              dragOverPath={dragOverPath}
              onMouseDown={onMouseDown}
              editingPath={editingPath}
              onStartEdit={onStartEdit}
              onFinishEdit={onFinishEdit}
              onNewWindow={onNewWindow}
              onBookmark={onBookmark}
              selectedPaths={selectedPaths}
              onMultiSelect={onMultiSelect}
              lastClickedPathRef={lastClickedPathRef}
              onToggleExpand={onToggleExpand}
              onMoveTo={onMoveTo}
            />
          ))}
        </div>
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={menuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="删除确认"
        message={selectedPaths.size > 1 && selectedPaths.has(node.path)
          ? `确定要删除选中的 ${selectedPaths.size} 个项目吗？`
          : node.isDirectory
            ? `确定要删除文件夹 "${node.name}" 及其所有内容吗？`
            : `确定要删除文件 "${node.name}" 吗？`}
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}

// ── FileTree Component ───────────────────────────────────────────────

function FileTree({
  rootPath,
  activePath,
  onSelect,
  refreshKey,
  onNewWindow,
  onScrollToTop,
  hidden,
  onBookmark,
}: {
  rootPath: string;
  activePath: string | null;
  onSelect: (path: string) => void;
  refreshKey: number;
  onNewWindow: (filePath: string) => void;
  onScrollToTop?: () => void;
  hidden?: boolean;
  onBookmark: (filePath: string, isDirectory: boolean) => void;
}) {
  const vaultPath = rootPath;
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [, forceUpdate] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const lastClickedPathRef = useRef<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);

  const handleStartEdit = useCallback((path: string) => {
    setEditingPath(path);
  }, []);

  // ── Drag state (mouse-event based) ──
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragNodeRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; path: string } | null>(null);

  // ── Update link dialog state ──
  const [linkUpdateDialog, setLinkUpdateDialog] = useState<{
    srcPath: string;
    targetPath: string;
    filesCount: number;
    linksCount: number;
  } | null>(null);
  const alwaysUpdateLinksRef = useRef(false);
  const pendingRenameRef = useRef<{ path: string; newName: string } | null>(null);

  // ── Move to folder state ──
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [moveSourcePath, setMoveSourcePath] = useState<string | null>(null);

  // 记录展开的目录，reload 后恢复
  const rootNodesRef = useRef<TreeNode[]>([]);
  rootNodesRef.current = rootNodes;

  const collectExpanded = useCallback((nodes: TreeNode[]) => {
    const paths = new Set<string>();
    const walk = (list: TreeNode[]) => {
      for (const n of list) {
        if (n.isDirectory && n.expanded) paths.add(n.path);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return paths;
  }, []);

  const restoreExpanded = useCallback(async (nodes: TreeNode[], paths: Set<string>) => {
    for (const n of nodes) {
      if (paths.has(n.path)) {
        n.children = await loadDirectory(n.path);
        n.expanded = true;
        if (n.children) await restoreExpanded(n.children, paths);
      }
    }
  }, []);

  const loadRoot = useCallback(async () => {
    const nodes = await loadDirectory(rootPath);
    // Restore expanded state from localStorage
    const savedExpanded = loadExpandedPaths(vaultPath);
    if (savedExpanded.size > 0) {
      await restoreExpanded(nodes, savedExpanded);
    }
    setRootNodes(nodes);
  }, [rootPath, vaultPath]);

  const handleRefresh = useCallback(() => {
    forceUpdate((n) => n + 1);
  }, []);

  const handleReload = useCallback(async (expandPath?: string) => {
    invalidateFileCache(rootPath);
    const paths = collectExpanded(rootNodesRef.current);
    if (expandPath) paths.add(expandPath);
    const nodes = await loadDirectory(rootPath);
    await restoreExpanded(nodes, paths);
    setRootNodes(nodes);
    handleRefresh();
  }, [rootPath, collectExpanded, restoreExpanded, handleRefresh]);

  const handleFinishEdit = useCallback(async (path: string, newName: string) => {
    setEditingPath(null);
    if (!newName || newName.trim() === "") return;
    newName = newName.trim();
    const currentName = path.split(pathSep()).pop() || "";
    if (newName === currentName) return;
    const p = parentPath(path);
    const newPath = joinPath(p, newName);

    // 检查是否有受影响的 wiki links（仅 .md 文件）
    if (path.endsWith(".md") && !LinkIndexService.isEmpty()) {
      const { filesCount, linksCount } = LinkIndexService.getAffectedLinkCount(path, newPath, rootPath);
      if (filesCount > 0) {
        pendingRenameRef.current = { path, newName };
        setLinkUpdateDialog({ srcPath: path, targetPath: newPath, filesCount, linksCount });
        return;
      }
    }

    try { await rename(path, newPath); await handleReload(); }
    catch (err) { console.error("重命名失败:", err); }
  }, [handleReload, rootPath]);

  // ── Move to folder ──
  const handleMoveTo = useCallback((path: string) => {
    setMoveSourcePath(path);
    setFolderPickerOpen(true);
  }, []);

  const handleFolderSelect = useCallback(async (targetFolder: string) => {
    if (!moveSourcePath) return;
    
    const fileName = moveSourcePath.split(pathSep()).pop() || "";
    const targetPath = joinPath(targetFolder, fileName);
    
    // 不能移动到自身所在目录
    if (targetFolder === parentPath(moveSourcePath)) {
      setFolderPickerOpen(false);
      setMoveSourcePath(null);
      return;
    }
    
    // 检查是否有受影响的 wiki links（仅 .md 文件）
    if (moveSourcePath.endsWith(".md") && !LinkIndexService.isEmpty()) {
      const { filesCount, linksCount } = LinkIndexService.getAffectedLinkCount(moveSourcePath, targetPath, rootPath);
      if (filesCount > 0) {
        // 如果已选择"总是更新"，直接重写链接
        if (alwaysUpdateLinksRef.current) {
          try {
            await LinkIndexService.rewriteWikiLinks(moveSourcePath, targetPath, rootPath);
            await rename(moveSourcePath, targetPath);
            await handleReload();
          } catch (err) {
            console.error("移动失败:", err);
          }
        } else {
          // 弹出对话框
          pendingRenameRef.current = { path: moveSourcePath, newName: fileName };
          setLinkUpdateDialog({ srcPath: moveSourcePath, targetPath, filesCount, linksCount });
        }
      } else {
        // 无受影响链接，直接移动
        try {
          await rename(moveSourcePath, targetPath);
          await handleReload();
        } catch (err) {
          console.error("移动失败:", err);
        }
      }
    } else {
      // 非 .md 文件或索引为空，直接移动
      try {
        await rename(moveSourcePath, targetPath);
        await handleReload();
      } catch (err) {
        console.error("移动失败:", err);
      }
    }
    
    setFolderPickerOpen(false);
    setMoveSourcePath(null);
  }, [moveSourcePath, rootPath, handleReload]);

  const handleFolderPickerCancel = useCallback(() => {
    setFolderPickerOpen(false);
    setMoveSourcePath(null);
  }, []);

  // ── Multi-select ──
  const handleMultiSelect = useCallback((paths: string[], mode: 'toggle' | 'range' | 'replace') => {
    setSelectedPaths(prev => {
      const next = new Set(mode === 'replace' ? [] : prev);
      if (mode === 'toggle') {
        for (const p of paths) {
          if (next.has(p)) next.delete(p); else next.add(p);
        }
      } else {
        for (const p of paths) next.add(p);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedPaths(new Set());
  }, []);

  // ── Mouse-based Drag & Drop ──
  const handleMouseDown = useCallback((e: React.MouseEvent, nodePath: string) => {
    // Only left button
    if (e.button !== 0) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, path: nodePath };
  }, []);

  useEffect(() => {
    // Find the nearest directory ancestor for drop target
    const findDropTargetDir = (el: Element | null): HTMLElement | null => {
      if (!el) return null;
      const treeNode = el.closest("[data-path]") as HTMLElement | null;
      if (!treeNode) return null;
      // If it's already a directory, return it
      if (treeNode.dataset.isDir === "1") return treeNode;
      // Otherwise, look for parent directory
      // tree-node -> .tree-branch -> .tree-children -> parent .tree-branch -> parent dir node
      const childBranch = treeNode.closest(".tree-branch");
      if (childBranch) {
        const treeChildren = childBranch.parentElement;
        if (treeChildren && treeChildren.classList.contains("tree-children")) {
          const parentBranch = treeChildren.parentElement;
          if (parentBranch) {
            const parentDir = parentBranch.querySelector(":scope > .tree-node[data-is-dir='1']") as HTMLElement | null;
            if (parentDir) return parentDir;
          }
        }
      }
      return null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      // Start dragging after 5px movement
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

      // Dragging started
      if (!dragNodeRef.current) {
        dragNodeRef.current = dragStartRef.current.path;
        setIsDragging(true);
      }

      // Find which tree-node the mouse is over
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const dirNode = findDropTargetDir(el);
      if (dirNode) {
        const p = dirNode.dataset.path || "";
        if (p !== dragNodeRef.current) {
          setDragOverPath(p);
        }
      } else {
        setDragOverPath(null);
      }
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      if (dragNodeRef.current) {
        // Dragging was active — find drop target
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const dirNode = findDropTargetDir(el);
        if (dirNode) {
          const targetDir = dirNode.dataset.path || "";
          const srcPath = dragNodeRef.current;
          if (srcPath && targetDir && srcPath !== targetDir) {
            const fileName = srcPath.split(pathSep()).pop() || "untitled";
            const targetPath = joinPath(targetDir, fileName);
            if (srcPath !== targetPath) {
              // 检查是否有受影响的 wiki links（仅 .md 文件）
              if (srcPath.endsWith(".md") && !LinkIndexService.isEmpty()) {
                const { filesCount, linksCount } = LinkIndexService.getAffectedLinkCount(srcPath, targetPath, rootPath);
                if (filesCount > 0) {
                  // 如果已选择"总是更新"，直接重写链接
                  if (alwaysUpdateLinksRef.current) {
                    try {
                      await LinkIndexService.rewriteWikiLinks(srcPath, targetPath, rootPath);
                      await rename(srcPath, targetPath);
                      await handleReload();
                    } catch (err) {
                      console.error("移动失败:", err);
                    }
                  } else {
                    // 弹出对话框
                    pendingRenameRef.current = { path: srcPath, newName: fileName };
                    setLinkUpdateDialog({ srcPath, targetPath, filesCount, linksCount });
                  }
                } else {
                  // 无受影响链接，直接移动
                  try {
                    await rename(srcPath, targetPath);
                    await handleReload();
                  } catch (err) {
                    console.error("移动失败:", err);
                  }
                }
              } else {
                // 非 .md 文件或索引为空，直接移动
                try {
                  await rename(srcPath, targetPath);
                  await handleReload();
                } catch (err) {
                  console.error("移动失败:", err);
                }
              }
            }
          }
        }
      }

      // Reset
      dragStartRef.current = null;
      dragNodeRef.current = null;
      setDragOverPath(null);
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleReload]);

  // ── Blank area actions ──
  const handleNewRootFile = useCallback(async () => {
    try {
      const filePath = await uniqueFilePath(rootPath, "untitled", ".md");
      await writeTextFile(filePath, ""); await handleReload(); handleStartEdit(filePath);
    } catch (err) { console.error("新建文件失败:", err); }
  }, [rootPath, handleReload, handleStartEdit]);

  const handleNewRootFolder = useCallback(async () => {
    try {
      const dirPath = await uniqueDirPath(rootPath, "新建文件夹");
      await mkdir(dirPath); await handleReload(); handleStartEdit(dirPath);
    } catch (err) { console.error("新建文件夹失败:", err); }
  }, [rootPath, handleReload, handleStartEdit]);

  const handleNewRootWhiteboard = useCallback(async () => {
    try {
      const filePath = await uniqueFilePath(rootPath, "untitled", ".canvas");
      await writeTextFile(filePath, '{"nodes":[],"edges":[]}'); await handleReload(); handleStartEdit(filePath);
    } catch (err) { console.error("新建白板失败:", err); }
  }, [rootPath, handleReload, handleStartEdit]);

  const handleCopyRootPath = useCallback(() => {
    navigator.clipboard.writeText(rootPath).then(() => {
      showToast("路径已复制到剪贴板");
    }).catch(() => { prompt("文件夹路径:", rootPath); });
  }, [rootPath]);
  const handleOpenRootLocation = useCallback(async () => {
    try {
      await invoke("open_file_location", { filePath: rootPath });
    } catch (err) {
      console.error("打开文件夹位置失败:", err);
    }
  }, [rootPath]);

  const blankActions: FileActions = {
    onOpen: () => {},
    onNewWindow: showDevAlert,
    onNewFile: handleNewRootFile,
    onNewFolder: handleNewRootFolder,
    onNewWhiteboard: handleNewRootWhiteboard,
    onSearch: showDevAlert,
    onRename: () => {},
    onDuplicate: showDevAlert,
    onDelete: () => {},
    onCopyPath: handleCopyRootPath,
    onOpenLocation: handleOpenRootLocation,
    onBookmark: () => {},
    onMoveTo: () => {},
  };

  const handleBlankContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".tree-node")) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => { loadRoot(); }, [loadRoot, refreshKey]);

  // Handle expand/collapse and persist to localStorage
  const handleToggleExpand = useCallback((path: string, expanded: boolean) => {
    const current = loadExpandedPaths(vaultPath);
    if (expanded) {
      current.add(path);
    } else {
      current.delete(path);
    }
    saveExpandedPaths(vaultPath, current);
  }, [vaultPath]);

  const handleScroll = useCallback(() => {
    const el = treeRef.current;
    if (!el || !onScrollToTop) return;
    const st = el.scrollTop;
    if (st < lastScrollTopRef.current && st < 5) {
      onScrollToTop();
    }
    lastScrollTopRef.current = st;
  }, [onScrollToTop]);

  // ── Link update dialog handlers ──
  const handleLinkUpdateAlways = useCallback(async () => {
    alwaysUpdateLinksRef.current = true;
    if (linkUpdateDialog) {
      try {
        await LinkIndexService.rewriteWikiLinks(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath, rootPath);
        await rename(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath);
        await handleReload();
      } catch (err) {
        console.error("移动失败:", err);
      }
    }
    setLinkUpdateDialog(null);
    pendingRenameRef.current = null;
  }, [linkUpdateDialog, rootPath, handleReload]);

  const handleLinkUpdateOnce = useCallback(async () => {
    if (linkUpdateDialog) {
      try {
        await LinkIndexService.rewriteWikiLinks(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath, rootPath);
        await rename(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath);
        await handleReload();
      } catch (err) {
        console.error("移动失败:", err);
      }
    }
    setLinkUpdateDialog(null);
    pendingRenameRef.current = null;
  }, [linkUpdateDialog, rootPath, handleReload]);

  const handleLinkUpdateSkip = useCallback(async () => {
    if (linkUpdateDialog) {
      try {
        await rename(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath);
        await handleReload();
      } catch (err) {
        console.error("移动失败:", err);
      }
    }
    setLinkUpdateDialog(null);
    pendingRenameRef.current = null;
  }, [linkUpdateDialog, handleReload]);

  return (
    <div ref={treeRef} className={`sidebar-tree${hidden ? " hidden" : ""}${isDragging ? " dragging" : ""}${dragOverPath === rootPath ? " drag-over" : ""}`} onContextMenu={handleBlankContextMenu} onScroll={handleScroll} onClick={(e) => { if (e.target === e.currentTarget) handleClearSelection(); }} data-path={rootPath} data-is-dir="1">
      {rootNodes.length > 0 &&
        rootNodes.map((node) => (
          <TreeNodeComp
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            onSelect={onSelect}
            onRefresh={handleRefresh}
            onReload={handleReload}
            rootPath={rootPath}
            dragOverPath={dragOverPath}
            onMouseDown={handleMouseDown}
            editingPath={editingPath}
            onStartEdit={handleStartEdit}
            onFinishEdit={handleFinishEdit}
            onNewWindow={onNewWindow}
            onBookmark={onBookmark}
            selectedPaths={selectedPaths}
            onMultiSelect={handleMultiSelect}
            lastClickedPathRef={lastClickedPathRef}
            onToggleExpand={handleToggleExpand}
            onMoveTo={handleMoveTo}
          />
        ))}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={getBlankMenuItems(blankActions)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <UpdateLinkDialog
        isOpen={linkUpdateDialog !== null}
        filesCount={linkUpdateDialog?.filesCount ?? 0}
        linksCount={linkUpdateDialog?.linksCount ?? 0}
        onAlwaysUpdate={handleLinkUpdateAlways}
        onUpdateOnce={handleLinkUpdateOnce}
        onSkip={handleLinkUpdateSkip}
      />

      <FolderPicker
        isOpen={folderPickerOpen}
        vaultPath={rootPath}
        onSelect={handleFolderSelect}
        onCancel={handleFolderPickerCancel}
      />
    </div>
  );
}

// ── Outline Component ───────────────────────────────────────────────

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

function parseOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (m) {
      items.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
    }
  }
  return items;
}

function Outline({
  content,
  onSelectHeading,
}: {
  content: string;
  onSelectHeading: (level: number, text: string, line: number) => void;
}) {
  const items = parseOutline(content);

  if (items.length === 0) {
    return (
      <div className="sidebar-tree">
        <div className="tree-empty">无标题</div>
        <div className="tree-empty-hint">使用 # 标题语法来创建大纲</div>
      </div>
    );
  }

  return (
    <div className="sidebar-tree">
      {items.map((item, i) => (
        <div
          key={i}
          className="outline-item"
          style={{ paddingLeft: `${12 + (item.level - 1) * 16}px` }}
          title={item.text}
          onClick={() => onSelectHeading(item.level, item.text, item.line)}
        >
          <span className="outline-level">H{item.level}</span>
          <span className="outline-text">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── VaultSwitcher ────────────────────────────────────────────────────

function VaultSwitcher({
  vaults,
  activeIndex,
  onRemove,
  onPublish,
}: {
  vaults: VaultInfo[];
  activeIndex: number;
  onRemove: (index: number) => void;
  onPublish: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removingVaultIndex, setRemovingVaultIndex] = useState<number>(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeVault = activeIndex >= 0 ? vaults[activeIndex] : null;

  // Close vault menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpen]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await invoke("open_settings_window");
    } catch (err) {
      console.error("打开设置窗口失败:", err);
    }
  }, []);

  const vaultSvgIcon = (
    <svg className="vault-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M9 7h6M9 11h4" />
    </svg>
  );

  if (vaults.length === 0) {
    return (
      <div className="sidebar-footer">
        <div className="vault-empty-row">
          <button className="vault-open-btn" onClick={() => invoke("open_vault_manager_window")}>
            {vaultSvgIcon}
            <span className="vault-name">管理仓库</span>
          </button>
          <button
            className="vault-menu-btn"
            title="设置"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenSettings();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-footer">
      <div
        className="vault-current"
        title="切换仓库"
      >
        {vaultSvgIcon}
        <span
          className="vault-name"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
        >
          {activeVault ? activeVault.name : "未选择"}
        </span>
        <button
          className="vault-menu-btn"
          title="设置"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(false);
            handleOpenSettings();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div ref={menuRef} className="vault-menu">
          <div className="vault-menu-list">
            {vaults.map((vault, i) => (
              <div
                key={vault.path}
                className={`vault-menu-item${i === activeIndex ? " active" : ""}`}
                onClick={() => {
                  // 在新窗口中打开仓库
                  invoke("open_vault_in_new_window", { vaultPath: vault.path });
                  setMenuOpen(false);
                }}
              >
                <span className="vault-menu-name">{vault.name}</span>
                <button
                  className="vault-menu-remove-btn"
                  title="移除此仓库"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemovingVaultIndex(i);
                    setRemoveConfirmOpen(true);
                  }}
                >
                  ✕
                </button>
                {i === activeIndex && <span className="vault-menu-check">✓</span>}
              </div>
            ))}
          </div>
          <div className="vault-menu-divider" />
          <div
            className="vault-menu-item vault-menu-manage"
            onClick={() => {
              setMenuOpen(false);
              invoke("open_vault_manager_window");
            }}
          >
            <svg className="vault-menu-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M9 7h6M9 11h4" />
            </svg>
            <span>管理仓库</span>
          </div>
          {activeIndex >= 0 && (
            <div
              className="vault-menu-item vault-menu-manage"
              onClick={() => {
                setMenuOpen(false);
                onPublish();
              }}
            >
              <svg className="vault-menu-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span>发布为网站</span>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={removeConfirmOpen}
        title="移除仓库"
        message={`确定要移除仓库 "${vaults[removingVaultIndex]?.name || ""}" 吗？\n此操作不会删除本地文件。`}
        type="warning"
        onConfirm={() => {
          onRemove(removingVaultIndex);
          setRemoveConfirmOpen(false);
        }}
        onCancel={() => setRemoveConfirmOpen(false)}
      />
    </div>
  );
}

// ── Sidebar Main ─────────────────────────────────────────────────────

export default function Sidebar({
  vaults,
  activeVaultIndex,
  currentFilePath,
  content,
  onSelectFile,
  onSelectHeading,
  onRemoveVault,
  onNewWindow,
  onPublish,
  collapsed,
  refreshKey,
  width,
  onWidthChange,
  onBookmark,
}: SidebarProps) {
  const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<"files" | "search" | "outline" | "bookmarks">("files");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectFile = useCallback(
    (path: string, line?: number, query?: string) => { onSelectFile(path, line, query); },
    [onSelectFile],
  );

  const switchTab = useCallback((tab: "files" | "search" | "outline" | "bookmarks") => {
    setActiveTab(tab);
    if (tab !== "search") {
      setSearchQuery("");
    }
  }, []);

  // Ctrl+Shift+F to toggle search tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setActiveTab((prev) => {
          const next = prev === "search" ? "files" : "search";
          if (next !== "search") setSearchQuery("");
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Resize logic
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(width);
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = startWidth + deltaX;
      const clampedWidth = Math.max(180, Math.min(800, newWidth));
      onWidthChange(clampedWidth);
    };
    const handleMouseUp = () => { setIsResizing(false); };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange, startX, startWidth]);

  return (
    <div
      className={`sidebar${collapsed ? " collapsed" : ""}${isResizing ? " resizing" : ""}`}
      style={{ width: collapsed ? 0 : width }}
    >
      <div className="sidebar-topbar" />

      <div className="sidebar-header">
        <div className="sidebar-tabs-wrapper">
          <button
            className={`sidebar-tab${activeTab === "files" ? " active" : ""}`}
            onClick={() => switchTab("files")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            className={`sidebar-tab${activeTab === "search" ? " active" : ""}`}
            onClick={() => switchTab("search")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <button
            className={`sidebar-tab${activeTab === "outline" ? " active" : ""}`}
            onClick={() => switchTab("outline")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button
            className={`sidebar-tab${activeTab === "bookmarks" ? " active" : ""}`}
            onClick={() => switchTab("bookmarks")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {activeTab === "files" && (
        activeVault ? (
          <FileTree
            rootPath={activeVault.path}
            activePath={currentFilePath}
            onSelect={handleSelectFile}
            refreshKey={refreshKey}
            onNewWindow={onNewWindow}
            onBookmark={onBookmark}
          />
        ) : (
          <div className="sidebar-tree">
            <div className="tree-empty">尚未打开仓库</div>
            <div className="tree-empty-hint">点击底部按钮打开一个文件夹</div>
          </div>
        )
      )}

      {activeTab === "search" && (
        <>
          <SearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClose={() => switchTab("files")}
          />
          {searchQuery.trim() ? (
            <SearchResults
              vaultPath={activeVault?.path ?? ""}
              query={searchQuery}
              onSelectFile={handleSelectFile}
            />
          ) : (
            <div className="sidebar-tree">
              <div className="tree-empty">输入关键词搜索文件</div>
            </div>
          )}
        </>
      )}

      {activeTab === "outline" && (
        <Outline content={content} onSelectHeading={onSelectHeading} />
      )}

      {activeTab === "bookmarks" && (
        <BookmarksPanel
          vaultPath={activeVault?.path ?? null}
          vaults={vaults}
          onSelectFile={handleSelectFile}
          onNewWindow={onNewWindow}
        />
      )}

      <VaultSwitcher
        vaults={vaults}
        activeIndex={activeVaultIndex}
        onRemove={onRemoveVault}
        onPublish={onPublish}
      />

      {!collapsed && (
        <div className="sidebar-resize-handle" onMouseDown={handleMouseDown} />
      )}
    </div>
  );
}
