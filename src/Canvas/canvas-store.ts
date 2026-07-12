import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, type Node, type Edge } from '@xyflow/react';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { JsonCanvasFile, CanvasNodeType } from './canvas-utils';
import { jsonCanvasToReactFlow, reactFlowToJsonCanvas, generateId } from './canvas-utils';

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  filePath: string | null;
  vaultPath: string | null;
  isModified: boolean;
  isLoaded: boolean;

  // History for undo/redo
  history: HistoryEntry[];
  historyIndex: number;

  // Clipboard for copy/paste
  clipboard: { nodes: Node[]; edges: Edge[] };

  // Actions
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: any[]) => void;
  onEdgesChange: (changes: any[]) => void;
  loadCanvas: (filePath: string, vaultPath: string) => Promise<void>;
  saveCanvas: () => Promise<void>;
  addNode: (type: CanvasNodeType, position: { x: number; y: number }, data?: Partial<Node['data']>) => void;
  addEdge: (source: string, target: string, sourceHandle?: string, targetHandle?: string) => void;
  deleteSelected: (selectedNodeIds: string[], selectedEdgeIds: string[]) => void;
  updateNodeData: (nodeId: string, data: Partial<Node['data']>) => void;
  updateEdgeData: (edgeId: string, data: Partial<Edge['data']>) => void;
  updateNodeColor: (nodeId: string, color: string | null) => void;
  copySelected: (selectedNodeIds: string[]) => void;
  paste: () => void;
  clearCanvas: () => void;
  setModified: (modified: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: () => void;
}

