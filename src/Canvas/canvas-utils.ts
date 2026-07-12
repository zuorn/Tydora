import type { Node, Edge } from '@xyflow/react';

// JSON Canvas Spec types (jsoncanvas.org)
export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6' | string;
export type CanvasNodeType = 'text' | 'file' | 'note' | 'media' | 'canvas' | 'link' | 'group';
export type Direction = 'top' | 'right' | 'left' | 'bottom';
export type MarkerType = 'none' | 'arrow';

export interface CanvasNodeData {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
  text?: string;      // for text nodes
  file?: string;       // for file nodes
  subpath?: string;    // for file nodes
  url?: string;        // for link nodes
  label?: string;      // for group nodes
  background?: string; // for group nodes
  backgroundStyle?: 'cover' | 'ratio' | 'repeat'; // for group nodes
}

export interface CanvasEdgeData {
  id: string;
  fromNode: string;
  fromSide?: Direction;
  fromEnd?: MarkerType;
  toNode: string;
  toSide?: Direction;
  toEnd?: MarkerType;
  color?: CanvasColor;
  label?: string;
}

export interface JsonCanvas {
  nodes?: CanvasNodeData[];
  edges?: CanvasEdgeData[];
}

export interface JsonCanvasFile {
  nodes?: CanvasNodeData[];
  edges?: CanvasEdgeData[];
}

// Canvas color presets
export const CANVAS_COLORS: Record<string, string> = {
  '1': '#ef4444', // red
  '2': '#f97316', // orange
  '3': '#eab308', // yellow
  '4': '#22c55e', // green
  '5': '#06b6d4', // cyan
  '6': '#a855f7', // purple
};

// Convert JSON Canvas to React Flow nodes
function jsonCanvasNodeTypeToReactFlow(type: CanvasNodeType, nodeData?: any): string {
  switch (type) {
    case 'text': return 'textNode';
    case 'file':
      // Check if the file is a markdown file - render as noteNode
      if (nodeData?.file && /\.(md|markdown)$/i.test(nodeData.file)) {
        return 'noteNode';
      }
      // Check if the file is a canvas file - render as canvasNode
      if (nodeData?.file && /\.canvas$/i.test(nodeData.file)) {
        return 'canvasNode';
      }
      return 'fileNode';
    case 'canvas': return 'canvasNode';
    case 'link': return 'urlNode';
    case 'group': return 'groupNode';
    default: return 'textNode';
  }
}

export function jsonCanvasToReactFlow(canvas: JsonCanvasFile): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = (canvas.nodes || []).map((n) => ({
    id: n.id,
    type: jsonCanvasNodeTypeToReactFlow(n.type, n),
    position: { x: n.x, y: n.y },
    data: {
      label: n.label || '',
      text: n.text || '',
      file: n.file || '',
      subpath: n.subpath || '',
      url: n.url || '',
      color: n.color,
      background: n.background || '',
      backgroundStyle: n.backgroundStyle || 'cover',
    },
    style: {
      width: n.width,
      height: n.height,
    },
  }));

  const edges: Edge[] = (canvas.edges || []).map((e) => ({
    id: e.id,
    source: e.fromNode,
    target: e.toNode,
    sourceHandle: e.fromSide || 'right',
    targetHandle: e.toSide || 'left',
    type: 'canvasEdge',
    data: {
      fromSide: e.fromSide,
      toSide: e.toSide,
      fromEnd: e.fromEnd || 'none',
      toEnd: e.toEnd || 'arrow',
      color: e.color,
      label: e.label || '',
    },
  }));

  return { nodes, edges };
}

// Convert absolute path to relative path (relative to vault)
function toRelativePath(absolutePath: string, vaultPath: string): string {
  if (!vaultPath || !absolutePath) return absolutePath;
  
  // Normalize paths
  const normalizedAbsolute = absolutePath.replace(/\\/g, '/');
  const normalizedVault = vaultPath.replace(/\\/g, '/');
  
  // Check if the path starts with vault path
  if (normalizedAbsolute.startsWith(normalizedVault)) {
    let relative = normalizedAbsolute.slice(normalizedVault.length);
    if (relative.startsWith('/')) {
      relative = relative.slice(1);
    }
    return relative;
  }
  
  // If not under vault, return as-is
  return absolutePath;
}

