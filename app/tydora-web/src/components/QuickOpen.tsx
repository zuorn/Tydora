import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { readDir } from "@tauri-apps/plugin-fs";
import { VaultInfo } from "../Sidebar";
import { useDebounce } from "../hooks/useDebounce";

interface QuickOpenProps {
  vault: VaultInfo | null;
  vaults: VaultInfo[];  // 所有已打开的知识库
  recentFiles: string[];
  currentFilePath: string | null;
  files?: FileItem[];  // Optional: external file list
  onSelect: (path: string) => void;                       // 打开文件（当前窗口）
  onSelectFileInNewWindow?: (path: string) => void;       // 打开文件（新窗口）
  onSelectFileInSplitPane?: (path: string, dir: "lr" | "tb") => void;  // 在聚焦编辑器分屏（右侧/下方）打开
  onSelectVault: (vaultPath: string) => void;             // 打开知识库（新窗口）
  onSelectVaultCurrent?: (vaultPath: string) => void;     // 打开知识库（当前窗口）
  onClose: () => void;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

// 递归获取仓库中所有文件
async function getAllFiles(dirPath: string): Promise<FileItem[]> {
  const files: FileItem[] = [];

  async function walk(dir: string) {
    try {
      const entries = await readDir(dir);
      for (const entry of entries) {
        if (entry.name?.startsWith(".")) continue;
        const sep = navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
        const fullPath = dir.endsWith(sep) ? dir + entry.name : dir + sep + entry.name;
        if (entry.isDirectory) {
          await walk(fullPath);
        } else if (entry.isFile) {
          files.push({
            name: entry.name || "",
            path: fullPath,
            isDirectory: false,
          });
        }
      }
    } catch {
      // 忽略访问错误
    }
  }

  await walk(dirPath);
  return files;
}

// 文件名匹配度评分（用于排序）
function matchScore(file: FileItem, query: string): number {
  const name = file.name.toLowerCase();
  const q = query.toLowerCase();
  const nameWithoutExt = name.replace(/\.[^.]+$/, "");

  // 精确匹配文件名（不含扩展名）
  if (nameWithoutExt === q) return 100;
  // 文件名开头匹配
  if (nameWithoutExt.startsWith(q)) return 80;
  // 文件名包含查询词
  if (name.includes(q)) return 60;
  // 路径中包含
  if (file.path.toLowerCase().includes(q)) return 40;
  return 0;
}

// 高亮匹配文字
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lower.indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="quick-open-highlight">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// 从路径获取文件名
function getFileName(path: string): string {
  const sep = navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
  return path.split(sep).pop() || path;
}

const QUICKOPEN_DEBOUNCE = 120; // ms — 快速打开防抖延迟，比查找对话框更短以保持响应感

type QuickOpenMode = "file" | "vault";

export default function QuickOpen({
  vault,
  vaults,
  recentFiles,
  currentFilePath,
  files: externalFiles,
  onSelect,
  onSelectFileInNewWindow = () => {},
  onSelectFileInSplitPane = () => {},
  onSelectVault,
  onSelectVaultCurrent = () => {},
  onClose,
}: QuickOpenProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query.trim(), QUICKOPEN_DEBOUNCE);
  // 搜索模式：file = 搜索文件；vault = 搜索知识库
  const [mode, setMode] = useState<QuickOpenMode>("file");
  const [allFiles, setAllFiles] = useState<FileItem[] | null>(null);
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isKeyboardNavRef = useRef(false);
  const keyboardNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 标记键盘导航激活，短暂忽略鼠标 hover
  const markKeyboardNav = useCallback(() => {
    isKeyboardNavRef.current = true;
    if (keyboardNavTimerRef.current) clearTimeout(keyboardNavTimerRef.current);
    keyboardNavTimerRef.current = setTimeout(() => {
      isKeyboardNavRef.current = false;
    }, 200);
  }, []);

  // 鼠标 hover 设置选中项（仅在非键盘导航时生效）
  const handleItemMouseEnter = useCallback((idx: number) => {
    if (isKeyboardNavRef.current) return;
    setSelectedIndex(idx);
  }, []);

  // 将最近访问文件路径转换为 FileItem 格式（使用 useMemo 避免每次渲染创建新数组），并排除当前打开的文件
  const recentFileItems = useMemo(() => recentFiles
    .filter((path) => path !== currentFilePath)
    .map((path) => ({
      name: getFileName(path),
      path,
      isDirectory: false,
    })), [recentFiles, currentFilePath]);

