import { useEffect, useRef, useCallback, useState } from "react";
import { executeCommand } from "./extensions/custom-commands";
import { loadShortcuts, formatShortcutDisplay } from "./shortcuts";
import type { Editor } from "@tiptap/core";

interface ContextMenuProps {
  editor: Editor | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
}

interface IconItem {
  name: string;
  label: string;
  shortcutId: string | null;
  icon: React.ReactNode;
}

const ICONS = {
  cut: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  ),
  copy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  paste: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
  trash: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  bold: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" /><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
    </svg>
  ),
  italic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  ),
  strikethrough: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4H9a3 3 0 00-2.83 4" /><path d="M14 12a4 4 0 010 8H6" /><line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  code: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  link: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ),
  quote: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
    </svg>
  ),
  listUnordered: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  listOrdered: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><text x="2" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
    </svg>
  ),
  checkSquare: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  heading: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v16M18 4v16M6 12h12" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  image: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  minus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  table: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  codeBlock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  math: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <text x="3" y="17" fontSize="14" fill="currentColor" stroke="none" fontFamily="serif" fontStyle="italic">x</text><line x1="14" y1="5" x2="20" y2="19" /><line x1="20" y1="5" x2="14" y2="19" />
    </svg>
  ),
  chevronRight: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  highlight: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
};

// 三行图标按钮配置
const ICON_ROWS: IconItem[][] = [
  // 第一行：剪贴板
  [
    { name: "cut", label: "剪切", shortcutId: null, icon: ICONS.cut },
    { name: "copy", label: "复制", shortcutId: null, icon: ICONS.copy },
    { name: "paste", label: "粘贴", shortcutId: null, icon: ICONS.paste },
    { name: "delete", label: "删除", shortcutId: null, icon: ICONS.trash },
  ],
  // 第二行：行内格式
  [
    { name: "bold", label: "加粗", shortcutId: "bold", icon: ICONS.bold },
    { name: "italic", label: "斜体", shortcutId: "italic", icon: ICONS.italic },
    { name: "strike", label: "删除线", shortcutId: "strike", icon: ICONS.strikethrough },
    { name: "inline-code", label: "行内代码", shortcutId: "inline-code", icon: ICONS.code },
    { name: "link", label: "链接", shortcutId: "link", icon: ICONS.link },
  ],
  // 第三行：块级格式
  [
    { name: "quote", label: "引用", shortcutId: "quote", icon: ICONS.quote },
    { name: "list", label: "无序列表", shortcutId: "unordered-list", icon: ICONS.listUnordered },
    { name: "ordered-list", label: "有序列表", shortcutId: "ordered-list", icon: ICONS.listOrdered },
    { name: "check", label: "任务列表", shortcutId: "check-list", icon: ICONS.checkSquare },
    { name: "highlight", label: "高亮", shortcutId: "highlight", icon: ICONS.highlight },
  ],
];

// 子菜单配置
const SUBMENU_ITEMS: any[] = [
  {
    name: "heading",
    label: "标题",
    icon: ICONS.heading,
    submenu: [
      { name: "heading-1", label: "一级标题", shortcutId: "heading-1" },
      { name: "heading-2", label: "二级标题", shortcutId: "heading-2" },
      { name: "heading-3", label: "三级标题", shortcutId: "heading-3" },
      { name: "heading-4", label: "四级标题", shortcutId: "heading-4" },
      { name: "heading-5", label: "五级标题", shortcutId: "heading-5" },
      { name: "heading-6", label: "六级标题", shortcutId: "heading-6" },
      { divider: true, label: "" },
      { name: "paragraph", label: "段落", shortcutId: "paragraph" },
    ],
  },
  {
    name: "insert",
    label: "插入",
    icon: ICONS.plus,
    submenu: [
      { name: "upload", label: "图像", shortcutId: null, icon: ICONS.image },
      { name: "hr", label: "水平分割线", shortcutId: "hr", icon: ICONS.minus },
      { name: "table", label: "表格", shortcutId: "table", icon: ICONS.table },
      { name: "code", label: "代码块", shortcutId: "code-block", icon: ICONS.codeBlock },
      { name: "math", label: "公式块", shortcutId: null, icon: ICONS.math },
    ],
  },
];

function getShortcutLabel(shortcutId: string | null, shortcuts: any[]): string {
  if (!shortcutId) return "";
  const item = shortcuts.find((s) => s.id === shortcutId);
  return item ? formatShortcutDisplay(item.keys) : "";
}

