// 小红书卡片渲染：复用导出 DOM 准备管线，构建卡片 DOM 并用 html-to-image 栅格化
// 渲染引擎与参考项目（note-to-red）一致：SVG foreignObject 方案，文字与浏览器渲染 100% 一致
import { toPng } from "html-to-image";
import appIconUrl from "../../assets/icon.png?inline";
import {
  prepareExportElement,
  inlineImages,
  rasterizeMermaidSvgsForDocx,
  replaceTaskCheckboxesWithSvg,
} from "../dom";
import { computePageBreaks, UNSPLITTABLE_SELECTORS } from "./paginate";
import { getXhsTheme, XHS_THEMES } from "./themes";
import type { XhsSettings, XhsTheme, XhsCard, XhsRatio, XhsImagePositions, XhsCardDom } from "./types";
import { XHS_FONT_FAMILIES, ensureXhsWebFont } from "./fonts";

const XHS_THEME_IDS = XHS_THEMES.map((t) => t.id);

/** 1×1 透明 PNG（参考项目 imagePlaceholder：图片加载失败时占位，避免渲染异常） */
const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** 快速字符串哈希（cyrb53）：用于判断卡片分段内容是否变化，跳过未变化分段的重新渲染 */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/**
 * 卡片渲染增量缓存：key = 渲染设置 + 卡片序号 + 分段内容哈希。
 * 用户编辑时只有受影响的分段需要重新栅格化，其余分段直接复用上次的 PNG，
 * 避免每次内容变化都全量重渲（toPng 是生成流程中最耗时的部分）。
 * 一轮构建结束后会清理未命中的旧项，防止缓存无限增长。
 */
const cardRenderCache = new Map<string, string>();

/** 各比例对应的卡片逻辑尺寸（CSS px） */
const RATIO_SIZES: Record<XhsRatio, { width: number; height: number }> = {
  // 与参考项目卡片逻辑尺寸一致（450px 宽，导出为 1350×1800）
  "3:4": { width: 450, height: 600 },
  "3:5": { width: 450, height: 750 },
  "1:1": { width: 600, height: 600 },
};

/** 3:4 基准尺寸（导出常量，兼容外部引用） */
export const XHS_CARD_WIDTH = RATIO_SIZES["3:4"].width;
export const XHS_CARD_HEIGHT = RATIO_SIZES["3:4"].height;

// 布局参数对齐参考项目：内边距 22px/24px、footer 高 48px
const CONTENT_PADDING_TOP = 22;
const CONTENT_PADDING_X = 24;
const FOOTER_HEIGHT = 48;
/** 导出像素比（参考项目 EXPORT_PIXEL_RATIO = 3） */
const EXPORT_PIXEL_RATIO = 3;

/** 正文可用高度（受卡片比例影响） */
function getContentHeight(ratio: XhsRatio): number {
  return RATIO_SIZES[ratio].height - CONTENT_PADDING_TOP - FOOTER_HEIGHT;
}

/** 正文字体族映射 */
let themeStyleInjected = false;
let cardStyleInjected = false;

