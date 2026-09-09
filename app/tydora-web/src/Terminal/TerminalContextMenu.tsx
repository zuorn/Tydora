import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface TerminalContextMenuProps {
  x: number;
  y: number;
  hasSelection: boolean;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFind: () => void;
  onSplit: (dir: "lr" | "tb") => void;
  onClosePane: () => void;
}

const ICONS = {
  copy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  paste: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
  find: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  splitLR: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  splitTB: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  ),
  chevronRight: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
};

export function TerminalContextMenu({
  x,
  y,
  hasSelection,
  onClose,
  onCopy,
  onPaste,
  onFind,
  onSplit,
  onClosePane,
}: TerminalContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState(false);
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
      setOpenSubmenu(false);
      setSubMenuPos(null);
    }, 120);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current?.contains(target);
      const inSubmenu = openSubmenu && subRef.current?.contains(target);
      if (!inMenu && !inSubmenu) {
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
  }, [onClose, openSubmenu]);

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

  useLayoutEffect(() => {
    if (!openSubmenu || !subMenuPos || !subRef.current) return;
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
  }, [openSubmenu, subMenuPos]);

  const handleSplitEnter = (e: React.MouseEvent) => {
    cancelSubClose();
    const itemRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const GAP = 4;
    const SUB_WIDTH = 180;
    let left = itemRect.right + GAP;
    if (left + SUB_WIDTH > window.innerWidth - GAP) {
      left = itemRect.left - GAP - SUB_WIDTH;
      if (left < GAP) left = GAP;
    }
    setSubMenuPos({ top: itemRect.top, left });
    setOpenSubmenu(true);
  };

  return createPortal(
    <div ref={menuRef} className="terminal-context-menu">
      <button
        className={`context-menu-item${!hasSelection ? " disabled" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (hasSelection) {
            onClose();
            setTimeout(() => onCopy(), 0);
          }
        }}
      >
        <span className="context-menu-icon">{ICONS.copy}</span>
        <span className="context-menu-label">{t("settings.terminal.contextMenu.copy")}</span>
      </button>

      <button
        className="context-menu-item"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
          setTimeout(() => onPaste(), 0);
        }}
      >
        <span className="context-menu-icon">{ICONS.paste}</span>
        <span className="context-menu-label">{t("settings.terminal.contextMenu.paste")}</span>
      </button>

      <div className="context-menu-divider" />

      <button
        className="context-menu-item"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
          setTimeout(() => onFind(), 0);
        }}
      >
        <span className="context-menu-icon">{ICONS.find}</span>
        <span className="context-menu-label">{t("settings.terminal.contextMenu.find")}</span>
      </button>

      <div
        className={`context-menu-item has-submenu${openSubmenu ? " open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseEnter={handleSplitEnter}
        onMouseLeave={scheduleSubClose}
      >
        <span className="context-menu-icon">{ICONS.splitLR}</span>
        <span className="context-menu-label">{t("settings.terminal.contextMenu.splitPane")}</span>
        <span className="context-menu-chevron">{ICONS.chevronRight}</span>
      </div>

      <div className="context-menu-divider" />

      <button
        className="context-menu-item danger"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
          setTimeout(() => onClosePane(), 0);
        }}
      >
        <span className="context-menu-icon">{ICONS.close}</span>
        <span className="context-menu-label">{t("settings.terminal.contextMenu.closePane")}</span>
      </button>

      {openSubmenu && subMenuPos && createPortal(
        <div
          ref={subRef}
          className="context-submenu"
          style={{ top: subMenuPos.top, left: subMenuPos.left }}
          onMouseEnter={cancelSubClose}
          onMouseLeave={scheduleSubClose}
        >
          <button
            className="context-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              // Defer split to next tick so menu closes first
              setTimeout(() => onSplit("lr"), 0);
            }}
          >
            <span className="context-menu-icon">{ICONS.splitLR}</span>
            <span className="context-menu-label">{t("settings.terminal.contextMenu.splitLeftRight")}</span>
          </button>
          <button
            className="context-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              setTimeout(() => onSplit("tb"), 0);
            }}
          >
            <span className="context-menu-icon">{ICONS.splitTB}</span>
            <span className="context-menu-label">{t("settings.terminal.contextMenu.splitTopBottom")}</span>
          </button>
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  );
}
