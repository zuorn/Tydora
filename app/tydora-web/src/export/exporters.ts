// 各格式的具体导出实现：返回字符串或二进制，由调用方负责保存
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import hljs from "highlight.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 从 documentElement 读取当前代码主题的 CSS 变量，构建 hljs-* → 颜色 映射 */
function getHljsColorMap(): Record<string, string> {
  const rootStyles = getComputedStyle(document.documentElement);
  const map: Record<string, string> = {};
  const hljsClasses = [
    "keyword", "string", "comment", "number", "built_in", "function",
    "title", "literal", "type", "params", "meta", "regexp",
    "selector-tag", "selector-id", "selector-class", "selector-pseudo",
    "attribute", "variable", "symbol", "bullet", "addition", "deletion",
    "section", "link", "template-tag", "template-variable", "operator",
    "name", "quote",
  ];
  for (const cls of hljsClasses) {
    const val = rootStyles.getPropertyValue(`--hljs-${cls}`).trim();
    if (val) map[cls] = val;
  }
  if (Object.keys(map).length === 0) {
    // Fallback: GitHub Light 默认颜色
    Object.assign(map, {
      keyword: "#d73a49", string: "#032f62", comment: "#6a737d",
      number: "#005cc5", built_in: "#e36209", title: "#6f42c1",
      function: "#6f42c1", literal: "#005cc5", type: "#005cc5",
      params: "#24292e", meta: "#6a737d", regexp: "#032f62",
      "selector-tag": "#22863a", "selector-id": "#6f42c1",
      "selector-class": "#6f42c1", "selector-pseudo": "#6f42c1",
      attribute: "#6f42c1", variable: "#e36209", symbol: "#005cc5",
      bullet: "#005cc5", addition: "#22863a", deletion: "#b31d28",
      section: "#005cc5", link: "#032f62", operator: "#d73a49",
      name: "#22863a", quote: "#6a737d",
    });
  }
  return map;
}

/** 给元素内所有 hljs-* span 设置内联颜色 */
function applyHljsColors(el: Element, map: Record<string, string>): void {
  const spans = el.querySelectorAll("[class*='hljs-']");
  for (const span of Array.from(spans)) {
    for (const cls of Array.from(span.classList)) {
      if (cls.startsWith("hljs-")) {
        const key = cls.replace("hljs-", "");
        const color = map[key];
        if (color) {
          (span as HTMLElement).style.color = color;
        }
      }
    }
  }
}

