import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo, lazy, Suspense, type ReactNode } from "react";
import { bootStart, bootEnd, bootStamp } from "./boot-timing";
bootStamp("sidebar_module_imported");
import { useTranslation } from "react-i18next";
import i18n from "./i18n";
import { createPortal } from "react-dom";
import { readDir, readTextFile, writeTextFile, mkdir, remove, rename, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "./components";
import { UpdateLinkDialog } from "./components";
import { FolderPicker } from "./components";
import { LinkIndexService } from "./wikilink";
import { resolveRelativePath } from "./services";
import { relativePath as computeRelativePath } from "./services/ImageManager";
import { BookmarksPanel } from "./Bookmarks";
import { type SidebarTab } from "./Settings";
import "./Sidebar.css";

// 大纲标签页顶部的本地图谱：d3 依赖较重，动态加载避免拖慢首屏
const LocalGraphLazy = lazy(() => import("./graph/LocalGraph").then((m) => ({ default: m.LocalGraph })));

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
  mtime: number | null;
  ctime: number | null;
}

interface DirEntryWithMeta {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  mtime: number | null;
  ctime: number | null;
}

type SortBy = "name" | "created" | "modified";
type SortOrder = "asc" | "desc";

interface FileSortSettings {
  sortBy: SortBy;
  sortOrder: SortOrder;
}

const DEFAULT_SORT: FileSortSettings = { sortBy: "name", sortOrder: "asc" };
const SORT_KEY = "zmd-file-sort-settings";

function loadSortSettings(): FileSortSettings {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    return raw ? { ...DEFAULT_SORT, ...JSON.parse(raw) } : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

function saveSortSettings(settings: FileSortSettings): void {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(settings));
  } catch {}
}

let currentSortSettings: FileSortSettings = loadSortSettings();

interface SidebarProps {
  vaults: VaultInfo[];
  activeVaultIndex: number;
  currentFilePath: string | null;
  content: string;
  onSelectFile: (path: string, line?: number, query?: string) => void;
  onSelectHeading: (level: number, text: string, line: number) => void;
  onRemoveVault: (index: number) => void;
  onNewWindow: (filePath: string) => void;
  onOpenInNewPanel: (filePath: string) => void;
  canOpenInNewPanel: boolean;
  onPublish: () => void;
  onSelectVault: (index: number) => void;
  collapsed: boolean;
  refreshKey: number;
  /** 链接索引刷新计数：本地图谱 / Linked references 依赖它重绘 */
  graphRefreshKey?: number;
  width: number;
  onWidthChange: (width: number) => void;
  onBookmark: (filePath: string, isDirectory: boolean) => void;
  outlineTrigger?: number;
  /** 侧栏位于左/右；右栏会镜像边框与 resize 方向 */
  side?: "left" | "right";
  /** 本侧栏渲染哪些 tab（顺序固定 files→search→outline→bookmarks）；空数组则显示空状态 */
  tabs?: SidebarTab[];
  /** 打开全局关系图谱 */
  onOpenGlobalGraph?: () => void;
  /** 全局关系图谱是否已打开（用于按钮激活态） */
  graphViewOpen?: boolean;
}

interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function sortTreeNodes(nodes: TreeNode[], settings: FileSortSettings = currentSortSettings): TreeNode[] {
  const { sortBy, sortOrder } = settings;
  const dir = sortOrder === "asc" ? 1 : -1;
  return [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    switch (sortBy) {
      case "created": {
        const cmp = (a.ctime ?? 0) - (b.ctime ?? 0);
        return cmp === 0 ? a.name.localeCompare(b.name) : cmp * dir;
      }
      case "modified": {
        const cmp = (a.mtime ?? 0) - (b.mtime ?? 0);
        return cmp === 0 ? a.name.localeCompare(b.name) : cmp * dir;
      }
      default:
        return a.name.localeCompare(b.name) * dir;
    }
  });
}

async function loadDirectory(dirPath: string): Promise<TreeNode[]> {
  try {
    const entries = await invoke<DirEntryWithMeta[]>("list_dir_with_meta", { dirPath });
    const nodes: TreeNode[] = entries
      .filter(e => !e.name.startsWith("."))
      .map(e => ({
        name: e.name,
        path: joinPath(dirPath, e.name),
        isDirectory: e.isDirectory,
        isFile: e.isFile,
        children: null,
        expanded: false,
        mtime: e.mtime,
        ctime: e.ctime,
      }));
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

/** 返回 dirPath 在 rootPath 内的所有祖先目录（含自身，不含 root），用于展开文件树使其可见。 */
function ancestorDirs(dirPath: string, rootPath: string): string[] {
  const result: string[] = [];
  let cur = dirPath;
  while (cur.length > rootPath.length && cur.startsWith(rootPath)) {
    result.push(cur);
    const parent = parentPath(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return result;
}

/** 比较当前可见文件树（折叠目录不看子节点）。结构未变时跳过 setState，避免刷新打散点击。 */
function visibleTreeEqual(a: TreeNode[], b: TreeNode[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.path !== y.path || x.isDirectory !== y.isDirectory || x.expanded !== y.expanded) {
      return false;
    }
    if (x.isDirectory && x.expanded) {
      if (!visibleTreeEqual(x.children ?? [], y.children ?? [])) return false;
    }
  }
  return true;
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

/** 递归查找目录下所有 .md 文件（用于文件夹重命名/移动时更新 wiki 链接） */
async function getAllMdFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      const fullPath = joinPath(dirPath, entry.name);
      if (entry.isDirectory) {
        files.push(...await getAllMdFiles(fullPath));
      } else if (entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  } catch {
    // 目录可能不存在或被删除，静默处理
  }
  return files;
}

/** 重写文件夹内所有 .md 文件的 wiki 链接 */
async function rewriteWikiLinksForFolder(
  oldDirPath: string,
  newDirPath: string,
  vaultPath: string,
): Promise<{ filesUpdated: number; linksUpdated: number }> {
  let filesUpdated = 0;
  let linksUpdated = 0;
  const mdFiles = await getAllMdFiles(oldDirPath);
  for (const filePath of mdFiles) {
    const relativePath = filePath.substring(oldDirPath.length);
    const newFilePath = newDirPath + relativePath;
    const result = await LinkIndexService.rewriteWikiLinks(filePath, newFilePath, vaultPath);
    filesUpdated += result.filesUpdated;
    linksUpdated += result.linksUpdated;
  }
  return { filesUpdated, linksUpdated };
}

/** 统计文件夹内所有 .md 文件移动后受影响的 wiki 链接数 */
async function getAffectedLinkCountForFolder(
  oldDirPath: string,
  newDirPath: string,
  vaultPath: string,
): Promise<{ filesCount: number; linksCount: number }> {
  let filesCount = 0;
  let linksCount = 0;
  const mdFiles = await getAllMdFiles(oldDirPath);
  for (const filePath of mdFiles) {
    const relativePath = filePath.substring(oldDirPath.length);
    const newFilePath = newDirPath + relativePath;
    const result = LinkIndexService.getAffectedLinkCount(filePath, newFilePath, vaultPath);
    filesCount += result.filesCount;
    linksCount += result.linksCount;
  }
  return { filesCount, linksCount };
}

// ── 图片路径正则 ──
/** Markdown 图片: ![alt](path) */
const MD_IMAGE_REGEX = /!\[[^\]]*\]\(([^)\s]+)\)/g;
/** HTML img: <img src="path" ...> */
const HTML_IMG_REGEX = /<img\s+[^>]*src=["']([^"'\s]+)["'][^>]*>/gi;

/** 判断是否为外部/内联路径（不需要更新） */
function isExternalOrInline(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:");
}

/** 统计文件夹改名后受影响的图片路径数 */
async function countImagePathsAffected(
  oldFolderPath: string,
  _newFolderPath: string,
  vaultPath: string,
): Promise<{ filesCount: number; pathsCount: number }> {
  let filesCount = 0;
  let pathsCount = 0;

  const mdFiles = await getAllMdFiles(vaultPath);
  for (const filePath of mdFiles) {
    const content = await readTextFile(filePath);
    const docDir = parentPath(filePath);
    let fileAffected = false;

    const sep = pathSep();
    for (const match of content.matchAll(MD_IMAGE_REGEX)) {
      const imgPath = match[1];
      if (isExternalOrInline(imgPath)) continue;
       const resolved = imgPath.startsWith("/")
       ? resolveRelativePath(vaultPath, imgPath.slice(1))
       : resolveRelativePath(docDir, imgPath);
      if (resolved.startsWith(oldFolderPath + sep) || resolved === oldFolderPath) {
        pathsCount++;
        fileAffected = true;
      }
    }

    for (const match of content.matchAll(HTML_IMG_REGEX)) {
      const imgPath = match[1];
      if (isExternalOrInline(imgPath)) continue;
       const resolved = imgPath.startsWith("/")
       ? resolveRelativePath(vaultPath, imgPath.slice(1))
       : resolveRelativePath(docDir, imgPath);
      if (resolved.startsWith(oldFolderPath + sep) || resolved === oldFolderPath) {
        pathsCount++;
        fileAffected = true;
      }
    }

    if (fileAffected) filesCount++;
  }

  return { filesCount, pathsCount };
}

/** 更新文件夹改名后所有文档中的图片路径 */
async function updateImagePathsForFolder(
  oldFolderPath: string,
  newFolderPath: string,
  vaultPath: string,
): Promise<{ filesUpdated: number; pathsUpdated: number }> {
  let filesUpdated = 0;
  let pathsUpdated = 0;

  const mdFiles = await getAllMdFiles(vaultPath);
  const sep = pathSep();
  for (const filePath of mdFiles) {
    const content = await readTextFile(filePath);
    const docDir = parentPath(filePath);
    let newContent = content;
    let changed = false;

    // 处理 Markdown 图片: ![alt](path)
    newContent = newContent.replace(MD_IMAGE_REGEX, (fullMatch, imgPath: string) => {
      if (isExternalOrInline(imgPath)) return fullMatch;
       const resolved = imgPath.startsWith("/")
       ? resolveRelativePath(vaultPath, imgPath.slice(1))
       : resolveRelativePath(docDir, imgPath);
      if (resolved.startsWith(oldFolderPath + sep) || resolved === oldFolderPath) {
        const relativePart = resolved.slice(oldFolderPath.length);
        const newAbsolute = newFolderPath + relativePart;
        // computeRelativePath 返回平台原生分隔符，Markdown 需要 / 
        const newRelative = computeRelativePath(docDir, newAbsolute).replace(/\\/g, "/");
        changed = true;
        pathsUpdated++;
        return fullMatch.replace(imgPath, newRelative);
      }
      return fullMatch;
    });

    // 处理 HTML img: <img src="path" ...>
    newContent = newContent.replace(HTML_IMG_REGEX, (fullMatch, imgPath: string) => {
      if (isExternalOrInline(imgPath)) return fullMatch;
       const resolved = imgPath.startsWith("/")
       ? resolveRelativePath(vaultPath, imgPath.slice(1))
       : resolveRelativePath(docDir, imgPath);
      if (resolved.startsWith(oldFolderPath + sep) || resolved === oldFolderPath) {
        const relativePart = resolved.slice(oldFolderPath.length);
        const newAbsolute = newFolderPath + relativePart;
        // computeRelativePath 返回平台原生分隔符，HTML 需要 /
        const newRelative = computeRelativePath(docDir, newAbsolute).replace(/\\/g, "/");
        changed = true;
        pathsUpdated++;
        return fullMatch.replace(imgPath, newRelative);
      }
      return fullMatch;
    });

    if (changed) {
      await writeTextFile(filePath, newContent);
      filesUpdated++;
    }
  }

  return { filesUpdated, pathsUpdated };
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
      const fileNameMatch = batch[j].name.toLowerCase().includes(lowerQuery);
      if (matches || fileNameMatch) {
        results.push({
          path: batch[j].path,
          fileName: batch[j].name,
          matches: matches || [],
        });
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
  const subRef = useRef<HTMLDivElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [subMenuPos, setSubMenuPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelSubClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleSubClose = () => {
    closeTimerRef.current = window.setTimeout(() => {
      setOpenIndex(null);
      setSubMenuPos(null);
    }, 120);
  };

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
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
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

  // 子菜单渲染到 body 后，按视口边界修正位置（避免底部/右侧溢出）
  useLayoutEffect(() => {
    if (openIndex === null || !subMenuPos || !subRef.current) return;
    const rect = subRef.current.getBoundingClientRect();
    const GAP = 4;
    let top = subMenuPos.top;
    let left = subMenuPos.left;
    if (top + rect.height > window.innerHeight - GAP) {
      top = Math.max(GAP, window.innerHeight - GAP - rect.height);
    }
    if (left + rect.width > window.innerWidth - GAP) {
      left = Math.max(GAP, window.innerWidth - GAP - rect.width);
    }
    subRef.current.style.top = `${top}px`;
    subRef.current.style.left = `${left}px`;
  }, [openIndex, subMenuPos]);

  const handleItemMouseEnter = (e: React.MouseEvent<HTMLDivElement>, index: number, hasChildren: boolean) => {
    cancelSubClose();
    if (!hasChildren) {
      setOpenIndex(null);
      setSubMenuPos(null);
      return;
    }
    const itemRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const GAP = 4;
    const SUB_WIDTH = 216; // 预估子菜单宽度（min-width 200 + padding 8 + 边框 2 + 间距）
    let left = itemRect.right + GAP;
    if (left + SUB_WIDTH > window.innerWidth - GAP) {
      left = itemRect.left - GAP - SUB_WIDTH;
      if (left < GAP) left = GAP;
    }
    setSubMenuPos({ top: itemRect.top, left });
    setOpenIndex(index);
  };

  return createPortal(
    <div ref={menuRef} className="context-menu">
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <div className="context-menu-divider" />}
          <div
            className={`context-menu-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}${
              item.children ? " has-submenu" : ""
            }${openIndex === i ? " open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            onMouseEnter={(e) => handleItemMouseEnter(e, i, Boolean(item.children))}
            onMouseLeave={item.children ? scheduleSubClose : undefined}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            <span className="context-menu-label">{item.label}</span>
            {item.children && (
              <span className="context-menu-chevron">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            )}
          </div>
          {item.children && openIndex === i && subMenuPos && createPortal(
            <div
              ref={subRef}
              className="context-submenu"
              style={{ top: subMenuPos.top, left: subMenuPos.left }}
              onMouseEnter={cancelSubClose}
              onMouseLeave={scheduleSubClose}
            >
              {item.children.map((child, j) => (
                <div
                  key={j}
                  className={`context-menu-item${child.danger ? " danger" : ""}${child.disabled ? " disabled" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!child.disabled) {
                      child.onClick();
                      onClose();
                    }
                  }}
                >
                  {child.icon && <span className="context-menu-icon">{child.icon}</span>}
                  <span className="context-menu-label">{child.label}</span>
                </div>
              ))}
            </div>,
            document.body,
          )}
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
  onDuplicateAndCopy: () => void;
  onCopyFile: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onOpenLocation: () => void;
  onOpenTerminal: () => void;
  onNewWindow: () => void;
  onBookmark: () => void;
  onMoveTo: () => void;
  onOpenInNewPanel: () => void;
}

