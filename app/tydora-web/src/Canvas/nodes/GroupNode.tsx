import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { getCanvasColor } from '../canvas-utils';
import { useCanvasStore } from '../canvas-store';
import { useNearestEdge } from '../useNearestEdge';

function GroupNode({ data, selected, id }: NodeProps) {
  const label = (data as any)?.label || '';
  const color = getCanvasColor((data as any)?.color);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();
  const [isHovered, setIsHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleNodeMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleNodeMouseLeave = useCallback(() => { setIsHovered(false); handleMouseLeave(); }, [handleMouseLeave]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(label);
    setEditing(true);
  }, [label]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (id && trimmed !== label) {
      updateNodeData(id, { label: trimmed });
    }
  }, [id, editValue, label, updateNodeData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  }, [commitEdit]);

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
      onMouseEnter={handleNodeMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleNodeMouseLeave}
    >
      <NodeResizer
        isVisible={selected || isHovered}
        minWidth={150}
        minHeight={100}
        handleClassName="canvas-resize-handle"
        lineClassName="canvas-resize-line"
      />

      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      {(label || editing) && (
        <div
          className="canvas-group-label"
          onDoubleClick={handleDoubleClick}
          style={color ? {
            background: color,
            color: '#fff',
            borderColor: color,
          } : undefined}
        >
          {editing ? (
            <input
              ref={inputRef}
              className="canvas-group-label-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            />
          ) : (
            label
          )}
        </div>
      )}
    </div>
  );
}

export default memo(GroupNode);