/** 构建自包含的 HTML 文档字符串 */
export function buildHtmlDoc(
  raw: HTMLElement,
  css: string,
  themeName: string,
  title: string,
  options?: { exportShadow?: boolean },
): string {
  // 安全清理：移除所有 <script> 标签和内联事件处理器，避免在 iframe srcDoc /
  // 导出的 HTML 中触发 "Unexpected end of input" 及 "Blocked script execution" 等错误。
  raw.querySelectorAll("script").forEach((el) => el.remove());
  const allEls = raw.querySelectorAll("*");
  for (const el of Array.from(allEls)) {
    for (const attr of Array.from(el.attributes)) {
      // 内联事件处理器（onclick / onerror / onload 等）
      if (attr.name.startsWith("on")) {
        (el as HTMLElement).removeAttribute(attr.name);
      }
      // javascript: 协议 URL
      if (attr.name === "href" && attr.value.trim().toLowerCase().startsWith("javascript:")) {
        (el as HTMLElement).removeAttribute("href");
      }
    }
  }

  const shadowCss = options?.exportShadow
    ? `
<style>
/* 导出文件专属：内容区背景阴影（不影响预览窗口） */
html, body { background: var(--bg-secondary, #f5f5f5); }
.export-page {
  margin: 40px auto !important;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  border-radius: 8px;
}
@media print {
  html, body { background: var(--bg-primary, #ffffff); }
  .export-page { margin: 0 auto !important; box-shadow: none; border-radius: 0; }
}
</style>`
    : "";

  return `<!DOCTYPE html>
<html data-theme="${escapeHtml(themeName)}" lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none'%3E%3Crect width='32' height='32' rx='7' fill='%238a5cf5'/%3E%3Cg stroke='%23fff' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M10 11 L16 21 M22 11 L16 21 M10 11 L22 11'/%3E%3C/g%3E%3Cg fill='%23fff'%3E%3Ccircle cx='10' cy='11' r='3'/%3E%3Ccircle cx='22' cy='11' r='3'/%3E%3Ccircle cx='16' cy='21' r='3'/%3E%3C/g%3E%3C/svg%3E" />
<style>
${css}
</style>
<style>
html, body { margin: 0; height: 100%; overflow-y: auto; }
.export-page {
  max-width: 1024px;
  margin: 0 auto;
  padding: 48px;
  box-sizing: border-box;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1f2330);
}
.export-page p {
  margin: 0.5em 0;
  line-height: 1.6;
}
.export-page hr {
  border: none;
  border-top: 1px solid var(--border, #d9ede5);
  margin: 2em 0;
}
.export-page ul,
.export-page ol {
  padding-left: 2em;
  margin: 0.5em 0;
  position: relative;
}
.export-page ul { list-style-type: disc; }
.export-page ol { list-style-type: decimal; }
.export-page ul ul { list-style-type: circle; }
.export-page ul ul ul { list-style-type: square; }
.export-page li { margin: 0.25em 0; }
.export-page li > p { margin: 0; }

/* 嵌套无序列表缩进引导竖线（画在嵌套 ul 上，比画在父 li 上更容易对齐） */
.export-page li > ul:not([data-type="taskList"])::before {
  content: '';
  position: absolute;
  left: -1em;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #d9ede5;
  opacity: 0.6;
}
/* 嵌套有序列表缩进引导竖线 */
.export-page ol ol::before,
.export-page ul ol::before {
  content: '';
  position: absolute;
  left: -0.8em;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #d9ede5;
  opacity: 0.6;
}

/* ── 任务列表 ── */
.export-page ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
  position: relative;
}
.export-page ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
}
.export-page ul[data-type="taskList"] li > label {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding-top: 1px;
}
.export-page ul[data-type="taskList"] li > label > span:not(.export-checkbox-svg) {
  display: none;
}
.export-page ul[data-type="taskList"] li > label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin: 0;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  border: 2px solid #c0c0c0;
  border-radius: 50%;
  background: transparent;
  position: relative;
  flex-shrink: 0;
  outline: none;
}
.export-page ul[data-type="taskList"] li > label input[type="checkbox"]:checked {
  background: #5b8c5a;
  border-color: #5b8c5a;
}
.export-page ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.export-page ul[data-type="taskList"] li > div {
  flex: 1;
  min-width: 0;
}
.export-page ul[data-type="taskList"] li > div > p:first-child {
  margin-top: 0;
  margin-bottom: 0;
}
.export-page ul[data-type="taskList"] li > div > p + p {
  margin-top: 0.5em;
}
.export-page ul[data-type="taskList"] li[data-checked="true"] > div > p {
  text-decoration: line-through;
  color: #999;
}
.export-page ul[data-type="taskList"] ul[data-type="taskList"] {
  margin: 0.25em 0;
  margin-left: 10px;
  position: relative;
}
/* 任务列表缩进引导竖线 */
.export-page ul[data-type="taskList"] ul[data-type="taskList"]::before {
  content: '';
  position: absolute;
  left: -26px;
  top: 0;
  bottom: 0.5em;
  width: 1px;
  background: #d9ede5;
  opacity: 0.6;
}

.export-page blockquote {
  border-left: 3px solid var(--border, #d9ede5);
  padding-left: 1em;
  margin: 1em 0;
  color: var(--text-secondary, #666);
}

.export-page :not(pre) > code {
  background: rgba(0, 0, 0, 0.06);
  padding: var(--padding-code-inline-y, 0.2em) var(--padding-code-inline-x, 0.4em);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: var(--radius-code-inline, 4px);
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 0.9em;
  color: #e83e8c;
}

/* 代码块 */
.export-page pre {
  background: var(--bg-code, #f5f5f5);
  border-radius: 6px;
  padding: 1em;
  overflow-x: auto;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 0.9em;
  line-height: 1.5;
  color: var(--text-primary, #1f2330);
}
.export-page pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
  color: inherit;
}
/* 代码块语法高亮 (highlight.js) */
.export-page .hljs-keyword,
.export-page .hljs-selector-tag,
.export-page .hljs-type,
.export-page .hljs-literal,
.export-page .hljs-section,
.export-page .hljs-link,
.export-page .hljs-meta {
  color: var(--hljs-keyword, #d73a49);
}
.export-page .hljs-string,
.export-page .hljs-title,
.export-page .hljs-name,
.export-page .hljs-attribute,
.export-page .hljs-symbol,
.export-page .hljs-bullet,
.export-page .hljs-addition,
.export-page .hljs-variable,
.export-page .hljs-template-tag,
.export-page .hljs-template-variable {
  color: var(--hljs-string, #032f62);
}
.export-page .hljs-comment,
.export-page .hljs-quote,
.export-page .hljs-deletion {
  color: var(--hljs-comment, #6a737d);
}
.export-page .hljs-number,
.export-page .hljs-regexp,
.export-page .hljs-params {
  color: var(--hljs-number, #005cc5);
}
.export-page .hljs-built_in,
.export-page .hljs-operator {
  color: var(--hljs-built_in, #e36209);
}

.export-page table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}
.export-page th,
.export-page td {
  border: 1px solid var(--border, #d9ede5);
  padding: 0.5em 0.75em;
  text-align: left;
}
.export-page th {
  background: var(--bg-secondary, #f5f5f5);
  font-weight: 600;
}

.export-page .callout {
  border-left: 4px solid;
  border-radius: 0 6px 6px 0;
  padding: 12px 16px;
  margin: 1em 0;
  position: relative;
  color: inherit;
}
.export-page .callout-title {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 0.9em;
}
.export-page .callout-note       { background: rgba(9, 105, 218, 0.08);   border-color: #0969da; }
.export-page .callout-tip        { background: rgba(26, 127, 55, 0.08);   border-color: #1a7f37; }
.export-page .callout-important  { background: rgba(130, 80, 223, 0.08);  border-color: #8250df; }
.export-page .callout-warning    { background: rgba(191, 135, 0, 0.08);   border-color: #bf8700; }
.export-page .callout-caution    { background: rgba(207, 34, 46, 0.08);   border-color: #cf222e; }
.export-page .callout-abstract   { background: rgba(9, 105, 218, 0.08);   border-color: #0969da; }
.export-page .callout-info       { background: rgba(9, 105, 218, 0.08);   border-color: #0969da; }
.export-page .callout-success    { background: rgba(26, 127, 55, 0.08);   border-color: #1a7f37; }
.export-page .callout-question   { background: rgba(130, 80, 223, 0.08);  border-color: #8250df; }
.export-page .callout-failure    { background: rgba(207, 34, 46, 0.08);   border-color: #cf222e; }
.export-page .callout-danger     { background: rgba(207, 34, 46, 0.08);   border-color: #cf222e; }
.export-page .callout-bug        { background: rgba(207, 34, 46, 0.08);   border-color: #cf222e; }
.export-page .callout-example    { background: rgba(130, 80, 223, 0.08);  border-color: #8250df; }
.export-page .callout-quote      { background: rgba(157, 157, 157, 0.12); border-color: #9d9d9d; }
.export-page .callout-faq        { background: rgba(9, 105, 218, 0.08);   border-color: #0969da; }

.export-page .callout-title-note,
.export-page .callout-title-abstract,
.export-page .callout-title-info      { color: #0969da; }
.export-page .callout-title-tip,
.export-page .callout-title-success   { color: #1a7f37; }
.export-page .callout-title-important,
.export-page .callout-title-question,
.export-page .callout-title-example   { color: #8250df; }
.export-page .callout-title-warning   { color: #bf8700; }
.export-page .callout-title-caution,
.export-page .callout-title-failure,
.export-page .callout-title-danger,
.export-page .callout-title-bug       { color: #cf222e; }
.export-page .callout-title-quote     { color: #9d9d9d; }
.export-page .callout-title-faq       { color: #0969da; }
@media print {
  .export-page { padding: 0; }
}
</style>
${shadowCss}
</head>
<body>
<div class="export-page">${raw.outerHTML}</div>
</body>
</html>`;
}