// 右键菜单图标（线条风格，与顶部栏菜单保持一致）
const menuIcon = (children: ReactNode): ReactNode => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const MENU_ICONS = {
  open: menuIcon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </>,
  ),
  newWindow: menuIcon(
    <>
      <rect x="2.5" y="3" width="14.5" height="16" rx="3" />
      <rect x="7.5" y="6" width="13.5" height="13" rx="3" />
      <line x1="9.5" y1="15.8" x2="19.5" y2="15.8" strokeWidth="1.5" />
    </>,
  ),
  newPanel: menuIcon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </>,
  ),
  favorite: menuIcon(<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />),
  newFile: menuIcon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </>,
  ),
  newCanvas: menuIcon(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>,
  ),
  newFolder: menuIcon(
    <>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </>,
  ),
  search: menuIcon(
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>,
  ),
  rename: menuIcon(<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />),
  duplicate: menuIcon(
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
  ),
  copyFile: menuIcon(
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </>,
  ),
  moveTo: menuIcon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <polyline points="9 15 12 18 15 15" />
    </>,
  ),
  delete: menuIcon(
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>,
  ),
  copyPath: menuIcon(
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>,
  ),
  openLocation: menuIcon(
    <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />,
  ),
  openTerminal: menuIcon(
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </>,
  ),
};

// 判断文件名是否为 Markdown（与编辑器分屏区一致，仅支持 Markdown 在新面板打开）
function isMarkdownFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["md", "markdown", "mdx"].includes(ext);
}

function getFileMenuItems(
  actions: FileActions,
  t: (key: string) => string,
  opts: { canOpenInNewPanel: boolean; targetIsMarkdown: boolean },
): ContextMenuItem[] {
  return [
    {
      label: t("sidebar.contextMenu.openInNewPanel"),
      icon: MENU_ICONS.newPanel,
      onClick: actions.onOpenInNewPanel,
      disabled: !opts.canOpenInNewPanel || !opts.targetIsMarkdown,
    },
    { label: t("sidebar.contextMenu.openInNewWindow"), icon: MENU_ICONS.newWindow, onClick: actions.onNewWindow },
    { label: t("sidebar.contextMenu.newFile"), icon: MENU_ICONS.newFile, onClick: actions.onNewFile, separator: true },
    { label: t("sidebar.contextMenu.newCanvas"), icon: MENU_ICONS.newCanvas, onClick: actions.onNewWhiteboard },
    { label: t("sidebar.contextMenu.newFolder"), icon: MENU_ICONS.newFolder, onClick: actions.onNewFolder },
    { label: t("sidebar.contextMenu.favorite"), icon: MENU_ICONS.favorite, onClick: actions.onBookmark, separator: true },
    { label: t("sidebar.contextMenu.rename"), icon: MENU_ICONS.rename, onClick: actions.onRename, separator: true },
    {
      label: t("sidebar.contextMenu.duplicate"),
      icon: MENU_ICONS.duplicate,
      onClick: actions.onDuplicateAndCopy,
      children: [
        { label: t("sidebar.contextMenu.duplicateCopy"), icon: MENU_ICONS.duplicate, onClick: actions.onDuplicate },
        { label: t("sidebar.contextMenu.copyToClipboard"), icon: MENU_ICONS.copyFile, onClick: actions.onCopyFile },
      ],
    },
    { label: t("sidebar.contextMenu.moveTo"), icon: MENU_ICONS.moveTo, onClick: actions.onMoveTo },
    { label: t("sidebar.contextMenu.delete"), icon: MENU_ICONS.delete, onClick: actions.onDelete, danger: true, separator: true },
    { label: t("sidebar.contextMenu.copyPath"), icon: MENU_ICONS.copyPath, onClick: actions.onCopyPath, separator: true },
    { label: t("sidebar.contextMenu.openInTerminal"), icon: MENU_ICONS.openTerminal, onClick: actions.onOpenTerminal },
    { label: t("sidebar.contextMenu.openLocation"), icon: MENU_ICONS.openLocation, onClick: actions.onOpenLocation },
  ];
}

function getFolderMenuItems(actions: FileActions, t: (key: string) => string): ContextMenuItem[] {
  return [
    { label: t("sidebar.contextMenu.newFile"), icon: MENU_ICONS.newFile, onClick: actions.onNewFile },
    { label: t("sidebar.contextMenu.newCanvas"), icon: MENU_ICONS.newCanvas, onClick: actions.onNewWhiteboard },
    { label: t("sidebar.contextMenu.newFolder"), icon: MENU_ICONS.newFolder, onClick: actions.onNewFolder, separator: true },
    { label: t("sidebar.contextMenu.favorite"), icon: MENU_ICONS.favorite, onClick: actions.onBookmark },
    { label: t("sidebar.contextMenu.rename"), icon: MENU_ICONS.rename, onClick: actions.onRename, separator: true },
    { label: t("sidebar.contextMenu.moveTo"), icon: MENU_ICONS.moveTo, onClick: actions.onMoveTo },
    { label: t("sidebar.contextMenu.delete"), icon: MENU_ICONS.delete, onClick: actions.onDelete, danger: true, separator: true },
    { label: t("sidebar.contextMenu.copyPath"), icon: MENU_ICONS.copyPath, onClick: actions.onCopyPath },
    { label: t("sidebar.contextMenu.openInTerminal"), icon: MENU_ICONS.openTerminal, onClick: actions.onOpenTerminal },
    { label: t("sidebar.contextMenu.openLocation"), icon: MENU_ICONS.openLocation, onClick: actions.onOpenLocation },
  ];
}

function getBlankMenuItems(actions: FileActions, t: (key: string) => string): ContextMenuItem[] {
  return [
    { label: t("sidebar.contextMenu.newFile"), icon: MENU_ICONS.newFile, onClick: actions.onNewFile },
    { label: t("sidebar.contextMenu.newCanvas"), icon: MENU_ICONS.newCanvas, onClick: actions.onNewWhiteboard },
    { label: t("sidebar.contextMenu.newFolder"), icon: MENU_ICONS.newFolder, onClick: actions.onNewFolder, separator: true },
    { label: t("sidebar.contextMenu.copyPath"), icon: MENU_ICONS.copyPath, onClick: actions.onCopyPath },
    { label: t("sidebar.contextMenu.openInTerminal"), icon: MENU_ICONS.openTerminal, onClick: actions.onOpenTerminal },
    { label: t("sidebar.contextMenu.openLocation"), icon: MENU_ICONS.openLocation, onClick: actions.onOpenLocation },
  ];
}

