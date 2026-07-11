import { useState, useEffect, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { emit } from '@tauri-apps/api/event';
import { getCanvasColor, resolveFilePath } from '../canvas-utils';

function NoteNode({ data, selected }: NodeProps) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');

  const filePath = (data as any)?.file || '';

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

  useEffect(() => {
    if (!filePath) return;

    // Extract title from filename
    const name = filePath.split(/[/\\]/).pop() || filePath;
    setTitle(name.replace(/\.(md|markdown)$/i, ''));

    const loadContent = async () => {
      try {
        // Resolve the path
        let resolvedPath = filePath;
        if (!filePath.match(/^[A-Z]:\\/i) && !filePath.startsWith('/')) {
          const vaultPath = getVaultPath();
          if (vaultPath) {
            resolvedPath = resolveFilePath(vaultPath, filePath);
          }
        }

        const text = await readTextFile(resolvedPath);
        // Get first 300 chars as preview
        setContent(text.slice(0, 300));
      } catch (err) {
        console.error('Failed to load note:', err);
        setContent('无法加载笔记内容');
      }
    };

    loadContent();
  }, [filePath]);

  const handleClick = () => {
    if (filePath) {
      emit('open-file', { path: filePath });
    }
  };

  const color = getCanvasColor((data as any)?.color);

  const backgroundColor = color
    ? `${color}15`
    : 'var(--bg-primary)';

  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  return (
    <div
      className={`canvas-node canvas-note-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
        overflow: 'hidden',
      }}
    >
      <NodeResizer
        color={color || 'var(--accent)'}
        isVisible={selected}
        minWidth={150}
        minHeight={150}
        handleClassName="canvas-resize-handle"
      />

      <Handle type="target" position={Position.Top} id="top" className="canvas-handle" />
      <Handle type="target" position={Position.Left} id="left" className="canvas-handle" />
      <Handle type="source" position={Position.Right} id="right" className="canvas-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="canvas-handle" />

      <div className="canvas-note-header" onClick={handleClick} style={{ cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span className="canvas-note-title">{title}</span>
      </div>

      <div className="canvas-note-content">
        {content ? (
          <div className="canvas-note-preview">{content}</div>
        ) : (
          <span className="canvas-placeholder">加载中...</span>
        )}
      </div>
    </div>
  );
}

export default memo(NoteNode);