/** html2canvas 渲染倍率，4x 保证 PDF 文字高度清晰 */
const RENDER_SCALE = 4;

/**
 * 把内容元素绘制到 canvas。
 * 使用 html2canvas（直接遍历 DOM 绘制，不借助 foreignObject），
 * 避免 WebView2 下 foreignObject 导致 canvas 被污染（tainted）而无法导出。
 */
async function renderToCanvas(raw: HTMLElement, backgroundColor: string): Promise<HTMLCanvasElement> {
  return html2canvas(raw, {
    backgroundColor,
    scale: RENDER_SCALE,
    useCORS: true,
    logging: false,
    windowWidth: raw.scrollWidth,
  });
}

/** 将内容元素栅格化为 PNG data URL */
export async function renderToPng(raw: HTMLElement, backgroundColor: string): Promise<string> {
  const canvas = await renderToCanvas(raw, backgroundColor);
  return canvas.toDataURL("image/png");
}

/** 不应跨页拆分的块级元素选择器 */
const UNSPLITTABLE_SELECTORS = [
  "p",
  "li",
  "pre",
  "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6",
  ".callout",
  "tr",
  "figure",
  "img",
  "svg",
  "ul[data-type='taskList'] > li",
];

/**
 * 收集 <pre> 代码块内每一行的上下边界（按视觉行，处理自动换行）。
 * 返回的坐标已换算为 canvas 像素，且相对于容器顶部。
 */
function collectCodeBlockLines(
  pre: HTMLElement,
  scale: number,
  offsetY: number,
): Array<{ top: number; bottom: number }> {
  const lines: Array<{ top: number; bottom: number }> = [];
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      lines.push({
        top: rect.top * scale - offsetY,
        bottom: rect.bottom * scale - offsetY,
      });
    }
  }

  if (lines.length === 0) return [];

  // 合并同一视觉行的多个文本片段（按 top 排序后相邻且 top 差 < 2px 的视为同一行）
  lines.sort((a, b) => a.top - b.top);
  const merged: Array<{ top: number; bottom: number }> = [];
  for (const line of lines) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(line.top - last.top) < 2 * scale) {
      last.bottom = Math.max(last.bottom, line.bottom);
    } else {
      merged.push({ top: line.top, bottom: line.bottom });
    }
  }
  return merged;
}

