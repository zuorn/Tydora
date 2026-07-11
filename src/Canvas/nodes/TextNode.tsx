import { useState, useCallback, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { getCanvasColor } from '../canvas-utils';

function TextNode({ data, selected }: NodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState((data as any)?.text || '');

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    (data as any).text = text;
  }, [text, data]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
      (data as any).text = text;
    }
  }, [text, data]);

  const color = getCanvasColor((data as any)?.color);

  // Calculate background: light tint of the color, or default
  const backgroundColor = color
    ? `${color}15` // 15 = ~8% opacity in hex
    : 'var(--bg-primary)';

  // Calculate border color: use node color if set, otherwise accent when selected
  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  return (
    <div
      className={`canvas-node canvas-text-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Node Resizer - only shows when selected */}
      <NodeResizer
        color={color || 'var(--accent)'}
        isVisible={selected}
        minWidth={100}
        minHeight={60}
        handleClassName="canvas-resize-handle"
      />

      <Handle type="target" position={Position.Top} id="top" className="canvas-handle" />
      <Handle type="target" position={Position.Left} id="left" className="canvas-handle" />
      <Handle type="source" position={Position.Right} id="right" className="canvas-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="canvas-handle" />

      <div className="canvas-node-content">
        {isEditing ? (
          <textarea
            className="canvas-text-edit"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="输入 Markdown 内容..."
          />
        ) : (
          <div className="canvas-text-preview">
            {text || <span className="canvas-placeholder">双击编辑</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TextNode);
