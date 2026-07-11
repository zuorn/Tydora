import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { BookmarkGroup } from "./BookmarksService";
import * as BookmarksService from "./BookmarksService";
import type { VaultInfo } from "../Sidebar";
import "./BookmarksPanel.css";

interface BookmarksPanelProps {
  vaultPath: string | null;
  vaults: VaultInfo[];
  onSelectFile: (path: string) => void;
  onNewWindow: (filePath: string) => void;
}

interface PanelBookmarkGroup extends BookmarkGroup {
  expanded: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: "bookmark" | "group";
  bookmarkId?: string;
  groupId?: string;
}

export function BookmarksPanel({
  vaultPath,
  onSelectFile,
  onNewWindow,
}: BookmarksPanelProps) {
  const [groups, setGroups] = useState<PanelBookmarkGroup[]>([]);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [dragState, setDragState] = useState<{
    bookmarkId: string;
    sourceGroupId: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState<{
    groupId: string;
    index: number;
  } | null>(null);

  const loadGroups = useCallback(() => {
    if (!vaultPath) {
      setGroups([]);
      return;
    }
    const loaded = BookmarksService.getGroupsForVault(vaultPath);
    setGroups(loaded.map((g, i) => ({ ...g, expanded: i === 0 })));
  }, [vaultPath]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleToggleGroup = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, expanded: !g.expanded } : g)),
    );
  }, []);

  const handleSelectBookmark = useCallback(
    (path: string) => {
      onSelectFile(path);
    },
    [onSelectFile],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, type: "bookmark" | "group", bookmarkId?: string, groupId?: string) => {
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({ x: e.clientX, y: e.clientY, type, bookmarkId, groupId });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setCtxMenu(null);
  }, []);

  const handleDeleteBookmark = useCallback(
    (bookmarkId: string) => {
      if (!vaultPath) return;
      BookmarksService.removeBookmark(vaultPath, bookmarkId);
      loadGroups();
    },
    [vaultPath, loadGroups],
  );

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      showToast("路径已复制到剪贴板");
    }).catch(() => {});
  }, []);

  const handleEditTitle = useCallback((bookmarkId: string, currentTitle: string) => {
    const newTitle = prompt("修改标题（留空则显示原文件名）：", currentTitle);
    if (newTitle !== null && vaultPath) {
      BookmarksService.updateBookmark(vaultPath, bookmarkId, { title: newTitle });
      loadGroups();
    }
  }, [vaultPath, loadGroups]);

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      if (!vaultPath) return;
      BookmarksService.deleteGroup(vaultPath, groupId);
      loadGroups();
    },
    [vaultPath, loadGroups],
  );

  const handleRenameGroupStart = useCallback((groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setEditingGroupName(currentName);
  }, []);

  const handleRenameGroupConfirm = useCallback(() => {
    if (!vaultPath || !editingGroupId || !editingGroupName.trim()) {
      setEditingGroupId(null);
      return;
    }
    BookmarksService.renameGroup(vaultPath, editingGroupId, editingGroupName.trim());
    setEditingGroupId(null);
    loadGroups();
  }, [vaultPath, editingGroupId, editingGroupName, loadGroups]);

  // ── Drag & Drop ──
  const handleDragStart = useCallback(
    (e: React.DragEvent, bookmarkId: string, sourceGroupId: string) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", bookmarkId);
      setDragState({ bookmarkId, sourceGroupId });
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, groupId: string, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver({ groupId, index });
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetGroupId: string, targetIndex: number) => {
      e.preventDefault();
      if (!vaultPath || !dragState) return;

      if (dragState.sourceGroupId === targetGroupId) {
        // Same group reorder
        const group = groups.find((g) => g.id === targetGroupId);
        if (!group) return;
        const ids = group.bookmarks.map((b) => b.id);
        const fromIdx = ids.indexOf(dragState.bookmarkId);
        if (fromIdx === -1) return;
        ids.splice(fromIdx, 1);
        ids.splice(targetIndex, 0, dragState.bookmarkId);
        BookmarksService.reorderBookmarks(vaultPath, targetGroupId, ids);
      } else {
        // Cross-group move
        BookmarksService.moveBookmark(
          vaultPath,
          dragState.bookmarkId,
          dragState.sourceGroupId,
          targetGroupId,
          targetIndex,
        );
      }

      setDragState(null);
      setDragOver(null);
      loadGroups();
    },
    [vaultPath, dragState, groups, loadGroups],
  );

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDragOver(null);
  }, []);

  // Context menu click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    document.addEventListener("click", handler);
    document.addEventListener("contextmenu", handler);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("contextmenu", handler);
    };
  }, [ctxMenu]);

  if (!vaultPath) {
    return (
      <div className="bookmarks-panel">
        <div className="bookmarks-empty">尚未打开仓库</div>
      </div>
    );
  }

  if (groups.length === 0 && groups.every((g) => g.bookmarks.length === 0)) {
    return (
      <div className="bookmarks-panel">
        <div className="bookmarks-empty">暂无书签</div>
        <div className="bookmarks-empty-hint">右键文件或文件夹可添加书签</div>
      </div>
    );
  }

  const allBookmarksEmpty = groups.every((g) => g.bookmarks.length === 0);
  if (allBookmarksEmpty) {
    return (
      <div className="bookmarks-panel">
        <div className="bookmarks-empty">暂无书签</div>
        <div className="bookmarks-empty-hint">右键文件或文件夹可添加书签</div>
      </div>
    );
  }

  return (
    <div className="bookmarks-panel">
      {groups.map((group) => {
        if (group.bookmarks.length === 0 && !group.expanded) return null;
        return (
          <div key={group.id} className="bookmark-group">
            <div
              className={`bookmark-group-header${group.expanded ? " expanded" : ""}`}
              onClick={() => handleToggleGroup(group.id)}
              onContextMenu={(e) => handleContextMenu(e, "group", undefined, group.id)}
            >
              <svg
                className="bookmark-group-chevron"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {editingGroupId === group.id ? (
                <input
                  className="bookmark-group-rename-input"
                  value={editingGroupName}
                  onChange={(e) => setEditingGroupName(e.target.value)}
                  onBlur={handleRenameGroupConfirm}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameGroupConfirm();
                    if (e.key === "Escape") setEditingGroupId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="bookmark-group-name">{group.name}</span>
                  <span className="bookmark-group-count">{group.bookmarks.length}</span>
                </>
              )}
            </div>
            {group.expanded && (
              <div className="bookmark-group-items">
                {group.bookmarks.map((bookmark, idx) => {
                  const fileName = bookmark.path.split(/[/\\]/).pop() || bookmark.path;
                  const displayTitle = bookmark.title || fileName;
                  return (
                    <div
                      key={bookmark.id}
                      className={`bookmark-item${
                        dragOver?.groupId === group.id && dragOver?.index === idx
                          ? " drag-over-top"
                          : ""
                      }${dragState?.bookmarkId === bookmark.id ? " dragging" : ""}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, bookmark.id, group.id)}
                      onDragOver={(e) => handleDragOver(e, group.id, idx)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, group.id, idx)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleSelectBookmark(bookmark.path)}
                      onContextMenu={(e) =>
                        handleContextMenu(e, "bookmark", bookmark.id, group.id)
                      }
                    >
                      <div className="bookmark-item-info">
                        <span className="bookmark-item-title">{displayTitle}</span>
                        {bookmark.title && (
                          <span className="bookmark-item-path">{fileName}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {group.bookmarks.length === 0 && (
                  <div className="bookmarks-empty-small">拖拽书签到此分组</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {ctxMenu && (
        <BookmarkContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          type={ctxMenu.type}
          bookmarkId={ctxMenu.bookmarkId}
          groupId={ctxMenu.groupId}
          groups={groups}
          onClose={handleCloseContextMenu}
          onDeleteBookmark={handleDeleteBookmark}
          onCopyPath={handleCopyPath}
          onDeleteGroup={handleDeleteGroup}
          onRenameGroup={handleRenameGroupStart}
          onNewWindow={onNewWindow}
          onEditTitle={handleEditTitle}
        />
      )}
    </div>
  );
}

// ── Context Menu ──

function BookmarkContextMenu({
  x,
  y,
  type,
  bookmarkId,
  groupId,
  groups,
  onClose,
  onDeleteBookmark,
  onCopyPath,
  onDeleteGroup,
  onRenameGroup,
  onNewWindow,
  onEditTitle,
}: {
  x: number;
  y: number;
  type: "bookmark" | "group";
  bookmarkId?: string;
  groupId?: string;
  groups: PanelBookmarkGroup[];
  onClose: () => void;
  onDeleteBookmark: (id: string) => void;
  onCopyPath: (path: string) => void;
  onDeleteGroup: (id: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onNewWindow: (filePath: string) => void;
  onEditTitle: (bookmarkId: string, currentTitle: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const menu = menuRef.current;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const rect = menu.getBoundingClientRect();
    const GAP = 4;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - GAP) left = x - rect.width;
    if (top + rect.height > window.innerHeight - GAP) top = y - rect.height;
    if (left < GAP) left = GAP;
    if (top < GAP) top = GAP;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [x, y]);

  const bookmark = type === "bookmark" && bookmarkId
    ? groups.flatMap((g) => g.bookmarks).find((b) => b.id === bookmarkId)
    : null;

  const group = type === "group" && groupId
    ? groups.find((g) => g.id === groupId)
    : null;

  const items: { label: string; onClick: () => void; danger?: boolean; separator?: boolean }[] = [];

  if (type === "bookmark" && bookmark) {
    items.push(
      { label: "在新窗口打开", onClick: () => { onNewWindow(bookmark.path); onClose(); } },
      { label: "修改标题", onClick: () => { onEditTitle(bookmarkId!, bookmark.title); onClose(); } },
      { label: "取消收藏", onClick: () => { onDeleteBookmark(bookmarkId!); onClose(); }, danger: true, separator: true },
      { label: "复制路径", onClick: () => { onCopyPath(bookmark.path); onClose(); } },
    );
  } else if (type === "group" && group) {
    items.push(
      { label: "重命名", onClick: () => { onRenameGroup(groupId!, group.name); onClose(); } },
      { label: "删除分组", onClick: () => { onDeleteGroup(groupId!); onClose(); }, danger: true },
    );
  }

  return createPortal(
    <div ref={menuRef} className="context-menu">
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <div className="context-menu-divider" />}
          <div
            className={`context-menu-item${item.danger ? " danger" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

function showToast(message: string) {
  const existing = document.querySelector(".sidebar-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "sidebar-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}
