import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from './canvas-store';

interface AlignmentToolbarProps {
  selectedNodeIds: string[];
  onClose: () => void;
}

export default function AlignmentToolbar({ selectedNodeIds, onClose }: AlignmentToolbarProps) {
  const { getNodes } = useReactFlow();
  const setNodes = useCanvasStore((s) => s.setNodes);

  const alignNodes = useCallback((alignment: 'left' | 'centerHorizontal' | 'right' | 'top' | 'centerVertical' | 'bottom') => {
    const allNodes = getNodes();
    const selectedNodes = allNodes.filter(n => selectedNodeIds.includes(n.id));

    if (selectedNodes.length < 2) return;

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of selectedNodes) {
      const x = node.position.x;
      const y = node.position.y;
      const width = node.measured?.width || 400;
      const height = node.measured?.height || 200;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + width);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + height);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Update positions
    const updatedNodes = allNodes.map(n => {
      if (!selectedNodeIds.includes(n.id)) return n;

      const width = n.measured?.width || 400;
      const height = n.measured?.height || 200;

      let newX = n.position.x;
      let newY = n.position.y;

      switch (alignment) {
        case 'left':
          newX = minX;
          break;
        case 'centerHorizontal':
          newX = centerX - width / 2;
          break;
        case 'right':
          newX = maxX - width;
          break;
        case 'top':
          newY = minY;
          break;
        case 'centerVertical':
          newY = centerY - height / 2;
          break;
        case 'bottom':
          newY = maxY - height;
          break;
      }

      return { ...n, position: { x: newX, y: newY } };
    });

    setNodes(updatedNodes);
    onClose();
  }, [selectedNodeIds, getNodes, setNodes, onClose]);

  return (
    <div className="alignment-toolbar">
      <div className="alignment-toolbar-buttons">
        {/* Horizontal alignment */}
        <button
          className="alignment-toolbar-btn"
          title="左对齐"
          onClick={() => alignNodes('left')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="4" x2="4" y2="20" />
            <rect x="8" y="6" width="12" height="4" fill="currentColor" opacity="0.3" />
            <rect x="8" y="14" width="8" height="4" fill="currentColor" opacity="0.3" />
          </svg>
        </button>

        <button
          className="alignment-toolbar-btn"
          title="水平居中"
          onClick={() => alignNodes('centerHorizontal')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="4" x2="12" y2="20" />
            <rect x="6" y="6" width="12" height="4" fill="currentColor" opacity="0.3" />
            <rect x="8" y="14" width="8" height="4" fill="currentColor" opacity="0.3" />
          </svg>
        </button>

        <button
          className="alignment-toolbar-btn"
          title="右对齐"
          onClick={() => alignNodes('right')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="20" y1="4" x2="20" y2="20" />
            <rect x="4" y="6" width="12" height="4" fill="currentColor" opacity="0.3" />
            <rect x="8" y="14" width="8" height="4" fill="currentColor" opacity="0.3" />
          </svg>
        </button>

        <div className="alignment-toolbar-divider" />

        {/* Vertical alignment */}
        <button
          className="alignment-toolbar-btn"
          title="顶对齐"
          onClick={() => alignNodes('top')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="4" x2="20" y2="4" />
            <rect x="6" y="8" width="4" height="12" fill="currentColor" opacity="0.3" />
            <rect x="14" y="8" width="4" height="8" fill="currentColor" opacity="0.3" />
          </svg>
        </button>

        <button
          className="alignment-toolbar-btn"
          title="垂直居中"
          onClick={() => alignNodes('centerVertical')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="12" x2="20" y2="12" />
            <rect x="6" y="6" width="4" height="12" fill="currentColor" opacity="0.3" />
            <rect x="14" y="8" width="4" height="8" fill="currentColor" opacity="0.3" />
          </svg>
        </button>

        <button
          className="alignment-toolbar-btn"
          title="底对齐"
          onClick={() => alignNodes('bottom')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="20" x2="20" y2="20" />
            <rect x="6" y="4" width="4" height="12" fill="currentColor" opacity="0.3" />
            <rect x="14" y="8" width="4" height="8" fill="currentColor" opacity="0.3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
