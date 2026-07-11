import { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { open } from '@tauri-apps/plugin-dialog';
import { useCanvasStore } from './canvas-store';

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

export default function CanvasContextMenu({ x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.canUndo);

  const getFlowPosition = useCallback(() => {
    return screenToFlowPosition({ x, y });
  }, [x, y, screenToFlowPosition]);

  const handleAddText = useCallback(() => {
    const pos = getFlowPosition();
    addNode('text', pos);
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleAddFile = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        multiple: false,
      });
      if (selected) {
        const filePath = selected as string;
        const fileName = filePath.split(/[/\\]/).pop() || '';
        const pos = getFlowPosition();
        addNode('file', pos, { file: filePath, label: fileName });
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleAddUrl = useCallback(() => {
    const url = prompt('输入 URL:');
    if (url) {
      const pos = getFlowPosition();
      addNode('link', pos, { url, label: url });
    }
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleAddImage = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
        multiple: false,
      });
      if (selected) {
        const filePath = selected as string;
        const pos = getFlowPosition();
        addNode('text', pos, { text: `![image](${filePath})` });
      }
    } catch (err) {
      console.error('Failed to open image:', err);
    }
    onClose();
  }, [addNode, getFlowPosition, onClose]);

  const handleAddGroup = useCallback(() => {
    const pos = getFlowPosition();
    addNode('group', pos, { label: '分组' });
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

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuItems: MenuItem[] = [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="7" y1="8" x2="17" y2="8" />
          <line x1="7" y1="12" x2="14" y2="12" />
          <line x1="7" y1="16" x2="11" y2="16" />
        </svg>
      ),
      label: '添加文本节点',
      onClick: handleAddText,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
      label: '添加文件节点',
      onClick: handleAddFile,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
      label: '添加链接节点',
      onClick: handleAddUrl,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ),
      label: '添加图片节点',
      onClick: handleAddImage,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
        </svg>
      ),
      label: '添加分组',
      onClick: handleAddGroup,
    },
    { icon: null, label: '', onClick: () => {}, divider: true },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      ),
      label: '撤销',
      onClick: handleUndo,
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
        </svg>
      ),
      label: '重做',
      onClick: handleRedo,
    },
  ];

  return (
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
            disabled={item.label === '撤销' && !canUndo()}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}
