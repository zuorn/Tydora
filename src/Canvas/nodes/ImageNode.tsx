import { useState, useEffect, memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getCanvasColor } from '../canvas-utils';

function ImageNode({ data, selected }: NodeProps) {
  const [imageSrc, setImageSrc] = useState('');
  const filePath = (data as any)?.file || '';

  useEffect(() => {
    if (!filePath) return;

    // Convert file path to local-file:// URI
    const normalizedPath = filePath.replace(/\\/g, '/');
    setImageSrc(`local-file://${normalizedPath}`);
  }, [filePath]);

  const color = getCanvasColor((data as any)?.color);

  return (
    <div
      className={`canvas-node canvas-image-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: color || 'var(--bg-primary)',
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="canvas-handle" />
      <Handle type="target" position={Position.Left} id="left" className="canvas-handle" />
      <Handle type="source" position={Position.Right} id="right" className="canvas-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="canvas-handle" />

      {imageSrc ? (
        <img
          src={imageSrc}
          alt={(data as any)?.file || 'image'}
          className="canvas-image-display"
          onError={() => setImageSrc('')}
        />
      ) : (
        <div className="canvas-image-placeholder">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="canvas-placeholder">拖入图片文件</span>
        </div>
      )}
    </div>
  );
}

export default memo(ImageNode);