/** 注入卡片主题 CSS 变量（一次性） */
function ensureThemeStylesheet(): void {
  if (themeStyleInjected) return;
  themeStyleInjected = true;
  const rules = XHS_THEME_IDS.map((id) => {
    const theme = getXhsTheme(id);
    const decls = Object.entries(theme.vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");
    return `.xhs-themed[data-xhs-theme="${id}"] { ${decls} }`;
  }).join("\n");

  const style = document.createElement("style");
  style.id = "xhs-theme-vars";
  style.textContent = rules;
  document.head.appendChild(style);
}

/** 卡片内容样式（一次性）：标题字号、封面、footer、图片圆角等 */
const CARD_CONTENT_CSS = `
.xhs-card { position: relative; overflow: hidden; box-sizing: border-box; border: none; font-family: Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, "PingFang SC", sans-serif; }
.xhs-card .tiptap-export-content { color: var(--text-primary); }
.xhs-card h1 { font-size: 1.8em; font-weight: 600; line-height: 1.18; margin: 0.9em 0 0.5em; color: var(--text-primary); }
.xhs-card h2 { font-size: 1.5em; font-weight: 600; line-height: 1.5; margin: 0.9em 0 0.5em; letter-spacing: -0.01em; color: var(--text-primary); }
.xhs-card h3 { font-size: 1.25em; font-weight: 600; line-height: 1.5; margin: 1.6em 0 0.4em; color: var(--text-primary); }
.xhs-card h4 { font-size: 1.12em; font-weight: 600; line-height: 1.5; margin: 0.8em 0 0.4em; color: var(--text-primary); }
.xhs-card h5 { font-size: 1em; font-weight: 600; margin: 0.7em 0 0.4em; color: var(--text-primary); }
.xhs-card h6 { font-size: 0.9em; font-weight: 600; margin: 0.7em 0 0.4em; color: var(--text-primary); }
.xhs-card p { margin: 0 0 1.1em; }
.xhs-card strong, .xhs-card b { font-weight: 700; color: var(--text-strong, inherit); }
.xhs-card img { display: block; max-width: 100%; height: auto; margin-left: auto; margin-right: auto; border-radius: 12px; }
.xhs-card .image-node-view { display: block; text-align: center; margin-left: auto; margin-right: auto; }
.xhs-card hr { border: none; border-top: 1px solid var(--border, #2c2c2e); margin: 26px 0; }
.xhs-card .tiptap-mathematics-render .katex-display { overflow-x: auto; overflow-y: hidden; padding: 2px 0; }
.xhs-card .katex { font-size: 1.05em; }
.xhs-card a.wiki-link { color: var(--accent, #0A84FF); text-decoration: none; border-bottom: 1px dashed var(--accent, #0A84FF); }
.xhs-card .md-tag, .xhs-card span[data-tag] { color: var(--accent, #0A84FF); }
.xhs-card .mermaid-node img { border-radius: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
.xhs-card .xhs-card-footer { display: flex; align-items: center; justify-content: space-between; font-family: Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, "PingFang SC", sans-serif; }
.xhs-card .xhs-card-footer-brand { font-size: 13px; color: var(--text-secondary); letter-spacing: 0.5px; }
.xhs-card .xhs-card-footer-page { font-size: 13px; color: var(--text-secondary); }
.xhs-card .xhs-card-cover-title { font-size: 32px; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; color: var(--text-primary); margin: 0; }
.xhs-card .xhs-card-cover-summary { font-size: 14px; line-height: 1.7; color: var(--text-secondary); margin: 16px 0 0; }
.xhs-card .xhs-card-cover-bar { width: 40px; height: 4px; border-radius: 2px; background: var(--accent); margin-bottom: 20px; }
.xhs-card .xhs-card-grid-overlay { position: absolute; top: 1px; left: 1px; right: 1px; bottom: 1px; pointer-events: none; z-index: -1; background-image: linear-gradient(to right, rgba(120, 120, 120, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(120, 120, 120, 0.08) 1px, transparent 1px); }
`;

function ensureCardStylesheet(): void {
  if (cardStyleInjected) return;
  cardStyleInjected = true;
  const style = document.createElement("style");
  style.id = "xhs-card-styles";
  style.textContent = CARD_CONTENT_CSS;
  document.head.appendChild(style);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function applyCardBase(
  card: HTMLElement,
  theme: XhsTheme,
  size: { width: number; height: number },
  fontFamily: string,
): void {
  card.className = "xhs-card xhs-themed";
  card.setAttribute("data-xhs-theme", theme.id);
  card.style.width = `${size.width}px`;
  card.style.height = `${size.height}px`;
  card.style.position = "relative";
  // 建立堆叠上下文，让网格线 overlay（z-index:-1）停留在卡片背景之上、内容之下
  card.style.zIndex = "0";
  card.style.overflow = "hidden";
  card.style.background = "var(--bg-primary)";
  card.style.color = "var(--text-primary)";
  card.style.fontFamily = fontFamily;
}

/**
 * 构图网格线覆盖层（辅助对齐/检查内容溢出）。
 * 每格为正方形、边长 = 正文字号 × 行高（1.8），正好容纳一行文字，随字号设置联动。
 */
function createGridOverlay(fontSizePx: number): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "xhs-card-grid-overlay";
  const cell = Math.round(fontSizePx * 1.8);
  overlay.style.backgroundSize = `${cell}px ${cell}px`;
  return overlay;
}

function buildFooter(settings: XhsSettings, index: number, total: number): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "xhs-card-footer";
  // 与参考项目一致的 footer：通栏置于卡片底部，顶部 1px 分隔线
  footer.style.cssText = `position:absolute;left:0;right:0;bottom:0;height:${FOOTER_HEIGHT}px;padding:0 ${CONTENT_PADDING_X}px;box-sizing:border-box;border-top:1px solid var(--border, rgba(0,0,0,0.08));background:var(--bg-primary);`;

  const left = document.createElement("span");
  left.className = "xhs-card-footer-brand";
  left.style.display = "flex";
  left.style.alignItems = "center";
  left.style.gap = "6px";
  // 品牌名称前放置应用图标
  const icon = document.createElement("img");
  icon.src = appIconUrl;
  icon.alt = "";
  icon.style.width = "22px";
  icon.style.height = "22px";
  icon.style.borderRadius = "5px";
  icon.style.flexShrink = "0";
  left.appendChild(icon);
  left.appendChild(document.createTextNode("Tydora"));

  const right = document.createElement("span");
  right.style.cssText = "display:flex;align-items:center;";
  if (settings.pageNumber) {
    const page = document.createElement("span");
    page.className = "xhs-card-footer-page";
    page.textContent = `${pad(index + 1)} / ${pad(total)}`;
    right.appendChild(page);
  }

  footer.appendChild(left);
  footer.appendChild(right);
  return footer;
}

