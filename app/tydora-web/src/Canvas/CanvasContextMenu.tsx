import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from './canvas-store';
import NotePicker from './NotePicker';
import MediaPicker from './MediaPicker';

// Convert absolute path to relative path (relative to vault)
function toRelativePath(absolutePath: string, vaultPath: string): string {
  if (!vaultPath || !absolutePath) return absolutePath;
  const normalizedAbsolute = absolutePath.replace(/\\/g, '/');
  const normalizedVault = vaultPath.replace(/\\/g, '/');
  if (normalizedAbsolute.startsWith(normalizedVault)) {
    let relative = normalizedAbsolute.slice(normalizedVault.length);
    if (relative.startsWith('/')) relative = relative.slice(1);
    return relative;
  }
  return absolutePath;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

interface MenuItem {
  id?: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  divider?: boolean;
}

// Toolbar-matching icons (16px versions of the 24px toolbar SVGs)
const Icons = {
  // 工具栏"添加卡片"图标
  Card: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  // 工具栏"添加笔记"图标
  Note: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  // 工具栏"添加媒体"图标
  Media: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Link: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  Group: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </svg>
  ),
  Undo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  ),
  Redo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
    </svg>
  ),
};

export default function CanvasContextMenu({ x, y, onClose }: ContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.canUndo);

  const [showNotePicker, setShowNotePicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Get vault path from localStorage
  const getVaultPath = (): string => {
    try {
      const raw = localStorage.getItem('zmd-vaults');
      const activeIndex = parseInt(localStorage.getItem('zmd-active-vault') || '-1');
      if (raw && activeIndex >= 0) {
        const vaults = JSON.parse(raw);
        return vaults[activeIndex]?.path || '';
      }
    } catch {}
    return '';
  };

  const getFlowPosition = useCallback(() => {
    return screenToFlowPosition({ x, y });
  }, [x, y, screenToFlowPosition]);

  const handleAddCard = useCallback(() => {
    addNode('text', getFlowPosition());
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleAddNote = useCallback(() => {
    setShowNotePicker(true);
  }, []);

  const handleNoteSelect = useCallback((path: string, name: string) => {
    const vaultPath = getVaultPath();
    const relativePath = toRelativePath(path, vaultPath);
    addNode('note', getFlowPosition(), { file: relativePath, label: name });
    setShowNotePicker(false);
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleAddMedia = useCallback(() => {
    setShowMediaPicker(true);
  }, []);

  const handleMediaSelect = useCallback((path: string) => {
    const vaultPath = getVaultPath();
    const relativePath = toRelativePath(path, vaultPath);
    const isCanvas = /\.canvas$/i.test(path);
    addNode(isCanvas ? 'canvas' : 'media', getFlowPosition(), { file: relativePath });
    setShowMediaPicker(false);
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleAddLink = useCallback(() => {
    setLinkUrl('');
    setShowLinkInput(true);
  }, []);

  const handleLinkSubmit = useCallback(() => {
    const url = linkUrl.trim();
    if (url) {
      const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      addNode('link', getFlowPosition(), { url: normalizedUrl, label: url });
    }
    setShowLinkInput(false);
    onClose();
  }, [linkUrl, addNode, getFlowPosition, onClose]);

  const handleLinkKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLinkSubmit();
    } else if (e.key === 'Escape') {
      setShowLinkInput(false);
      onClose();
    }
  }, [handleLinkSubmit, onClose]);

  const handleAddGroup = useCallback(() => {
    addNode('group', getFlowPosition(), { label: t("canvas.contextMenu.addGroup") });
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleUndo = useCallback(() => {
    undo();
    onClose();
  }, [undo, onClose]);

  const handleRedo = useCallback(() => {
    redo();
    onClose();
  }, [redo, onClose]);

  // Close on outside click (but not when pickers or link input are open)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showNotePicker || showMediaPicker || showLinkInput) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, showNotePicker, showMediaPicker, showLinkInput]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuItems: MenuItem[] = [
    { id: 'addCard', icon: Icons.Card, label: t("canvas.contextMenu.addCard"), onClick: handleAddCard },
    { id: 'addNote', icon: Icons.Note, label: t("canvas.contextMenu.addNote"), onClick: handleAddNote },
    { id: 'addMedia', icon: Icons.Media, label: t("canvas.contextMenu.addMedia"), onClick: handleAddMedia },
    { id: 'addLink', icon: Icons.Link, label: t("canvas.contextMenu.addLink"), onClick: handleAddLink },
    { id: 'addGroup', icon: Icons.Group, label: t("canvas.contextMenu.addGroup"), onClick: handleAddGroup },
    { icon: null, label: '', onClick: () => {}, divider: true },
    { id: 'undo', icon: Icons.Undo, label: t("canvas.contextMenu.undo"), onClick: handleUndo },
    { id: 'redo', icon: Icons.Redo, label: t("canvas.contextMenu.redo"), onClick: handleRedo },
  ];

  return (
    <>
      <div
        ref={menuRef}
        className="canvas-context-menu"
        style={{ left: x, top: y }}
      >
        {menuItems.map((item, i) =>
          item.divider ? (
            <div key={i} className="canvas-context-menu-divider" />
          ) : (
            <button
              key={i}
              className="canvas-context-menu-item"
              onClick={item.onClick}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={item.id === 'undo' && !canUndo()}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        )}
      </div>

      {showNotePicker && (
        <NotePicker
          vaultPath={getVaultPath()}
          onSelect={handleNoteSelect}
          onClose={() => setShowNotePicker(false)}
        />
      )}

      {showMediaPicker && (
        <MediaPicker
          vaultPath={getVaultPath()}
          onSelect={handleMediaSelect}
          onClose={() => setShowMediaPicker(false)}
        />
      )}

      {showLinkInput && (
        <div
          className="canvas-link-input-popover"
          style={{ left: x + 200, top: y }}
        >
          <input
            ref={linkInputRef}
            className="canvas-link-input"
            type="text"
            placeholder={t("canvas.contextMenu.enterUrl")}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleLinkKeyDown}
            autoFocus
          />
          <button className="canvas-link-input-btn" onClick={handleLinkSubmit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
