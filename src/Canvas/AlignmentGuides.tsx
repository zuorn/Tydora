import { useMemo } from 'react';

interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface AlignmentGuidesProps {
  draggedNodeId: string | null;
  nodePositions: Map<string, { x: number; y: number; width: number; height: number }>;
  viewport: { x: number; y: number; zoom: number };
}

const SNAP_THRESHOLD = 5; // in flow coordinates

export default function AlignmentGuides({ draggedNodeId, nodePositions, viewport }: AlignmentGuidesProps) {
  const guides = useMemo(() => {
    if (!draggedNodeId || nodePositions.size < 2) return [];

    const draggedNode = nodePositions.get(draggedNodeId);
    if (!draggedNode) return [];

    const result: AlignmentGuide[] = [];

    // Calculate dragged node's key points in flow coordinates
    const draggedLeft = draggedNode.x;
    const draggedRight = draggedNode.x + draggedNode.width;
    const draggedTop = draggedNode.y;
    const draggedBottom = draggedNode.y + draggedNode.height;
    const draggedCenterX = draggedNode.x + draggedNode.width / 2;
    const draggedCenterY = draggedNode.y + draggedNode.height / 2;

    // Check alignment with other nodes
    nodePositions.forEach((otherNode, otherId) => {
      if (otherId === draggedNodeId) return;

      const otherLeft = otherNode.x;
      const otherRight = otherNode.x + otherNode.width;
      const otherTop = otherNode.y;
      const otherBottom = otherNode.y + otherNode.height;
      const otherCenterX = otherNode.x + otherNode.width / 2;
      const otherCenterY = otherNode.y + otherNode.height / 2;

      // Vertical alignment (left, center, right)
      // Left edge alignment
      if (Math.abs(draggedLeft - otherLeft) < SNAP_THRESHOLD) {
        result.push({
          type: 'vertical',
          position: otherLeft,
          startX: otherLeft,
          startY: Math.min(draggedTop, otherTop),
          endX: otherLeft,
          endY: Math.max(draggedBottom, otherBottom),
        });
      }
      // Right edge alignment
      if (Math.abs(draggedRight - otherRight) < SNAP_THRESHOLD) {
        result.push({
          type: 'vertical',
          position: otherRight,
          startX: otherRight,
          startY: Math.min(draggedTop, otherTop),
          endX: otherRight,
          endY: Math.max(draggedBottom, otherBottom),
        });
      }
      // Center X alignment
      if (Math.abs(draggedCenterX - otherCenterX) < SNAP_THRESHOLD) {
        result.push({
          type: 'vertical',
          position: otherCenterX,
          startX: otherCenterX,
          startY: Math.min(draggedTop, otherTop),
          endX: otherCenterX,
          endY: Math.max(draggedBottom, otherBottom),
        });
      }
      // Left-Right alignment (dragged left aligns with other right)
      if (Math.abs(draggedLeft - otherRight) < SNAP_THRESHOLD) {
        result.push({
          type: 'vertical',
          position: otherRight,
          startX: otherRight,
          startY: Math.min(draggedTop, otherTop),
          endX: otherRight,
          endY: Math.max(draggedBottom, otherBottom),
        });
      }
      // Right-Left alignment (dragged right aligns with other left)
      if (Math.abs(draggedRight - otherLeft) < SNAP_THRESHOLD) {
        result.push({
          type: 'vertical',
          position: otherLeft,
          startX: otherLeft,
          startY: Math.min(draggedTop, otherTop),
          endX: otherLeft,
          endY: Math.max(draggedBottom, otherBottom),
        });
      }

      // Horizontal alignment (top, center, bottom)
      // Top edge alignment
      if (Math.abs(draggedTop - otherTop) < SNAP_THRESHOLD) {
        result.push({
          type: 'horizontal',
          position: otherTop,
          startX: Math.min(draggedLeft, otherLeft),
          startY: otherTop,
          endX: Math.max(draggedRight, otherRight),
          endY: otherTop,
        });
      }
      // Bottom edge alignment
      if (Math.abs(draggedBottom - otherBottom) < SNAP_THRESHOLD) {
        result.push({
          type: 'horizontal',
          position: otherBottom,
          startX: Math.min(draggedLeft, otherLeft),
          startY: otherBottom,
          endX: Math.max(draggedRight, otherRight),
          endY: otherBottom,
        });
      }
      // Center Y alignment
      if (Math.abs(draggedCenterY - otherCenterY) < SNAP_THRESHOLD) {
        result.push({
          type: 'horizontal',
          position: otherCenterY,
          startX: Math.min(draggedLeft, otherLeft),
          startY: otherCenterY,
          endX: Math.max(draggedRight, otherRight),
          endY: otherCenterY,
        });
      }
      // Top-Bottom alignment (dragged top aligns with other bottom)
      if (Math.abs(draggedTop - otherBottom) < SNAP_THRESHOLD) {
        result.push({
          type: 'horizontal',
          position: otherBottom,
          startX: Math.min(draggedLeft, otherLeft),
          startY: otherBottom,
          endX: Math.max(draggedRight, otherRight),
          endY: otherBottom,
        });
      }
      // Bottom-Top alignment (dragged bottom aligns with other top)
      if (Math.abs(draggedBottom - otherTop) < SNAP_THRESHOLD) {
        result.push({
          type: 'horizontal',
          position: otherTop,
          startX: Math.min(draggedLeft, otherLeft),
          startY: otherTop,
          endX: Math.max(draggedRight, otherRight),
          endY: otherTop,
        });
      }
    });

    return result;
  }, [draggedNodeId, nodePositions]);

  if (guides.length === 0) return null;

  // Convert flow coordinates to screen coordinates
  // ReactFlow viewport: screenX = flowX * zoom + x, screenY = flowY * zoom + y
  const flowToScreen = (flowX: number, flowY: number) => ({
    x: flowX * viewport.zoom + viewport.x,
    y: flowY * viewport.zoom + viewport.y,
  });

  return (
    <svg
      className="alignment-guides"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
        overflow: 'visible',
      }}
    >
      {guides.map((guide, index) => {
        const start = flowToScreen(guide.startX, guide.startY);
        const end = flowToScreen(guide.endX, guide.endY);

        return (
          <line
            key={index}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="#6366f1"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        );
      })}
    </svg>
  );
}