/**
 * 收集任意文本元素内每一行的上下边界（按视觉行，处理自动换行）。
 * 与 collectCodeBlockLines 逻辑相同，但泛化到 p / li / h1-h6 等。
 * 返回的坐标已换算为 canvas 像素，且相对于容器顶部。
 */
function collectParagraphLines(
  el: HTMLElement,
  scale: number,
  offsetY: number,
): Array<{ top: number; bottom: number }> {
  const lines: Array<{ top: number; bottom: number }> = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      lines.push({
        top: rect.top * scale - offsetY,
        bottom: rect.bottom * scale - offsetY,
      });
    }
  }

  if (lines.length === 0) return [];

  // 合并同一视觉行的多个文本片段
  lines.sort((a, b) => a.top - b.top);
  const merged: Array<{ top: number; bottom: number }> = [];
  for (const line of lines) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(line.top - last.top) < 2 * scale) {
      last.bottom = Math.max(last.bottom, line.bottom);
    } else {
      merged.push({ top: line.top, bottom: line.bottom });
    }
  }
  return merged;
}

/**
 * 将断点位置 snap 到最近的文本行边界（用于 p/li/h1-h6 等文本元素）。
 * 相比代码块使用更宽松的 40% 阈值以适配较大的行间距。
 */
function snapToTextLineBoundary(
  nextY: number,
  currentY: number,
  pageCanvasH: number,
  lines: Array<{ top: number; bottom: number }>,
): number {
  for (let i = 0; i < lines.length - 1; i++) {
    const thisLineBottom = lines[i].bottom;
    const nextLineTop = lines[i + 1].top;
    if (nextY >= thisLineBottom && nextY <= nextLineTop) {
      if (thisLineBottom - currentY >= pageCanvasH * 0.40) {
        return thisLineBottom;
      }
      return nextLineTop;
    }
  }

  const lastLine = lines[lines.length - 1];
  if (lastLine && nextY > lastLine.bottom) {
    return lastLine.bottom;
  }

  const firstLine = lines[0];
  if (firstLine && nextY < firstLine.top) {
    return firstLine.top;
  }

  return nextY;
}

/**
 * 将断点位置 snap 到最近的代码行边界，确保不会把一行代码切成两半。
 * 优先向上取整（让当前页以完整行结尾），若留白过少则向下取整。
 */
function snapToCodeLineBoundary(
  nextY: number,
  currentY: number,
  pageCanvasH: number,
  lines: Array<{ top: number; bottom: number }>,
): number {
  // 找到断点所在或相邻的行间隙
  for (let i = 0; i < lines.length - 1; i++) {
    const thisLineBottom = lines[i].bottom;
    const nextLineTop = lines[i + 1].top;
    if (nextY >= thisLineBottom && nextY <= nextLineTop) {
      // 断点落在这两行之间，优先选择上一行底部（保留完整行）
      if (thisLineBottom - currentY >= pageCanvasH * 0.35) {
        return thisLineBottom;
      }
      return nextLineTop;
    }
  }

  // 断点落在最后一行之后：若能放到上一行底部则放，否则保留原值
  const lastLine = lines[lines.length - 1];
  if (lastLine && nextY > lastLine.bottom) {
    return lastLine.bottom;
  }

  // 断点落在第一行之前：放到第一行顶部
  const firstLine = lines[0];
  if (firstLine && nextY < firstLine.top) {
    return firstLine.top;
  }

  return nextY;
}

/**
 * 根据 DOM 元素位置计算安全的分页断点，尽量避免把段落、代码块、表格行等
 * 块级元素从中间切断。
 */