// Debounce timer for auto-save
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Max history entries
const MAX_HISTORY = 50;

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  filePath: null,
  vaultPath: null,
  isModified: false,
  isLoaded: false,
  history: [],
  historyIndex: -1,
  clipboard: { nodes: [], edges: [] },

  setNodes: (nodes) => set({ nodes, isModified: true }),
  setEdges: (edges) => set({ edges, isModified: true }),

  onNodesChange: (changes) => {
    const newNodes = applyNodeChanges(changes, get().nodes);
    // Only push history for drag-end and remove changes
    const shouldPushHistory = changes.some(c =>
      c.type === 'remove' || (c.type === 'position' && c.dragging)
    );
    set({ nodes: newNodes, isModified: true });
    if (shouldPushHistory) {
      get().pushHistory();
    }
  },

  onEdgesChange: (changes) => {
    const newEdges = applyEdgeChanges(changes, get().edges);
    const shouldPushHistory = changes.some(c => c.type === 'remove');
    set({ edges: newEdges, isModified: true });
    if (shouldPushHistory) {
      get().pushHistory();
    }
  },

  loadCanvas: async (filePath, vaultPath) => {
    try {
      const content = await readTextFile(filePath);
      const canvas: JsonCanvasFile = JSON.parse(content);
      const { nodes, edges } = jsonCanvasToReactFlow(canvas);
      set({
        nodes, edges, filePath, vaultPath, isLoaded: true, isModified: false,
        history: [{ nodes, edges }], historyIndex: 0
      });
    } catch (err) {
      console.error('Failed to load canvas:', err);
      set({
        nodes: [], edges: [], filePath, vaultPath, isLoaded: true, isModified: false,
        history: [], historyIndex: -1
      });
    }
  },

  saveCanvas: async () => {
    const { filePath, nodes, edges, vaultPath } = get();
    if (!filePath) return;

    try {
      const canvas = reactFlowToJsonCanvas(nodes, edges, vaultPath || undefined);
      await writeTextFile(filePath, JSON.stringify(canvas, null, 2));
      set({ isModified: false });
    } catch (err) {
      console.error('Failed to save canvas:', err);
    }
  },

  addNode: (type, position, data) => {
    get().pushHistory();

    const id = generateId();
    const defaultData: Record<string, any> = {
      text: { text: '' },
      file: { file: '', subpath: '' },
      url: { url: '' },
      group: { label: '', background: '', backgroundStyle: 'cover' },
    };

    const newNode: Node = {
      id,
      type: `${type}Node` as string,
      position,
      data: { ...defaultData[type], ...data },
      style: {
        width: type === 'group' ? 400 : type === 'text' ? 250 : 400,
        height: type === 'group' ? 300 : type === 'text' ? 60 : 200,
      },
    };

    set({
      nodes: [...get().nodes, newNode],
      isModified: true,
    });
  },

  addEdge: (source, target, sourceHandle = 'right', targetHandle = 'left') => {
    get().pushHistory();

    const id = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newEdge: Edge = {
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: 'canvasEdge',
      data: {
        fromSide: sourceHandle,
        toSide: targetHandle,
        fromEnd: 'none',
        toEnd: 'arrow',
        label: '',
      },
    };

    set({
      edges: [...get().edges, newEdge],
      isModified: true,
    });
  },

  deleteSelected: (selectedNodeIds, selectedEdgeIds) => {
    get().pushHistory();

    const { nodes, edges } = get();
    set({
      nodes: nodes.filter(n => !selectedNodeIds.includes(n.id)),
      edges: edges.filter(e =>
        !selectedEdgeIds.includes(e.id) &&
        !selectedNodeIds.includes(e.source) &&
        !selectedNodeIds.includes(e.target)
      ),
      isModified: true,
    });
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isModified: true,
    });
  },

  updateEdgeData: (edgeId, data) => {
    set({
      edges: get().edges.map(e =>
        e.id === edgeId ? { ...e, data: { ...e.data, ...data } } : e
      ),
      isModified: true,
    });
  },

  updateNodeColor: (nodeId, color) => {
    get().pushHistory();
    set({
      nodes: get().nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, color } } : n
      ),
      isModified: true,
    });
  },

  copySelected: (selectedNodeIds) => {
    const { nodes, edges } = get();
    const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
    // Also copy edges that connect selected nodes
    const selectedEdges = edges.filter(
      e => selectedNodeIds.includes(e.source) && selectedNodeIds.includes(e.target)
    );
    set({ clipboard: { nodes: selectedNodes, edges: selectedEdges } });
  },

  paste: () => {
    const { clipboard, nodes, edges } = get();
    if (clipboard.nodes.length === 0) return;

    get().pushHistory();

    // Generate new IDs and offset positions
    const idMap = new Map<string, string>();
    const newNodes = clipboard.nodes.map(n => {
      const newId = generateId();
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        position: {
          x: n.position.x + 20,
          y: n.position.y + 20,
        },
        selected: false,
      };
    });

    // Update edge references with new IDs
    const newEdges = clipboard.edges.map(e => ({
      ...e,
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
    }));

    set({
      nodes: [...nodes, ...newNodes],
      edges: [...edges, ...newEdges],
      isModified: true,
    });
  },

  clearCanvas: () => {
    get().pushHistory();
    set({ nodes: [], edges: [], isModified: true });
  },

  setModified: (modified) => set({ isModified: modified }),

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    // Remove any future history after current index
    const newHistory = history.slice(0, historyIndex + 1);
    // Add current state
    newHistory.push({ nodes: [...nodes], edges: [...edges] });
    // Trim to max size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;

    const prevIndex = historyIndex - 1;
    const prev = history[prevIndex];
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      historyIndex: prevIndex,
      isModified: true,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;

    const nextIndex = historyIndex + 1;
    const next = history[nextIndex];
    set({
      nodes: next.nodes,
      edges: next.edges,
      historyIndex: nextIndex,
      isModified: true,
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
}));

// Auto-save with debounce
export function scheduleAutoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { filePath, isModified } = useCanvasStore.getState();
    if (filePath && isModified) {
      useCanvasStore.getState().saveCanvas();
    }
  }, 1000);
}