interface CoverInfo {
  title: string;
  summary: string;
}

function extractCoverInfo(contentEl: HTMLElement, fallbackTitle: string): CoverInfo {
  const h1 = contentEl.querySelector("h1");
  const title = h1?.textContent?.trim() || fallbackTitle || "Untitled";
  // 封面只保留标题，不提取摘要（正文由分割线严格分隔）
  return { title, summary: "" };
}

function buildCoverCard(
  theme: XhsTheme,
  settings: XhsSettings,
  info: CoverInfo,
  index: number,
  total: number,
): HTMLElement {
  const card = document.createElement("div");
  applyCardBase(card, theme, RATIO_SIZES[settings.ratio], XHS_FONT_FAMILIES[settings.fontFamily]);

  const wrap = document.createElement("div");
  wrap.className = "xhs-card-cover";
  wrap.style.cssText = `position:absolute;left:${CONTENT_PADDING_X}px;right:${CONTENT_PADDING_X}px;top:${CONTENT_PADDING_TOP}px;bottom:${FOOTER_HEIGHT}px;display:flex;flex-direction:column;justify-content:center;`;

  const bar = document.createElement("div");
  bar.className = "xhs-card-cover-bar";
  const titleEl = document.createElement("h1");
  titleEl.className = "xhs-card-cover-title";
  titleEl.textContent = info.title;
  const summaryEl = document.createElement("p");
  summaryEl.className = "xhs-card-cover-summary";
  summaryEl.textContent = info.summary;

  wrap.appendChild(bar);
  wrap.appendChild(titleEl);
  wrap.appendChild(summaryEl);
  // 网格线置于最底层（内容之前插入），不遮挡标题/图片
  if (settings.gridLines) card.appendChild(createGridOverlay(settings.fontSize));
  card.appendChild(wrap);
  card.appendChild(buildFooter(settings, index, total));
  return card;
}

/**
 * 判断 [from, to) 区间内是否存在实际内容块。
 * hr 是分页边界（不属于内容），仅用于定位；空白段（如封面标题与首个分割线之间
 * 的 margin）会被判定为无内容，从而在分页时被合并掉，避免产生空白卡片。
 */
function segmentHasBlock(contentEl: HTMLElement, from: number, to: number): boolean {
  if (to - from <= 1) return false;
  const offsetTop = contentEl.getBoundingClientRect().top;
  const els = contentEl.querySelectorAll(UNSPLITTABLE_SELECTORS.join(", "));
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as HTMLElement;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) continue;
    const top = rect.top - offsetTop;
    const bottom = rect.bottom - offsetTop;
    if (Math.min(to, bottom) - Math.max(from, top) > 0.5) return true;
  }
  return false;
}

