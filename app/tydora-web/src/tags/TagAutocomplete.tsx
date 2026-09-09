// src/tags/TagAutocomplete.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { TagIndexService } from "./TagIndexService";
import "./TagAutocomplete.css";

interface TagAutocompleteProps {
  query: string;
  position: { x: number; y: number } | null;
  onSelect: (tag: string) => void;
  onClose: () => void;
}

const MAX_HEIGHT = 240;
const ITEM_HEIGHT = 32;
const VIEWPORT_PADDING = 8;

export function TagAutocomplete({ query, position, onSelect, onClose }: TagAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const results = TagIndexService.searchTags(query, 30);
    // 如果 query 非空且不在结果中，把它作为"创建新标签"选项放在前面
    const trimmed = query.trim();
    if (trimmed && !results.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
      // 不强制，只是显示已有标签 + 允许 Enter 创建新标签
    }
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
      const isNext =
        e.key === "ArrowDown" ||
        (e.ctrlKey && e.key.toLowerCase() === "j");
      const isPrev =
        e.key === "ArrowUp" ||
        (e.ctrlKey && e.key.toLowerCase() === "k");

      if (isNext) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => {
          const max = suggestions.length > 0 ? suggestions.length - 1 : 0;
          return Math.min(i + 1, max);
        });
      } else if (isPrev) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (suggestions.length > 0 && suggestions[selectedIndex]) {
          onSelect(suggestions[selectedIndex]);
        } else if (query.trim()) {
          // 没有匹配项时，用用户输入的内容创建新标签
          onSelect(query.trim());
        }
      } else if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === " ") {
        if (suggestions.length > 0 && suggestions[selectedIndex]) {
          if (query.trim()) {
            // 用户已输入查询文本，空格时自动补全为选中的标签
            e.preventDefault();
            e.stopPropagation();
            onSelect(suggestions[selectedIndex]);
          } else {
            // query 为空（用户只输入了 #），说明用户可能想输入标题 (# 标题)
            // 关闭面板，让空格键正常输入到编辑器
            onClose();
          }
        }
      }
    };

    // 捕获阶段拦截，在编辑器内部处理器之前阻止 Enter/Arrow 等按键
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [suggestions, selectedIndex, onSelect, onClose, query]);

  // 计算菜单位置，确保不溢出窗口
  const adjustedPosition = useMemo(() => {
    if (!position) return null;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    // 头部标签分组 + 每一项高度
    const headerHeight = 28;
    const menuHeight = Math.min(
      headerHeight + suggestions.length * ITEM_HEIGHT + 8,
      MAX_HEIGHT
    );

    let top = position.y;
    let left = position.x;

    // 垂直方向：如果下方空间不够，改为向上显示
    if (top + menuHeight > viewportHeight - VIEWPORT_PADDING) {
      top = position.y - menuHeight - 8;
    }

    // 水平方向：如果右侧空间不够，向左偏移
    const menuWidth = 260;
    if (left + menuWidth > viewportWidth - VIEWPORT_PADDING) {
      left = Math.max(VIEWPORT_PADDING, viewportWidth - menuWidth - VIEWPORT_PADDING);
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
      className="tag-autocomplete"
      ref={listRef}
      style={{ left: adjustedPosition.left, top: adjustedPosition.top }}
    >
      <div className="tag-autocomplete-header">标签</div>
      {suggestions.length === 0 ? (
        <div className="tag-autocomplete-empty">
          {query ? `无匹配标签，Enter 创建新标签 #${query}` : "暂无标签，输入 # 后开始输入"}
        </div>
      ) : (
        suggestions.map((tag, i) => (
          <div
            key={tag}
            ref={(el) => {
              itemsRef.current[i] = el;
            }}
            className={`tag-autocomplete-item ${i === selectedIndex ? "selected" : ""}`}
            onClick={() => onSelect(tag)}
          >
            <span className="tag-autocomplete-item-prefix">#</span>
            <span className="tag-autocomplete-item-name">{tag}</span>
            <span className="tag-autocomplete-item-count">
              {TagIndexService.getTagCount(tag)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
