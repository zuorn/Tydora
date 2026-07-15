import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getCanvasColor } from '../canvas-utils';
import { useNearestEdge } from '../useNearestEdge';

function UrlNode({ data, selected }: NodeProps) {
  const url = (data as any)?.url || '';
  const label = (data as any)?.label || '';
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();

  const handleOpenUrl = () => {
    if (url) {
      // Use Tauri to open URL in default browser
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('open_url', { url });
      });
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
      ref={nodeRef}
      className={`canvas-node canvas-url-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      <div className="canvas-node-header" onClick={handleOpenUrl} style={{ cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        <span className="canvas-url-label">
          {label || url || '未设置 URL'}
        </span>
      </div>

      <div className="canvas-node-content canvas-url-content">
        {url ? (
          <div className="canvas-url-display">
            <div className="canvas-url-favicon">
              <img
                src={`https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`}
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <span className="canvas-url-text">{url}</span>
          </div>
        ) : (
          <span className="canvas-placeholder">输入 URL</span>
        )}
      </div>
    </div>
  );
}

export default memo(UrlNode);