function buildBodyCard(
  contentEl: HTMLElement,
  from: number,
  to: number,
  theme: XhsTheme,
  settings: XhsSettings,
  index: number,
  total: number,
): HTMLElement {
  const card = document.createElement("div");
  const { width } = RATIO_SIZES[settings.ratio];
  // 卡片高度自适应本段内容（分割线之间的内容整段放入一张卡片）；
  // 至少保持一页标准高度，避免分段过短时卡片过矮
  const segH = Math.max(0, to - from);
  const height = Math.max(
    RATIO_SIZES[settings.ratio].height,
    CONTENT_PADDING_TOP + Math.ceil(segH) + FOOTER_HEIGHT,
  );
  applyCardBase(card, theme, { width, height }, XHS_FONT_FAMILIES[settings.fontFamily]);

  // 视口结构必须与测量容器同构（padding 22/24，顶部无偏移）：
  // 1) 高度 = 22 + 分段内容高度，overflow:hidden 在分段末尾精确裁剪（用原始浮点值，
  //    避免 ceil 放大导致下一段顶部露出细边）；
  // 2) 用 padding 而非 top 偏移，保证克隆内容的 margin 折叠行为与测量容器一致，
  //    否则首个元素的 margin 会把整段内容下推，导致裁剪错位。
  const viewport = document.createElement("div");
  viewport.style.cssText =
    `position:absolute;top:0;left:0;right:0;height:${CONTENT_PADDING_TOP + segH}px;` +
    `padding:${CONTENT_PADDING_TOP}px ${CONTENT_PADDING_X}px 0;box-sizing:border-box;overflow:hidden;`;

  const content = contentEl.cloneNode(true) as HTMLElement;
  // 分割线（---）是分页标记，不出现在卡片上；用 visibility 隐藏而非移除，
  // 保留其占位高度，避免其后的内容上移导致与测量坐标错位
  content.querySelectorAll("hr").forEach((el) => {
    (el as HTMLElement).style.visibility = "hidden";
  });
  // 与测量容器 contentEl 一致（flow-root 阻止 margin 穿透），保证克隆内
  // 各元素垂直位置与测量坐标一一对应
  content.style.display = "flow-root";
  content.style.transform = `translateY(${-from}px)`;
  viewport.appendChild(content);
  // 网格线置于最底层（内容之前插入），不遮挡正文/图片
  if (settings.gridLines) card.appendChild(createGridOverlay(settings.fontSize));
  card.appendChild(viewport);
  card.appendChild(buildFooter(settings, index, total));
  return card;
}

/**
 * 移除克隆卡片中完全落在当前分段外的图片。
 * 卡片克隆包含整篇文档的内容，html-to-image 序列化时会遍历并 embed 所有 <img>，
 * 即使它们被 viewport 的 overflow:hidden 裁掉，仍会白白消耗解码/编码时间。
 * 在克隆 DOM 上移除（不影响测量容器 contentEl），可显著降低长文多图场景的渲染开销。
 *
 * 注意不能对所有分段外图片直接 remove：
 * - 分段下方的图片（top >= to）可以安全移除，不影响当前分段及上方内容的布局；
 * - 分段上方的图片（bottom <= from）若直接移除，其占据的垂直空间消失，
 *   会导致后续内容整体上移，与卡片的 translateY(-from) 定位错位，分页错乱，
 *   因此用等高占位符替换，保留其空间。
 */
function pruneImagesOutsideSegment(content: HTMLElement, from: number, to: number): void {
  const contentTop = content.getBoundingClientRect().top;
  const imgs = content.querySelectorAll("img");
  for (const img of Array.from(imgs)) {
    const rect = img.getBoundingClientRect();
    const top = rect.top - contentTop;
    const bottom = rect.bottom - contentTop;
    // 图片完全位于分段下方：直接移除（不影响本分段布局）
    if (top >= to) {
      img.remove();
      continue;
    }
    // 图片完全位于分段上方：用等高占位符替换，保留其垂直空间，避免后续内容上移错位
    if (bottom <= from) {
      const placeholder = document.createElement("div");
      placeholder.style.height = `${rect.height}px`;
      img.replaceWith(placeholder);
      continue;
    }
    // 跨分段边界的图片保留（会显示在当前卡片中）
  }
}

/** 等待元素内所有图片加载完成（complete / load / error / 超时兜底） */
async function waitForImages(root: HTMLElement, timeoutMs = 10000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          const timer = window.setTimeout(done, timeoutMs);
          function done() {
            window.clearTimeout(timer);
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          }
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        }),
    ),
  );
}

async function renderCard(card: HTMLElement, width: number, height: number): Promise<string> {
  // 与参考项目一致的导出方式：html-to-image（SVG foreignObject）+ pixelRatio 3
  return toPng(card, {
    pixelRatio: EXPORT_PIXEL_RATIO,
    width,
    height,
    imagePlaceholder: TRANSPARENT_PNG,
    // 单张图片加载失败不拖垮整卡渲染
    onImageErrorHandler: () => {},
  });
}