function findSafePageBreaks(
  container: HTMLElement,
  pageCanvasH: number,
  scale: number,
  canvasH: number,
): number[] {
  const raw = container.querySelector(".tiptap-export-content") as HTMLElement | null;
  if (!raw) {
    return [0, canvasH];
  }

  const containerRect = container.getBoundingClientRect();
  const offsetY = containerRect.top * scale;

  // 内容区域的 canvas 坐标范围（排除容器 padding）
  const rawRect = raw.getBoundingClientRect();
  const contentTop = (rawRect.top - containerRect.top) * scale;
  const contentBottom = (rawRect.bottom - containerRect.top) * scale;

  const elements = Array.from(raw.querySelectorAll(UNSPLITTABLE_SELECTORS.join(", ")));
  const rects = elements
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el: el as HTMLElement,
        top: rect.top * scale - offsetY,
        bottom: rect.bottom * scale - offsetY,
        height: rect.height * scale,
      };
    })
    .filter((r) => r.height > 0);

  // 预计算所有代码块的行边界（用于比页面还高的代码块）
  const codeBlockLines = new Map<HTMLElement, Array<{ top: number; bottom: number }>>();
  rects
    .filter((r) => r.el.tagName === "PRE")
    .forEach((r) => {
      const lines = collectCodeBlockLines(r.el, scale, offsetY);
      if (lines.length > 0) {
        codeBlockLines.set(r.el, lines);
      }
    });

  const breaks: number[] = [contentTop];
  let currentY = contentTop;

  while (currentY < contentBottom) {
    let nextY = Math.min(currentY + pageCanvasH, contentBottom);
    if (nextY >= contentBottom) break;

    // 优先处理代码块：即使比页面高，也按行边界 snap，而不是任意切断
    const cutPre = rects.find(
      (r) => r.el.tagName === "PRE" && r.top < nextY && r.bottom > nextY,
    );
    if (cutPre) {
      if (cutPre.height < pageCanvasH) {
        // 代码块整体能放进一页，整体移到下一页
        nextY = cutPre.top;
      } else {
        // 代码块比页面高，按行边界 snap 避免切断代码行
        const lines = codeBlockLines.get(cutPre.el);
        if (lines && lines.length > 0) {
          nextY = snapToCodeLineBoundary(nextY, currentY, pageCanvasH, lines);
        }
      }
      // 若代码块比页面高且无法获取行边界，则按原位置切分（不得已）
    } else {
      // 查找会被当前断点切断的其他元素（比页面高的元素无法避免，跳过）
      const cut = rects.find(
        (r) => r.top < nextY && r.bottom > nextY && r.height < pageCanvasH,
      );

      if (cut) {
        // 方案 A：在该元素之前分页（保留更多空白在本页）
        const before = Math.max(currentY, cut.top);
        // 方案 B：在该元素之后分页（把该元素整体放到下一页）
        const after = cut.bottom;
        const tag = cut.el.tagName;

        // 列表项、表格行、图片整体不可再分：直接整体移到下一页
        if (tag === "LI" || tag === "TR" || tag === "FIGURE") {
          nextY = before;
        } else if (before - currentY >= pageCanvasH * 0.55) {
          // 若方案 A 仍保留超过 55% 的可用高度，优先提前分页
          nextY = before;
        } else if (after > currentY + pageCanvasH) {
          // 元素超出页面：尝试按文本行边界 snap，避免切断一行文字
          const tLines = collectParagraphLines(cut.el, scale, offsetY);
          if (tLines.length > 1) {
            nextY = snapToTextLineBoundary(
              currentY + pageCanvasH,
              currentY,
              pageCanvasH,
              tLines,
            );
          } else {
            nextY = after;
          }
        } else {
          nextY = after;
        }
      }
    }

    if (nextY <= currentY) {
      nextY = Math.min(currentY + pageCanvasH, contentBottom);
    }

    breaks.push(nextY);
    currentY = nextY;
  }

  breaks.push(contentBottom);
  return breaks;
}

/** 导出为 PDF 二进制（A4 多页切片，按页裁剪 + JPEG 压缩以减小体积） */
export async function exportPdfBytes(raw: HTMLElement, backgroundColor: string): Promise<Uint8Array> {
  // 一次性渲染完整内容（高倍率保证文字清晰度）
  const canvas = await renderToCanvas(raw, backgroundColor);
  const canvasW = canvas.width;
  const canvasH = canvas.height;

  // 根据内容宽高比决定横/竖版
  const orientation = canvasW >= canvasH ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: "a4",
    compress: true,
  });

  const pageW_pt = pdf.internal.pageSize.getWidth();
  const pageH_pt = pdf.internal.pageSize.getHeight();

  // 页面边距：内容不贴边
  const margin_pt = 36;
  const contentW_pt = pageW_pt - margin_pt * 2;
  const contentH_pt = pageH_pt - margin_pt * 2;

  // Canvas 像素 → PDF 内容区域点的换算比（按内容宽度缩放）
  const pxPerPt = canvasW / contentW_pt;
  const pageCanvasH = Math.ceil(contentH_pt * pxPerPt);

  // 计算安全分页断点，避免切断块级元素
  const breaks = findSafePageBreaks(raw, pageCanvasH, RENDER_SCALE, canvasH);
  const totalPages = breaks.length - 1;

  // 逐页裁剪，每页只嵌入当前页的 JPEG（而非整张大 PNG）
  for (let i = 0; i < totalPages; i++) {
    if (i > 0) pdf.addPage();

    const yStart = breaks[i];
    const yEnd = breaks[i + 1];
    const cropH = yEnd - yStart;

    // 从完整 canvas 裁剪当前页部分
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = canvasW;
    cropCanvas.height = cropH;
    const ctx = cropCanvas.getContext("2d")!;
    // 填充背景（JPEG 无透明通道，防止出现黑底）
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.drawImage(canvas, 0, yStart, canvasW, cropH, 0, 0, cropCanvas.width, cropH);

    // JPEG 高质量，配合 4x 渲染保证文字清晰
    const jpegDataUrl = cropCanvas.toDataURL("image/jpeg", 0.98);
    const imgH_pt = cropH / pxPerPt;
    pdf.addImage(jpegDataUrl, "JPEG", margin_pt, margin_pt, contentW_pt, imgH_pt);
  }

  const buf = pdf.output("arraybuffer");
  return new Uint8Array(buf);
}

