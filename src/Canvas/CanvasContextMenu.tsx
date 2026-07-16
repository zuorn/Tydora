import { useState, useCallback, useEffect, useRef } from 'react';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.canUndo);

  const [showNotePicker, setShowNotePicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

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
    const url = prompt('输入 URL:');
    if (url) {
      addNode('link', getFlowPosition(), { url, label: url });
    }
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleAddGroup = useCallback(() => {
    addNode('group', getFlowPosition(), { label: '分组' });
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

  // Close on outside click (but not when pickers are open)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Don't close if a picker is open — the picker renders outside menuRef
      if (showNotePicker || showMediaPicker) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, showNotePicker, showMediaPicker]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuItems: MenuItem[] = [
    { icon: Icons.Card, label: '添加卡片', onClick: handleAddCard },
    { icon: Icons.Note, label: '添加笔记', onClick: handleAddNote },
    { icon: Icons.Media, label: '添加媒体文件', onClick: handleAddMedia },
    { icon: Icons.Link, label: '添加链接', onClick: handleAddLink },
    { icon: Icons.Group, label: '添加分组', onClick: handleAddGroup },
    { icon: null, label: '', onClick: () => {}, divider: true },
    { icon: Icons.Undo, label: '撤销', onClick: handleUndo },
    { icon: Icons.Redo, label: '重做', onClick: handleRedo },
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
              disabled={item.label === '撤销' && !canUndo()}
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
    </>
  );
}