export interface XhsBuildResult {
  cards: XhsCard[];
  warnings: string[];
}

/** 卡片构建统一入参 */
interface XhsBuildOpts {
  getContentElement: () => HTMLElement | null;
  editorTheme: string;
  settings: XhsSettings;
  title: string;
  /** 用户拖拽调整后的图片位置（key = cyrb53(图片 data URL)） */
  imagePositions?: XhsImagePositions;
}

/** 内容准备产物：测量容器、分页断点、封面信息等，供构建卡片 DOM 使用 */
interface PreparedXhs {
  settings: XhsSettings;
  theme: XhsTheme;
  contentEl: HTMLElement;
  breaks: number[];
  useCoverCard: boolean;
  coverInfo: CoverInfo;
  totalPages: number;
  settingsKey: string;
  cardW: number;
  cardH: number;
  cleanup: () => void;
}

/**
 * 准备卡片渲染所需内容：克隆编辑器 DOM、内联图片、测量分页断点。
 * 供 buildXhsCards（栅格化导出）与 buildXhsCardDoms（预览交互）共用，
 * 保证两者排版/分页/裁剪行为完全一致。
 */
async function prepareXhsContent(opts: XhsBuildOpts): Promise<PreparedXhs> {
  const raw = opts.getContentElement();
  if (!raw) throw new Error("XHS_SOURCE_MODE");

  ensureThemeStylesheet();
  ensureCardStylesheet();
  ensureXhsWebFont(opts.settings.fontFamily);

  const theme = getXhsTheme(opts.settings.themeId);
  const { width: cardW, height: cardH } = RATIO_SIZES[opts.settings.ratio];
  const { container, cleanup } = prepareExportElement(raw, opts.editorTheme, true);

  try {
    container.querySelector(".export-app-header")?.remove();

    // 测量容器与卡片使用同一套排版规则（.xhs-card 的 CARD_CONTENT_CSS）：
    // 否则测量坐标与卡片内实际渲染的垂直位置不一致，分段裁剪会错位
    container.classList.add("xhs-card");
    // 卡片主题变量 + 测量尺寸（与卡片内容宽度一致）
    container.classList.add("xhs-themed");
    container.setAttribute("data-xhs-theme", theme.id);
    container.style.width = `${cardW}px`;
    container.style.padding = `${CONTENT_PADDING_TOP}px ${CONTENT_PADDING_X}px ${FOOTER_HEIGHT}px`;
    container.style.boxSizing = "border-box";
    container.style.background = "var(--bg-primary)";
    container.style.color = "var(--text-primary)";

    await inlineImages(raw);
    // frontmatter 为元数据块，不进入正文卡片（与 docx 导出一致）
    container.querySelectorAll("[data-type='frontmatter']").forEach((el) => el.remove());
    // Mermaid SVG 栅格化为 <img>，两种渲染引擎下均能稳定输出
    await rasterizeMermaidSvgsForDocx(container);
    replaceTaskCheckboxesWithSvg(container);

    // 图片高度限制（参考项目：正文图片 max-height 252px），避免大图撑爆卡片/被分页切穿；
    // 同时转为块级水平居中，使卡片内图片（含首图）居中显示。
    container.querySelectorAll("img").forEach((img) => {
      img.style.maxWidth = "100%";
      img.style.maxHeight = "252px";
      img.style.width = "auto";
      img.style.height = "auto";
      img.style.display = "block";
      img.style.margin = "0 auto";
      const wrapper = img.closest<HTMLElement>(".image-node-view");
      if (wrapper) {
        wrapper.style.display = "block";
        wrapper.style.textAlign = "center";
        wrapper.style.margin = "0 auto";
      }
    });

    // 等待图片加载完成，确保分页测量时图片高度正确（避免高度为 0 导致分页错位）
    await waitForImages(container);

    const contentEl = container.querySelector(".tiptap-export-content") as HTMLElement | null;
    if (!contentEl) throw new Error("XHS_EMPTY");

    // 统一正文字号/行高/字体（em 型标题随此缩放）；行高 1.8 与参考项目一致
    contentEl.style.fontSize = `${opts.settings.fontSize}px`;
    contentEl.style.lineHeight = "1.8";
    contentEl.style.fontFamily = XHS_FONT_FAMILIES[opts.settings.fontFamily];
    // 阻止首个子元素 margin 穿透（与卡片克隆的 flow-root 保持一致），
    // 保证测量坐标系与卡片渲染坐标系完全对齐
    contentEl.style.display = "flow-root";
    // 加粗等文本样式显式内联，保持与文档渲染一致
    contentEl.querySelectorAll("strong, b").forEach((el) => {
      const s = el as HTMLElement;
      s.style.fontWeight = "700";
      s.style.color = "var(--text-strong)";
    });

    // 为每张图片标记稳定哈希（基于内联后的 data URL），供「预览拖拽调整位置」识别
    contentEl.querySelectorAll("img").forEach((img) => {
      img.dataset.xhsImgHash = cyrb53(img.src);
    });

    // 强制布局，确保 getBoundingClientRect 取到正确尺寸
    void container.offsetHeight;

    // 封面提取 h1（仅无分割线时作为独立封面卡片使用）
    const coverInfo = extractCoverInfo(contentEl, opts.title);

    // 分割线（--- / <hr>）是否存在。存在时严格按分割线分页
    const hasHr = contentEl.querySelectorAll("hr").length > 0;

    let breaks: number[];
    let useCoverCard = false;
    if (hasHr) {
      breaks = computePageBreaks(contentEl, getContentHeight(opts.settings.ratio));
    } else {
      useCoverCard = true;
      const h1El = contentEl.querySelector("h1") as HTMLElement | null;
      let bodyStartOffset = 0;
      if (h1El) {
        bodyStartOffset = h1El.getBoundingClientRect().bottom - contentEl.getBoundingClientRect().top;
      }
      breaks = computePageBreaks(contentEl, getContentHeight(opts.settings.ratio));
      breaks = breaks.filter((b) => b > bodyStartOffset);
      if (breaks.length === 0 || breaks[0] !== bodyStartOffset) {
        breaks.unshift(bodyStartOffset);
      }
    }
    // 去除内容为空的段（如封面标题与首个分割线之间仅有空白），避免产生空白卡片
    for (let i = breaks.length - 2; i >= 0 && breaks.length > 2; i--) {
      if (!segmentHasBlock(contentEl, breaks[i], breaks[i + 1])) {
        breaks.splice(i, 1);
      }
    }
    const bodyPages = Math.max(1, breaks.length - 1);
    // 无分割线时纯标题封面始终生成
    const totalPages = bodyPages + (useCoverCard ? 1 : 0);

    const settingsKey = JSON.stringify({
      ratio: opts.settings.ratio,
      themeId: opts.settings.themeId,
      fontFamily: opts.settings.fontFamily,
      fontSize: opts.settings.fontSize,
      gridLines: opts.settings.gridLines,
      pageNumber: opts.settings.pageNumber,
    });

    return {
      settings: opts.settings,
      theme,
      contentEl,
      breaks,
      useCoverCard,
      coverInfo,
      totalPages,
      settingsKey,
      cardW,
      cardH,
      cleanup,
    };
  } catch (e) {
    cleanup();
    throw e;
  }
}

