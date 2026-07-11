import { memo, useState, useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { getCanvasColor } from '../canvas-utils';

function CanvasEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelText, setLabelText] = useState((data as any)?.label || '');

  const color = getCanvasColor((data as any)?.color);
  const edgeColor = selected ? 'var(--accent)' : (color || 'var(--text-secondary)');
  const fromEnd = (data as any)?.fromEnd || 'none';
  const toEnd = (data as any)?.toEnd || 'arrow';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleLabelDoubleClick = useCallback(() => {
    setIsEditingLabel(true);
  }, []);

  const handleLabelBlur = useCallback(() => {
    setIsEditingLabel(false);
    if (data) {
      (data as any).label = labelText;
    }
  }, [labelText, data]);

  const handleLabelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditingLabel(false);
      setLabelText((data as any)?.label || '');
    }
  }, [data]);

  return (
    <>
      {/* SVG marker definitions for arrows */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker
            id={`arrowhead-${id}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={edgeColor} />
          </marker>
          <marker
            id={`arrowhead-start-${id}`}
            markerWidth="10"
            markerHeight="7"
            refX="1"
            refY="3.5"
            orient="auto"
          >
            <polygon points="10 0, 0 3.5, 10 7" fill={edgeColor} />
          </marker>
        </defs>
      </svg>

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth: selected ? 2.5 : 2,
          opacity: selected ? 1 : 0.7,
        }}
        markerEnd={toEnd === 'arrow' ? `url(#arrowhead-${id})` : undefined}
        markerStart={fromEnd === 'arrow' ? `url(#arrowhead-start-${id})` : undefined}
      />

      <EdgeLabelRenderer>
        {(labelText || isEditingLabel) && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="canvas-edge-label"
            onDoubleClick={handleLabelDoubleClick}
          >
            {isEditingLabel ? (
              <input
                className="canvas-edge-label-input"
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                onBlur={handleLabelBlur}
                onKeyDown={handleLabelKeyDown}
                autoFocus
              />
            ) : (
              <span className="canvas-edge-label-text">{labelText}</span>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(CanvasEdge);
