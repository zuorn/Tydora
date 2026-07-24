import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import MarkdownIt from "markdown-it";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { LinkIndexService } from "./LinkIndexService";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
});

const htmlCache = new Map<string, string>();
const CACHE_MAX = 50;

function renderMarkdown(text: string): string {
  const body = text.replace(/^---[\s\S]*?---\n?/, "");
  // 预处理 WikiLink 语法，转换为 HTML
  let processed = body.replace(
    /\[\[([^\]|]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g,
    (_match, note, heading, display) => {
      const label = display || note;
      const headingAttr = heading ? ` data-heading="${heading}"` : '';
      return `<a class="wiki-link" data-note="${note}"${headingAttr} href="#">${label}</a>`;
    }
  );
  // 预处理任务列表：将 - [ ] / - [x] 转换为 HTML checkbox
  processed = processed.replace(
    /^(\s*)- \[([ x])\] (.+)$/gm,
    (_match, indent, checked, content) => {
      const isChecked = checked === 'x';
      const checkedAttr = isChecked ? ' checked' : '';
      const dataChecked = isChecked ? ' data-checked="true"' : '';
      return `${indent}<ul data-type="taskList"><li${dataChecked}><label><input type="checkbox"${checkedAttr}></label><p>${content}</p></li></ul>`;
    }
  );
  return md.render(processed);
}

function setCache(key: string, html: string) {
  if (htmlCache.size >= CACHE_MAX) {
    const first = htmlCache.keys().next().value!;
    htmlCache.delete(first);
  }
  htmlCache.set(key, html);
}

function computePosition(anchorRect: DOMRect, depth: number = 0) {
  const W = 460;
  const H = 320;
  const GAP = 8;
  const CASCADE_OFFSET = 24;
  const x = Math.max(GAP, Math.min(
    anchorRect.left + depth * CASCADE_OFFSET,
    window.innerWidth - W - GAP
  ));
  const below = anchorRect.bottom + GAP + H <= window.innerHeight;
  const y = below
    ? anchorRect.bottom + GAP
    : Math.max(GAP, anchorRect.top - H - GAP);
  return { x, y };
}

interface CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
}

const CANVAS_COLORS: Record<string, string> = {
  '1': '#ef4444',
  '2': '#f97316',
  '3': '#eab308',
  '4': '#22c55e',
  '5': '#06b6d4',
  '6': '#a855f7',
};

function renderCanvasThumbnail(json: string): string {
  try {
    const data = JSON.parse(json);
    const nodes: CanvasNode[] = data.nodes || [];
    const edges: Array<{ fromNode: string; toNode: string }> = data.edges || [];

    if (nodes.length === 0) {
      return '<div class="wiki-link-preview-canvas-empty">空白白板</div>';
    }

    // 计算边界框
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const padding = 30;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    // 建立 node id → node 映射
    const nodeMap = new Map<string, CanvasNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    // 构建 SVG
    let svg = `<svg class="wiki-link-preview-canvas-thumb" viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

    // 渲染连线
    for (const edge of edges) {
      const from = nodeMap.get(edge.fromNode);
      const to = nodeMap.get(edge.toNode);
      if (!from || !to) continue;

      const fromX = from.x + from.width / 2;
      const fromY = from.y + from.height / 2;
      const toX = to.x + to.width / 2;
      const toY = to.y + to.height / 2;
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;
      const ctrlOffset = Math.min(Math.abs(toX - fromX), Math.abs(toY - fromY)) * 0.3;

      svg += `<path d="M ${fromX} ${fromY} Q ${midX + ctrlOffset} ${midY - ctrlOffset} ${toX} ${toY}" fill="none" stroke="#888" stroke-width="2" opacity="0.7"/>`;
    }

    // 渲染节点
    for (const node of nodes) {
      const fillColor = node.color ? (CANVAS_COLORS[node.color] || '#e0e0e0') : '#ffffff';
      const strokeColor = node.color ? (CANVAS_COLORS[node.color] || '#ccc') : '#ccc';
      const strokeWidth = node.color ? 2 : 0.5;

      svg += `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" rx="4" opacity="0.95"/>`;

      // 文本节点显示文字预览
      if (node.type === 'text' && node.text) {
        const plainText = node.text.replace(/[#*_~`>]/g, '').trim();
        if (plainText) {
          const displayText = plainText.length > 30 ? plainText.slice(0, 30) + '...' : plainText;
          const textLines = displayText.split('\n').slice(0, 3);
          const startY = node.y + 20;
          for (let i = 0; i < textLines.length; i++) {
            const line = textLines[i].slice(0, Math.floor(node.width / 8));
            svg += `<text x="${node.x + 8}" y="${startY + i * 16}" font-size="12" fill="#333" font-family="sans-serif">${escapeXml(line)}</text>`;
          }
        }
      }
    }

    svg += '</svg>';
    return svg;
  } catch {
    return '<div class="wiki-link-preview-canvas-empty">无法解析白板文件</div>';
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface WikiLinkPreviewProps {
  noteName: string;
  heading: string | null;
  anchorRect: DOMRect;
  depth: number;
  vaultPath: string;
  onMouseEnter: () => void;
  onMouseLeave: (e?: MouseEvent) => void;
  onClose: () => void;
}

export function WikiLinkPreview({
  noteName,
  heading,
  anchorRect,
  depth,
  vaultPath,
  onMouseEnter,
  onMouseLeave,
  onClose,
}: WikiLinkPreviewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { x, y } = computePosition(anchorRect, depth);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const filePath = LinkIndexService.findFileByNoteName(noteName);
      if (!filePath) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      const cacheKey = filePath;
      const cached = htmlCache.get(cacheKey);
      if (cached) {
        if (!cancelled) {
          setHtml(cached);
          setLoading(false);
        }
        return;
      }

      try {
        const content = await readTextFile(filePath);
        const isCanvas = filePath.endsWith('.canvas');
        const rendered = isCanvas ? renderCanvasThumbnail(content) : renderMarkdown(content);
        setCache(cacheKey, rendered);
        if (!cancelled) {
          setHtml(rendered);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [noteName, vaultPath]);

  // 滚动到指定 heading
  useEffect(() => {
    if (!html || !heading || !bodyRef.current) return;
    const slug = heading
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u4e00-\u9fff-]/g, "");
    const target = bodyRef.current.querySelector(`h1[id="${slug}"], h2[id="${slug}"], h3[id="${slug}"], h4[id="${slug}"], h5[id="${slug}"], h6[id="${slug}"]`);
    if (target) {
      target.scrollIntoView({ block: "start" });
    }
  }, [html, heading]);

  // 阻止预览弹窗内链接的点击导航 + 支持 wiki link 悬停预览
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    let currentLink: HTMLElement | null = null;

    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // 使用 mouseover/mouseout（会冒泡）代替 mouseenter/mouseleave（不冒泡）
    const overHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest?.('a.wiki-link, a[data-note]') as HTMLElement | null;
      // 如果鼠标已经在同一个链接上（包括在父元素和子元素之间移动），不需要重新触发
      if (link && link === currentLink) return;

      currentLink = link;
      if (!link) return;
      const noteName = link.getAttribute('data-note');
      if (!noteName) return;
      const heading = link.getAttribute('data-heading') || null;
      window.dispatchEvent(new CustomEvent("wiki-link-hover", {
        detail: { noteName, heading, element: link, depth }
      }));
    };

    const outHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      const link = target.closest?.('a.wiki-link, a[data-note]') as HTMLElement | null;
      if (!link) return;
      if (link !== currentLink) return;

      // 如果鼠标移动到了同一个链接的子元素中（如 <strong>、<em>），不要触发离开事件
      if (relatedTarget && link.contains(relatedTarget)) return;

      currentLink = null;
      // 传递 relatedTarget 给 handleHoverEnd，以便正确判断鼠标去向
      window.dispatchEvent(new CustomEvent("wiki-link-hover-end", {
        detail: { relatedTarget }
      }));
    };

    el.addEventListener("click", clickHandler, true);
    el.addEventListener("mouseover", overHandler, true);
    el.addEventListener("mouseout", outHandler, true);
    return () => {
      el.removeEventListener("click", clickHandler, true);
      el.removeEventListener("mouseover", overHandler, true);
      el.removeEventListener("mouseout", outHandler, true);
    };
  }, [html]);

  const handleOpenNote = () => {
    onClose();
    window.dispatchEvent(new CustomEvent("wiki-link-click", {
      detail: { noteName, heading }
    }));
  };

  return createPortal(
    <div
      className="wiki-link-preview visible"
      style={{ left: x, top: y, zIndex: 9999 + depth }}
      data-depth={depth}
      onMouseEnter={onMouseEnter}
      onMouseLeave={(e) => onMouseLeave(e.nativeEvent)}
    >
      <div className="wiki-link-preview-body" ref={bodyRef}>
        <button
          className="wiki-link-preview-open"
          onClick={handleOpenNote}
          title="打开笔记"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </button>
        {loading && (
          <div className="wiki-link-preview-loading">
            <div className="skeleton-line" style={{ width: "80%" }} />
            <div className="skeleton-line" style={{ width: "60%" }} />
            <div className="skeleton-line" style={{ width: "70%" }} />
            <div className="skeleton-line" style={{ width: "45%" }} />
          </div>
        )}
        {notFound && (
          <div className="wiki-link-preview-notfound">
            笔记不存在
          </div>
        )}
        {html && (
          <div
            className="wiki-link-preview-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