interface RenderJob {
  el: HTMLElement;
  height: number;
  index: number;
  isCover: boolean;
  /** 缓存 key：封面卡片在构建时即可确定；正文卡片在图片加载 + 裁剪后确定 */
  cacheKey: string;
  /** 正文分段起始/结束坐标（用于裁剪分段外图片） */
  from: number;
  to: number;
}

/** 构建所有卡片 DOM 并挂载到 host（测量高度），返回渲染任务列表 */
function buildJobs(prepared: PreparedXhs, host: HTMLElement): RenderJob[] {
  const { theme, contentEl, breaks, useCoverCard, coverInfo, totalPages, settingsKey, cardH } = prepared;
  const coverOffset = useCoverCard ? 1 : 0;
  const jobs: RenderJob[] = [];
  if (useCoverCard) {
    const coverEl = buildCoverCard(theme, prepared.settings, coverInfo, 0, totalPages);
    host.appendChild(coverEl);
    jobs.push({
      el: coverEl,
      height: cardH,
      index: 0,
      isCover: true,
      cacheKey: `${settingsKey}|cover|${prepared.settings.pageNumber ? `0/${totalPages}` : ""}|${cyrb53(coverInfo.title)}`,
      from: 0,
      to: 0,
    });
  }
  for (let i = 0; i < breaks.length - 1; i++) {
    const idx = coverOffset + i;
    const el = buildBodyCard(contentEl, breaks[i], breaks[i + 1], theme, prepared.settings, idx, totalPages);
    host.appendChild(el);
    jobs.push({
      el,
      height: el.offsetHeight,
      index: idx,
      isCover: false,
      cacheKey: "",
      from: breaks[i],
      to: breaks[i + 1],
    });
  }
  return jobs;
}