function showDevAlert() {
  alert(i18n.t("sidebar.alert.inDevelopment"));
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
        placeholder={i18n.t("sidebar.search.placeholder")}
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
          title={i18n.t("sidebar.search.clear")}
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
      {searching && <div className="sidebar-search-status">{i18n.t("sidebar.search.searching")}</div>}
      {!searching && results.length === 0 && (
        <div className="sidebar-search-status">{i18n.t("sidebar.search.noResults")}</div>
      )}
      {!searching && results.map((r) => (
        <div key={r.path} className="sidebar-search-result">
          <div
            className="sidebar-search-result-name"
            onClick={() => onSelectFile(r.path, undefined, query.trim())}
            style={{ cursor: "pointer" }}
          ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign: "-2px", marginRight: 4}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>{highlight(r.fileName, query.trim())}</div>
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
  pendingActivePath,
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
  onOpenInNewPanel,
  canOpenInNewPanel,
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
  pendingActivePath: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
  onReload: (expandPath?: string) => void;
  rootPath: string;
  dragOverPath: string | null;
  onMouseDown: (e: React.MouseEvent, nodePath: string, isDirectory: boolean) => void;
  editingPath: string | null;
  onStartEdit: (path: string) => void;
  onFinishEdit: (path: string, newName: string, isDirectory: boolean) => void;
  onNewWindow: (filePath: string) => void;
  onOpenInNewPanel: (filePath: string) => void;
  canOpenInNewPanel: boolean;
  onBookmark: (filePath: string, isDirectory: boolean) => void;
  selectedPaths: Set<string>;
  onMultiSelect: (paths: string[], mode: 'toggle' | 'range' | 'replace') => void;
  lastClickedPathRef: React.MutableRefObject<string | null>;
  onToggleExpand: (path: string, expanded: boolean) => void;
  onMoveTo: (path: string, isDirectory: boolean) => void;
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
    } catch (err) { console.error(i18n.t("sidebar.error.newFileFailed"), err); }
  }, [node, onReload, onStartEdit]);

  const handleNewFolder = useCallback(async () => {
    const targetDir = node.isDirectory ? node.path : parentPath(node.path);
    try {
      const dirPath = await uniqueDirPath(targetDir, "新建文件夹");
      await mkdir(dirPath); await onReload(targetDir); onStartEdit(dirPath);
    } catch (err) { console.error(i18n.t("sidebar.error.newFolderFailed"), err); }
  }, [node, onReload, onStartEdit]);

  const handleNewWhiteboard = useCallback(async () => {
    const targetDir = node.isDirectory ? node.path : parentPath(node.path);
    try {
      const filePath = await uniqueFilePath(targetDir, "untitled", ".canvas");
      await writeTextFile(filePath, '{"nodes":[],"edges":[]}'); await onReload(targetDir); onStartEdit(filePath);
    } catch (err) { console.error(i18n.t("sidebar.error.newCanvasFailed"), err); }
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
    } catch (err) { console.error(i18n.t("sidebar.error.deleteFailed"), err); }
  }, [node, onReload, selectedPaths, onMultiSelect]);

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(node.path).then(() => {
      showToast(i18n.t("sidebar.toast.pathCopied"));
    }).catch(() => { prompt(`${i18n.t("sidebar.file.filePath")}`, node.path); });
  }, [node]);

  const handleOpenLocation = useCallback(async () => {
    try {
      await invoke("open_file_location", { filePath: node.path });
    } catch (err) {
      console.error(i18n.t("sidebar.error.openLocationFailed"), err);
    }
  }, [node]);

  const handleOpenTerminal = useCallback(async () => {
    try {
      await invoke("open_in_terminal", { path: node.path });
    } catch (err) {
      console.error(i18n.t("sidebar.error.openTerminalFailed"), err);
    }
  }, [node]);

  const handleDuplicate = useCallback(async () => {
    try {
      await invoke("duplicate_file", { path: node.path });
      showToast(i18n.t("sidebar.toast.duplicated"));
      onReload();
    } catch (err) {
      console.error(i18n.t("sidebar.error.duplicateFailed"), err);
      showToast(i18n.t("sidebar.error.duplicateFailed"));
    }
  }, [node, onReload]);

  const handleDuplicateAndCopy = useCallback(async () => {
    try {
      await invoke("duplicate_file", { path: node.path });
      await invoke("copy_file_to_clipboard", { path: node.path });
      showToast(i18n.t("sidebar.toast.duplicatedAndCopied"));
      onReload();
    } catch (err) {
      console.error(i18n.t("sidebar.error.duplicateAndCopyFailed"), err);
      showToast(i18n.t("sidebar.error.duplicateAndCopyFailed"));
    }
  }, [node, onReload]);

  const handleCopyFileToClipboard = useCallback(async () => {
    try {
      await invoke("copy_file_to_clipboard", { path: node.path });
      showToast(i18n.t("sidebar.toast.fileCopiedToClipboard"));
    } catch (err) {
      console.error(i18n.t("sidebar.error.copyToClipboardFailed"), err);
      showToast(i18n.t("sidebar.error.copyToClipboardFailed"));
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
    onDuplicate: handleDuplicate,
    onDuplicateAndCopy: handleDuplicateAndCopy,
    onCopyFile: handleCopyFileToClipboard,
    onDelete: handleDelete,
    onCopyPath: handleCopyPath,
    onOpenLocation: handleOpenLocation,
    onOpenTerminal: handleOpenTerminal,
    onBookmark: () => onBookmark(node.path, node.isDirectory),
    onMoveTo: () => onMoveTo(node.path, node.isDirectory),
    onOpenInNewPanel: () => onOpenInNewPanel(node.path),
  };

  const menuItems = node.isDirectory
    ? getFolderMenuItems(actions, i18n.t)
    : getFileMenuItems(actions, i18n.t, {
        canOpenInNewPanel,
        targetIsMarkdown: isMarkdownFileName(node.name),
      });

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const isActive = activePath === node.path;
  const isPending = pendingActivePath === node.path;
  const isSelected = selectedPaths.has(node.path);
  const indent = depth * 22;
  const isDragOver = node.isDirectory && dragOverPath === node.path;

  return (
    <div className="tree-branch">
      <div
        ref={nodeRef}
        className={`tree-node${isActive ? " active" : ""}${isPending ? " pending-active" : ""}${isSelected ? " selected" : ""}${isDragOver ? " drag-over" : ""}`}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => onMouseDown(e, node.path, node.isDirectory)}
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
                onFinishEdit(node.path, (e.target as HTMLInputElement).value, node.isDirectory);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onFinishEdit(node.path, node.name, node.isDirectory);
              }
            }}
            onBlur={(e) => {
              onFinishEdit(node.path, e.target.value, node.isDirectory);
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
              pendingActivePath={pendingActivePath}
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
              onOpenInNewPanel={onOpenInNewPanel}
              canOpenInNewPanel={canOpenInNewPanel}
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
        title={i18n.t("sidebar.dialog.deleteConfirmTitle")}
        message={selectedPaths.size > 1 && selectedPaths.has(node.path)
          ? i18n.t("sidebar.dialog.deleteMultiConfirm", { count: selectedPaths.size })
          : node.isDirectory
            ? i18n.t("sidebar.dialog.deleteFolderConfirm", { name: node.name })
            : i18n.t("sidebar.dialog.deleteFileConfirm", { name: node.name })}
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
  onOpenInNewPanel,
  canOpenInNewPanel,
  onScrollToTop,
  hidden,
  onBookmark,
}: {
  rootPath: string;
  activePath: string | null;
  onSelect: (path: string) => void;
  refreshKey: number;
  onNewWindow: (filePath: string) => void;
  onOpenInNewPanel: (filePath: string) => void;
  canOpenInNewPanel: boolean;
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
  const pendingRevealPathRef = useRef<string | null>(null);
  // 滚动位置持久化：用 localStorage 保存，刷新/重载后恢复，避免跳回顶部
  const scrollSaveQueuedRef = useRef(false);
  const loadGenRef = useRef(0);
  const restoreGenRef = useRef(0);
  const restoringScrollRef = useRef(false);
  const pointerDownOnTreeRef = useRef(false);
  const interactUntilRef = useRef(0);

  const markTreeInteract = useCallback(() => {
    interactUntilRef.current = Date.now() + 450;
    restoreGenRef.current++;
  }, []);

  const scrollToPath = useCallback((path: string) => {
    const node = treeRef.current?.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // ── 滚动位置持久化（localStorage） ──
  const scrollStorageKey = `zmd-sidebar-scroll-${vaultPath}`;

  const saveScrollTop = useCallback((st: number) => {
    try {
      localStorage.setItem(scrollStorageKey, String(st));
    } catch {
      /* ignore quota / private mode */
    }
  }, [scrollStorageKey]);

  const loadScrollTop = useCallback((): number | null => {
    try {
      const raw = localStorage.getItem(scrollStorageKey);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  }, [scrollStorageKey]);

  const handleStartEdit = useCallback((path: string) => {
    setEditingPath(path);
  }, []);

  // ── Drag state (mouse-event based) ──
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragNodeRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; path: string; isDirectory: boolean } | null>(null);
  const isDragDirectoryRef = useRef(false);

  // ── Update link dialog state ──
  const [linkUpdateDialog, setLinkUpdateDialog] = useState<{
    srcPath: string;
    targetPath: string;
    filesCount: number;
    linksCount: number;
    imagePathsCount?: number;
    isDirectory?: boolean;
  } | null>(null);
  const alwaysUpdateLinksRef = useRef(false);
  const pendingRenameRef = useRef<{ path: string; newName: string; isDirectory?: boolean } | null>(null);

  // ── Move to folder state ──
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [moveSourcePath, setMoveSourcePath] = useState<string | null>(null);

  // ── Sort state ──
  const [sortSettings, setSortSettings] = useState<FileSortSettings>(loadSortSettings);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

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

  const loadRoot = useCallback(async (opts?: { skipIfUnchanged?: boolean; deferIfInteracting?: boolean }) => {
    const gen = ++loadGenRef.current;
    bootStart("sidebar_load_root");
    bootStamp("sidebar_load_dir_start");
    const nodes = await loadDirectory(rootPath);
    bootStamp("sidebar_load_dir_done");
    const expanded = new Set(loadExpandedPaths(vaultPath));
    for (const p of collectExpanded(rootNodesRef.current)) expanded.add(p);
    if (expanded.size > 0) {
      bootStamp("sidebar_restore_expanded_start");
      await restoreExpanded(nodes, expanded);
      bootStamp("sidebar_restore_expanded_done");
    }
    if (gen !== loadGenRef.current) {
      bootEnd("sidebar_load_root");
      return;
    }
    if (opts?.deferIfInteracting && (pointerDownOnTreeRef.current || Date.now() < interactUntilRef.current)) {
      window.setTimeout(() => {
        if (gen !== loadGenRef.current) return;
        void loadRoot(opts);
      }, 80);
      bootEnd("sidebar_load_root");
      return;
    }
    if (opts?.skipIfUnchanged && visibleTreeEqual(rootNodesRef.current, nodes)) {
      bootEnd("sidebar_load_root");
      return;
    }
    if (treeRef.current) lastScrollTopRef.current = treeRef.current.scrollTop;
    setRootNodes(nodes);
    bootStamp("sidebar_setRootNodes_called");
    bootEnd("sidebar_load_root");
  }, [rootPath, vaultPath, collectExpanded, restoreExpanded]);

  const handleRefresh = useCallback(() => {
    forceUpdate((n) => n + 1);
  }, []);

  const handleReload = useCallback(async (expandPath?: string | string[]) => {
    invalidateFileCache(rootPath);
    const paths = collectExpanded(rootNodesRef.current);
    if (expandPath) {
      if (Array.isArray(expandPath)) {
        for (const p of expandPath) paths.add(p);
      } else {
        paths.add(expandPath);
      }
    }
    const nodes = await loadDirectory(rootPath);
    await restoreExpanded(nodes, paths);
    setRootNodes(nodes);
    handleRefresh();
  }, [rootPath, collectExpanded, restoreExpanded, handleRefresh]);

  const handleSortChange = useCallback((settings: FileSortSettings) => {
    currentSortSettings = settings;
    saveSortSettings(settings);
    setSortSettings(settings);
    setSortDropdownOpen(false);
    const resortTree = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children) {
          resortTree(n.children);
          n.children = sortTreeNodes(n.children, settings);
        }
      }
    };
    resortTree(rootNodesRef.current);
    setRootNodes(sortTreeNodes(rootNodesRef.current, settings));
    handleRefresh();
  }, [handleRefresh, setSortDropdownOpen]);

  const handleRevealActiveFile = useCallback(async () => {
    if (!activePath || !activePath.startsWith(rootPath)) return;
    const dirs = ancestorDirs(parentPath(activePath), rootPath);
    if (dirs.length === 0) {
      scrollToPath(activePath);
      return;
    }
    pendingRevealPathRef.current = activePath;
    await handleReload(dirs);
  }, [activePath, rootPath, handleReload, scrollToPath]);

  useLayoutEffect(() => {
    const pending = pendingRevealPathRef.current;
    if (!pending) return;
    pendingRevealPathRef.current = null;
    scrollToPath(pending);
  }, [rootNodes, scrollToPath]);

  // 刷新后同步恢复滚动。优先用当前 DOM/ref 位置，避免 rAF 循环在点击过程中把列表拽走。
  useLayoutEffect(() => {
    if (pendingRevealPathRef.current) return;
    const el = treeRef.current;
    if (!el) return;
    const saved = lastScrollTopRef.current > 0 ? lastScrollTopRef.current : (loadScrollTop() ?? 0);
    if (saved <= 0) return;

    const restoreGen = ++restoreGenRef.current;
    restoringScrollRef.current = true;
    el.scrollTop = saved;
    restoringScrollRef.current = false;
    if (el.scrollTop >= saved - 1) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if (atBottom) return;

    let rafId = 0;
    let attempts = 0;
    const tryRestore = () => {
      if (restoreGen !== restoreGenRef.current) return;
      if (pointerDownOnTreeRef.current || Date.now() < interactUntilRef.current) return;
      attempts++;
      restoringScrollRef.current = true;
      el.scrollTop = saved;
      restoringScrollRef.current = false;
      const reached = el.scrollTop >= saved - 1
        || el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (!reached && attempts < 20) rafId = requestAnimationFrame(tryRestore);
    };
    rafId = requestAnimationFrame(tryRestore);
    return () => cancelAnimationFrame(rafId);
  }, [rootNodes, loadScrollTop]);

  // ── Collapse all / Expand all ──
  const hasExpandedDir = useMemo(() => {
    const anyExpanded = (nodes: TreeNode[]): boolean =>
      nodes.some((n) => (n.expanded ? true : n.children ? anyExpanded(n.children) : false));
    return anyExpanded(rootNodes);
  }, [rootNodes]);

  const handleCollapseAll = useCallback(() => {
    const collapse = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        n.expanded = false;
        if (n.children) collapse(n.children);
      }
    };
    collapse(rootNodesRef.current);
    saveExpandedPaths(vaultPath, new Set());
    setRootNodes([...rootNodesRef.current]);
    handleRefresh();
  }, [vaultPath, handleRefresh]);

  const handleExpandAll = useCallback(async () => {
    const expand = async (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.isDirectory) {
          if (n.children === null) n.children = await loadDirectory(n.path);
          n.expanded = true;
          if (n.children) await expand(n.children);
        }
      }
    };
    await expand(rootNodesRef.current);
    saveExpandedPaths(vaultPath, collectExpanded(rootNodesRef.current));
    setRootNodes([...rootNodesRef.current]);
    handleRefresh();
  }, [vaultPath, collectExpanded, handleRefresh]);


  const handleFinishEdit = useCallback(async (path: string, newName: string, isDirectory: boolean) => {
    setEditingPath(null);
    if (!newName || newName.trim() === "") return;
    newName = newName.trim();
    const currentName = path.split(pathSep()).pop() || "";
    if (newName === currentName) return;
    const p = parentPath(path);
    const newPath = joinPath(p, newName);

    // 检查是否有受影响的 wiki links 和图片路径
    if (isDirectory) {
      // 文件夹：检查内部所有 .md 文件（wiki 链接 + 图片路径）
      const [wikiTotal, imgTotal] = await Promise.all([
        !LinkIndexService.isEmpty() ? getAffectedLinkCountForFolder(path, newPath, rootPath) : Promise.resolve({ filesCount: 0, linksCount: 0 }),
        countImagePathsAffected(path, newPath, rootPath),
      ]);
      if (wikiTotal.filesCount > 0 || imgTotal.pathsCount > 0) {
        pendingRenameRef.current = { path, newName, isDirectory: true };
        setLinkUpdateDialog({ srcPath: path, targetPath: newPath, filesCount: wikiTotal.filesCount, linksCount: wikiTotal.linksCount, imagePathsCount: imgTotal.pathsCount, isDirectory: true });
        return;
      }
    } else if (path.endsWith(".md") && !LinkIndexService.isEmpty()) {
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
  const moveSourceIsDirectoryRef = useRef(false);

  const handleMoveTo = useCallback((path: string, isDirectory: boolean) => {
    setMoveSourcePath(path);
    moveSourceIsDirectoryRef.current = isDirectory;
    setFolderPickerOpen(true);
  }, []);

  const handleFolderSelect = useCallback(async (targetFolder: string) => {
    if (!moveSourcePath) return;
    
    const fileName = moveSourcePath.split(pathSep()).pop() || "";
    const targetPath = joinPath(targetFolder, fileName);
    const isDir = moveSourceIsDirectoryRef.current;
    
    // 不能移动到自身所在目录
    if (targetFolder === parentPath(moveSourcePath)) {
      setFolderPickerOpen(false);
      setMoveSourcePath(null);
      return;
    }
    
    // 检查是否有受影响的 wiki links 和图片路径
    if (isDir) {
      // 文件夹：检查内部所有 .md 文件（wiki 链接 + 图片路径）
      const [wikiTotal, imgTotal] = await Promise.all([
        !LinkIndexService.isEmpty() ? getAffectedLinkCountForFolder(moveSourcePath, targetPath, rootPath) : Promise.resolve({ filesCount: 0, linksCount: 0 }),
        countImagePathsAffected(moveSourcePath, targetPath, rootPath),
      ]);
      if (wikiTotal.filesCount > 0 || imgTotal.pathsCount > 0) {
        if (alwaysUpdateLinksRef.current) {
          if (wikiTotal.filesCount > 0) await rewriteWikiLinksForFolder(moveSourcePath, targetPath, rootPath);
          if (imgTotal.pathsCount > 0) await updateImagePathsForFolder(moveSourcePath, targetPath, rootPath);
          await rename(moveSourcePath, targetPath);
          await handleReload();
        } else {
          pendingRenameRef.current = { path: moveSourcePath, newName: fileName, isDirectory: true };
          setLinkUpdateDialog({ srcPath: moveSourcePath, targetPath, filesCount: wikiTotal.filesCount, linksCount: wikiTotal.linksCount, imagePathsCount: imgTotal.pathsCount, isDirectory: true });
        }
      } else {
        try { await rename(moveSourcePath, targetPath); await handleReload(); } catch (err) { console.error("移动失败:", err); }
      }
    } else if (moveSourcePath.endsWith(".md") && !LinkIndexService.isEmpty()) {
      const { filesCount, linksCount } = LinkIndexService.getAffectedLinkCount(moveSourcePath, targetPath, rootPath);
      if (filesCount > 0) {
        if (alwaysUpdateLinksRef.current) {
          try {
            await LinkIndexService.rewriteWikiLinks(moveSourcePath, targetPath, rootPath);
            await rename(moveSourcePath, targetPath);
            await handleReload();
          } catch (err) { console.error("移动失败:", err); }
        } else {
          pendingRenameRef.current = { path: moveSourcePath, newName: fileName };
          setLinkUpdateDialog({ srcPath: moveSourcePath, targetPath, filesCount, linksCount });
        }
      } else {
        try { await rename(moveSourcePath, targetPath); await handleReload(); } catch (err) { console.error("移动失败:", err); }
      }
    } else {
      try { await rename(moveSourcePath, targetPath); await handleReload(); } catch (err) { console.error("移动失败:", err); }
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
  const handleMouseDown = useCallback((e: React.MouseEvent, nodePath: string, isDirectory: boolean) => {
    // Only left button
    if (e.button !== 0) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, path: nodePath, isDirectory };
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
        isDragDirectoryRef.current = dragStartRef.current.isDirectory;
        setIsDragging(true);
        // 清掉拖拽阈值内已产生的文本选区（WKWebView 上 user-select 偶发失效）
        window.getSelection()?.removeAllRanges();
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
              const isDir = isDragDirectoryRef.current;

              // 检查是否有受影响的 wiki links 和图片路径
              if (isDir) {
                // 文件夹：检查内部所有 .md 文件（wiki 链接 + 图片路径）
                const [wikiTotal, imgTotal] = await Promise.all([
                  !LinkIndexService.isEmpty() ? getAffectedLinkCountForFolder(srcPath, targetPath, rootPath) : Promise.resolve({ filesCount: 0, linksCount: 0 }),
                  countImagePathsAffected(srcPath, targetPath, rootPath),
                ]);
                if (wikiTotal.filesCount > 0 || imgTotal.pathsCount > 0) {
                  if (alwaysUpdateLinksRef.current) {
                    if (wikiTotal.filesCount > 0) await rewriteWikiLinksForFolder(srcPath, targetPath, rootPath);
                    if (imgTotal.pathsCount > 0) await updateImagePathsForFolder(srcPath, targetPath, rootPath);
                    await rename(srcPath, targetPath);
                    await handleReload();
                  } else {
                    pendingRenameRef.current = { path: srcPath, newName: fileName, isDirectory: true };
                    setLinkUpdateDialog({ srcPath, targetPath, filesCount: wikiTotal.filesCount, linksCount: wikiTotal.linksCount, imagePathsCount: imgTotal.pathsCount, isDirectory: true });
                  }
                } else {
                  try { await rename(srcPath, targetPath); await handleReload(); } catch (err) { console.error("移动失败:", err); }
                }
              } else if (srcPath.endsWith(".md") && !LinkIndexService.isEmpty()) {
                // 单个 .md 文件
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
                try { await rename(srcPath, targetPath); await handleReload(); } catch (err) { console.error("移动失败:", err); }
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

  // 禁止文件树文本选中（重命名输入框除外）；WKWebView 对 CSS user-select 不完全可靠
  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    const onSelectStart = (e: Event) => {
      // WebKit/macOS WKWebView 偶发把 e.target 设为非 Element（TextNode/Document/null），
      // 直接 (e.target as HTMLElement).closest() 会 NPE。
      const t = e.target;
      if (t instanceof Element && t.closest(".tree-name-input")) return;
      e.preventDefault();
    };
    el.addEventListener("selectstart", onSelectStart);
    return () => el.removeEventListener("selectstart", onSelectStart);
  }, []);

  // ── Blank area actions ──
  /** 当前选中文件所在目录；未选中或不在本仓库内时回退到根目录。 */
  const selectionDir = activePath && activePath.startsWith(rootPath)
    ? parentPath(activePath)
    : rootPath;

  const handleNewRootFile = useCallback(async () => {
    const targetDir = selectionDir;
    try {
      const filePath = await uniqueFilePath(targetDir, "untitled", ".md");
      await writeTextFile(filePath, ""); await handleReload(ancestorDirs(targetDir, rootPath)); handleStartEdit(filePath);
    } catch (err) { console.error(i18n.t("sidebar.error.newFileFailed"), err); }
  }, [selectionDir, rootPath, handleReload, handleStartEdit]);

  const handleNewRootFolder = useCallback(async () => {
    const targetDir = selectionDir;
    try {
      const dirPath = await uniqueDirPath(targetDir, "新建文件夹");
      await mkdir(dirPath); await handleReload(ancestorDirs(targetDir, rootPath)); handleStartEdit(dirPath);
    } catch (err) { console.error(i18n.t("sidebar.error.newFolderFailed"), err); }
  }, [selectionDir, rootPath, handleReload, handleStartEdit]);

  const handleNewRootWhiteboard = useCallback(async () => {
    try {
      const filePath = await uniqueFilePath(rootPath, "untitled", ".canvas");
      await writeTextFile(filePath, '{"nodes":[],"edges":[]}'); await handleReload(); handleStartEdit(filePath);
    } catch (err) { console.error(i18n.t("sidebar.error.newCanvasFailed"), err); }
  }, [rootPath, handleReload, handleStartEdit]);

  const handleCopyRootPath = useCallback(() => {
    navigator.clipboard.writeText(rootPath).then(() => {
      showToast(i18n.t("sidebar.toast.pathCopied"));
    }).catch(() => { prompt(`${i18n.t("sidebar.file.folderPath")}`, rootPath); });
  }, [rootPath]);
  const handleOpenRootLocation = useCallback(async () => {
    try {
      await invoke("open_file_location", { filePath: rootPath });
    } catch (err) {
      console.error(i18n.t("sidebar.error.openFolderLocationFailed"), err);
    }
  }, [rootPath]);

  const handleOpenRootTerminal = useCallback(async () => {
    try {
      await invoke("open_in_terminal", { path: rootPath });
    } catch (err) {
      console.error(i18n.t("sidebar.error.openTerminalFailed"), err);
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
    onDuplicateAndCopy: showDevAlert,
    onCopyFile: () => {},
    onDelete: () => {},
    onCopyPath: handleCopyRootPath,
    onOpenLocation: handleOpenRootLocation,
    onOpenTerminal: handleOpenRootTerminal,
    onBookmark: () => {},
    onMoveTo: () => {},
    onOpenInNewPanel: () => {},
  };

  const handleBlankContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".tree-node")) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      if (cancelled) return;
      if (pointerDownOnTreeRef.current || Date.now() < interactUntilRef.current) {
        timer = setTimeout(run, 80);
        return;
      }
      void loadRoot({ skipIfUnchanged: true, deferIfInteracting: true });
    };
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadRoot, refreshKey]);

  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const onPointerDown = () => {
      pointerDownOnTreeRef.current = true;
      markTreeInteract();
    };
    const onPointerUp = () => {
      pointerDownOnTreeRef.current = false;
      markTreeInteract();
    };
    tree.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      tree.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [markTreeInteract]);

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

  // ── Vim 键盘光标（pendingActivePath）：j/k 上下不打开文件，l/Enter 才打开 ──
  const [pendingActivePath, setPendingActivePath] = useState<string | null>(null);
  const pendingActivePathRef = useRef<string | null>(null);
  pendingActivePathRef.current = pendingActivePath;

  // 先序遍历，只把「当前可见」的项放入列表（目录未 expanded 时子项不进入）
  const flattenVisible = useCallback((nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    const walk = (list: TreeNode[]) => {
      for (const n of list) {
        out.push(n);
        if (n.isDirectory && n.expanded && n.children) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  }, []);

  const findNodeByPath = useCallback((nodes: TreeNode[], path: string): TreeNode | null => {
    const stack = [...nodes];
    while (stack.length) {
      const cur = stack.shift()!;
      if (cur.path === path) return cur;
      if (cur.children) for (const c of cur.children) stack.unshift(c);
    }
    return null;
  }, []);

  const targetDirPathFor = useCallback((path: string | null): string => {
    if (!path) return rootPath;
    const n = findNodeByPath(rootNodesRef.current, path);
    if (n?.isDirectory) return path;
    return parentPath(path) || rootPath;
  }, [findNodeByPath, rootPath]);

  // expand dir 并等待 loadDirectory 完成 + setState 完成
  const toggleDirExpanded = useCallback(async (path: string): Promise<boolean> => {
    const n = findNodeByPath(rootNodesRef.current, path);
    if (!n || !n.isDirectory) return false;
    if (n.children === null) n.children = await loadDirectory(n.path);
    n.expanded = !n.expanded;
    handleToggleExpand(n.path, n.expanded);
    setRootNodes([...rootNodesRef.current]);
    handleRefresh();
    return n.expanded;
  }, [findNodeByPath, handleToggleExpand, handleRefresh]);

  const collapseDescendants = useCallback((path: string) => {
    const n = findNodeByPath(rootNodesRef.current, path);
    if (!n || !n.isDirectory) return;
    const walk = (nodes: TreeNode[]) => {
      for (const c of nodes) {
        if (c.isDirectory) {
          c.expanded = false;
          if (c.children) walk(c.children);
        }
      }
    };
    if (n.children) walk(n.children);
    handleToggleExpand(path, n.expanded); // path 本身保持原样
    saveExpandedPaths(vaultPath, collectExpanded(rootNodesRef.current));
    setRootNodes([...rootNodesRef.current]);
    handleRefresh();
  }, [findNodeByPath, collectExpanded, handleToggleExpand, vaultPath, handleRefresh]);

  // 打开文件或目录（l/Enter/o 的语义）
  const doConfirmOpen = useCallback(async (path: string | null) => {
    if (!path) return;
    const n = findNodeByPath(rootNodesRef.current, path);
    if (!n) return;
    if (n.isDirectory) {
      await toggleDirExpanded(path);
    } else {
      onSelect(path);
    }
  }, [findNodeByPath, toggleDirExpanded, onSelect]);

  // 初始化 pendingActivePath：优先用 activePath（真实已打开文件），否则用第一个节点
  useEffect(() => {
    setPendingActivePath((prev) => {
      if (prev) return prev;
      if (activePath) {
        const exists = findNodeByPath(rootNodesRef.current, activePath);
        if (exists) return activePath;
      }
      const list = flattenVisible(rootNodesRef.current);
      return list[0]?.path ?? null;
    });
  }, [activePath, rootNodes, findNodeByPath, flattenVisible]);

  // 监听 Vim 侧栏动作事件
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ action?: string; path?: string; delta?: number }>;
      const action = ce.detail?.action;
      if (!action) return;
      const setP = (p: string | null) => { setPendingActivePath(p); pendingActivePathRef.current = p; };
      const jump = (delta: number) => {
        const list = flattenVisible(rootNodesRef.current);
        if (list.length === 0) return;
        const cur = pendingActivePathRef.current;
        let idx = cur ? list.findIndex((n) => n.path === cur) : -1;
        if (idx < 0) idx = list[0].path === cur ? 0 : -1;
        idx = idx < 0 ? (delta > 0 ? -1 : 0) : idx;
        const next = Math.max(0, Math.min(list.length - 1, idx + delta));
        setP(list[next].path);
        pendingRevealPathRef.current = list[next].path;
        window.requestAnimationFrame(() => {
          const el = treeRef.current?.querySelector(`[data-path="${CSS.escape(list[next].path)}"]`);
          el?.scrollIntoView({ block: "nearest", behavior: "auto" });
        });
      };
      switch (action) {
        case "highlight-next":
          jump(+1);
          break;
        case "highlight-prev":
          jump(-1);
          break;
        case "highlight-first": {
          const list = flattenVisible(rootNodesRef.current);
          if (list.length) { setP(list[0].path); pendingRevealPathRef.current = list[0].path; }
          break;
        }
        case "highlight-last": {
          const list = flattenVisible(rootNodesRef.current);
          if (list.length) { setP(list[list.length - 1].path); pendingRevealPathRef.current = list[list.length - 1].path; }
          break;
        }
        case "highlight-path": {
          const p = ce.detail.path ?? null;
          if (p) setP(p);
          break;
        }
        case "highlight-parent": {
          const p = pendingActivePathRef.current;
          if (!p) return;
          if (p === rootPath) return;
          const par = parentPath(p);
          setP(par);
          pendingRevealPathRef.current = par;
          break;
        }
        case "h-toggle": {
          // h 语义：如果当前是已展开目录 → 折叠；否则 → 高亮父目录
          const p = pendingActivePathRef.current;
          if (!p) return;
          const n = findNodeByPath(rootNodesRef.current, p);
          if (n?.isDirectory && n.expanded) {
            toggleDirExpanded(p); // 折叠
          } else {
            if (p === rootPath) return;
            const par = parentPath(p);
            setP(par);
            pendingRevealPathRef.current = par;
          }
          break;
        }
        case "toggle-dir-only": {
          const p = pendingActivePathRef.current;
          if (p) toggleDirExpanded(p);
          break;
        }
        case "collapse-all": {
          handleCollapseAll();
          break;
        }
        case "expand-all": {
          handleExpandAll();
          break;
        }
        case "collapse-branch": {
          const p = pendingActivePathRef.current;
          if (p) collapseDescendants(p);
          break;
        }
        case "confirm-open": {
          doConfirmOpen(pendingActivePathRef.current);
          break;
        }
        case "new-file": {
          const target = targetDirPathFor(pendingActivePathRef.current);
          (async () => {
            try {
              const filePath = await uniqueFilePath(target, "untitled", ".md");
              await writeTextFile(filePath, "");
              await handleReload(target);
              setP(filePath);
              handleStartEdit(filePath);
            } catch (err) { console.error(i18n.t("sidebar.error.newFileFailed"), err); }
          })();
          break;
        }
        case "new-folder": {
          const target = targetDirPathFor(pendingActivePathRef.current);
          (async () => {
            try {
              const dirPath = await uniqueDirPath(target, "新建文件夹");
              await mkdir(dirPath);
              await handleReload(target);
              setP(dirPath);
              handleStartEdit(dirPath);
            } catch (err) { console.error(i18n.t("sidebar.error.newFolderFailed"), err); }
          })();
          break;
        }
        case "rename": {
          const p = pendingActivePathRef.current;
          if (p) handleStartEdit(p);
          break;
        }
        case "delete": {
          const p = pendingActivePathRef.current;
          if (!p) return;
          (async () => {
            try {
              const paths = selectedPaths.size > 0 && selectedPaths.has(p)
                ? Array.from(selectedPaths)
                : [p];
              for (const q of paths) { await remove(q, { recursive: true }); }
              handleMultiSelect([], 'replace');
              await handleReload();
            } catch (err) { console.error(i18n.t("sidebar.error.deleteFailed"), err); }
          })();
          break;
        }
        case "duplicate": {
          const p = pendingActivePathRef.current;
          if (!p) return;
          (async () => {
            try {
              await invoke("duplicate_file", { path: p });
              showToast(i18n.t("sidebar.toast.duplicated"));
              await handleReload();
            } catch (err) {
              console.error(i18n.t("sidebar.error.duplicateFailed"), err);
              showToast(i18n.t("sidebar.error.duplicateFailed"));
            }
          })();
          break;
        }
        case "move-to": {
          const p = pendingActivePathRef.current;
          if (!p) return;
          const n = findNodeByPath(rootNodesRef.current, p);
          if (n) handleMoveTo(p, n.isDirectory);
          break;
        }
        case "copy-path": {
          const p = pendingActivePathRef.current;
          if (!p) return;
          navigator.clipboard?.writeText(p)
            .then(() => showToast(i18n.t("sidebar.toast.pathCopied")))
            .catch(() => { prompt(`${i18n.t("sidebar.file.filePath")}`, p); });
          break;
        }
      }
    };
    window.addEventListener("vim-sidebar-action", handler);
    return () => window.removeEventListener("vim-sidebar-action", handler);
  }, [
    flattenVisible, findNodeByPath, targetDirPathFor, toggleDirExpanded, collapseDescendants,
    doConfirmOpen, handleCollapseAll, handleExpandAll, rootPath, handleReload, handleStartEdit,
    handleMoveTo, handleMultiSelect, selectedPaths,
  ]);

  const handleScroll = useCallback(() => {
    const el = treeRef.current;
    if (!el) return;
    const st = el.scrollTop;

    if (!restoringScrollRef.current) {
      markTreeInteract();
    }

    // 节流保存滚动位置到 localStorage（每帧最多一次）
    if (!scrollSaveQueuedRef.current) {
      scrollSaveQueuedRef.current = true;
      requestAnimationFrame(() => {
        scrollSaveQueuedRef.current = false;
        const latest = treeRef.current?.scrollTop ?? 0;
        lastScrollTopRef.current = latest;
        saveScrollTop(latest);
      });
    }

    if (onScrollToTop) {
      if (st < lastScrollTopRef.current && st < 5) {
        onScrollToTop();
      }
    }
    lastScrollTopRef.current = st;
  }, [onScrollToTop, saveScrollTop, markTreeInteract]);

  // ── Link update dialog handlers ──
  const handleLinkUpdateAlways = useCallback(async () => {
    alwaysUpdateLinksRef.current = true;
    if (linkUpdateDialog) {
      try {
        if (linkUpdateDialog.isDirectory) {
          const tasks: Promise<unknown>[] = [];
          if (linkUpdateDialog.linksCount > 0) tasks.push(rewriteWikiLinksForFolder(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath, rootPath));
          if (linkUpdateDialog.imagePathsCount != null && linkUpdateDialog.imagePathsCount > 0) tasks.push(updateImagePathsForFolder(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath, rootPath));
          if (tasks.length > 0) await Promise.all(tasks);
        } else {
          await LinkIndexService.rewriteWikiLinks(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath, rootPath);
        }
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
        if (linkUpdateDialog.isDirectory) {
          const tasks: Promise<unknown>[] = [];
          if (linkUpdateDialog.linksCount > 0) tasks.push(rewriteWikiLinksForFolder(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath, rootPath));
          if (linkUpdateDialog.imagePathsCount != null && linkUpdateDialog.imagePathsCount > 0) tasks.push(updateImagePathsForFolder(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath, rootPath));
          if (tasks.length > 0) await Promise.all(tasks);
        } else {
          await LinkIndexService.rewriteWikiLinks(linkUpdateDialog.srcPath, linkUpdateDialog.targetPath, rootPath);
        }
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

  useEffect(() => {
    if (!sortDropdownOpen) return;
    const handler = () => setSortDropdownOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [sortDropdownOpen]);

  return (
    <div className="sidebar-tree-wrapper">
      <div className="sidebar-sort-bar">
        <button
          className="sidebar-action-btn"
          onClick={handleNewRootFile}
          title={i18n.t("sidebar.toolbar.newFile")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <path d="M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35" />
            <path d="M14 2v5a1 1 0 0 0 1 1h5" />
            <path d="M14 19h6" />
            <path d="M17 16v6" />
          </svg>
        </button>
        <button
          className="sidebar-action-btn"
          onClick={handleNewRootFolder}
          title={i18n.t("sidebar.toolbar.newFolder")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <path d="M12 10v6" />
            <path d="M9 13h6" />
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
        </button>
        <div className="sidebar-sort-wrap">
          <button
            className="sidebar-action-btn"
            onClick={(e) => { e.stopPropagation(); setSortDropdownOpen(v => !v); }}
            title={i18n.t("sidebar.sort.tooltip")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="m3 8 4-4 4 4" />
              <path d="M7 4v16" />
              <path d="M11 12h4" />
              <path d="M11 16h7" />
              <path d="M11 20h10" />
            </svg>
          </button>
          {sortDropdownOpen && (
            <div className="sidebar-sort-dropdown" onClick={e => e.stopPropagation()}>
              <button
                className={`sidebar-sort-option${sortSettings.sortBy === "name" && sortSettings.sortOrder === "asc" ? " active" : ""}`}
                onClick={() => handleSortChange({ sortBy: "name", sortOrder: "asc" })}
              >
                {i18n.t("sidebar.sort.nameAsc")}
              </button>
              <button
                className={`sidebar-sort-option${sortSettings.sortBy === "name" && sortSettings.sortOrder === "desc" ? " active" : ""}`}
                onClick={() => handleSortChange({ sortBy: "name", sortOrder: "desc" })}
              >
                {i18n.t("sidebar.sort.nameDesc")}
              </button>
              <div className="sidebar-sort-divider" />
              <button
                className={`sidebar-sort-option${sortSettings.sortBy === "modified" && sortSettings.sortOrder === "desc" ? " active" : ""}`}
                onClick={() => handleSortChange({ sortBy: "modified", sortOrder: "desc" })}
              >
                {i18n.t("sidebar.sort.modifiedDesc")}
              </button>
              <button
                className={`sidebar-sort-option${sortSettings.sortBy === "modified" && sortSettings.sortOrder === "asc" ? " active" : ""}`}
                onClick={() => handleSortChange({ sortBy: "modified", sortOrder: "asc" })}
              >
                {i18n.t("sidebar.sort.modifiedAsc")}
              </button>
              <div className="sidebar-sort-divider" />
              <button
                className={`sidebar-sort-option${sortSettings.sortBy === "created" && sortSettings.sortOrder === "desc" ? " active" : ""}`}
                onClick={() => handleSortChange({ sortBy: "created", sortOrder: "desc" })}
              >
                {i18n.t("sidebar.sort.createdDesc")}
              </button>
              <button
                className={`sidebar-sort-option${sortSettings.sortBy === "created" && sortSettings.sortOrder === "asc" ? " active" : ""}`}
                onClick={() => handleSortChange({ sortBy: "created", sortOrder: "asc" })}
              >
                {i18n.t("sidebar.sort.createdAsc")}
              </button>
            </div>
          )}
        </div>
        <button
          className="sidebar-action-btn"
          onClick={handleRevealActiveFile}
          disabled={!activePath || !activePath.startsWith(rootPath)}
          title={i18n.t("sidebar.toolbar.revealActiveFile")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
        </button>
        <button
          className="sidebar-action-btn"
          onClick={hasExpandedDir ? handleCollapseAll : handleExpandAll}
          title={hasExpandedDir ? i18n.t("sidebar.toolbar.collapseAll") : i18n.t("sidebar.toolbar.expandAll")}
        >
          {hasExpandedDir ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="m7 20 5-5 5 5" />
              <path d="m7 4 5 5 5-5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="m7 15 5 5 5-5" />
              <path d="m7 9 5-5 5 5" />
            </svg>
          )}
        </button>
      </div>
      <div
        ref={treeRef}
        className={`sidebar-tree${hidden ? " hidden" : ""}${isDragging ? " dragging" : ""}${dragOverPath === rootPath ? " drag-over" : ""}`}
        onContextMenu={handleBlankContextMenu}
        onScroll={handleScroll}
        onClick={(e) => { if (e.target === e.currentTarget) handleClearSelection(); }}
        data-path={rootPath}
        data-is-dir="1"
      >
      {rootNodes.length > 0 &&
        rootNodes.map((node) => (
          <TreeNodeComp
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            pendingActivePath={pendingActivePath}
            onSelect={(path) => {
              // 鼠标点击后 Vim 光标跟随到该文件：pending-active 始终指向最近交互的节点，
              // 任何未来的 reveal 也只滚到当前文件（在视野内，nearest 不会产生滚动）
              setPendingActivePath(path);
              pendingActivePathRef.current = path;
              onSelect(path);
            }}
            onRefresh={handleRefresh}
            onReload={handleReload}
            rootPath={rootPath}
            dragOverPath={dragOverPath}
            onMouseDown={handleMouseDown}
            editingPath={editingPath}
            onStartEdit={handleStartEdit}
            onFinishEdit={handleFinishEdit}
            onNewWindow={onNewWindow}
            onOpenInNewPanel={onOpenInNewPanel}
            canOpenInNewPanel={canOpenInNewPanel}
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
          items={getBlankMenuItems(blankActions, i18n.t)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <UpdateLinkDialog
        isOpen={linkUpdateDialog !== null}
        filesCount={linkUpdateDialog?.filesCount ?? 0}
        linksCount={linkUpdateDialog?.linksCount ?? 0}
        imagePathsCount={linkUpdateDialog?.imagePathsCount}
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
    </div>
  );
}

// ── Outline Component ───────────────────────────────────────────────

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

interface OutlineNode {
  item: OutlineItem;
  children: OutlineNode[];
  hasChildren: boolean;
}

function parseOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = markdown.split("\n");
  // fenced code block（``` 或 ~~~）开关：避免把代码里的 # 注释识别成标题
  let inFence = false;
  let fenceMarker = ""; // 当前围栏标记：``` 或 ~~~，避免不同标记交叉闭合
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // 1) 先处理 fenced code block 标记行（允许最多 3 个前导空格，符合 CommonMark）
    const fenceMatch = rawLine.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];               // 具体标记：```、````、~~~ 等
      const markerChar = marker[0];               // ` 或 ~
      const markerLen = marker.length;
      if (!inFence) {
        // 进入围栏：必须整行只有标记 + 可选信息字符串，不能被 info 字符串打断
        inFence = true;
        fenceMarker = marker;
      } else if (markerChar === fenceMarker[0] && markerLen >= fenceMarker.length) {
        // 闭合围栏：同类字符 + 长度 >= 开围栏长度 才算闭合
        // 额外校验：闭合围栏后面只能跟空白，防止被 ```foo 误伤
        const after = rawLine.slice(fenceMatch[0].length);
        if (/^\s*$/.test(after)) {
          inFence = false;
          fenceMarker = "";
        }
      }
      continue;
    }
    // 2) 在围栏内部不解析标题
    if (inFence) continue;
    // 3) ATX 标题：按 CommonMark 规范，前导空格 <= 3 且格式为 #{1,6} + 空格 + 文本
    //    缩进代码块（>=4 空格）或行首非 # 直接跳过
    const m = rawLine.match(/^ {0,3}(#{1,6})(?:\s+(.+?))?\s*#*\s*$/);
    if (m) {
      // 文本部分可以为空（如 "###   " 也算合法空标题），但大纲里我们跳过空文本
      const text = (m[2] ?? "").trim();
      if (text) {
        items.push({ level: m[1].length, text, line: i + 1 });
      } else {
        // 空标题也保留一项，避免"### " 这种合法但没内容的行影响定位
        // 但如果完全没文本就不加入大纲，避免空白项污染
      }
    }
  }
  return items;
}

function buildOutlineTree(items: OutlineItem[]): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: { node: OutlineNode; level: number }[] = [];

  for (const item of items) {
    const node: OutlineNode = { item, children: [], hasChildren: false };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      parent.children.push(node);
      parent.hasChildren = true;
    }

    stack.push({ node, level: item.level });
  }

  return root;
}

function OutlineNodeComp({
  node,
  depth,
  collapsedLines,
  activeLine,
  onToggle,
  onSelectHeading,
}: {
  node: OutlineNode;
  depth: number;
  collapsedLines: Set<number>;
  activeLine: number;
  onToggle: (line: number) => void;
  onSelectHeading: (level: number, text: string, line: number) => void;
}) {
  const isCollapsed = collapsedLines.has(node.item.line);
  const showChildren = node.hasChildren && !isCollapsed;
  const isActive = activeLine === node.item.line;

  return (
    <div className="outline-branch">
      <div
        className={`outline-node${isActive ? " active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        title={node.item.text}
      >
        {node.hasChildren ? (
          <span
            className={`outline-chevron${isCollapsed ? "" : " expanded"}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.item.line);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </span>
        ) : (
          <span className="outline-icon-spacer" />
        )}
        <span className="outline-level">H{node.item.level}</span>
        <span
          className="outline-text"
          onClick={() => onSelectHeading(node.item.level, node.item.text, node.item.line)}
        >
          {node.item.text}
        </span>
      </div>

      {showChildren && node.children.length > 0 && (
        <div className="outline-children" style={{ '--outline-depth': depth } as React.CSSProperties}>
          {node.children.map((child) => (
            <OutlineNodeComp
              key={child.item.line}
              node={child}
              depth={depth + 1}
              collapsedLines={collapsedLines}
              activeLine={activeLine}
              onToggle={onToggle}
              onSelectHeading={onSelectHeading}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Outline({
  content,
  onSelectHeading,
}: {
  content: string;
  onSelectHeading: (level: number, text: string, line: number) => void;
}) {
  const items = parseOutline(content);
  const [collapsedLines, setCollapsedLines] = useState<Set<number>>(new Set());
  const [activeLine, setActiveLine] = useState<number>(0);

  const handleToggle = useCallback((line: number) => {
    setCollapsedLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) {
        next.delete(line);
      } else {
        next.add(line);
      }
      return next;
    });
  }, []);

  const handleSelectHeading = useCallback((level: number, text: string, line: number) => {
    setActiveLine(line);
    onSelectHeading(level, text, line);
  }, [onSelectHeading]);

  if (items.length === 0) {
    return (
      <div className="sidebar-tree">
        <div className="tree-empty">{i18n.t("sidebar.outline.untitled")}</div>
        <div className="tree-empty-hint">{i18n.t("sidebar.outline.hint")}</div>
      </div>
    );
  }

  const tree = buildOutlineTree(items);

  return (
    <div className="sidebar-tree">
      {tree.map((node) => (
        <OutlineNodeComp
          key={node.item.line}
          node={node}
          depth={0}
          collapsedLines={collapsedLines}
          activeLine={activeLine}
          onToggle={handleToggle}
          onSelectHeading={handleSelectHeading}
        />
      ))}
    </div>
  );
}

// ── Linked References（大纲面板底部：列出当前打开的笔记中包含的 wiki 链接/出链）──

/** 与文件树一致的系统分隔符（Windows 用反斜杠，其它用正斜杠） */
function refNativeSeparator(): string {
  return navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
}

/** 把任意书写风格的路径统一成系统原生分隔符，保证与文件树/编辑器路径可比对 */
function refToNativePath(p: string): string {
  return refNativeSeparator() === "\\" ? p.replace(/\//g, "\\") : p.replace(/\\/g, "/");
}

interface LinkedRefItem {
  raw: string;
  path: string;
  label: string;
  valid: boolean;
}

/** 从链接目标提取文件名：去路径、去扩展名（如 Notes/Mind-Map.md → Mind-Map） */
function linkFileName(raw: string): string {
  const seg = raw.replace(/\\/g, "/").split("/").pop() ?? raw;
  const hashIdx = seg.indexOf("#");
  const core = hashIdx >= 0 ? seg.slice(0, hashIdx) : seg;
  return core.replace(/\.[^.]+$/, "");
}

function LinkedReferences({
  vaultPath,
  filePath,
  refreshTick,
  onSelectFile,
}: {
  vaultPath: string;
  filePath: string;
  refreshTick?: number;
  onSelectFile: (path: string) => void;
}) {
  // 本面板展示当前文档里的 wiki 链接（[[...]] 出链）：按出现顺序去重，
  // 统一显示链接目标的文件名；点击跳转到目标文件。
  const items = useMemo<LinkedRefItem[]>(() => {
    if (!vaultPath || !filePath) return [];
    const seen = new Set<string>();
    const result: LinkedRefItem[] = [];
    for (const target of LinkIndexService.getOutlinksForFile(filePath)) {
      if (!target) continue;
      const found = LinkIndexService.resolveTargetPath(target);
      const resolved = found ? refToNativePath(found) : "";
      const label = linkFileName(target);
      const key = resolved ? resolved.toLowerCase() : label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ raw: target, path: resolved, label, valid: Boolean(resolved) });
    }
    return result;
  }, [vaultPath, filePath, refreshTick]);

  if (items.length === 0) {
    return <div className="inspector-empty">No links in this note</div>;
  }
  return (
    <div className="linked-refs">
      {items.map((it) => (
        <button
          key={it.path || it.raw}
          type="button"
          className="linked-ref"
          title={it.valid ? it.path : `[[${it.label}]]（未找到对应文件）`}
          onClick={() => {
            // 优先用缓存路径；点击时再解析一次兜底（索引可能刚更新）
            let target = it.path;
            if (!target) {
              const found = LinkIndexService.resolveTargetPath(it.raw);
              if (found) target = refToNativePath(found);
            }
            if (target) onSelectFile(target);
          }}
        >
          {it.label}
        </button>
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
  onSelectVault,
}: {
  vaults: VaultInfo[];
  activeIndex: number;
  onRemove: (index: number) => void;
  onPublish: () => void;
  onSelectVault: (index: number) => void;
}) {
  const { t } = useTranslation();
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
      console.error(i18n.t("sidebar.error.openSettingsFailed"), err);
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
            <span className="vault-name">{t("sidebar.vault.manage")}</span>
          </button>
          <button
            className="vault-menu-btn"
            title={t("sidebar.vault.settings")}
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
        title={t("sidebar.vault.switch")}
      >
        {vaultSvgIcon}
        <span
          className="vault-name"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
        >
          {activeVault ? activeVault.name : t("sidebar.vault.unselected")}
        </span>
        <button
          className="vault-menu-btn"
          title={t("sidebar.vault.settings")}
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
                  onSelectVault(i);
                  setMenuOpen(false);
                }}
              >
                <span className="vault-menu-name">{vault.name}</span>
                <button
                  className="vault-menu-remove-btn"
                  title={t("sidebar.vault.remove")}
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
            <span>{t("sidebar.vault.manage")}</span>
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
              <span>{t("sidebar.vault.publishWebsite")}</span>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={removeConfirmOpen}
        title={t("sidebar.vault.removeConfirmTitle")}
        message={t("sidebar.vault.removeConfirmMessage", { name: vaults[removingVaultIndex]?.name || "" })}
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
  onOpenInNewPanel,
  canOpenInNewPanel,
  onPublish,
  onSelectVault,
  collapsed,
  refreshKey,
  graphRefreshKey,
  width,
  onWidthChange,
  onBookmark,
  outlineTrigger,
  side = "left",
  tabs,
  onOpenGlobalGraph,
  graphViewOpen = false,
}: SidebarProps) {
  bootStart("sidebar_component_render");
  bootStamp("sidebar_component_entered");
  const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
  const [isResizing, setIsResizing] = useState(false);
  // 本侧栏可渲染的 tab 列表（默认全部 4 个，顺序固定 files→search→outline→bookmarks）
  const visibleTabs = useMemo<SidebarTab[]>(
    () => tabs ?? ["files", "search", "outline", "bookmarks"],
    [tabs],
  );
  const [activeTab, setActiveTab] = useState<"files" | "search" | "outline" | "bookmarks">(
    visibleTabs[0] ?? "files",
  );
  const [searchQuery, setSearchQuery] = useState("");
  // 局部关系图谱放大弹窗
  const [localGraphExpanded, setLocalGraphExpanded] = useState(false);

  // ESC 关闭局部图谱弹窗
  useEffect(() => {
    if (!localGraphExpanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLocalGraphExpanded(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [localGraphExpanded]);
  // Trigger re-render on language change
  useTranslation();

  // ── 焦点管理：侧栏打开 / 切 Tab / 点击时，焦点自动落到当前 Tab 的可交互区域 ──
  const sidebarRef = useRef<HTMLDivElement>(null);
  const filesPanelRef = useRef<HTMLDivElement>(null);
  const outlinePanelRef = useRef<HTMLDivElement>(null);
  const bookmarksPanelRef = useRef<HTMLDivElement>(null);

  const focusTabContent = useCallback((tab: "files" | "search" | "outline" | "bookmarks", opts?: { reveal?: boolean }) => {
    switch (tab) {
      case "files": {
        filesPanelRef.current?.focus();
        // 鼠标点击路径（reveal: false）只做焦点管理，不滚动列表：
        // 否则 pending-active/active 落在滚动位置之外时，scrollIntoView 会把文件树拽回顶部
        if (opts?.reveal === false) break;
        // 兜底：若 FileTree 内部已有 pending-active 元素，滚到视野
        const el = filesPanelRef.current?.querySelector<HTMLElement>(
          ".tree-node.pending-active, .tree-node.active",
        );
        if (el) {
          window.requestAnimationFrame(() =>
            el.scrollIntoView({ block: "nearest", behavior: "auto" }),
          );
        }
        break;
      }
      case "search": {
        const input =
          sidebarRef.current?.querySelector<HTMLInputElement>(".sidebar-search-input");
        input?.focus();
        input?.select();
        break;
      }
      case "outline":
        outlinePanelRef.current?.focus();
        break;
      case "bookmarks":
        bookmarksPanelRef.current?.focus();
        break;
    }
  }, []);

  const handleSelectFile = useCallback(
    (path: string, line?: number, query?: string) => { onSelectFile(path, line, query); },
    [onSelectFile],
  );

  const switchTab = useCallback((tab: "files" | "search" | "outline" | "bookmarks") => {
    // 本侧栏不渲染该 tab 时忽略（避免 vim/快捷键切换把焦点设到不存在的面板）
    if (!visibleTabs.includes(tab)) return;
    setActiveTab(tab);
    if (tab !== "search") {
      setSearchQuery("");
    }
  }, [visibleTabs]);

  // tabs 变化后（如设置里把当前 activeTab 移到另一侧）：把 activeTab 重置为本侧第一个 tab
  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [visibleTabs, activeTab]);

  // 侧栏从折叠→展开、或 activeTab 切换时，把焦点自动移到当前 Tab 的主内容区
  useEffect(() => {
    if (collapsed) return;
    if (!visibleTabs.includes(activeTab)) return;
    // 延迟一帧，确保切 Tab 后的 DOM 已渲染（如搜索 input、FileTree 挂载完成）
    const id = window.requestAnimationFrame(() => {
      // 编辑器正持有焦点时不抢焦点：否则 vim 模式下 i / Ctrl+d/u 会失效
      // （焦点跑到侧栏面板后，编辑器收不到按键）。
      const active = document.activeElement;
      if (active) {
        const editorHost =
          document.querySelector(".ProseMirror") as HTMLElement | null
          ?? document.querySelector(".codemirror-editor") as HTMLElement | null;
        if (editorHost && editorHost.contains(active)) return;
      }
      focusTabContent(activeTab);
    });
    return () => window.cancelAnimationFrame(id);
  }, [collapsed, activeTab, focusTabContent, visibleTabs]);

  // Ctrl+Shift+F to toggle search tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setActiveTab((prev) => {
          const next = prev === "search" ? "files" : "search";
          // 本侧栏不渲染目标 tab 时不动（让另一侧栏接管，或保持现状）
          if (!visibleTabs.includes(next)) return prev;
          if (next !== "search") setSearchQuery("");
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visibleTabs]);

  // Vim Leader 菜单的全局搜索：监听 vim-sidebar-tab 事件切换侧栏 tab
  useEffect(() => {
    const handler = (e: Event) => {
      const { tab } = (e as CustomEvent).detail;
      if (tab === "search" || tab === "files" || tab === "outline" || tab === "bookmarks") {
        switchTab(tab);
      }
    };
    window.addEventListener("vim-sidebar-tab", handler);
    return () => window.removeEventListener("vim-sidebar-tab", handler);
  }, [switchTab]);

  // Ctrl+h 到最左边界 / focusPane 跨界 → 把焦点交给侧栏当前 tab 的主内容区
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: "files" | "search" | "outline" | "bookmarks"; side?: "left" | "right" }>).detail ?? {};
      // 只处理属于本侧栏的事件：未指定 side 时默认 left（兼容旧调用方）
      const targetSide = detail.side === "right" ? "right" : "left";
      if (targetSide !== side) return;
      if (collapsed) return;
      // 指定了不属于本侧栏的 tab：忽略（让拥有该 tab 的侧栏处理）
      if (detail.tab && !visibleTabs.includes(detail.tab)) return;
      focusTabContent(detail.tab ?? activeTab);
    };
    window.addEventListener("vim-sidebar-focus", handler);
    return () => window.removeEventListener("vim-sidebar-focus", handler);
  }, [collapsed, activeTab, focusTabContent, visibleTabs, side]);

  // 外部触发切换到大纲（如双击 .md 文件时按设置自动展开大纲）
  const prevOutlineTriggerRef = useRef<number | undefined>(outlineTrigger);
  useEffect(() => {
    if (outlineTrigger === undefined) return;
    if (prevOutlineTriggerRef.current === outlineTrigger) return;
    prevOutlineTriggerRef.current = outlineTrigger;
    switchTab("outline");
  }, [outlineTrigger, switchTab]);

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
      // 右侧栏往左拖（deltaX 负）应变宽，故方向取反；左侧栏保持 +deltaX
      const newWidth = startWidth + (side === "right" ? -deltaX : deltaX);
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
  }, [isResizing, onWidthChange, startX, startWidth, side]);

  bootStamp("sidebar_component_rendered");
  bootEnd("sidebar_component_render");
  return (
    <div
      ref={sidebarRef}
      tabIndex={-1}
      className={`sidebar${collapsed ? " collapsed" : ""}${isResizing ? " resizing" : ""}${side === "right" ? " sidebar-right" : ""}`}
      style={{ width: collapsed ? 0 : width }}
      onMouseDownCapture={(e) => {
        // 用户点击侧栏时：若点击的是「非可聚焦」元素，把焦点交给当前 Tab 的主内容容器。
        // 若用户点了 tab 按钮、搜索 input、tree-node 内 input（重命名态）等原生可聚焦元素，
        // 它们会在 mouseup 后自动拿到焦点，这里不动，避免抢占。
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const focusable = target.closest<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        if (focusable) return;
        // 当前焦点已经在侧栏内部则不重复触发
        const cur = document.activeElement as HTMLElement | null;
        if (cur && sidebarRef.current?.contains(cur)) return;
        // 鼠标点击不做 reveal：文件树停在用户滚动到的位置，避免被拽回顶部
        focusTabContent(activeTab, { reveal: false });
      }}
    >
      <div className="sidebar-topbar" data-tauri-drag-region="deep" />

      {visibleTabs.length > 1 && (
        <div className="sidebar-header">
          <div className="sidebar-tabs-wrapper">
            {visibleTabs.includes("files") && (
              <button
                className={`sidebar-tab${activeTab === "files" ? " active" : ""}`}
                onClick={() => switchTab("files")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            )}
            {visibleTabs.includes("search") && (
              <button
                className={`sidebar-tab${activeTab === "search" ? " active" : ""}`}
                onClick={() => switchTab("search")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </button>
            )}
            {visibleTabs.includes("outline") && (
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
            )}
            {visibleTabs.includes("bookmarks") && (
              <button
                className={`sidebar-tab${activeTab === "bookmarks" ? " active" : ""}`}
                onClick={() => switchTab("bookmarks")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {visibleTabs.length === 0 ? (
        <div className="sidebar-empty">
          <div className="sidebar-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </div>
          <div className="sidebar-empty-text">{i18n.t("sidebar.empty.noTabs")}</div>
        </div>
      ) : (
        <>
          {activeTab === "files" && (
            <div ref={filesPanelRef} tabIndex={-1} style={{ outline: "none", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {activeVault ? (
                <FileTree
                  key={activeVault.path}
                  rootPath={activeVault.path}
                  activePath={currentFilePath}
                  onSelect={handleSelectFile}
                  refreshKey={refreshKey}
                  onNewWindow={onNewWindow}
                  onOpenInNewPanel={onOpenInNewPanel}
                  canOpenInNewPanel={canOpenInNewPanel}
                  onBookmark={onBookmark}
                />
              ) : (
                <div className="sidebar-tree">
                  <div className="tree-empty">{i18n.t("sidebar.empty.noVault")}</div>
                  <div className="tree-empty-hint">{i18n.t("sidebar.empty.openVaultHint")}</div>
                </div>
              )}
            </div>
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
                  <div className="tree-empty">{i18n.t("sidebar.search.hint")}</div>
                </div>
              )}
            </>
          )}

          {activeTab === "outline" && (
            <div ref={outlinePanelRef} tabIndex={-1} style={{ outline: "none", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {activeVault && currentFilePath ? (
                <div className="sidebar-inspector">
                  <section className="inspector-section">
                    <div className="inspector-section-header">
                      <h3 className="inspector-section-title">Graph</h3>
                      <div className="inspector-section-actions">
                        <button
                          className={`inspector-icon-btn${localGraphExpanded ? " active" : ""}`}
                          title="Open local graph"
                          onClick={() => setLocalGraphExpanded((prev) => !prev)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="5" r="3" />
                            <circle cx="4" cy="19" r="3" />
                            <circle cx="20" cy="19" r="3" />
                            <line x1="9.5" y1="6.5" x2="5.5" y2="16.5" />
                            <line x1="14.5" y1="6.5" x2="18.5" y2="16.5" />
                            <line x1="7" y1="19" x2="17" y2="19" />
                          </svg>
                        </button>
                        <button
                          className={`inspector-icon-btn${graphViewOpen ? " active" : ""}`}
                          title="Open global graph"
                          onClick={() => onOpenGlobalGraph?.()}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 17 17 7" />
                            <path d="M7 7h10v10" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <Suspense fallback={<div className="local-graph-loading" />}>
                      <LocalGraphLazy
                        vaultPath={activeVault.path}
                        filePath={currentFilePath}
                        refreshTick={graphRefreshKey ?? 0}
                        onSelectFile={handleSelectFile}
                      />
                    </Suspense>
                  </section>
                  <section className="inspector-section">
                    <h3 className="inspector-section-title">On this page</h3>
                    <Outline content={content} onSelectHeading={onSelectHeading} />
                  </section>
                  <section className="inspector-section">
                    <h3 className="inspector-section-title">Linked references</h3>
                    <LinkedReferences
                      vaultPath={activeVault.path}
                      filePath={currentFilePath}
                      refreshTick={graphRefreshKey ?? 0}
                      onSelectFile={handleSelectFile}
                    />
                  </section>
                </div>
              ) : (
                <div className="sidebar-tree">
                  <div className="tree-empty">{i18n.t("sidebar.outline.untitled")}</div>
                  <div className="tree-empty-hint">{i18n.t("sidebar.outline.hint")}</div>
                </div>
              )}
            </div>
          )}

          {activeTab === "bookmarks" && (
            <div ref={bookmarksPanelRef} tabIndex={-1} style={{ outline: "none", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <BookmarksPanel
                vaultPath={activeVault?.path ?? null}
                vaults={vaults}
                onSelectFile={handleSelectFile}
                onNewWindow={onNewWindow}
              />
            </div>
          )}
        </>
      )}

      <VaultSwitcher
        vaults={vaults}
        activeIndex={activeVaultIndex}
        onRemove={onRemoveVault}
        onPublish={onPublish}
        onSelectVault={onSelectVault}
      />

      {!collapsed && (
        <div className="sidebar-resize-handle" onMouseDown={handleMouseDown} />
      )}

      {/* 局部关系图谱放大弹窗 */}
      {localGraphExpanded && activeVault && currentFilePath && (
        <div className="graph-modal-overlay" onClick={() => setLocalGraphExpanded(false)}>
          <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
            <div className="graph-modal-header">
              <span className="graph-modal-title">Local Graph</span>
              <button className="graph-modal-close" onClick={() => setLocalGraphExpanded(false)} title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="graph-modal-body">
              <Suspense fallback={<div className="local-graph-loading" />}>
                <LocalGraphLazy
                  vaultPath={activeVault.path}
                  filePath={currentFilePath}
                  refreshTick={graphRefreshKey ?? 0}
                  onSelectFile={(path) => {
                    handleSelectFile(path);
                    setLocalGraphExpanded(false);
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
