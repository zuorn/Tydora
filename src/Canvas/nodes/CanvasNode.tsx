import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { emit } from '@tauri-apps/api/event';
import { getCanvasColor, resolveFilePath } from '../canvas-utils';
import { CANVAS_COLORS } from '../canvas-utils';
import { useNearestEdge } from '../useNearestEdge';
import { useCanvasZoom, shouldHideContent } from '../CanvasZoomContext';

interface CanvasData {
  nodes?: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
  }>;
  edges?: Array<{
    fromNode: string;
    toNode: string;
  }>;
}

function CanvasNode({ data, selected }: NodeProps) {
  const [title, setTitle] = useState('');
  const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();
  const [isHovered, setIsHovered] = useState(false);
  const handleNodeMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleNodeMouseLeave = useCallback(() => { setIsHovered(false); handleMouseLeave(); }, [handleMouseLeave]);
  const { zoom, hideContentThreshold } = useCanvasZoom();
  const hideContent = shouldHideContent(zoom, hideContentThreshold);

  const filePath = (data as any)?.file || '';

  // Get vault path from localStorage
  const getVaultPath = (): string => {
    try {
      const raw = localStorage.getItem('zmd-vaults');
      const activeIndex = parseInt(localStorage.getItem('zmd-active-vault') || '-1');
      if (raw && activeIndex >= 0) {
        const vaults = JSON.parse(raw);
        return vaults[activeIndex]?.path || '';
      }
    } catch {}
    return '';
  };

  useEffect(() => {
    if (!filePath) return;

    // Extract title from filename
    const name = filePath.split(/[/\\]/).pop() || filePath;
    setTitle(name.replace(/\.canvas$/i, ''));

    const loadCanvasInfo = async () => {
      try {
        let resolvedPath = filePath;
        if (!filePath.match(/^[A-Z]:\\/i) && !filePath.startsWith('/')) {
          const vaultPath = getVaultPath();
          if (vaultPath) {
            resolvedPath = resolveFilePath(vaultPath, filePath);
          }
        }

        const text = await readTextFile(resolvedPath);
        const canvas = JSON.parse(text);
        setCanvasData(canvas);
      } catch (err) {
        console.error('Failed to load canvas info:', err);
      }
    };

    loadCanvasInfo();
  }, [filePath]);

  // Calculate preview bounds and render
  const preview = useMemo(() => {
    if (!canvasData?.nodes || canvasData.nodes.length === 0) {
      return null;
    }

    const nodes = canvasData.nodes;
    const edges = canvasData.edges || [];

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });

    // Add padding
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    // Create a map of node id to index for edge lookup
    const nodeIdToIndex = new Map<string, number>();
    nodes.forEach((node, index) => {
      nodeIdToIndex.set(node.id, index);
    });

    // Pre-compute resolved edges for rendering
    const resolvedEdges: Array<{
      fromX: number; fromY: number;
      toX: number; toY: number;
      fromNode: typeof nodes[0]; toNode: typeof nodes[0];
    }> = [];

    edges.forEach(edge => {
      const fromIdx = nodeIdToIndex.get(edge.fromNode);
      const toIdx = nodeIdToIndex.get(edge.toNode);
      if (fromIdx === undefined || toIdx === undefined) return;

      const fromNode = nodes[fromIdx];
      const toNode = nodes[toIdx];
      resolvedEdges.push({
        fromX: fromNode.x + fromNode.width / 2,
        fromY: fromNode.y + fromNode.height / 2,
        toX: toNode.x + toNode.width / 2,
        toY: toNode.y + toNode.height / 2,
        fromNode,
        toNode,
      });
    });

    return { nodes, edges: resolvedEdges, minX, minY, width, height, edgeCount: edges.length, resolvedCount: resolvedEdges.length };
  }, [canvasData]);

  const handleDoubleClick = useCallback(() => {
    if (filePath) {
      let resolvedPath = filePath;
      if (!filePath.match(/^[A-Z]:\\/i) && !filePath.startsWith('/')) {
        const vaultPath = getVaultPath();
        if (vaultPath) {
          resolvedPath = resolveFilePath(vaultPath, filePath);
        }
      }
      emit('open-file', { path: resolvedPath });
    }
  }, [filePath]);

  const color = getCanvasColor((data as any)?.color);

  const backgroundColor = color
    ? `${color}15`
    : 'var(--bg-primary)';

  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  return (
    <div
      ref={nodeRef}
      className={`canvas-node canvas-embed-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
        overflow: 'hidden',
      }}
      onMouseEnter={handleNodeMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleNodeMouseLeave}
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        isVisible={selected || isHovered}
        minWidth={150}
        minHeight={100}
        handleClassName="canvas-resize-handle"
      />

      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      <div className="canvas-embed-header" style={{ cursor: 'pointer' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <span className="canvas-embed-title">{title}</span>
      </div>

      <div className="canvas-embed-content" style={{ cursor: 'pointer' }}>
        {hideContent ? (
          <div className="canvas-node-content-placeholder" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.5,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </div>
        ) : preview ? (
          <svg
            className="canvas-embed-preview"
            viewBox={`${preview.minX} ${preview.minY} ${preview.width} ${preview.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Render edges - pre-resolved */}
            {preview.edges.map((edge, i) => {
              const midX = (edge.fromX + edge.toX) / 2;
              const midY = (edge.fromY + edge.toY) / 2;
              const ctrlOffset = Math.min(Math.abs(edge.toX - edge.fromX), Math.abs(edge.toY - edge.fromY)) * 0.3;

              return (
                <path
                  key={`edge-${i}`}
                  d={`M ${edge.fromX} ${edge.fromY} Q ${midX + ctrlOffset} ${midY - ctrlOffset} ${edge.toX} ${edge.toY}`}
                  fill="none"
                  stroke="#888"
                  strokeWidth={2}
                  opacity={0.8}
                />
              );
            })}

            {/* Render nodes */}
            {preview.nodes.map((node, i) => (
              <rect
                key={`node-${i}`}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                fill={node.color ? (CANVAS_COLORS[node.color] || '#e0e0e0') : '#ffffff'}
                stroke={node.color ? (CANVAS_COLORS[node.color] || '#ccc') : '#ccc'}
                strokeWidth={node.color ? 2 : 0.5}
                rx={4}
                opacity={0.95}
              />
            ))}

            {/* Debug: edge count badge */}
            <text
              x={preview.minX + 5}
              y={preview.minY + 14}
              fontSize="10"
              fill="red"
              fontFamily="monospace"
            >
              {preview.resolvedCount}/{preview.edgeCount} edges
            </text>
          </svg>
        ) : (
          <div className="canvas-embed-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span>{canvasData?.nodes?.length || 0} 个节点</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(CanvasNode);
