import { useState, useEffect, memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { emit } from '@tauri-apps/api/event';
import { getCanvasColor } from '../canvas-utils';

function FileNode({ data, selected }: NodeProps) {
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');

  const filePath = (data as any)?.file || '';
  const subpath = (data as any)?.subpath || '';

  useEffect(() => {
    if (!filePath) return;

    // Extract filename from path
    const name = filePath.split(/[/\\]/).pop() || filePath;
    setFileName(name);

    // Try to load file content for preview
    const loadContent = async () => {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const text = await readTextFile(filePath);
        // Show first 500 chars as preview
        setContent(text.slice(0, 500));
      } catch {
        setContent('无法加载文件内容');
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

  // Calculate background: light tint of the color, or default
  const backgroundColor = color
    ? `${color}15` // 15 = ~8% opacity in hex
    : 'var(--bg-primary)';

  // Calculate border color: use node color if set, otherwise accent when selected
  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  return (
    <div
      className={`canvas-node canvas-file-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="canvas-handle" />
      <Handle type="target" position={Position.Left} id="left" className="canvas-handle" />
      <Handle type="source" position={Position.Right} id="right" className="canvas-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="canvas-handle" />

      <div className="canvas-node-header" onClick={handleClick} style={{ cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="canvas-file-name" title={filePath}>
          {fileName || '未选择文件'}
        </span>
        {subpath && <span className="canvas-file-subpath">{subpath}</span>}
      </div>

      <div className="canvas-node-content canvas-file-content">
        {content ? (
          <pre className="canvas-file-preview">{content}</pre>
        ) : (
          <span className="canvas-placeholder">点击选择文件</span>
        )}
      </div>
    </div>
  );
}

export default memo(FileNode);