export function ContextMenu({ editor, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null);
  const [shortcuts, setShortcuts] = useState<any[]>([]);

  useEffect(() => {
    if (position) {
      setShortcuts(loadShortcuts());
    }
  }, [position]);

  // 子菜单渲染后校正位置
  useEffect(() => {
    if (activeSubmenu && submenuRef.current && submenuPos) {
      const el = submenuRef.current;
      const rect = el.getBoundingClientRect();
      const GAP = 4;
      let { x, y } = submenuPos;

      if (x + rect.width > window.innerWidth - GAP) {
        x = window.innerWidth - rect.width - GAP;
      }
      if (x < GAP) x = GAP;
      if (y + rect.height > window.innerHeight - GAP) {
        y = window.innerHeight - rect.height - GAP;
      }
      if (y < GAP) y = GAP;

      if (x !== submenuPos.x || y !== submenuPos.y) {
        setSubmenuPos({ x, y });
      }
    }
  }, [activeSubmenu, submenuPos]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      onClose();
      setActiveSubmenu(null);
    }
  }, [onClose]);

  useEffect(() => {
    if (position) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [position, handleClickOutside]);

  useEffect(() => {
    if (position && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const GAP = 4;

      let left = position.x;
      let top = position.y;

      if (left + rect.width > window.innerWidth - GAP) {
        left = position.x - rect.width;
      }
      if (top + rect.height > window.innerHeight - GAP) {
        top = position.y - rect.height;
      }
      if (left < GAP) left = GAP;
      if (top < GAP) top = GAP;

      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }
  }, [position]);

  const handleItemClick = (name: string) => {
    if (!editor) return;
    executeCommand(name, editor);
    onClose();
    setActiveSubmenu(null);
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setActiveSubmenu(null);
      setSubmenuPos(null);
      closeTimerRef.current = null;
    }, 200);
  };

  const handleSubmenuEnter = (e: React.MouseEvent, item: any) => {
    if (!item.submenu) return;
    clearCloseTimer();
    const wrapper = e.currentTarget as HTMLElement;
    const rect = wrapper.getBoundingClientRect();
    setActiveSubmenu(item.name || null);

    const GAP = 4;
    const submenuWidth = 200;
    const submenuHeight = item.submenu.length * 32 + 8;

    let x = rect.right + GAP;
    let y = rect.top;

    if (x + submenuWidth > window.innerWidth - GAP) {
      x = rect.left - submenuWidth - GAP;
    }
    if (y + submenuHeight > window.innerHeight - GAP) {
      y = window.innerHeight - submenuHeight - GAP;
    }
    if (y < GAP) y = GAP;

    setSubmenuPos({ x, y });
  };

  const handleSubmenuLeave = () => {
    scheduleClose();
  };

  const handleSubmenuPanelEnter = () => {
    clearCloseTimer();
  };

  const handleSubmenuPanelLeave = () => {
    scheduleClose();
  };

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      className="editor-context-menu"
      style={{ left: position.x, top: position.y }}
    >
      {/* 三行图标按钮 */}
      {ICON_ROWS.map((row, rowIdx) => (
        <div key={`row-${rowIdx}`} className="context-menu-icon-row">
          {row.map((item) => {
            const shortcutLabel = getShortcutLabel(item.shortcutId, shortcuts);
            const tooltip = shortcutLabel ? `${item.label} (${shortcutLabel})` : item.label;
            return (
              <div
                key={item.name}
                className="context-menu-icon-btn-wrapper"
                data-tooltip={tooltip}
              >
                <button
                  className="context-menu-icon-btn"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleItemClick(item.name);
                  }}
                >
                  {item.icon}
                </button>
              </div>
            );
          })}
        </div>
      ))}

      <div className="context-menu-divider" />

      {/* 标题和插入子菜单 */}
      {SUBMENU_ITEMS.map((item) => (
        <div
          key={item.name}
          className="context-menu-item-wrapper"
          onMouseEnter={(e) => handleSubmenuEnter(e, item)}
          onMouseLeave={handleSubmenuLeave}
        >
          <button className="context-menu-item">
            <span className="context-menu-icon">{item.icon}</span>
            <span className="context-menu-label">{item.label}</span>
            <span className="context-menu-arrow">{ICONS.chevronRight}</span>
          </button>

          {activeSubmenu === item.name && submenuPos && (
            <div
              ref={submenuRef}
              className="context-menu-submenu"
              style={{ left: submenuPos.x, top: submenuPos.y }}
              onMouseEnter={handleSubmenuPanelEnter}
              onMouseLeave={handleSubmenuPanelLeave}
            >
              {item.submenu.map((sub: any, subIdx: number) => {
                if (sub.divider) {
                  return <div key={`sub-div-${subIdx}`} className="context-menu-divider" />;
                }
                return (
                  <button
                    key={sub.name}
                    className="context-menu-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (sub.name) handleItemClick(sub.name);
                    }}
                  >
                    {sub.icon && <span className="context-menu-icon">{sub.icon}</span>}
                    <span className="context-menu-label">{sub.label}</span>
                    {getShortcutLabel(sub.shortcutId || null, shortcuts) && (
                      <span className="context-menu-shortcut">
                        {getShortcutLabel(sub.shortcutId || null, shortcuts)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
