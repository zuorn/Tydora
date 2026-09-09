import { useCallback, useState, useRef, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { emit } from '@tauri-apps/api/event';
import { useCanvasStore } from './canvas-store';
import ColorPicker from './ColorPicker';

interface NodeToolbarProps {
  nodeId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function NodeToolbar({ nodeId, position, onClose }: NodeToolbarProps) {
  const { fitView, getNodes } = useReactFlow();
  const deleteSelected = useCanvasStore((s) => s.deleteSelected);
  const updateNodeColor = useCanvasStore((s) => s.updateNodeColor);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleDelete = useCallback(() => {
    deleteSelected([nodeId], []);
    onClose();
  }, [nodeId, deleteSelected, onClose]);

  const handleFocus = useCallback(() => {
    const nodes = getNodes();
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      fitView({
        nodes: [node],
        duration: 300,
        padding: 0.5,
      });
    }
    onClose();
  }, [nodeId, fitView, getNodes, onClose]);

  const handleColorSelect = useCallback((color: string | null) => {
    updateNodeColor(nodeId, color);
    setShowColorPicker(false);
  }, [nodeId, updateNodeColor]);

  const handleEdit = useCallback(() => {
    // Get the node to determine its type
    const nodes = getNodes();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      onClose();
      return;
    }

    // Handle different node types
    const nodeType = node.type;
    const nodeData = node.data as any;

    if (nodeType === 'noteNode' || nodeType === 'fileNode') {
      // Open the file in editor
      if (nodeData?.file) {
        emit('open-file', { path: nodeData.file });
      }
    } else if (nodeType === 'canvasNode') {
      // Open the embedded canvas
      if (nodeData?.file) {
        emit('open-file', { path: nodeData.file });
      }
    } else if (nodeType === 'textNode') {
      // For text nodes, find the TipTap editor and focus it
      // Use setTimeout to ensure the toolbar is closed first
      setTimeout(() => {
        const nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
        if (nodeElement) {
          // Find the ProseMirror editor element
          const editorElement = nodeElement.querySelector('.ProseMirror');
          if (editorElement) {
            (editorElement as HTMLElement).focus();
          }
        }
      }, 50);
    } else if (nodeType === 'mediaNode') {
      // Open media file in system default app
      if (nodeData?.file) {
        const nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
        if (nodeElement) {
          const clickEvent = new MouseEvent('click', { bubbles: true });
          nodeElement.dispatchEvent(clickEvent);
        }
      }
    }
    onClose();
  }, [nodeId, getNodes, onClose]);

  return (
    <div
      ref={toolbarRef}
      className="node-toolbar"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)',
        zIndex: 1000,
      }}
    >
      <div className="node-toolbar-buttons">
        {/* Delete button - Obsidian style */}
        <button
          className="node-toolbar-btn"
          title="删除"
          onClick={handleDelete}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>

        {/* Color picker button - Obsidian style */}
        <button
          className="node-toolbar-btn"
          title="颜色"
          onClick={() => setShowColorPicker(!showColorPicker)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r="2.5" />
            <circle cx="17.5" cy="10.5" r="2.5" />
            <circle cx="8.5" cy="7.5" r="2.5" />
            <circle cx="6.5" cy="12.5" r="2.5" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          </svg>
        </button>

        {/* Color picker popup */}
        {showColorPicker && (
          <div className="node-toolbar-color-picker">
            <ColorPicker
              onSelect={handleColorSelect}
              onClose={() => setShowColorPicker(false)}
            />
          </div>
        )}

        {/* Focus button - Obsidian style */}
        <button
          className="node-toolbar-btn"
          title="聚焦"
          onClick={handleFocus}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Edit button - Obsidian style */}
        <button
          className="node-toolbar-btn"
          title="编辑"
          onClick={handleEdit}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
