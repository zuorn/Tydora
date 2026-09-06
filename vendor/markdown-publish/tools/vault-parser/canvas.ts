import GithubSlugger from 'github-slugger';
import type {
  CanvasModel,
  CanvasNode,
  CanvasEdge,
  Bounds,
  Port,
  ObsidianCanvas,
  OCNode,
  Heading,
  LinkRef,
} from '@shared/content-model';
import { slugifyHeading, type MarkdownEnv, type ResolveResult } from './markdown';

const ASSET_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

const CANVAS_COLORS: Record<string, string> = {
  '1': '#fb464c',
  '2': '#e9973f',
  '3': '#e0de71',
  '4': '#44cf6e',
  '5': '#53dfdd',
  '6': '#a882ff',
};

function resolveColor(color?: string): string | undefined {
  if (!color) return undefined;
  if (color.startsWith('#')) return color;
  return CANVAS_COLORS[color] ?? undefined;
}

export interface CanvasResolved {
  /** A resolved note for a canvas file node. */
  slug: string;
  title: string;
  html: string;
  available: boolean;
  thumbUrl?: string;
}

export interface CanvasDeps {
  resolveLink(target: string): ResolveResult;
  resolveAsset(target: string): { url: string; ext: string } | null;
  renderText(text: string): string;
  /** Resolve a file node (.md) target to a rendered note section. */
  resolveFileNode(file: string, anchor: string | null): CanvasResolved | null;
}

export function normalizeCanvas(
  canvas: ObsidianCanvas,
  deps: CanvasDeps,
): CanvasModel {
  const nodes: CanvasNode[] = canvas.nodes.map((node) =>
    normalizeNode(node, deps),
  );
  const edges: CanvasEdge[] = (canvas.edges ?? []).map(normalizeEdge);
  const bounds = computeBounds(canvas.nodes);
  return { nodes, edges, bounds };
}

function normalizeNode(node: OCNode, deps: CanvasDeps): CanvasNode {
  const base = {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    color: resolveColor(node.color),
  };

  switch (node.type) {
    case 'text':
      return { ...base, kind: 'text', payload: { html: deps.renderText(node.text) } };
    case 'file': {
      const ext = (node.file.split('.').pop() ?? '').toLowerCase();
      const alt = basenameNoExt(node.file);
      if (ASSET_IMAGE_EXTS.has(ext)) {
        const asset = deps.resolveAsset(node.file);
        return {
          ...base,
          kind: 'image',
          payload: { src: asset ? asset.url : '', alt },
        };
      }
      let anchor: string | null = null;
      if (node.subpath && node.subpath.startsWith('#')) {
        anchor = slugifyHeading(node.subpath.slice(1));
      }
      const resolved = deps.resolveFileNode(node.file, anchor);
      if (resolved) {
        return {
          ...base,
          kind: 'file-note',
          payload: {
            slug: resolved.slug,
            title: resolved.title,
            ...(anchor ? { anchor } : {}),
            html: resolved.html,
            available: resolved.available,
            ...(resolved.thumbUrl ? { thumbUrl: resolved.thumbUrl } : {}),
          },
        };
      }
      return {
        ...base,
        kind: 'file-note',
        payload: { slug: '', title: alt, html: '', available: false },
      };
    }
    case 'link': {
      let title: string | undefined;
      try {
        title = new URL(node.url).host;
      } catch {
        title = undefined;
      }
      return { ...base, kind: 'link', payload: { url: node.url, title } };
    }
    case 'group':
      return { ...base, kind: 'group', payload: { label: node.label } };
  }
}

function normalizeEdge(edge: CanvasEdgeInput): CanvasEdge {
  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    sourcePort: (edge.fromSide ?? 'right') as Port,
    targetPort: (edge.toSide ?? 'left') as Port,
    arrowSource: edge.fromEnd === 'arrow',
    arrowTarget: edge.toEnd !== 'none',
    color: resolveColor(edge.color),
    label: edge.label,
  };
}

type CanvasEdgeInput = ObsidianCanvas['edges'][number];

function computeBounds(nodes: OCNode[]): Bounds {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { minX, minY, maxX, maxY };
}

function basenameNoExt(file: string): string {
  const base = file.split('/').pop() ?? file;
  return base.replace(/\.[^./]+$/, '');
}

/** Build a minimal MarkdownEnv for rendering canvas text (discards outgoing/headings). */
export function makeCanvasEnv(
  resolveLink: (target: string) => ResolveResult,
  resolveAsset: (target: string) => { url: string; ext: string } | null,
): MarkdownEnv {
  const outgoing: LinkRef[] = [];
  const headings: Heading[] = [];
  return {
    resolveLink,
    resolveAsset,
    resolveVideo: () => null,
    selfSlug: '',
    outgoing,
    headings,
    slugger: new GithubSlugger(),
    renderEmbed: () => null,
  };
}