/**
 * 构建微信公众号兼容 HTML。
 * 微信编辑器会过滤 <style> / <link> / JS，只保留内联样式。
 * 此函数将 CSS 类转换为 computed style，生成可直接粘贴到公众号编辑器的 HTML。
 */
export function buildWechatHtml(
  raw: HTMLElement,
  css: string,
  themeName: string,
  title: string,
): string {
  // 先构建完整 HTML 文档，再从中提取 body 内容并内联样式
  const fullHtml = buildHtmlDoc(raw, css, themeName, title);

  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, "text/html");

  // 创建一个临时容器，注入样式并计算 inline styles
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "677px";
  container.innerHTML = doc.body.innerHTML;
  document.body.appendChild(container);

  try {
    // 注入原始 CSS 到临时容器中，以便 getComputedStyle 生效
    const styleEl = document.createElement("style");
    styleEl.textContent = css + `
      .export-page { max-width: 677px; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
    `;
    container.appendChild(styleEl);

    // 递归遍历所有元素，将 computed style 内联
    const walkAndInline = (el: Element) => {
      if (el.nodeType !== Node.ELEMENT_NODE) return;

      const computed = window.getComputedStyle(el);
      const importantProps: string[] = [];

      // 文本样式
      const color = computed.color;
      if (color && color !== "rgb(0, 0, 0)") importantProps.push(`color:${color}`);
      const bg = computed.backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        importantProps.push(`background-color:${bg}`);
      }
      const fontSize = computed.fontSize;
      if (fontSize && fontSize !== "16px") importantProps.push(`font-size:${fontSize}`);
      const fontWeight = computed.fontWeight;
      if (fontWeight && fontWeight !== "400") importantProps.push(`font-weight:${fontWeight}`);
      const fontStyle = computed.fontStyle;
      if (fontStyle && fontStyle !== "normal") importantProps.push(`font-style:${fontStyle}`);
      const textDecoration = computed.textDecorationLine;
      if (textDecoration && textDecoration !== "none") importantProps.push(`text-decoration:${textDecoration}`);
      const textAlign = computed.textAlign;
      if (textAlign && textAlign !== "start" && textAlign !== "left") importantProps.push(`text-align:${textAlign}`);

      // 间距与边框
      const padLeft = computed.paddingLeft;
      if (padLeft && padLeft !== "0px") importantProps.push(`padding-left:${padLeft}`);
      const padRight = computed.paddingRight;
      if (padRight && padRight !== "0px") importantProps.push(`padding-right:${padRight}`);
      const padTop = computed.paddingTop;
      if (padTop && padTop !== "0px") importantProps.push(`padding-top:${padTop}`);
      const padBottom = computed.paddingBottom;
      if (padBottom && padBottom !== "0px") importantProps.push(`padding-bottom:${padBottom}`);
      const marginTop = computed.marginTop;
      if (marginTop && marginTop !== "0px") importantProps.push(`margin-top:${marginTop}`);
      const marginBottom = computed.marginBottom;
      if (marginBottom && marginBottom !== "0px") importantProps.push(`margin-bottom:${marginBottom}`);

      const borderLeftWidth = computed.borderLeftWidth;
      const borderLeftStyle = computed.borderLeftStyle;
      if (borderLeftWidth && borderLeftWidth !== "0px" && borderLeftStyle !== "none") {
        const borderLeftColor = computed.borderLeftColor;
        importantProps.push(`border-left:${borderLeftWidth} ${borderLeftStyle} ${borderLeftColor}`);
      }

      const borderRadius = computed.borderRadius;
      if (borderRadius && borderRadius !== "0px") importantProps.push(`border-radius:${borderRadius}`);

      // 表格
      if (el.tagName === "TABLE") {
        importantProps.push(`border-collapse:collapse`);
        importantProps.push(`width:100%`);
      }
      if (el.tagName === "TH" || el.tagName === "TD") {
        const border = computed.border;
        if (border && border !== "0px none rgb(0, 0, 0)") {
          importantProps.push(`border:${border}`);
        }
        importantProps.push(`padding:0.5em 0.75em`);
        if (el.tagName === "TH") {
          importantProps.push(`font-weight:600`);
        }
      }

      // 代码：使用支持中文的字体栈，避免 monospace 让中文字符被等宽拉宽
      if (el.tagName === "CODE" && el.parentElement?.tagName !== "PRE") {
        importantProps.push("font-family:'Microsoft YaHei','PingFang SC','Hiragino Sans GB','Source Han Sans CN',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif");
        importantProps.push("font-size:0.9em");
        importantProps.push("background-color:rgba(0,0,0,0.06)");
        importantProps.push("padding:0.15em 0.4em");
        importantProps.push("border-radius:4px");
      }

      // 代码块：使用支持中文的字体栈，避免 monospace 让中文字符被等宽拉宽
      if (el.tagName === "PRE") {
        importantProps.push(`border-radius:6px`);
        importantProps.push("font-family:'Microsoft YaHei','PingFang SC','Hiragino Sans GB','Source Han Sans CN',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif");
        importantProps.push("font-size:0.9em");
        importantProps.push("line-height:1.7");
        importantProps.push("overflow-x:auto");
      }

      // 图片：限制最大宽度
      if (el.tagName === "IMG") {
        importantProps.push("max-width:100%");
        importantProps.push("height:auto");
      }

      // 应用内联样式
      if (importantProps.length > 0) {
        (el as HTMLElement).style.cssText = importantProps.join(";") + ";" + (el as HTMLElement).style.cssText;
      }

      // 递归处理子元素
      for (const child of Array.from(el.children)) {
        walkAndInline(child);
      }
    };

    walkAndInline(container);

    // 清理：移除所有内联 SVG 图标（公众号编辑器不支持 SVG，且这些是编辑器的 UI 图标）
    const svgs = container.querySelectorAll("svg");
    for (const svg of svgs) {
      svg.remove();
    }

    // 清理：移除 Callout 块的原始 markdown 标记 [!TYPE] / [!TYPE]+ / [!TYPE]-
    // 这些标记在编辑器中通过 CSS visibility:hidden 隐藏，但公众号导出时 <style> 会被过滤，导致显示
    // 渲染后的标题 widget（.callout-title）已保留，无需这些占位标记
    const calloutMarkers = container.querySelectorAll(".callout-title-marker");
    for (const marker of calloutMarkers) {
      marker.remove();
    }

    // 清理：移除 Callout 标题 widget 后的第一个空段落
    // 原因：markdown 源文 "> [!TIP]\n>\n> content" 会产生两个段落，第一段仅包含 [!TIP] 标记，
    // 移除标记后该段落变为空 <p>，渲染时占一行高度，造成"标题与内容之间多余空行"
    // 仅移除紧邻标题 widget 的第一个空段落，保留其他段落间的空行（用户可能有意留白）
    const calloutTitlePs = container.querySelectorAll(".callout > p");
    for (const p of Array.from(calloutTitlePs)) {
      const prev = p.previousElementSibling;
      if (prev && prev.classList.contains("callout-title") && !p.textContent?.trim()) {
        p.remove();
      }
    }

    // 把 <pre> 块转换为 <blockquote> + 多个 <p>（每行一个段落）
    // 原因：公众号编辑器会把 <pre> 转成普通段落，\n 变空格，导致代码块无法换行
    // 公众号只保留 <blockquote> 和 <table> 的背景色与边框，但 <blockquote> 默认会带左侧边框，这里需要清除
    const hljsColorMap = getHljsColorMap();
    const preBlocks = Array.from(container.querySelectorAll("pre"));
    for (const pre of preBlocks) {
      const codeEl = pre.querySelector("code");
      // 收集 pre 的样式（背景、边框、内边距等）
      const preStyle = (pre as HTMLElement).getAttribute("style") || "";
      // white-space:pre-wrap 保留缩进空格，同时允许长行自动换行
      const codeP = "font-family:'Microsoft YaHei','PingFang SC','Hiragino Sans GB','Source Han Sans CN',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:0.85em;line-height:1.7;margin:0;padding:0;white-space:pre-wrap;word-break:break-all;overflow-wrap:break-word;";

      // 按行拆分，保留语法高亮 span 结构
      let lineHtmls: string[] = [];
      const codeText = codeEl?.textContent || pre.textContent || "";

      if (codeText.trim()) {
        // 检测编程语言：优先从 code 元素的 language-* class 获取
        let lang = "";
        if (codeEl) {
          const langClass = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
          lang = langClass ? langClass.replace("language-", "") : "";
        }

        // 使用 highlight.js 重新高亮，生成带 <span class="hljs-*"> 的 HTML
        let highlightedHtml: string;
        try {
          let result;
          if (lang) {
            result = hljs.highlight(codeText, { language: lang });
            // 如果高亮结果几乎没有 token（语言不支持），回退到自动检测
            if (result.value.indexOf('<span class="hljs-') === -1) {
              result = hljs.highlightAuto(codeText);
            }
          } else {
            result = hljs.highlightAuto(codeText);
          }
          highlightedHtml = result.value;
        } catch {
          // 高亮失败时回退到纯文本（转义 HTML）
          highlightedHtml = escapeHtml(codeText);
        }

        // 为 hljs span 设置内联颜色（公众号编辑器会过滤 <style>）
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = highlightedHtml;
        applyHljsColors(tempDiv, hljsColorMap);

        // 按行拆分为 <p> 元素，保留 <span> 高亮结构
        const marker = "__WECHAT_LB__";
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          textNodes.push(node);
        }
        for (const tn of textNodes) {
          tn.textContent = tn.textContent!.replace(/\n/g, marker);
        }

        lineHtmls = tempDiv.innerHTML.split(marker);
      }

      // 去掉首尾空行
      while (lineHtmls.length > 0 && lineHtmls[0].trim() === "") lineHtmls.shift();
      while (lineHtmls.length > 0 && lineHtmls[lineHtmls.length - 1].trim() === "") lineHtmls.pop();

      const blockquote = document.createElement("blockquote");
      // 显式覆盖公众号默认 blockquote 样式：清掉左侧边框，统一背景和圆角
      blockquote.setAttribute("style", `${preStyle}margin:1em 0;padding:0.8em 1em;border-radius:6px;border-left:0;background-color:rgba(0,0,0,0.04);`);
      for (const line of lineHtmls) {
        const p = document.createElement("p");
        p.setAttribute("style", codeP);
        if (line.trim() === "") {
          // 空行用零宽空格占位，避免被合并
          p.innerHTML = "\u200B";
        } else {
          // 使用 innerHTML 保留语法高亮的 span 标签和内联颜色
          p.innerHTML = line;
        }
        blockquote.appendChild(p);
      }
      pre.replaceWith(blockquote);
    }

    // ── 处理 TaskList — 把结构 + 样式直接内联到 DOM，公众号不支持 CSS 伪元素 ──
    // 用 getElementsByTagName 遍历避免 querySelectorAll 在临时 DOM 中的兼容问题
    const allUls = container.getElementsByTagName("ul");
    const taskListUls: HTMLUListElement[] = [];
    for (let i = 0; i < allUls.length; i++) {
      if (allUls[i].getAttribute("data-type") === "taskList") {
        taskListUls.push(allUls[i] as HTMLUListElement);
      }
    }

    for (const ul of taskListUls) {
      ul.style.cssText = "list-style:none;padding-left:0;position:relative;margin:0;";

      const childLis = ul.children;
      for (let k = 0; k < childLis.length; k++) {
        const li = childLis[k] as HTMLElement;
        if (li.tagName !== "LI" || li.getAttribute("data-type") !== "taskItem") continue;

        const isChecked = li.getAttribute("data-checked") === "true";
        li.style.cssText = "display:flex;align-items:flex-start;gap:8px;margin:6px 0;";

        // 递归处理嵌套子任务列表的缩进
        const nestedUls = li.getElementsByTagName("ul");
        for (let j = 0; j < nestedUls.length; j++) {
          const nested = nestedUls[j];
          if (nested.getAttribute("data-type") !== "taskList") continue;
          nested.style.setProperty("margin", "4px 0");
          nested.style.setProperty("margin-left", "24px");
          nested.style.setProperty("list-style", "none");
          nested.style.setProperty("padding-left", "0");
          nested.style.setProperty("position", "relative");
        }

        // 替换 input[type="checkbox"] 为圆形 span
        const inputs = li.getElementsByTagName("input");
        for (let m = 0; m < inputs.length; m++) {
          const cb = inputs[m];
          if (cb.type !== "checkbox") continue;

          const checkSpan = document.createElement("span");
          checkSpan.style.cssText = isChecked
            ? "display:inline-block;width:16px;height:16px;min-width:16px;background:#5b8c5a;border:2px solid #5b8c5a;border-radius:50%;vertical-align:middle;flex-shrink:0;text-align:center;font-size:11px;color:#fff;line-height:14px;box-sizing:content-box;"
            : "display:inline-block;width:16px;height:16px;min-width:16px;border:2px solid #c0c0c0;border-radius:50%;vertical-align:middle;flex-shrink:0;box-sizing:content-box;";
          if (isChecked) checkSpan.textContent = "✓";
          cb.replaceWith(checkSpan);

          // 样式化父级 label
          const parentLabel = checkSpan.parentElement;
          if (parentLabel && parentLabel.tagName === "LABEL") {
            parentLabel.style.cssText = "flex-shrink:0;display:inline-flex;align-items:center;";
          }
          break;
        }

        // 移除空 checkboxStyler span
        const spans = li.getElementsByTagName("span");
        for (let n = spans.length - 1; n >= 0; n--) {
          const s = spans[n];
          if (!s.style.cssText && !s.textContent?.trim() && !s.querySelector("*")) {
            s.remove();
          }
        }

        // 内容容器 div
        const divs = li.getElementsByTagName("div");
        if (divs.length > 0) {
          const content = divs[0] as HTMLElement;
          content.style.cssText =
            "flex:1;min-width:0;" + (isChecked ? "text-decoration:line-through;color:#999;" : "");
          const firstP = content.querySelector("p");
          if (firstP) {
            firstP.style.setProperty("margin-top", "0");
            firstP.style.setProperty("margin-bottom", "0");
          }
        }
      }
    }

    // 提取 .export-page 的内容（去除外部 wrapper）
    const exportPage = container.querySelector(".export-page");
    const innerHtml = exportPage ? exportPage.innerHTML : container.innerHTML;

    // 清理：移除所有 <style> 标签（公众号过滤器会剔除它们）
    const clean = innerHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

    // 构建可直接粘贴的 HTML
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style="max-width:677px;margin:0 auto;padding:20px 0;font-size:16px;color:#3f3f3f;line-height:1.8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Helvetica Neue',Helvetica,Arial,sans-serif;">
${clean}
</body>
</html>`;
  } finally {
    container.remove();
  }
}
