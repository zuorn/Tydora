import { useState, useEffect, useCallback, useRef } from "react";
import type { EditorHandle } from "../Editor/types";
import { useDebounce } from "../hooks/useDebounce";
import "./FindReplaceDialog.css";

interface FindReplaceDialogProps {
  editorHandle: EditorHandle | null;
  mode: "find" | "replace";
  onClose: () => void;
}

const DEBOUNCE_DELAY = 180; // ms — 防抖延迟，用户停止输入 180ms 后才执行搜索

export default function FindReplaceDialog({ editorHandle, mode: initialMode, onClose }: FindReplaceDialogProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, DEBOUNCE_DELAY);
  const [replaceText, setReplaceText] = useState("");
  const [matches, setMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showReplace, setShowReplace] = useState(initialMode === "replace");
  const findInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus find input on mount / mode change
  useEffect(() => {
    // 延迟聚焦，确保编辑器的 selectMatch 调用不会抢走焦点
    const timer = setTimeout(() => {
      findInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [initialMode]);

  // Perform search when query changes
  const doSearch = useCallback((q: string) => {
    if (!editorHandle || !q) {
      setMatches([]);
      setCurrentIndex(-1);
      editorHandle?.clearHighlight();
      return;
    }
    const results = editorHandle.findMatches(q);
    setMatches(results);
    if (results.length > 0) {
      setCurrentIndex(0);
      editorHandle.selectMatch(results[0].from, results[0].to);
      editorHandle.highlightSearch(q);
    } else {
      setCurrentIndex(-1);
      editorHandle.clearHighlight();
    }
  }, [editorHandle]);

  // Perform search when debounced query changes — 防抖避免每次按键都扫描全文
  useEffect(() => {
    // 空查询立即清空高亮（无延迟，保证即时响应）
    if (!debouncedQuery) {
      editorHandle?.clearHighlight();
      setMatches([]);
      setCurrentIndex(-1);
      return;
    }
    doSearch(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Navigate to next match
  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    const next = (currentIndex + 1) % matches.length;
    setCurrentIndex(next);
    editorHandle?.selectAndScroll(matches[next].from, matches[next].to);
  }, [matches, currentIndex, editorHandle]);

  // Navigate to previous match
  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prev);
    editorHandle?.selectAndScroll(matches[prev].from, matches[prev].to);
  }, [matches, currentIndex, editorHandle]);

  // Replace current match
  const replaceCurrent = useCallback(() => {
    if (!editorHandle || matches.length === 0 || currentIndex < 0 || currentIndex >= matches.length) return;
    const match = matches[currentIndex];
    editorHandle.replaceAt(match.from, match.to, replaceText);
    // Refresh matches after replace
    const newResults = editorHandle.findMatches(query);
    setMatches(newResults);
    if (newResults.length > 0) {
      const newIdx = Math.min(currentIndex, newResults.length - 1);
      setCurrentIndex(newIdx);
      editorHandle.selectAndScroll(newResults[newIdx].from, newResults[newIdx].to);
    } else {
      setCurrentIndex(-1);
      editorHandle.clearHighlight();
    }
  }, [editorHandle, matches, currentIndex, replaceText, query]);

  // Replace all matches
  const replaceAll = useCallback(() => {
    if (!editorHandle || matches.length === 0) return;
    // Replace from last to first to preserve positions
    for (let i = matches.length - 1; i >= 0; i--) {
      editorHandle.replaceAt(matches[i].from, matches[i].to, replaceText);
    }
    setMatches([]);
    setCurrentIndex(-1);
    editorHandle.clearHighlight();
  }, [editorHandle, matches, replaceText]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const target = e.target as HTMLElement;
        if (showReplace && target?.closest('.find-replace-row:last-child')) {
          replaceCurrent();
        } else {
          goToNext();
        }
      } else if (e.key === "Escape") {
        editorHandle?.clearHighlight();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showReplace, replaceCurrent, goToNext, onClose, editorHandle]);

  return (
    <div className="find-replace-dialog">
      <div className="find-replace-row">
        <button
          className={`find-replace-expand-btn${showReplace ? ' expanded' : ''}`}
          onClick={() => setShowReplace(v => !v)}
          title={showReplace ? "收起替换" : "展开替换"}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M6.03 3.72a.75.75 0 0 1 1.06 0l4.97 4.97a.75.75 0 0 1 0 1.06l-4.97 4.97a.75.75 0 1 1-1.06-1.06L10.47 8.5 6.03 4.78a.75.75 0 0 1 0-1.06Z"/>
          </svg>
        </button>
        <div className="find-replace-input-group">
          <svg className="find-replace-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
          </svg>
          <input
            ref={findInputRef}
            className="find-replace-input"
            type="text"
            placeholder="查找..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <span className="find-replace-count">
              {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : "0/0"}
            </span>
          )}
        </div>
        <button
          className="find-replace-nav-btn"
          onClick={goToPrev}
          disabled={matches.length === 0}
          title="上一个匹配"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M3.47 7.78a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 1.06L5.06 7.25h7.69a.75.75 0 0 1 0 1.5H5.06l2.72 2.72a.75.75 0 1 1-1.06 1.06L3.47 8.28Z"/>
          </svg>
        </button>
        <button
          className="find-replace-nav-btn"
          onClick={goToNext}
          disabled={matches.length === 0}
          title="下一个匹配"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M12.53 8.22a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L10.94 8.75H3.25a.75.75 0 0 1 0-1.5h7.69L8.22 4.53a.75.75 0 1 1 1.06-1.06l3.25 3.25Z"/>
          </svg>
        </button>
        <button
          className="find-replace-close-btn"
          onClick={() => {
            editorHandle?.clearHighlight();
            onClose();
          }}
          title="关闭"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
          </svg>
        </button>
      </div>

      {showReplace && (
        <div className="find-replace-row">
          <div className="find-replace-expand-spacer" />
          <div className="find-replace-input-group">
            <svg className="find-replace-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 20V4"/>
              <polyline points="4 8 8 4 12 8"/>
              <path d="M16 4v16"/>
              <polyline points="12 16 16 20 20 16"/>
            </svg>
            <input
              className="find-replace-input"
              type="text"
              placeholder="替换为..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
            />
          </div>
          <button
            className="find-replace-action-btn"
            onClick={replaceCurrent}
            disabled={matches.length === 0}
          >
            替换
          </button>
          <button
            className="find-replace-action-btn find-replace-all-btn"
            onClick={replaceAll}
            disabled={matches.length === 0}
          >
            全部替换
          </button>
        </div>
      )}
    </div>
  );
}