/** 把用户拖拽过的图片位置应用到卡片 DOM（导出与预览共用，保证结果一致）。
 *  有位移的图片会被提升到卡片根节点做绝对定位：
 *  - 脱离内容视口（overflow:hidden）的裁剪——不再因为拖到内容区外而“消失”；
 *  - 作为 footer 的兄弟节点 + zIndex:20，永远绘制在所有图层（文字、页脚）之上；
 *  - 原位置用等高占位符保留，不影响布局与分页。
 *  无位移的图片保持原样（在内容流中）。 */
function applyImagePositions(root: HTMLElement, positions: XhsImagePositions): void {
  root.querySelectorAll<HTMLElement>("img[data-xhs-img-hash]").forEach((img) => {
    const key = img.getAttribute("data-xhs-img-hash");
    if (!key) return;
    const pos = positions[key];
    if (!pos || (pos.dx === 0 && pos.dy === 0)) {
      img.style.transform = "";
      img.style.position = "";
      img.style.left = "";
      img.style.top = "";
      img.style.width = "";
      img.style.height = "";
      img.style.margin = "";
      img.style.zIndex = "";
      return;
    }
    // 卡片未被缩放（宿主离屏），getBoundingClientRect 即逻辑坐标
    const cardRect = root.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    const w = imgRect.width;
    const h = imgRect.height;
    // 图片移出内容流后，用等高占位符保留原垂直空间，避免下方内容上移错位
    if (img.parentElement !== root) {
      const placeholder = document.createElement("div");
      placeholder.style.height = `${h}px`;
      img.parentElement?.insertBefore(placeholder, img);
    }
    root.appendChild(img);
    img.style.position = "absolute";
    img.style.left = `${imgRect.left - cardRect.left + pos.dx}px`;
    img.style.top = `${imgRect.top - cardRect.top + pos.dy}px`;
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.margin = "0";
    img.style.zIndex = "20";
    img.style.transform = "";
  });
}

/**
 * 构建卡片 DOM（不栅格化），供预览面板实时交互。
 * 返回的卡片元素已从文档中分离，由调用方挂载到可见容器并按比例缩放显示；
 * 与 buildXhsCards 共用同一套内容准备/分页/裁剪/位置逻辑，保证预览与导出一致。
 */
export async function buildXhsCardDoms(opts: XhsBuildOpts): Promise<XhsCardDom[]> {
  const prepared = await prepareXhsContent(opts);
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;width:0;height:0;overflow:visible;";
  document.body.appendChild(host);
  try {
    const jobs = buildJobs(prepared, host);
    for (const job of jobs) {
      await waitForImages(job.el);
      if (!job.isCover) {
        const contentClone = job.el.querySelector(".tiptap-export-content") as HTMLElement | null;
        if (contentClone) {
          // 移除不在本分段的图片，与导出一致
          pruneImagesOutsideSegment(contentClone, job.from, job.to);
        }
      }
      applyImagePositions(job.el, opts.imagePositions ?? {});
    }
    return jobs.map((job) => ({
      el: job.el,
      index: job.index,
      total: prepared.totalPages,
      isCover: job.isCover,
      from: job.from,
      to: job.to,
    }));
  } finally {
    host.remove();
    prepared.cleanup();
  }
}

