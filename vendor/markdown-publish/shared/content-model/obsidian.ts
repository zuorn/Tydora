export interface ObsidianCanvas {
  nodes: OCNode[];
  edges: OCEdge[];
}

export type OCNode = OCText | OCFile | OCLink | OCGroup;

export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasEnd = 'none' | 'arrow';

export interface OCBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string; // preset "1".."6" or "#rrggbb"
}

export interface OCText extends OCBase {
  type: 'text';
  text: string;
}

export interface OCFile extends OCBase {
  type: 'file';
  file: string;
  subpath?: string; // starts with '#': "#Heading" or "#^blockid"
}

export interface OCLink extends OCBase {
  type: 'link';
  url: string;
}

export interface OCGroup extends OCBase {
  type: 'group';
  label?: string;
  background?: string;
  backgroundStyle?: 'cover' | 'ratio' | 'repeat';
}

export interface OCEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  fromEnd?: CanvasEnd; // default 'none'
  toEnd?: CanvasEnd; // default 'arrow'
  color?: string;
  label?: string;
}
