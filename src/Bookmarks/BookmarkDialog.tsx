import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Bookmark, BookmarkGroup } from "./BookmarksService";
import { createGroup } from "./BookmarksService";

interface BookmarkDialogProps {
  isOpen: boolean;
  filePath: string;
  fileName: string;
  isDirectory: boolean;
  vaultPath: string;
  existingGroups: BookmarkGroup[];
  editingBookmark?: Bookmark;
  onSave: (title: string, groupId: string) => void;
  onCancel: () => void;
}

export function BookmarkDialog({
  isOpen,
  filePath,
  fileName,
  isDirectory,
  vaultPath,
  existingGroups,
  editingBookmark,
  onSave,
  onCancel,
}: BookmarkDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(editingBookmark?.title ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState(
    editingBookmark
      ? existingGroups.find((g) => g.bookmarks.some((b) => b.id === editingBookmark.id))?.id ?? ""
      : existingGroups[0]?.id ?? "",
  );
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(editingBookmark?.title ?? "");
      setSelectedGroupId(
        editingBookmark
          ? existingGroups.find((g) => g.bookmarks.some((b) => b.id === editingBookmark.id))?.id ?? ""
          : existingGroups[0]?.id ?? "",
      );
      setIsCreatingGroup(false);
      setNewGroupName("");
      setDropdownOpen(false);
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isOpen, editingBookmark, existingGroups]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const handleOverlayClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOverlayClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOverlayClick);
    };
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleSave = useCallback(() => {
    let groupId = selectedGroupId;
    if (isCreatingGroup && newGroupName.trim()) {
      const group = createGroup(vaultPath, newGroupName.trim());
      groupId = group.id;
    }
    if (!groupId && existingGroups.length > 0) {
      groupId = existingGroups[0].id;
    }
    if (!groupId) {
      const group = createGroup(vaultPath, "默认分组");
      groupId = group.id;
    }
    onSave(title.trim(), groupId);
  }, [title, selectedGroupId, isCreatingGroup, newGroupName, vaultPath, existingGroups, onSave]);

  if (!isOpen) return null;

  const selectedGroup = existingGroups.find((g) => g.id === selectedGroupId);

  return createPortal(
    <div className="bookmark-dialog-overlay">
      <div ref={dialogRef} className="bookmark-dialog">
        <div className="bookmark-dialog-header">
          <span className="bookmark-dialog-title">
            {editingBookmark ? "编辑书签" : "添加书签"}
          </span>
          <button className="bookmark-dialog-close" onClick={onCancel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="bookmark-dialog-body">
          <div className="bookmark-dialog-field">
            <label className="bookmark-dialog-label">路径</label>
            <div className="bookmark-dialog-path">
              {isDirectory ? "📁 " : "📄 "}
              <span className="bookmark-dialog-path-text">{filePath}</span>
            </div>
          </div>

          <div className="bookmark-dialog-field">
            <label className="bookmark-dialog-label">标题</label>
            <input
              ref={titleInputRef}
              className="bookmark-dialog-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={fileName}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            {!title.trim() && (
              <span className="bookmark-dialog-hint">留空则显示原文件名</span>
            )}
          </div>

          <div className="bookmark-dialog-field">
            <label className="bookmark-dialog-label">分组</label>
            {isCreatingGroup ? (
              <div className="bookmark-dialog-new-group">
                <input
                  className="bookmark-dialog-input"
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="输入分组名称"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newGroupName.trim()) handleSave();
                    if (e.key === "Escape") setIsCreatingGroup(false);
                  }}
                />
                <button
                  className="bookmark-dialog-btn-text"
                  onClick={() => setIsCreatingGroup(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="bookmark-dialog-group-row">
                <div className="bookmark-dialog-select-wrapper" ref={dropdownRef}>
                  <button
                    className="bookmark-dialog-select"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                  >
                    {selectedGroup?.name || "选择分组"}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {dropdownOpen && (
                    <div className="bookmark-dialog-dropdown">
                      {existingGroups.map((g) => (
                        <div
                          key={g.id}
                          className={`bookmark-dialog-dropdown-item${g.id === selectedGroupId ? " active" : ""}`}
                          onClick={() => {
                            setSelectedGroupId(g.id);
                            setDropdownOpen(false);
                          }}
                        >
                          {g.name}
                          <span className="bookmark-dialog-dropdown-count">
                            {g.bookmarks.length}
                          </span>
                        </div>
                      ))}
                      {existingGroups.length === 0 && (
                        <div className="bookmark-dialog-dropdown-empty">
                          暂无分组
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="bookmark-dialog-btn-text"
                  onClick={() => setIsCreatingGroup(true)}
                >
                  + 新建
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bookmark-dialog-footer">
          <button className="bookmark-dialog-btn bookmark-dialog-btn-cancel" onClick={onCancel}>
            取消
          </button>
          <button className="bookmark-dialog-btn bookmark-dialog-btn-save" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