export async function buildXhsCards(opts: XhsBuildOpts, onlyIndex?: number): Promise<XhsBuildResult> {
  const positions = opts.imagePositions ?? {};
  const positionsHash = cyrb53(JSON.stringify(positions));
  const prepared = await prepareXhsContent(opts);
  const { cardW, totalPages, settingsKey } = prepared;

  const cards: XhsCard[] = [];
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;width:0;height:0;overflow:visible;";
  document.body.appendChild(host);

  try {
    // ① 先构建所有卡片 DOM 并测量高度（避免渲染循环中反复 append/remove 导致布局抖动）
    const jobs = buildJobs(prepared, host);
    const visitedKeys = new Set<string>();

    // ② 并发渲染：toPng 内部包含大量异步等待（图片解码、SVG 加载、canvas 绘制），
    // 多张卡片并行可显著重叠这些等待；限制并发数避免内存峰值过高。
    // 命中增量缓存的卡片直接复用上次 PNG，跳过最耗时的栅格化。
    // 结果按下标存放，保证卡片顺序稳定。
    // 传入 onlyIndex 时（如单张下载）只栅格化目标卡片，其余卡片跳过渲染以提速；
    // 分页测量仍依赖全部卡片 DOM，因此 DOM 构建阶段不跳过。
    const results = new Array<XhsCard | undefined>(jobs.length);
    const RENDER_CONCURRENCY = 3;
    let nextJob = 0;
    async function renderWorker(): Promise<void> {
      for (;;) {
        const jobIdx = nextJob++;
        if (jobIdx >= jobs.length) return;
        const job = jobs[jobIdx];
        const el = job.el;
        // 单张模式：非目标卡片不渲染、不等待图片、不触碰缓存
        if (onlyIndex !== undefined && job.index !== onlyIndex) {
          results[jobIdx] = undefined;
          host.removeChild(el);
          continue;
        }
        // 先等待克隆中的图片加载完成：裁剪分段外图片依赖图片实际高度，
        // 若在图片未加载（高度为 0）时裁剪，会把起点在分段前、实际跨入分段内的
        // 图片误删，导致卡片内容缺失、分页错乱。
        await waitForImages(el);
        let cacheKey = job.cacheKey;
        if (!job.isCover) {
          const contentClone = el.querySelector(".tiptap-export-content") as HTMLElement | null;
          if (contentClone) {
            // 移除不在本分段的图片，减少 html-to-image 序列化负载
            pruneImagesOutsideSegment(contentClone, job.from, job.to);
            // 内容哈希：对克隆再克隆并去掉 transform（仅定位用），使哈希只反映内容本身，
            // 这样内容未变但前后插入内容导致坐标偏移时，本分段仍可命中缓存
            const hashEl = contentClone.cloneNode(true) as HTMLElement;
            hashEl.style.transform = "";
            const pageKey = prepared.settings.pageNumber ? `${job.index}/${totalPages}` : "";
            // 图片位置哈希：拖拽调整位置后该段内容哈希不变，通过 pos 段强制失效缓存
            cacheKey = `${settingsKey}|pos|${positionsHash}|page|${pageKey}|${cyrb53(hashEl.outerHTML)}`;
          }
        }
        // 应用用户拖拽过的图片位置（在裁剪之后、栅格化之前）
        applyImagePositions(el, positions);
        const cached = cacheKey ? cardRenderCache.get(cacheKey) : undefined;
        if (cached !== undefined) {
          visitedKeys.add(cacheKey);
          results[jobIdx] = {
            index: job.index,
            total: totalPages,
            isCover: job.isCover,
            pngDataUrl: cached,
            width: cardW * EXPORT_PIXEL_RATIO,
            height: job.height * EXPORT_PIXEL_RATIO,
          };
          host.removeChild(el);
          continue;
        }
        const pngDataUrl = await renderCard(el, cardW, job.height);
        if (cacheKey) {
          cardRenderCache.set(cacheKey, pngDataUrl);
          visitedKeys.add(cacheKey);
        }
        results[jobIdx] = {
          index: job.index,
          total: totalPages,
          isCover: job.isCover,
          pngDataUrl,
          width: cardW * EXPORT_PIXEL_RATIO,
          height: job.height * EXPORT_PIXEL_RATIO,
        };
        host.removeChild(el);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(RENDER_CONCURRENCY, jobs.length) }, () => renderWorker()),
    );
    // 清理本轮未使用的旧缓存项，防止内容不断变化导致缓存无限增长。
    // 单张模式（onlyIndex）跳过清理：本轮只访问了目标卡片，其余卡片缓存
    // 并非过期，若清理会让下次整体导出失去缓存、被迫全量重渲。
    if (onlyIndex === undefined) {
      for (const k of Array.from(cardRenderCache.keys())) {
        if (!visitedKeys.has(k)) cardRenderCache.delete(k);
      }
      if (cardRenderCache.size > 200) cardRenderCache.clear();
    }
    for (const card of results) {
      if (card) cards.push(card);
    }
  } finally {
    host.remove();
    prepared.cleanup();
  }

  return { cards, warnings: [] };
}
