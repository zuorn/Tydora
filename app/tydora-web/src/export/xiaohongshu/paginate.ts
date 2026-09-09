// 卡片分页：严格按 --- 分割线（hr）分页。
// - 只要内容中存在 hr，断点即为每个 hr 底部——分割线之间的内容各自成为一张卡片，
//   完全忽略页高与标题分页设置（卡片高度由 render.ts 按分段内容自适应）；
// - 仅当内容中不存在任何 hr 时，退化为按页高安全切分（兜底，保证不切断块级元素/
//   代码行/文本行，算法与 src/export/exporters.ts 的 findSafePageBreaks 一致，但改为
//   内容相对坐标、scale=1）。
// 断点坐标均为内容相对坐标（CSS px）。

/** 不可分割块级元素选择器（同时用于空段检测） */
export const UNSPLITTABLE_SELECTORS = [
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

interface LineRect {
  top: number;
  bottom: number;
}

/** 收集元素内每个视觉行（处理自动换行）的上下边界，坐标相对内容顶部 */
function collectTextLines(el: HTMLElement, offsetTop: number): LineRect[] {
  const lines: LineRect[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      lines.push({ top: rect.top - offsetTop, bottom: rect.bottom - offsetTop });
    }
  }
  if (lines.length === 0) return [];

  lines.sort((a, b) => a.top - b.top);
  const merged: LineRect[] = [];
  for (const line of lines) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(line.top - last.top) < 2) {
      last.bottom = Math.max(last.bottom, line.bottom);
    } else {
      merged.push({ top: line.top, bottom: line.bottom });
    }
  }
  return merged;
}

/** 将断点 snap 到最近的文本行边界，避免切断一行文字（阈值 ratio） */
function snapToLineBoundary(
  nextY: number,
  currentY: number,
  pageH: number,
  lines: LineRect[],
  ratio: number,
): number {
  for (let i = 0; i < lines.length - 1; i++) {
    const thisLineBottom = lines[i].bottom;
    const nextLineTop = lines[i + 1].top;
    if (nextY >= thisLineBottom && nextY <= nextLineTop) {
      if (thisLineBottom - currentY >= pageH * ratio) {
        return thisLineBottom;
      }
      return nextLineTop;
    }
  }
  const lastLine = lines[lines.length - 1];
  if (lastLine && nextY > lastLine.bottom) return lastLine.bottom;
  const firstLine = lines[0];
  if (firstLine && nextY < firstLine.top) return firstLine.top;
  return nextY;
}

/**
 * 计算分页断点。返回内容相对坐标（CSS px），首尾分别为 0 与内容总高。
 * 内容中存在 hr（---）时严格按分割线分页；无 hr 时按页高安全切分。
 */
export function computePageBreaks(
  contentEl: HTMLElement,
  pageContentH: number,
): number[] {
  const contentRect = contentEl.getBoundingClientRect();
  const offsetTop = contentRect.top;
  const contentBottom = contentEl.offsetHeight;

  if (contentBottom <= 0) return [0, 0];

  const elements = Array.from(contentEl.querySelectorAll(UNSPLITTABLE_SELECTORS.join(", ")));
  const rects = elements
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el: el as HTMLElement,
        top: rect.top - offsetTop,
        bottom: rect.bottom - offsetTop,
        height: rect.height,
      };
    })
    .filter((r) => r.height > 0);

  // 分割线（--- / <hr>）：作为分页点收集（不属于不可分割元素）
  const hrRects = Array.from(contentEl.querySelectorAll("hr"))
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el: el as HTMLElement,
        top: rect.top - offsetTop,
        bottom: rect.bottom - offsetTop,
        height: rect.height,
      };
    })
    .filter((r) => r.height > 0);

  // ── 严格分割线分页 ──
  // 只要存在 hr（---），断点即为每个 hr 底部：分割线之间的内容各自成一张卡片，
  // 完全忽略页高与标题分页设置（卡片高度由 render.ts 按分段内容自适应）。
  if (hrRects.length > 0) {
    const breaks: number[] = [0];
    for (const hr of hrRects) {
      const b = hr.bottom;
      if (b > breaks[breaks.length - 1] && b < contentBottom) breaks.push(b);
    }
    if (breaks[breaks.length - 1] < contentBottom) breaks.push(contentBottom);
    return breaks;
  }

  const codeBlockLines = new Map<HTMLElement, LineRect[]>();
  for (const r of rects) {
    if (r.el.tagName !== "PRE") continue;
    const lines = collectTextLines(r.el, offsetTop);
    if (lines.length > 0) codeBlockLines.set(r.el, lines);
  }

  const breaks: number[] = [0];
  let currentY = 0;

  while (currentY < contentBottom) {
    let nextY = Math.min(currentY + pageContentH, contentBottom);
    if (nextY >= contentBottom) break;

    const cutPre = rects.find(
      (r) => r.el.tagName === "PRE" && r.top < nextY && r.bottom > nextY,
    );
    if (cutPre) {
      if (cutPre.height < pageContentH) {
        nextY = cutPre.top;
      } else {
        const lines = codeBlockLines.get(cutPre.el);
        if (lines && lines.length > 0) {
          nextY = snapToLineBoundary(nextY, currentY, pageContentH, lines, 0.35);
        }
      }
    } else {
      const cut = rects.find(
        (r) => r.top < nextY && r.bottom > nextY && r.height < pageContentH,
      );
      if (cut) {
        const before = Math.max(currentY, cut.top);
        const after = cut.bottom;
        const tag = cut.el.tagName;

        if (tag === "LI" || tag === "TR" || tag === "FIGURE") {
          nextY = before;
        } else if (before - currentY >= pageContentH * 0.55) {
          nextY = before;
        } else if (after > currentY + pageContentH) {
          const tLines = collectTextLines(cut.el, offsetTop);
          if (tLines.length > 1) {
            nextY = snapToLineBoundary(currentY + pageContentH, currentY, pageContentH, tLines, 0.40);
          } else {
            nextY = after;
          }
        } else {
          nextY = after;
        }
      }
    }

    if (nextY <= currentY) {
      nextY = Math.min(currentY + pageContentH, contentBottom);
    }
    breaks.push(nextY);
    currentY = nextY;
  }

  breaks.push(contentBottom);
  return breaks;
}
