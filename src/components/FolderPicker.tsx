import { useState, useEffect, useRef, useCallback } from "react";
import { readDir } from "@tauri-apps/plugin-fs";

interface FolderPickerProps {
  isOpen: boolean;
  vaultPath: string;
  onSelect: (folderPath: string) => void;
  onCancel: () => void;
}

interface FolderItem {
  name: string;
  path: string;
  relativePath: string;
}

function pathSep(): string {
  return navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
}

function joinPath(parent: string, child: string): string {
  const sep = pathSep();
  const clean = parent.endsWith("/") || parent.endsWith("\\") ? parent.slice(0, -1) : parent;
  return `${clean}${sep}${child}`;
}

async function getAllFolders(dirPath: string, basePath: string): Promise<FolderItem[]> {
  const folders: FolderItem[] = [];
  
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readDir(dir);
    } catch {
      return;
    }
    
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (!entry.isDirectory) continue;
      
      const fullPath = joinPath(dir, entry.name);
      const relativePath = fullPath.slice(basePath.length).replace(/^[\\/]/, "") || "/";
      
      folders.push({
        name: entry.name,
        path: fullPath,
        relativePath,
      });
      
      await walk(fullPath);
    }
  }
  
  await walk(dirPath);
  return folders;
}

export function FolderPicker({
  isOpen,
  vaultPath,
  onSelect,
  onCancel,
}: FolderPickerProps) {
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 加载所有文件夹
  useEffect(() => {
    if (!isOpen) return;
    
    setLoading(true);
    setQuery("");
    setSelectedIndex(0);
    
    getAllFolders(vaultPath, vaultPath).then((items) => {
      // 添加根目录作为第一项
      setFolders([
        { name: "/", path: vaultPath, relativePath: "/" },
        ...items,
      ]);
      setLoading(false);
    });
  }, [isOpen, vaultPath]);

  // 聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // 过滤文件夹
  const filteredFolders = folders.filter((folder) => {
    if (!query.trim()) return true;
    const lowerQuery = query.toLowerCase();
    return (
      folder.name.toLowerCase().includes(lowerQuery) ||
      folder.relativePath.toLowerCase().includes(lowerQuery)
    );
  });

  // 滚动选中项到可见区域
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll(".folder-picker-item");
    const selected = items[selectedIndex];
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filteredFolders]);

  // 键盘事件处理
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
        case "j":
          if (e.ctrlKey || e.metaKey || e.key === "j") {
            e.preventDefault();
            setSelectedIndex((i) => Math.min(i + 1, filteredFolders.length - 1));
          }
          break;
        case "ArrowUp":
        case "k":
          if (e.ctrlKey || e.metaKey || e.key === "k") {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
          }
          break;
        case "Enter":
          e.preventDefault();
          if (filteredFolders[selectedIndex]) {
            onSelect(filteredFolders[selectedIndex].path);
          }
          break;
        case "Escape":
          e.preventDefault();
          onCancel();
          break;
      }
    },
    [filteredFolders, selectedIndex, onSelect, onCancel]
  );

  if (!isOpen) return null;

  return (
    <div className="folder-picker-overlay" onClick={onCancel}>
      <div
        className="folder-picker-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="folder-picker-header">
          <span className="folder-picker-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            className="folder-picker-input"
            placeholder="输入文件夹名称..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        <div className="folder-picker-list" ref={listRef}>
          {loading && (
            <div className="folder-picker-loading">加载中...</div>
          )}
          {!loading && filteredFolders.length === 0 && (
            <div className="folder-picker-empty">未找到匹配的文件夹</div>
          )}
          {!loading && filteredFolders.map((folder, index) => (
            <div
              key={folder.path}
              className={`folder-picker-item${index === selectedIndex ? " selected" : ""}`}
              onClick={() => onSelect(folder.path)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="folder-picker-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="folder-picker-item-name">{folder.relativePath}</span>
            </div>
          ))}
        </div>

        <div className="folder-picker-footer">
          <span className="folder-picker-hint">
            <kbd>↑</kbd> <kbd>↓</kbd> 或 <kbd>Ctrl+J</kbd> <kbd>Ctrl+K</kbd> 导航 &nbsp;
            <kbd>Enter</kbd> 移动 &nbsp;
            <kbd>Esc</kbd> 退出
          </span>
        </div>
      </div>
    </div>
  );
}
