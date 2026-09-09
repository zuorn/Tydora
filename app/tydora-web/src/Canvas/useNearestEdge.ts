import { useState, useCallback, useRef } from 'react';

type EdgePosition = 'top' | 'bottom' | 'left' | 'right' | null;

export function useNearestEdge() {
  const [activeEdge, setActiveEdge] = useState<EdgePosition>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const node = nodeRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    // Distance to each edge
    const distTop = y;
    const distBottom = height - y;
    const distLeft = x;
    const distRight = width - x;

    // Threshold: only show handle if mouse is within 20px of edge
    const threshold = 20;
    const minDist = Math.min(distTop, distBottom, distLeft, distRight);

    if (minDist > threshold) {
      setActiveEdge(null);
      return;
    }

    if (minDist === distTop) setActiveEdge('top');
    else if (minDist === distBottom) setActiveEdge('bottom');
    else if (minDist === distLeft) setActiveEdge('left');
    else setActiveEdge('right');
  }, []);

  const handleMouseLeave = useCallback(() => {
    setActiveEdge(null);
  }, []);

  return {
    nodeRef,
    activeEdge,
    handleMouseMove,
    handleMouseLeave,
  };
}

export type { EdgePosition };
