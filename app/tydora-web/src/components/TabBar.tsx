import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import "./TabBar.css";

export interface TabItem {
  id: string;
  /** 文件绝对路径；未命名标签为 null */
  path: string | null;
  modified: boolean;
}

interface TabBarProps {
  tabs: TabItem[];
  /** 当前激活标签 id；白板 / 预览等非标签视图显示时为 null */
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  /** 批量关闭（关闭其他 / 右侧 / 全部）；未保存的由调用方逐个确认 */
  onCloseMany: (ids: string[]) => void;
  onNew: () => void;
}

type TabMenuState = {
  x: number;
  y: number;
  /** 右键点在某个标签上；点在空白处为 null */
  tabId: string | null;
};

const baseName = (p: string) => p.split(/[/\\]/).pop() || p;
const parentName = (p: string) => {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
};

export function TabBar({ tabs, activeId, onActivate, onClose, onCloseMany, onNew }: TabBarProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<TabMenuState | null>(null);

  // 同名文件（不同目录）需要附带父目录名才能区分
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tab of tabs) {
      if (!tab.path) continue;
      const name = baseName(tab.path);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [tabs]);

  useEffect(() => {
    if (!activeId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  const openMenu = useCallback((e: React.MouseEvent, tabId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    // 下一帧再监听，避免打开菜单的同一次右键立刻关掉
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("contextmenu", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("contextmenu", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // 菜单超出视口时往回拉
  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const GAP = 4;
    let left = menu.x;
    let top = menu.y;
    if (left + rect.width > window.innerWidth - GAP) left = window.innerWidth - rect.width - GAP;
    if (top + rect.height > window.innerHeight - GAP) top = window.innerHeight - rect.height - GAP;
    if (left < GAP) left = GAP;
    if (top < GAP) top = GAP;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [menu]);

  const runMenuAction = (action: () => void) => {
    setMenu(null);
    action();
  };

  const menuTabIndex = menu?.tabId ? tabs.findIndex((tab) => tab.id === menu.tabId) : -1;
  const canCloseOthers = menuTabIndex >= 0 && tabs.length > 1;
  const canCloseToRight = menuTabIndex >= 0 && menuTabIndex < tabs.length - 1;
  const canCloseAll = tabs.length > 0;

  return (
    <div className="editor-tabbar" data-tauri-drag-region="false" onContextMenu={(e) => openMenu(e, null)}>
      <div className="editor-tabbar-list" ref={listRef} role="tablist">
        {tabs.map((tab) => {
          const name = tab.path ? baseName(tab.path) : t("app.tabs.untitled");
          const hint = tab.path && (duplicateNames.get(name) ?? 0) > 1 ? parentName(tab.path) : "";
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={active}
              className={`editor-tab${active ? " is-active" : ""}${tab.modified ? " is-modified" : ""}`}
              title={tab.path ?? name}
              onMouseDown={(e) => {
                if (e.button === 0) onActivate(tab.id);
                // 中键关闭（浏览器标签栏习惯）
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(tab.id);
                }
              }}
              onContextMenu={(e) => openMenu(e, tab.id)}
            >
              <span className="editor-tab-name">{name}</span>
              {hint && <span className="editor-tab-hint">{hint}</span>}
              <button
                className="editor-tab-close"
                title={t("app.tabs.close")}
                aria-label={t("app.tabs.close")}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <span className="editor-tab-dot" />
                <svg className="editor-tab-x" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <button className="editor-tabbar-new" title={t("app.tabs.newTab")} aria-label={t("app.tabs.newTab")} onClick={onNew}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {menu && createPortal(
        <div
          ref={menuRef}
          className="editor-tabbar-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          {menu.tabId && (
            <button
              className="editor-tabbar-menu-item"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runMenuAction(() => onClose(menu.tabId!))}
            >
              {t("app.tabs.close")}
            </button>
          )}
          {canCloseOthers && (
            <button
              className="editor-tabbar-menu-item"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runMenuAction(() => onCloseMany(tabs.filter((tab) => tab.id !== menu.tabId).map((tab) => tab.id)))}
            >
              {t("app.tabs.closeOthers")}
            </button>
          )}
          {canCloseToRight && (
            <button
              className="editor-tabbar-menu-item"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runMenuAction(() => onCloseMany(tabs.slice(menuTabIndex + 1).map((tab) => tab.id)))}
            >
              {t("app.tabs.closeToRight")}
            </button>
          )}
          {canCloseAll && (
            <>
              {(menu.tabId || canCloseOthers || canCloseToRight) && <div className="editor-tabbar-menu-divider" />}
              <button
                className="editor-tabbar-menu-item"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runMenuAction(() => onCloseMany(tabs.map((tab) => tab.id)))}
              >
                {t("app.tabs.closeAll")}
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
