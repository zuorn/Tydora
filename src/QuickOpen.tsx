import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { readDir } from "@tauri-apps/plugin-fs";
import { VaultInfo } from "./Sidebar";

interface QuickOpenProps {
  vault: VaultInfo | null;
  recentFiles: string[];
  currentFilePath: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface FileItem {
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

export default function QuickOpen({ vault, recentFiles, currentFilePath, onSelect, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<FileItem[] | null>(null);
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 将最近访问文件路径转换为 FileItem 格式（使用 useMemo 避免每次渲染创建新数组），并排除当前打开的文件
  const recentFileItems = useMemo(() => recentFiles
    .filter((path) => path !== currentFilePath)
    .map((path) => ({
      name: getFileName(path),
      path,
      isDirectory: false,
    })), [recentFiles, currentFilePath]);

  // 初始化：显示最近访问文件
  useEffect(() => {
    if (!query.trim()) {
      setSearchMode(false);
      setFilteredFiles(recentFileItems);
      setSelectedIndex(0);
    }
  }, [query, recentFileItems]);

  // 当用户输入搜索词时，加载所有文件并切换到搜索模式
  useEffect(() => {
    if (!vault) return;

    // 没有输入搜索词时，不加载所有文件
    if (!query.trim()) return;

    // 有搜索词时，切换到搜索模式
    setSearchMode(true);

    // 如果还没有加载所有文件，先加载
    if (allFiles === null && !loading) {
      setLoading(true);
      getAllFiles(vault.path).then((files) => {
        files.sort((a, b) => a.name.localeCompare(b.name));
        setAllFiles(files);
        setLoading(false);
      });
    }
  }, [query, vault, allFiles, loading]);

  // 搜索过滤
  useEffect(() => {
    if (!searchMode || allFiles === null) return;

    const q = query.trim();
    if (!q) {
      setFilteredFiles(recentFileItems);
      setSelectedIndex(0);
      return;
    }

    const matched = allFiles
      .map((f) => ({ file: f, score: matchScore(f, q) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name))
      .map(({ file }) => file)
      .slice(0, 50);

    setFilteredFiles(matched);
    setSelectedIndex(0);
  }, [searchMode, allFiles, query, recentFileItems]);

  // 滚动选中项到可见区域
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll(".quick-open-item");
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, filteredFiles]);

  // 键盘事件处理
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+J 向下选择（Vim 风格）
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
        return;
      }
      // Ctrl+K 向上选择（Vim 风格）
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            onSelect(filteredFiles[selectedIndex].path);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredFiles, selectedIndex, onSelect, onClose],
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
          <span className="quick-open-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="quick-open-input"
            placeholder="输入文件名搜索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="quick-open-results" ref={listRef}>
          {loading && searchMode && (
            <div className="quick-open-empty">搜索中...</div>
          )}

          {!loading && !searchMode && filteredFiles.length === 0 && (
            <div className="quick-open-empty">
              <div className="quick-open-empty-title">最近访问的文件</div>
              <div className="quick-open-empty-hint">输入文件名搜索，或打开文件后会显示在这里</div>
            </div>
          )}

          {!loading && searchMode && filteredFiles.length === 0 && (
            <div className="quick-open-empty">未找到匹配的文件</div>
          )}

          {!loading && filteredFiles.length > 0 && (
            <>
              {!searchMode && (
                <div className="quick-open-section-label">最近访问</div>
              )}
              {filteredFiles.map((file, idx) => (
                <div
                  key={file.path}
                  className={`quick-open-item${idx === selectedIndex ? " selected" : ""}`}
                  onClick={() => onSelect(file.path)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="quick-open-item-icon">📄</span>
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
        </div>

        <div className="quick-open-footer">
          <span className="quick-open-hint">
            <kbd>↑</kbd> <kbd>↓</kbd> 或 <kbd>Ctrl+J</kbd> <kbd>Ctrl+K</kbd> 选择 &nbsp;
            <kbd>Enter</kbd> 打开 &nbsp;
            <kbd>Esc</kbd> 关闭
          </span>
          <span className="quick-open-count">
            {searchMode ? `${filteredFiles.length} 个结果` : `${filteredFiles.length} 个最近文件`}
          </span>
        </div>
      </div>
    </div>
  );
}