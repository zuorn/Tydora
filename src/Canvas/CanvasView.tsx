import { useCallback, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useReactFlow,
  useStoreApi,
  type Node,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TextNode from './nodes/TextNode';
import { loadCanvasSettings } from './canvas-settings';
import FileNode from './nodes/FileNode';
import NoteNode from './nodes/NoteNode';
import MediaNode from './nodes/MediaNode';
import CanvasNode from './nodes/CanvasNode';
import UrlNode from './nodes/UrlNode';
import ImageNode from './nodes/ImageNode';
import GroupNode from './nodes/GroupNode';
import CanvasEdge from './edges/CanvasEdge';
import CanvasToolbar from './CanvasToolbar';
import CanvasContextMenu from './CanvasContextMenu';
import NodeToolbar from './NodeToolbar';
import AlignmentToolbar from './AlignmentToolbar';
import AlignmentGuides from './AlignmentGuides';
import UndoRedoPanel from './UndoRedoPanel';
import { useCanvasStore, scheduleAutoSave } from './canvas-store';
import { saveImageToLocal, loadImageSettings, type ImageSettings } from '../services';

// Register custom node types
const nodeTypes = {
  textNode: TextNode,
  fileNode: FileNode,
  noteNode: NoteNode,
  mediaNode: MediaNode,
  canvasNode: CanvasNode,
  urlNode: UrlNode,
  linkNode: UrlNode,
  imageNode: ImageNode,
  groupNode: GroupNode,
};

const edgeTypes = {
  canvasEdge: CanvasEdge,
};

// Default edge options
const defaultEdgeOptions = {
  type: 'canvasEdge',
  data: {
    fromSide: 'right',
    toSide: 'left',
    fromEnd: 'none',
    toEnd: 'arrow',
    label: '',
  },
};

interface CanvasViewProps {
  onNodeClick?: (nodeId: string, filePath: string) => void;
}

export default function CanvasView({ onNodeClick }: CanvasViewProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes, getViewport, fitView } = useReactFlow();
  const [canvasSettings] = useState(loadCanvasSettings);
  const storeApi = useStoreApi();

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const addNode = useCanvasStore((s) => s.addNode);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const copySelected = useCanvasStore((s) => s.copySelected);
  const paste = useCanvasStore((s) => s.paste);
  const vaultPath = useCanvasStore((s) => s.vaultPath);
  const filePath = useCanvasStore((s) => s.filePath);
  const startGroupDrag = useCanvasStore((s) => s.startGroupDrag);
  const stopGroupDrag = useCanvasStore((s) => s.stopGroupDrag);

  // Fit view when canvas file changes
  useEffect(() => {
    if (!filePath) return;
    // Wait for nodes to render, then fit view
    const timer = setTimeout(() => {
      fitView({ padding: 0.1, duration: 0 });
    }, 50);
    return () => clearTimeout(timer);
  }, [filePath, fitView]);

  // Update node positions for alignment guides
  useEffect(() => {
    const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
    nodes.forEach(node => {
      positions.set(node.id, {
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width || (node.style?.width as number) || 400,
        height: node.measured?.height || (node.style?.height as number) || 200,
      });
    });
    setNodePositions(positions);
  }, [nodes]);

  // Handle node drag start — hide toolbar during drag
  const onNodeDragStart = useCallback((_: any, node: Node) => {
    setDraggedNodeId(node.id);
    setSelectedNodeId(null);
    setToolbarPosition(null);
    // Start group drag tracking if dragging a group node
    if (node.type === 'groupNode') {
      startGroupDrag(node.id);
    }
  }, [startGroupDrag]);

  // Handle node drag stop — show toolbar at new position
  const onNodeDragStop = useCallback((_: any, node: Node) => {
    setDraggedNodeId(null);
    // Stop group drag tracking
    stopGroupDrag();
    // Recalculate toolbar position after drag
    const viewport = getViewport();
    const nodeScreenX = node.position.x * viewport.zoom + viewport.x;
    const nodeScreenY = node.position.y * viewport.zoom + viewport.y;
    setSelectedNodeId(node.id);
    setToolbarPosition({
      x: nodeScreenX + (node.measured?.width || 400) * viewport.zoom / 2,
      y: nodeScreenY - 10,
    });
  }, [getViewport, stopGroupDrag]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Node toolbar state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);

  // Alignment toolbar state
  const [showAlignmentToolbar, setShowAlignmentToolbar] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  // Alignment guides state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());

  // Connection drag state - for showing handles during drag
  const [connecting, setConnecting] = useState(false);

  // Right-click drag panning state
  const isRightDragging = useRef(false);
  const lastRightMousePos = useRef({ x: 0, y: 0 });
  const accumulatedDelta = useRef({ x: 0, y: 0 });
  const panRafId = useRef<number | null>(null);

  // Manual right-click drag panning on nodes (React Flow's panOnDrag only pans on pane).
  // Uses capture-phase mousedown to intercept before React Flow, and RAF-batched panBy
  // for smooth 60fps panning matching React Flow's native feel.
  useEffect(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      const target = e.target as HTMLElement;
      // Only intercept right-click on nodes — pane panning is handled by React Flow
      if (!target.closest('.react-flow__node')) return;
      isRightDragging.current = true;
      lastRightMousePos.current = { x: e.clientX, y: e.clientY };
      accumulatedDelta.current = { x: 0, y: 0 };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isRightDragging.current) return;
      accumulatedDelta.current.x += e.clientX - lastRightMousePos.current.x;
      accumulatedDelta.current.y += e.clientY - lastRightMousePos.current.y;
      lastRightMousePos.current = { x: e.clientX, y: e.clientY };

      if (!panRafId.current) {
        panRafId.current = requestAnimationFrame(() => {
          const panBy = storeApi.getState().panBy;
          panBy?.({ x: accumulatedDelta.current.x, y: accumulatedDelta.current.y });
          accumulatedDelta.current = { x: 0, y: 0 };
          panRafId.current = null;
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        isRightDragging.current = false;
        accumulatedDelta.current = { x: 0, y: 0 };
      }
    };

    // Capture phase ensures we see the event before React Flow processes it
    wrapper.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      wrapper.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (panRafId.current) cancelAnimationFrame(panRafId.current);
    };
  }, [storeApi]);

  // Hide toolbar when the selected node is deleted
  useEffect(() => {
    if (selectedNodeId && !nodes.find(n => n.id === selectedNodeId)) {
      setSelectedNodeId(null);
      setToolbarPosition(null);
    }
  }, [nodes, selectedNodeId]);

  // Handle connection start - track that user is dragging a connection
  const onConnectStart = useCallback((_: any, __: any) => {
    setConnecting(true);
  }, []);

  // Handle connection end - proximity connect to node edge
  const onConnectEnd = useCallback(
    (event: MouseEvent | React.MouseEvent | TouchEvent, connectionState: any) => {
      setConnecting(false);

      // If the connection was already made (snapped to a handle), do nothing
      if (connectionState.isValid) return;

      const { source, sourceHandle } = connectionState;
      if (!source) return;

      // Get client coordinates from either MouseEvent or TouchEvent
      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;

      // Convert mouse position to flow coordinates
      const position = screenToFlowPosition({
        x: clientX,
        y: clientY,
      });

      // Find the nearest node edge within snap distance
      const allNodes = getNodes();
      const SNAP_DISTANCE = 30; // pixels in flow space

      let bestNode: Node | null = null;
      let bestHandle = '';
      let bestDistance = Infinity;

      for (const node of allNodes) {
        if (node.id === source) continue;

        const width = node.measured?.width || (node.style?.width as number) || 400;
        const height = node.measured?.height || (node.style?.height as number) || 200;
        const x = node.position.x;
        const y = node.position.y;

        // Calculate distance to each edge and the corresponding handle
        const edges = [
          { handle: 'left', dist: Math.abs(position.x - x), point: { x: x, y: Math.min(Math.max(position.y, y), y + height) } },
          { handle: 'right', dist: Math.abs(position.x - (x + width)), point: { x: x + width, y: Math.min(Math.max(position.y, y), y + height) } },
          { handle: 'top', dist: Math.abs(position.y - y), point: { x: Math.min(Math.max(position.x, x), x + width), y: y } },
          { handle: 'bottom', dist: Math.abs(position.y - (y + height)), point: { x: Math.min(Math.max(position.x, x), x + width), y: y + height } },
        ];

        for (const edge of edges) {
          if (edge.dist < bestDistance && edge.dist < SNAP_DISTANCE) {
            bestDistance = edge.dist;
            bestNode = node;
            bestHandle = edge.handle;
          }
        }
      }

      if (bestNode && bestHandle) {
        addEdge(source, bestNode.id, sourceHandle || 'right', bestHandle);
      }
    },
    [screenToFlowPosition, getNodes, addEdge]
  );

  // Handle new edge connections
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addEdge(
          connection.source,
          connection.target,
          connection.sourceHandle || 'right',
          connection.targetHandle || 'left'
        );
      }
    },
    [addEdge]
  );

  // Handle double-click to create text node
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Don't create node if double-clicking on an existing node or edge
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__node')) return;
      if (target.closest('.react-flow__edge')) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNode('text', position, { text: '' });
    },
    [screenToFlowPosition, addNode]
  );

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle pane context menu (right-click on empty area)
  // ReactFlow already prevents this when panOnDrag includes button 2
  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  // Prevent browser context menu on nodes so right-click drag panning works
  const onNodeContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
  }, []);

  // Handle node click - show toolbar
  const onNodeClickHandler = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // For file nodes, also open the file
      if (node.type === 'fileNode' && (node.data as any)?.file) {
        onNodeClick?.(node.id, (node.data as any).file);
      }

      // Get all selected nodes
      const allNodes = getNodes();
      const selectedNodes = allNodes.filter(n => n.selected);

      // If Shift is held, add to selection
      if (event.shiftKey) {
        const newSelectedIds = selectedNodes.map(n => n.id);
        if (!newSelectedIds.includes(node.id)) {
          newSelectedIds.push(node.id);
        }
        setSelectedNodeIds(newSelectedIds);
        setShowAlignmentToolbar(newSelectedIds.length >= 2);
        return;
      }

      // Single node selection
      setSelectedNodeIds([node.id]);
      setShowAlignmentToolbar(false);

      // Show toolbar above the node
      const currentNode = allNodes.find(n => n.id === node.id);
      if (currentNode) {
        const viewport = getViewport();
        const nodeScreenX = currentNode.position.x * viewport.zoom + viewport.x;
        const nodeScreenY = currentNode.position.y * viewport.zoom + viewport.y;

        setSelectedNodeId(node.id);
        setToolbarPosition({
          x: nodeScreenX + (currentNode.measured?.width || 400) * viewport.zoom / 2,
          y: nodeScreenY - 10,
        });
      }
    },
    [onNodeClick, getNodes, getViewport]
  );

  // Handle pane click - hide toolbar
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setToolbarPosition(null);
    setShowAlignmentToolbar(false);
    setSelectedNodeIds([]);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          copySelected(selectedNodes.map(n => n.id));
        }
      }
      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
        // Check if there's an active text input - if so, let default paste work
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        // For canvas paste, we need to check clipboard asynchronously
        // Use navigator.clipboard.read() to check for images and URLs
        navigator.clipboard.read().then(clipboardItems => {
          const hasImage = clipboardItems.some(item =>
            item.types.some(type => type.startsWith('image/'))
          );

          if (!hasImage) {
            // Check for URL text in clipboard
            navigator.clipboard.readText().then(text => {
              const trimmed = text?.trim();
              if (trimmed && /^((https?:\/\/)|(www\.)).+/i.test(trimmed)) {
                // URL detected - the window paste event handler will create a link node
                return;
              }
              // No URL, paste canvas nodes
              paste();
            }).catch(() => {
              // If readText fails, just paste canvas nodes
              paste();
            });
          }
          // If there's an image, the paste event handler will process it
        }).catch(() => {
          // If clipboard read fails, just paste canvas nodes
          paste();
        });
      }
      // Select All: Ctrl+A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const allNodeIds = nodes.map(n => n.id);
        setSelectedNodeIds(allNodeIds);
        // Update node selection state
        const updatedNodes = nodes.map(n => ({ ...n, selected: true }));
        useCanvasStore.getState().setNodes(updatedNodes);
      }
      // Escape: Deselect all
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setToolbarPosition(null);
        setShowAlignmentToolbar(false);
        setSelectedNodeIds([]);
        // Clear node selection
        const updatedNodes = nodes.map(n => ({ ...n, selected: false }));
        useCanvasStore.getState().setNodes(updatedNodes);
      }
      // Arrow keys: Move selected nodes
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 1 : 15;
          let dx = 0, dy = 0;
          switch (e.key) {
            case 'ArrowUp': dy = -step; break;
            case 'ArrowDown': dy = step; break;
            case 'ArrowLeft': dx = -step; break;
            case 'ArrowRight': dx = step; break;
          }
          const updatedNodes = nodes.map(n => {
            if (n.selected) {
              return {
                ...n,
                position: {
                  x: n.position.x + dx,
                  y: n.position.y + dy,
                },
              };
            }
            return n;
          });
          useCanvasStore.getState().setNodes(updatedNodes);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, copySelected, paste, nodes]);

  // Handle image paste
  const handleImagePaste = useCallback(async (file: File) => {
    try {
      const settings: ImageSettings = loadImageSettings();
      
      // Get vault path from store or localStorage
      let currentVaultPath = vaultPath;
      if (!currentVaultPath) {
        try {
          const raw = localStorage.getItem('zmd-vaults');
          const activeIndex = parseInt(localStorage.getItem('zmd-active-vault') || '-1');
          if (raw && activeIndex >= 0) {
            const vaults = JSON.parse(raw);
            currentVaultPath = vaults[activeIndex]?.path || '';
          }
        } catch {}
      }
      
      const result = await saveImageToLocal(file, settings, null, currentVaultPath || null);

      // Create image node at the center of the viewport
      const viewport = getViewport();
      const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
      const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;

      // Create a media node for the image
      addNode('media', { x: centerX - 200, y: centerY - 150 }, {
        file: result.savedPath,
      });
    } catch (err) {
      console.error('Failed to save pasted image:', err);
      alert('保存图片失败: ' + (err as Error).message);
    }
  }, [addNode, getViewport, vaultPath]);

  // Handle URL paste - detect URLs and create link nodes at viewport center
  const handleUrlPaste = useCallback((url: string) => {
    const viewport = getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;

    // Add protocol if missing so iframe loads correctly
    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    addNode('link', { x: centerX - 200, y: centerY - 100 }, {
      url: normalizedUrl,
      label: url,
    });
  }, [addNode, getViewport]);

  // Paste event listener for images and URLs
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      // Check if focus is in an input/textarea - if so, let default paste work
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for images first
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file && file.size > 0) {
            handleImagePaste(file);
          }
          return;
        }
      }

      // Check for URL text
      const text = e.clipboardData?.getData('text')?.trim();
      if (text && /^((https?:\/\/)|(www\.)).+/i.test(text)) {
        e.preventDefault();
        handleUrlPaste(text);
        return;
      }
    };

    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [handleImagePaste, handleUrlPaste]);

  // Auto-save on changes
  useEffect(() => {
    scheduleAutoSave();
  }, [nodes, edges]);

  // Hide toolbar during viewport move (zoom/pan), re-show after
  const onMoveStart = useCallback(() => {
    setToolbarPosition(null);
    setShowAlignmentToolbar(false);
  }, []);

  const onMoveEnd = useCallback((_: any, viewport: { x: number; y: number; zoom: number }) => {
    if (selectedNodeId) {
      const currentNode = nodes.find(n => n.id === selectedNodeId);
      if (currentNode) {
        const nodeScreenX = currentNode.position.x * viewport.zoom + viewport.x;
        const nodeScreenY = currentNode.position.y * viewport.zoom + viewport.y;
        setToolbarPosition({
          x: nodeScreenX + (currentNode.measured?.width || 400) * viewport.zoom / 2,
          y: nodeScreenY - 10,
        });
      }
    }
  }, [selectedNodeId, nodes]);

  // Close toolbar when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.node-toolbar') && !target.closest('.react-flow__node')) {
        setSelectedNodeId(null);
        setToolbarPosition(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CanvasToolbar />
      <div
        ref={reactFlowWrapper}
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
        className={connecting ? 'connecting' : ''}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onDoubleClick={onDoubleClick}
          onNodeClick={onNodeClickHandler}
          onPaneClick={onPaneClick}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onMoveStart={onMoveStart}
          onMoveEnd={onMoveEnd}
          nodesDraggable
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionRadius={40}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          multiSelectionKeyCode="Shift"
          deleteKeyCode="Delete"
          selectionOnDrag
          panOnDrag={[1, 2]} // Middle and right click
          panActivationKeyCode="Space"
          paneClickDistance={5}
          minZoom={canvasSettings.minZoom}
          maxZoom={canvasSettings.maxZoom}
        >
          <Controls position="top-right" />
          <MiniMap
            position="bottom-right"
            nodeStrokeWidth={3}
            pannable
            zoomable
            nodeColor={(n) => {
              switch (n.type) {
                case 'textNode': return 'var(--accent)';
                case 'fileNode': return 'var(--text-secondary)';
                case 'urlNode': return '#06b6d4';
                case 'groupNode': return 'rgba(128,128,128,0.3)';
                default: return 'var(--text-secondary)';
              }
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
        </ReactFlow>

        {/* Node toolbar */}
        {selectedNodeId && toolbarPosition && (
          <NodeToolbar
            nodeId={selectedNodeId}
            position={toolbarPosition}
            onClose={() => {
              setSelectedNodeId(null);
              setToolbarPosition(null);
            }}
          />
        )}

        {/* Alignment toolbar - shown when multiple nodes are selected */}
        {showAlignmentToolbar && selectedNodeIds.length >= 2 && (
          <AlignmentToolbar
            selectedNodeIds={selectedNodeIds}
            onClose={() => {
              setShowAlignmentToolbar(false);
              setSelectedNodeIds([]);
            }}
          />
        )}

        {/* Alignment guides - shown when dragging a node */}
        <AlignmentGuides draggedNodeId={draggedNodeId} nodePositions={nodePositions} viewport={getViewport()} />

        {/* Undo/Redo Panel - positioned above controls */}
        <UndoRedoPanel />
      </div>

      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
