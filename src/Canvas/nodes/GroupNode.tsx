import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getCanvasColor } from '../canvas-utils';
import { useNearestEdge } from '../useNearestEdge';

function GroupNode({ data, selected }: NodeProps) {
  const label = (data as any)?.label || '';
  const color = getCanvasColor((data as any)?.color);
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();

  return (
    <div
      ref={nodeRef}
      className={`canvas-node canvas-group-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: color ? `${color}15` : 'rgba(128, 128, 128, 0.1)',
        borderColor: selected ? 'var(--accent)' : (color || 'var(--border)'),
        borderStyle: 'dashed',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      {label && (
        <div className="canvas-group-label">
          {label}
        </div>
      )}
    </div>
  );
}

export default memo(GroupNode);
