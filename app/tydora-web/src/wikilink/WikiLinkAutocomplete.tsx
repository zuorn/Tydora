// src/WikiLinkAutocomplete.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LinkIndexService } from "./LinkIndexService";
import "./WikiLinkAutocomplete.css";

interface WikiLinkAutocompleteProps {
  query: string;
  position: { x: number; y: number } | null;
  onSelect: (noteName: string) => void;
  onClose: () => void;
}

const MAX_HEIGHT = 200;
const ITEM_HEIGHT = 32;
const VIEWPORT_PADDING = 8;

export function WikiLinkAutocomplete({ query, position, onSelect, onClose }: WikiLinkAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<{ name: string; path: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const results = LinkIndexService.searchNotes(query);
    setSuggestions(results);
    setSelectedIndex(0);
  }, [query]);

  // 滚动选中项到可见区域
  const scrollToIndex = useCallback((index: number) => {
    const item = itemsRef.current[index];
    if (item && listRef.current) {
      const container = listRef.current;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      const scrollTop = container.scrollTop;
      const scrollBottom = scrollTop + container.clientHeight;

      if (itemTop < scrollTop) {
        container.scrollTop = itemTop;
      } else if (itemBottom > scrollBottom) {
        container.scrollTop = itemBottom - container.clientHeight;
      }
    }
  }, []);

  // selectedIndex 变化时滚动
  useEffect(() => {
    scrollToIndex(selectedIndex);
  }, [selectedIndex, scrollToIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isNext = (e.key === 'ArrowDown') || (e.ctrlKey && e.key.toLowerCase() === 'j');
      const isPrev = (e.key === 'ArrowUp') || (e.ctrlKey && e.key.toLowerCase() === 'k');

      if (isNext) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
      } else if (isPrev) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (suggestions.length > 0 && suggestions[selectedIndex]) {
          onSelect(suggestions[selectedIndex].name);
        } else if (query.trim()) {
          onSelect(query.trim());
        }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    // 捕获阶段拦截，在编辑器内部处理器之前阻止 Enter/Arrow 等按键
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [suggestions, selectedIndex, onSelect, onClose, query]);

  // 计算菜单位置，确保不溢出窗口
  const adjustedPosition = useMemo(() => {
    if (!position) return null;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const menuHeight = Math.min(suggestions.length * ITEM_HEIGHT + 16, MAX_HEIGHT);

    let top = position.y;
    let left = position.x;

    // 垂直方向：如果下方空间不够，改为向上显示
    if (top + menuHeight > viewportHeight - VIEWPORT_PADDING) {
      top = position.y - menuHeight - ITEM_HEIGHT;
    }

    // 水平方向：如果右侧空间不够，向左偏移
    if (left + 250 > viewportWidth - VIEWPORT_PADDING) {
      left = Math.max(VIEWPORT_PADDING, viewportWidth - 250 - VIEWPORT_PADDING);
    }

    // 确保不超出左边界
    left = Math.max(VIEWPORT_PADDING, left);

    // 确保不超出上边界
    if (top < VIEWPORT_PADDING) {
      top = VIEWPORT_PADDING;
    }

    return { left, top };
  }, [position, suggestions.length]);

  if (!adjustedPosition) return null;

  return (
    <div
      className="wiki-autocomplete"
      ref={listRef}
      style={{ left: adjustedPosition.left, top: adjustedPosition.top }}
    >
      {suggestions.length === 0 ? (
        <div className="wiki-autocomplete-empty">无匹配结果，Enter 创建新笔记</div>
      ) : (
        suggestions.map((s, i) => (
          <div
            key={s.path}
            ref={el => { itemsRef.current[i] = el; }}
            className={`wiki-autocomplete-item ${i === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(s.name)}
          >
            {s.name}
          </div>
        ))
      )}
    </div>
  );
}