  // 如果提供了外部文件列表，直接使用
  const useExternalFiles = externalFiles && externalFiles.length > 0;

  // 是否处于“输入了搜索词”的状态（用于文件搜索分支）
  const searchMode = useExternalFiles || query.trim().length > 0;

  // 知识库搜索结果：无搜索词时列出全部知识库，否则按名称过滤
  const vaultResults = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    const list = !q
      ? vaults
      : vaults.filter((v) => v.name.toLowerCase().includes(q));
    return list.map((v) => ({ name: v.name, path: v.path }));
  }, [debouncedQuery, vaults]);

  // 文件模式下的列表：无搜索词显示最近访问，有搜索词显示匹配文件
  const fileItems = searchMode ? filteredFiles : recentFileItems;

  // 当前模式对应的列表与总项数
  const currentItems = mode === "file" ? fileItems : vaultResults;
  const totalItems = currentItems.length;

  // 加载全部文件（仅在文件模式且有搜索词时）
  useEffect(() => {
    if (useExternalFiles) return;
    if (!vault) return;
    if (mode !== "file") return;
    if (!query.trim()) return;

    if (allFiles === null && !loading) {
      setLoading(true);
      getAllFiles(vault.path).then((files) => {
        files.sort((a, b) => a.name.localeCompare(b.name));
        setAllFiles(files);
        setLoading(false);
      });
    }
  }, [query, vault, allFiles, loading, useExternalFiles, mode]);

  // 文件搜索过滤 — 使用防抖查询避免每次按键都过滤全量文件
  useEffect(() => {
    const q = debouncedQuery;
    const sourceFiles = useExternalFiles && externalFiles ? externalFiles : allFiles;

    if (!q) {
      setFilteredFiles(useExternalFiles && externalFiles ? externalFiles.slice(0, 50) : recentFileItems);
      return;
    }

    if (!sourceFiles) return;

    const matched = sourceFiles
      .map((f) => ({ file: f, score: matchScore(f, q) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name))
      .map(({ file }) => file)
      .slice(0, 50);

    setFilteredFiles(matched);
  }, [searchMode, allFiles, debouncedQuery, recentFileItems, externalFiles, useExternalFiles]);

  // 查询词或模式变化时，重置选中项到顶部
  useEffect(() => {
    setSelectedIndex(0);
  }, [mode, debouncedQuery]);

  // 滚动选中项到可见区域
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll(".quick-open-item");
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, currentItems]);

  // 键盘事件处理
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Tab 切换 搜索文件 / 搜索知识库
      if (e.key === "Tab") {
        e.preventDefault();
        setMode((m) => (m === "file" ? "vault" : "file"));
        setSelectedIndex(0);
        return;
      }

      // Ctrl+J 向下选择（Vim 风格）
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        markKeyboardNav();
        setSelectedIndex((i) => Math.min(i + 1, totalItems - 1));
        return;
      }
      // Ctrl+K 向上选择（Vim 风格）
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        markKeyboardNav();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      // Ctrl+\ 在聚焦编辑器右侧分屏打开选中文件
      if ((e.ctrlKey || e.metaKey) && (e.key === "\\" || e.key === "|")) {
        e.preventDefault();
        e.stopPropagation();
        (e.nativeEvent as KeyboardEvent)?.stopImmediatePropagation?.();
        const item = currentItems[selectedIndex];
        if (item && mode === "file") onSelectFileInSplitPane(item.path, "lr");
        return;
      }
      // Ctrl+- 在聚焦编辑器下方分屏打开选中文件
      if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        e.stopPropagation();
        (e.nativeEvent as KeyboardEvent)?.stopImmediatePropagation?.();
        const item = currentItems[selectedIndex];
        if (item && mode === "file") onSelectFileInSplitPane(item.path, "tb");
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          markKeyboardNav();
          setSelectedIndex((i) => Math.min(i + 1, totalItems - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          markKeyboardNav();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const item = currentItems[selectedIndex];
          if (!item) break;
          if (mode === "file") {
            // 文件：Enter 当前窗口，Ctrl/Cmd+Enter 新窗口
            if (e.ctrlKey || e.metaKey) onSelectFileInNewWindow(item.path);
            else onSelect(item.path);
          } else {
            // 知识库：Enter 当前窗口，Ctrl/Cmd+Enter 新窗口
            if (e.ctrlKey || e.metaKey) onSelectVault(item.path);
            else onSelectVaultCurrent(item.path);
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [mode, currentItems, totalItems, selectedIndex, onSelect, onSelectFileInNewWindow, onSelectFileInSplitPane, onSelectVault, onSelectVaultCurrent, onClose],
  );

  // 聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 复制路径用于显示
  const getDisplayPath = (path: string): string => {
    if (!vault) return path;
    const sep = navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
    const vaultPathWithSep = vault.path.endsWith(sep) ? vault.path : vault.path + sep;
    return path.replace(vaultPathWithSep, "");
  };

  return (
    <div className="quick-open-overlay" onClick={onClose}>
      <div
        className="quick-open-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="quick-open-header">
          <span className="quick-open-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input
            ref={inputRef}
            type="text"
            className="quick-open-input"
            placeholder={t("quickOpen.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* 搜索文件 / 搜索知识库 切换标签，按 Tab 切换 */}
        <div className="quick-open-tabs">
          <button
            type="button"
            className={`quick-open-tab${mode === "file" ? " active" : ""}`}
            onClick={() => { setMode("file"); setSelectedIndex(0); }}
          >
            {t("quickOpen.tabFiles")}
          </button>
          <button
            type="button"
            className={`quick-open-tab${mode === "vault" ? " active" : ""}`}
            onClick={() => { setMode("vault"); setSelectedIndex(0); }}
          >
            {t("quickOpen.tabVault")}
          </button>
        </div>

        <div className="quick-open-results" ref={listRef}>
          {loading && searchMode && mode === "file" && (
            <div className="quick-open-empty">{t("quickOpen.searching")}</div>
          )}

          {/* 文件模式 */}
          {!loading && mode === "file" && fileItems.length === 0 && (
            <div className="quick-open-empty">
              <div className="quick-open-empty-title">{searchMode ? t("quickOpen.noMatch") : t("quickOpen.recentFiles")}</div>
              {!searchMode && <div className="quick-open-empty-hint">{t("quickOpen.searchHint")}</div>}
            </div>
          )}

          {!loading && mode === "file" && fileItems.length > 0 && (
            <>
              {!searchMode && (
                <div className="quick-open-section-label">{t("quickOpen.recentAccess")}</div>
              )}
              {fileItems.map((file, idx) => (
                <div
                  key={file.path}
                  className={`quick-open-item${idx === selectedIndex ? " selected" : ""}`}
                  onClick={() => {
                    onSelect(file.path);
                    inputRef.current?.focus();
                  }}
                  onMouseEnter={() => handleItemMouseEnter(idx)}
                >
                  <span className="quick-open-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                  <span className="quick-open-item-name">
                    {highlightMatch(file.name, searchMode ? query : "")}
                  </span>
                  <span className="quick-open-item-path">
                    {highlightMatch(getDisplayPath(file.path), searchMode ? query : "")}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* 知识库模式 */}
          {!loading && mode === "vault" && vaultResults.length === 0 && (
            <div className="quick-open-empty">{t("quickOpen.noMatch")}</div>
          )}

          {!loading && mode === "vault" && vaultResults.length > 0 && (
            <>
              <div className="quick-open-section-label">{t("quickOpen.vault")}</div>
              {vaultResults.map((v, idx) => (
                <div
                  key={`vault-${v.path}`}
                  className={`quick-open-item${idx === selectedIndex ? " selected" : ""}`}
                  onClick={() => {
                    onSelectVaultCurrent(v.path);
                    inputRef.current?.focus();
                  }}
                  onMouseEnter={() => handleItemMouseEnter(idx)}
                >
                  <span className="quick-open-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
                  <span className="quick-open-item-name">
                    {highlightMatch(v.name, query)}
                  </span>
                  <span className="quick-open-item-path">
                    {highlightMatch(v.path, query)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="quick-open-footer">
          <span className="quick-open-hint">
            <kbd>Tab</kbd> {t("quickOpen.switchTab")}&nbsp;
            <kbd>↑</kbd> <kbd>↓</kbd> or <kbd>Ctrl+J</kbd> <kbd>Ctrl+K</kbd> {t("quickOpen.select")}&nbsp;
            <kbd>Enter</kbd> {t("quickOpen.open")}&nbsp;
            <kbd>Ctrl+Enter</kbd> {t("quickOpen.openNewWindow")}&nbsp;
            <kbd>Ctrl+\</kbd> {t("quickOpen.splitRight")}&nbsp;
            <kbd>Ctrl+-</kbd> {t("quickOpen.splitDown")}&nbsp;
            <kbd>Esc</kbd> {t("quickOpen.close")}
          </span>
          <span className="quick-open-count">
            {t("quickOpen.results", { count: totalItems })}
          </span>
        </div>
      </div>
    </div>
  );
}
