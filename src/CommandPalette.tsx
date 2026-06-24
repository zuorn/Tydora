import { useState, useEffect, useRef, useCallback, useMemo } from "react";

interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
  aliases?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

const RECENT_COMMANDS_KEY = "zmd-recent-commands";
const MAX_RECENT_COMMANDS = 5;

// 从 localStorage 加载最近使用的命令
function loadRecentCommands(): string[] {
  try {
    const saved = localStorage.getItem(RECENT_COMMANDS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

// 保存最近使用的命令到 localStorage
function saveRecentCommands(ids: string[]) {
  localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(ids));
}

// 添加命令到最近使用列表
function addToRecent(id: string): string[] {
  const recent = loadRecentCommands();
  const filtered = recent.filter((rid) => rid !== id);
  return [id, ...filtered].slice(0, MAX_RECENT_COMMANDS);
}

// 模糊匹配评分
function fuzzyScore(text: string, query: string): number {
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lower === lowerQuery) return 100;
  if (lower.startsWith(lowerQuery)) return 80;
  if (lower.includes(lowerQuery)) return 60;

  let queryIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let i = 0; i < lower.length && queryIdx < lowerQuery.length; i++) {
    if (lower[i] === lowerQuery[queryIdx]) {
      score += 10;
      if (lastMatchIdx === i - 1) score += 5;
      lastMatchIdx = i;
      queryIdx++;
    }
  }

  return queryIdx === lowerQuery.length ? score : 0;
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
      <span className="command-palette-highlight">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentCommands());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 最近使用的命令
  const recentCommands = useMemo(() => {
    return recentIds
      .map((id) => commands.find((cmd) => cmd.id === id))
      .filter((cmd): cmd is Command => cmd !== undefined);
  }, [recentIds, commands]);

  // 过滤后的命令（搜索时）
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return [];
    return commands
      .map((cmd) => {
        let score = fuzzyScore(cmd.label, query);
        if (score === 0 && cmd.aliases) {
          for (const alias of cmd.aliases) {
            const aliasScore = fuzzyScore(alias, query);
            if (aliasScore > score) score = aliasScore;
          }
        }
        return { command: cmd, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ command }) => command)
      .slice(0, 30);
  }, [query, commands]);

  // 所有命令按分类分组（非搜索时）
  const allGroupedCommands = useMemo(() => {
    if (query.trim()) return {};
    const groups: Record<string, Command[]> = {};
    commands.forEach((cmd) => {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [query, commands]);

  // 搜索结果按分类分组
  const searchGroupedCommands = useMemo(() => {
    if (!query.trim()) return {};
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [query, filteredCommands]);

  const isSearchMode = query.trim().length > 0;

  // 执行命令并记录到最近使用
  const executeCommand = useCallback((cmd: Command) => {
    cmd.action();
    const newRecent = addToRecent(cmd.id);
    setRecentIds(newRecent);
    saveRecentCommands(newRecent);
    onClose();
  }, [onClose]);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // 聚焦输入框
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // 滚动选中项到可见区域
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll(".command-palette-item");
    const selected = items[selectedIndex];
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filteredCommands, recentCommands, allGroupedCommands]);

  // 键盘事件处理
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, commands.length - 1));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, commands.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (isSearchMode) {
            if (filteredCommands[selectedIndex]) {
              executeCommand(filteredCommands[selectedIndex]);
            }
          } else {
            // 非搜索模式：先检查最近使用，再检查所有命令
            if (selectedIndex < recentCommands.length) {
              executeCommand(recentCommands[selectedIndex]);
            } else {
              const allCmds = Object.values(allGroupedCommands).flat();
              const allIdx = selectedIndex - recentCommands.length;
              if (allCmds[allIdx]) {
                executeCommand(allCmds[allIdx]);
              }
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedIndex((i) => Math.max(i - 1, 0));
          } else {
            setSelectedIndex((i) => Math.min(i + 1, commands.length - 1));
          }
          break;
      }
    },
    [filteredCommands, selectedIndex, onClose, executeCommand, isSearchMode, recentCommands, allGroupedCommands, commands.length]
  );

  if (!isOpen) return null;

  let itemIndex = 0;

  // 渲染命令项
  const renderCommand = (cmd: Command, query: string = "") => {
    const currentIndex = itemIndex++;
    return (
      <div
        key={cmd.id}
        className={`command-palette-item${currentIndex === selectedIndex ? " selected" : ""}`}
        onClick={() => executeCommand(cmd)}
        onMouseEnter={() => setSelectedIndex(currentIndex)}
      >
        <span className="command-palette-item-label">
          {query ? highlightMatch(cmd.label, query) : cmd.label}
        </span>
        {cmd.shortcut && (
          <span className="command-palette-item-shortcut">
            {cmd.shortcut.split("+").map((key, i) => (
              <kbd key={i} className="command-palette-kbd">{key}</kbd>
            ))}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div
        className="command-palette-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="command-palette-header">
          <span className="command-palette-icon">⚡</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="输入命令搜索..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        <div className="command-palette-results" ref={listRef}>
          {/* 搜索模式 */}
          {isSearchMode && (
            <>
              {filteredCommands.length === 0 && (
                <div className="command-palette-empty">未找到匹配的命令</div>
              )}
              {Object.entries(searchGroupedCommands).map(([category, cmds]) => (
                <div key={category} className="command-palette-group">
                  <div className="command-palette-group-title">{category}</div>
                  {cmds.map((cmd) => renderCommand(cmd, query))}
                </div>
              ))}
            </>
          )}

          {/* 非搜索模式：最近使用 + 所有命令 */}
          {!isSearchMode && (
            <>
              {/* 最近使用的命令 */}
              {recentCommands.length > 0 && (
                <div className="command-palette-group">
                  <div className="command-palette-group-title">最近使用</div>
                  {recentCommands.map((cmd) => renderCommand(cmd))}
                </div>
              )}

              {/* 所有命令按分类 */}
              {Object.entries(allGroupedCommands).map(([category, cmds]) => (
                <div key={category} className="command-palette-group">
                  <div className="command-palette-group-title">{category}</div>
                  {cmds.map((cmd) => renderCommand(cmd))}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="command-palette-footer">
          <span className="command-palette-hint">
            <kbd>↑</kbd> <kbd>↓</kbd> 或 <kbd>Ctrl+J</kbd> <kbd>Ctrl+K</kbd> 选择 &nbsp;
            <kbd>Enter</kbd> 执行 &nbsp;
            <kbd>Esc</kbd> 关闭
          </span>
          <span className="command-palette-count">
            {isSearchMode ? `${filteredCommands.length} 个结果` : `${commands.length} 个命令`}
          </span>
        </div>
      </div>
    </div>
  );
}
