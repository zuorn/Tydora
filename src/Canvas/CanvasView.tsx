import { useCallback, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useReactFlow,
  type Node,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TextNode from './nodes/TextNode';
import FileNode from './nodes/FileNode';
import NoteNode from './nodes/NoteNode';
import MediaNode from './nodes/MediaNode';
import UrlNode from './nodes/UrlNode';
import ImageNode from './nodes/ImageNode';
import GroupNode from './nodes/GroupNode';
import CanvasEdge from './edges/CanvasEdge';
import CanvasToolbar from './CanvasToolbar';
import CanvasContextMenu from './CanvasContextMenu';
import NodeToolbar from './NodeToolbar';
import AlignmentToolbar from './AlignmentToolbar';
import UndoRedoPanel from './UndoRedoPanel';
import { useCanvasStore, scheduleAutoSave } from './canvas-store';
import { saveImageToLocal, loadImageSettings, type ImageSettings } from '../ImageManager';

// Register custom node types
const nodeTypes = {
  textNode: TextNode,
  fileNode: FileNode,
  noteNode: NoteNode,
  mediaNode: MediaNode,
  urlNode: UrlNode,
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
  const { screenToFlowPosition, getNodes, getViewport } = useReactFlow();

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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Node toolbar state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);

  // Alignment toolbar state
  const [showAlignmentToolbar, setShowAlignmentToolbar] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

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
      // Don't create node if double-clicking on an existing node
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__node')) return;

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

  // Close context menu on any click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
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
        e.preventDefault();
        paste();
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
      const result = await saveImageToLocal(file, settings, null, vaultPath);

      // Create image node at the center of the viewport
      const viewport = getViewport();
      const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
      const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;

      addNode('text', { x: centerX - 200, y: centerY - 100 }, {
        text: `![${file.name}](${result.savedPath})`,
      });
    } catch (err) {
      console.error('Failed to save pasted image:', err);
      alert('保存图片失败: ' + (err as Error).message);
    }
  }, [addNode, getViewport, vaultPath]);

  // Paste event listener for images
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

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
    };

    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [handleImagePaste]);

  // Auto-save on changes
  useEffect(() => {
    scheduleAutoSave();
  }, [nodes, edges]);

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
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDoubleClick={onDoubleClick}
          onNodeClick={onNodeClickHandler}
          onPaneClick={onPaneClick}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          multiSelectionKeyCode="Shift"
          deleteKeyCode="Delete"
          selectionOnDrag
          panOnDrag={[1, 2]} // Middle and right click
          panActivationKeyCode="Space"
          paneClickDistance={5}
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
