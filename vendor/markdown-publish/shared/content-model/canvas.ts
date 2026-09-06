export type Port = 'top' | 'right' | 'bottom' | 'left';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type CanvasNodeKind = 'text' | 'file-note' | 'image' | 'link' | 'group';

export interface CanvasModel {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  bounds: Bounds;
}

export interface CanvasNode {
  id: string;
  kind: CanvasNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  payload: TextPayload | FileNotePayload | ImagePayload | LinkPayload | GroupPayload;
}

export interface TextPayload {
  html: string;
}

export interface FileNotePayload {
  slug: string;
  title: string;
  anchor?: string;
  html: string;
  available: boolean;
  /** Medium-res rendered thumbnail of the note, shown on the board until the
   *  card is zoomed in (cheap to pan vs. full note DOM). */
  thumbUrl?: string;
}

export interface ImagePayload {
  src: string;
  alt: string;
}

export interface LinkPayload {
  url: string;
  title?: string;
  favicon?: string;
}

export interface GroupPayload {
  label?: string;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourcePort: Port;
  targetPort: Port;
  arrowSource: boolean;
  arrowTarget: boolean;
  color?: string;
  label?: string;
}
