import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { emit } from '@tauri-apps/api/event';
import { getCanvasColor, resolveFilePath } from '../canvas-utils';
import { CANVAS_COLORS } from '../canvas-utils';
import { useNearestEdge } from '../useNearestEdge';

interface CanvasData {
  nodes?: Array<{
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
    const nodeIndexMap = new Map<string, number>();
    nodes.forEach((_node, index) => {
      nodeIndexMap.set(`node-${index}`, index);
    });

    return { nodes, edges, minX, minY, width, height, nodeIndexMap };
  }, [canvasData]);

  const handleClick = () => {
    if (filePath) {
      emit('open-file', { path: filePath });
    }
  };

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

      <div className="canvas-embed-header" onClick={handleClick} style={{ cursor: 'pointer' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <span className="canvas-embed-title">{title}</span>
      </div>

      <div className="canvas-embed-content" onClick={handleClick} style={{ cursor: 'pointer' }}>
        {preview ? (
          <svg
            className="canvas-embed-preview"
            viewBox={`${preview.minX} ${preview.minY} ${preview.width} ${preview.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Render edges */}
            {preview.edges.map((edge, i) => {
              const fromIdx = preview.nodeIndexMap.get(edge.fromNode);
              const toIdx = preview.nodeIndexMap.get(edge.toNode);
              if (fromIdx === undefined || toIdx === undefined) return null;
              
              const fromNode = preview.nodes[fromIdx];
              const toNode = preview.nodes[toIdx];
              
              const fromX = fromNode.x + fromNode.width / 2;
              const fromY = fromNode.y + fromNode.height / 2;
              const toX = toNode.x + toNode.width / 2;
              const toY = toNode.y + toNode.height / 2;
              
              return (
                <line
                  key={`edge-${i}`}
                  x1={fromX}
                  y1={fromY}
                  x2={toX}
                  y2={toY}
                  stroke="#999"
                  strokeWidth={1}
                  opacity={0.5}
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
                fill={CANVAS_COLORS[node.color || ''] || '#e0e0e0'}
                stroke="#ccc"
                strokeWidth={0.5}
                rx={4}
              />
            ))}
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