// Convert React Flow nodes/edges back to JSON Canvas
export function reactFlowToJsonCanvas(
  nodes: Node[],
  edges: Edge[],
  vaultPath?: string
): JsonCanvasFile {
  const canvasNodes: CanvasNodeData[] = nodes
    .filter(n => n.type !== 'groupNode' || true) // Include all node types
    .map((n) => {
      const base = {
        id: n.id,
        type: reactFlowTypeToCanvasType(n.type || 'textNode'),
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        width: Math.round(Number(n.measured?.width) || Number(n.style?.width) || 400),
        height: Math.round(Number(n.measured?.height) || Number(n.style?.height) || 200),
        color: (n.data as any)?.color as CanvasColor | undefined,
      };

      const data = n.data as any;

      switch (base.type) {
        case 'text':
          return { ...base, text: data?.text || '' };
        case 'file':
          return { ...base, file: toRelativePath(data?.file || '', vaultPath || ''), subpath: data?.subpath || undefined };
        case 'note':
          return { ...base, file: toRelativePath(data?.file || '', vaultPath || ''), label: data?.label || undefined };
        case 'media':
          return { ...base, file: toRelativePath(data?.file || '', vaultPath || '') };
        case 'link':
          return { ...base, url: data?.url || '' };
        case 'group':
          return {
            ...base,
            label: data?.label || undefined,
            background: data?.background || undefined,
            backgroundStyle: data?.backgroundStyle as any || undefined,
          };
        default:
          return { ...base, text: data?.text || '' };
      }
    });

  const canvasEdges: CanvasEdgeData[] = edges.map((e) => ({
    id: e.id,
    fromNode: e.source,
    fromSide: (e.sourceHandle as Direction) || 'right',
    fromEnd: (e.data as any)?.fromEnd || 'none',
    toNode: e.target,
    toSide: (e.targetHandle as Direction) || 'left',
    toEnd: (e.data as any)?.toEnd || 'arrow',
    color: (e.data as any)?.color,
    label: (e.data as any)?.label || undefined,
  }));

  return {
    nodes: canvasNodes,
    edges: canvasEdges,
  };
}

function reactFlowTypeToCanvasType(type: string): CanvasNodeType {
  switch (type) {
    case 'textNode': return 'text';
    case 'fileNode': return 'file';
    case 'noteNode': return 'file'; // Save as 'file' for Obsidian compatibility
    case 'mediaNode': return 'file'; // Save as 'file' for Obsidian compatibility
    case 'canvasNode': return 'file'; // Save as 'file' for Obsidian compatibility
    case 'urlNode': return 'link';
    case 'groupNode': return 'group';
    default: return 'text';
  }
}

// Generate a unique ID for new nodes/edges
export function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Get color CSS variable from canvas color preset
export function getCanvasColor(color: CanvasColor | undefined): string | undefined {
  if (!color) return undefined;
  return CANVAS_COLORS[color] || color;
}

// Resolve file path relative to vault path
export function resolveFilePath(basePath: string, relativePath: string): string {
  // If already absolute path, return as-is
  if (relativePath.match(/^[A-Z]:\\/i) || relativePath.startsWith('/')) {
    return relativePath;
  }

  // Normalize separators
  const base = basePath.replace(/\\/g, '/');
  const rel = relativePath.replace(/\\/g, '/');

  // Handle ../ and ./
  const baseParts = base.split('/').filter(Boolean);
  const relParts = rel.split('/');

  for (const part of relParts) {
    if (part === '..') {
      baseParts.pop();
    } else if (part !== '.') {
      baseParts.push(part);
    }
  }

  // Reconstruct path with original separator style
  const sep = basePath.includes('\\') ? '\\' : '/';
  let result = baseParts.join(sep);

  // Ensure Windows drive letter format
  if (result.match(/^[A-Z]:$/i)) {
    result += sep;
  }

  return result;
}
