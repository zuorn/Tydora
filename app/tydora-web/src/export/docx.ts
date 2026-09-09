/**
 * HTML → 真实 .docx 转换器
 * 将编辑器渲染的 HTML DOM 解析为 docx 库的文档元素，生成标准 Office Open XML 格式
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  ImageRun,
  ExternalHyperlink,
  UnderlineType,
  LevelFormat,
} from "docx";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Block = Paragraph | Table;

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: { type: typeof UnderlineType.SINGLE };
  highlight?: string; // eslint-disable-line @typescript-eslint/no-redundant-type-constituents
  superScript?: boolean;
  subScript?: boolean;
  font?: string;
  size?: number;
  color?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

// 使用 Word 大纲级别（outlineLevel）替代 HeadingLevel，避免 Word 内置蓝色标题样式
const HEADING_OUTLINE_LEVEL: Record<string, number> = {
  h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6,
};

const HEADING_SIZE: Record<string, number> = {
  h1: 40, // 20pt
  h2: 36, // 18pt
  h3: 32, // 16pt
  h4: 28, // 14pt
  h5: 24, // 12pt
  h6: 22, // 11pt
};

// 字体大小以半点（half-point）为单位
const BODY_SIZE = 22;  // 11pt
const CODE_SIZE = 18;  // 9pt

// A4 内容区可用宽度（DXA 单位，1 DXA = 1/20 点 = 1/1440 英寸）
// A4 = 210mm = 11906 DXA，左右边距各 1800 DXA
const CONTENT_WIDTH = 11906 - 1800 - 1800; // 8306 DXA

// 中文字体：同时指定西文 + 东亚字体，确保中英文混排时各自正确
const DEFAULT_FONT = "DengXian";          // 等线（中文正文）
const HEADING_FONT = "Microsoft YaHei";  // 微软雅黑（标题）
const CODE_FONT = "Consolas";             // 等宽英文

// 显式文本颜色（Word 不设 color 时可能被内置样式覆盖）
const HEADING_COLOR = "111827"; // 接近黑色的深灰，标题用
const BODY_COLOR = "1F2937";    // 正文深灰
const CODE_BG = "F6F8FA";       // 代码背景
const TABLE_HEADER_BG = "F3F4F6"; // 表头背景

// docx 原生列表编号引用 ID（整个文档共享）
const NUM_UL = "tydora-ul"; // 无序列表
const NUM_OL = "tydora-ol"; // 有序列表
const NUM_TASK = "tydora-task"; // 任务列表（无标记）

/**
 * 将 data: URL 解码为二进制 Uint8Array
 */
function dataUrlToImageData(dataUrl: string): { bytes: Uint8Array; type: string } | null {
  try {
    const [header, b64] = dataUrl.split(",");
    if (!b64) return null;
    const mime = header.match(/:(.*?);/)?.[1] || "image/png";
    const rawType = mime.split("/")[1] || "png";
    // ImageRun 不接受 "jpeg"，统一为 "jpg"
    const type = rawType === "jpeg" ? "jpg" : rawType;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, type };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Inline 解析：DOM 文本节点 → TextRun / ExternalHyperlink            */
/* ------------------------------------------------------------------ */

function parseInlines(node: Node, base: RunStyle = {}): (TextRun | ExternalHyperlink)[] {
  const items: (TextRun | ExternalHyperlink)[] = [];

  function walk(n: Node, style: RunStyle) {
    // 文本节点（按换行拆分为多个 TextRun，保留换行）
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent || "";
      if (!text) return;
      const lines = text.split("\n");
      lines.forEach((line, idx) => {
        if (line) {
          items.push(new TextRun({ text: line, ...style } as Record<string, unknown>));
        }
        if (idx < lines.length - 1) {
          items.push(new TextRun({ break: 1, ...style } as Record<string, unknown>));
        }
      });
      return;
    }

    if (!(n instanceof HTMLElement)) return;

    const tag = n.tagName.toLowerCase();
    const next: RunStyle = { ...style };

    // 累积样式
    if (tag === "strong" || tag === "b") next.bold = true;
    if (tag === "em" || tag === "i") next.italics = true;
    if (tag === "s" || tag === "del" || tag === "strike") next.strike = true;
    if (tag === "u") next.underline = { type: UnderlineType.SINGLE };
    if (tag === "mark") next.highlight = "yellow";
    if (tag === "code") {
      next.font = CODE_FONT;
      next.size = CODE_SIZE;
      next.color = BODY_COLOR;
    }
    if (tag === "sup") next.superScript = true;
    if (tag === "sub") next.subScript = true;

    if (tag === "br") {
      items.push(new TextRun({ break: 1 }));
    } else if (tag === "a") {
      // 超链接：先递归收集内部文本，再包装成 ExternalHyperlink
      const href = n.getAttribute("href") || "#";
      const before = items.length;
      n.childNodes.forEach(c => walk(c, next));
      const linkRuns = items.splice(before).filter(i => i instanceof TextRun) as TextRun[];
      if (linkRuns.length > 0) {
        items.push(new ExternalHyperlink({ children: linkRuns, link: href }));
      }
    } else if (tag === "span") {
      // 递归处理 span（如 highlight.js 的高亮 span）
      n.childNodes.forEach(c => walk(c, next));
    } else {
      n.childNodes.forEach(c => walk(c, next));
    }
  }

  walk(node, base);
  return items;
}

/* ------------------------------------------------------------------ */
/*  块级元素转换                                                        */
/* ------------------------------------------------------------------ */

/** 标题 h1-h6 → 粗体大号 Paragraph（不用 Word 内置 HeadingLevel，避免自带蓝色主题色） */
function heading(el: HTMLElement): Paragraph {
  const tag = el.tagName.toLowerCase();
  const size = HEADING_SIZE[tag] || BODY_SIZE;
  const isTopLevel = tag === "h1" || tag === "h2";
  return new Paragraph({
    children: parseInlines(el, {
      bold: true,
      font: HEADING_FONT,
      size,
      color: HEADING_COLOR,
    }),
    spacing: { before: isTopLevel ? 360 : 240, after: 120 },
    // 保留大纲级别，使 Word 导航窗格仍能看到标题层级
    outlineLevel: HEADING_OUTLINE_LEVEL[tag] || 0,
  });
}

/** 普通段落 <p> → Paragraph */
function paragraph(el: HTMLElement, extra: Record<string, unknown> = {}): Paragraph {
  const children = parseInlines(el, { size: BODY_SIZE, font: DEFAULT_FONT, color: BODY_COLOR });
  if (children.length === 0) {
    return new Paragraph({ spacing: { after: 60 }, ...extra } as any);
  }
  return new Paragraph({ children, spacing: { after: 60 }, ...extra } as any);
}

/** 引用块 <blockquote> → 缩进 + 左边框 + 背景色的 Paragraph */
function blockquote(el: HTMLElement): Block[] {
  return Array.from(el.children).flatMap(child => {
    const childEl = child as HTMLElement;
    const tag = childEl.tagName?.toLowerCase();
    if (tag === "p") {
      return [
        new Paragraph({
          children: parseInlines(childEl, { size: BODY_SIZE, font: DEFAULT_FONT, color: BODY_COLOR }),
          indent: { left: 720 },
          spacing: { after: 60 },
          border: { left: { style: BorderStyle.SINGLE, size: 3, color: "CCCCCC" } },
          shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
        }),
      ];
    }
    return elementToBlocks(childEl);
  });
}

/** 代码块 <pre><code> → 等宽字体 + 灰色背景的 Paragraph（每行一个 TextRun） */
function codeBlock(el: HTMLElement): Paragraph {
  const code = el.querySelector("code") || el;
  const text = code.textContent || "";
  const lines = text.split("\n");
  const children: TextRun[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) {
      children.push(new TextRun({ break: 1 }));
    }
    children.push(
      new TextRun({
        text: line || " ",
        font: CODE_FONT,
        size: CODE_SIZE,
        color: BODY_COLOR,
      }),
    );
  });
  return new Paragraph({
    children,
    spacing: { after: 60 },
    shading: { type: ShadingType.CLEAR, fill: CODE_BG },
    indent: { left: 360 },
  });
}

/** 水平线 <hr> → 带下边框的 Paragraph */
function horizontalRule(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } },
    spacing: { before: 120, after: 120 },
  });
}

/** 有序/无序/任务列表 — 使用 docx 原生编号定义，非 Unicode 前缀 */
function list(el: HTMLElement, ordered: boolean): Block[] {
  const blocks: Block[] = [];
  const isTask = el.getAttribute("data-type") === "taskList";

  for (const li of Array.from(el.children)) {
    if (li.tagName.toLowerCase() !== "li") continue;
    const liEl = li as HTMLElement;

    // 任务列表的内容在 <div><p> 中
    let textEl = liEl;
    if (isTask) {
      const inner = liEl.querySelector("div > p") || liEl.querySelector("div");
      if (inner) textEl = inner as HTMLElement;
    }

    const checked = liEl.getAttribute("data-checked") === "true";

    // 任务列表：使用 ☑/☐ 作为前缀文本（无编号）
    const prefixRuns: TextRun[] = [];
    if (isTask) {
      prefixRuns.push(new TextRun({ text: checked ? "\u2611 " : "\u2610 ", size: BODY_SIZE, font: "Segoe UI Symbol", color: BODY_COLOR }));
    }

    const bodyRuns = parseInlines(textEl, { size: BODY_SIZE, font: DEFAULT_FONT, color: BODY_COLOR });
    const children = [...prefixRuns, ...bodyRuns];

    const paraOpts: Record<string, unknown> = {
      children,
      spacing: { after: 40 },
    };

    if (isTask) {
      // 任务列表不使用编号，手动缩进
      paraOpts.indent = { left: 360, hanging: 180 };
    } else {
      // 普通有序/无序列表使用 docx 原生编号
      paraOpts.numbering = { reference: ordered ? NUM_OL : NUM_UL, level: 0 };
    }

    blocks.push(new Paragraph(paraOpts as any));
  }
  return blocks;
}

/** 表格 <table> → Table */
function buildTable(el: HTMLElement): Table {
  const rows: TableRow[] = [];

  // 计算列数（取第一行 td/th 的数量）
  const firstRow = el.querySelector("tr");
  const colCount = firstRow ? firstRow.querySelectorAll("td, th").length : 0;
  const cellWidthDxa = colCount > 0 ? Math.floor(CONTENT_WIDTH / colCount) : CONTENT_WIDTH;

  el.querySelectorAll("tr").forEach(tr => {
    const cells: TableCell[] = [];
    tr.querySelectorAll("td, th").forEach(td => {
      const isHeader = td.tagName.toLowerCase() === "th";
      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: parseInlines(td as HTMLElement, {
                bold: isHeader,
                size: BODY_SIZE,
                font: DEFAULT_FONT,
                color: BODY_COLOR,
              }),
            }),
          ],
          width: { size: cellWidthDxa, type: WidthType.DXA },
          shading: isHeader
            ? { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG }
            : undefined,
        }),
      );
    });
    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  });

  return new Table({
    rows,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
  });
}

/** 标注块 Callout → 彩色边框 + 背景的 Paragraph */
function callout(el: HTMLElement): Block[] {
  // 从 class（callout-note）或 data-callout-type 提取类型
  const type =
    el.getAttribute("data-callout-type") ||
    (el.className?.match(/callout-(\w+)/) || [])[1] ||
    "note";

  // 颜色映射：匹配编辑器 theme.css 中的实际配色
  // fill = rgba(borderColor, 0.08) 在白色背景上的近似 solid 色值
  // titleColor 从 .callout-title-{type} 获取
  const colors: Record<string, { fill: string; border: string; titleColor: string }> = {
    note:      { fill: "EBF3FC", border: "0969DA", titleColor: "0969DA" },
    abstract:  { fill: "EBF3FC", border: "0969DA", titleColor: "0969DA" },
    info:      { fill: "EBF3FC", border: "0969DA", titleColor: "0969DA" },
    faq:       { fill: "EBF3FC", border: "0969DA", titleColor: "0969DA" },
    tip:       { fill: "EDF5EF", border: "1A7F37", titleColor: "1A7F37" },
    success:   { fill: "EDF5EF", border: "1A7F37", titleColor: "1A7F37" },
    important: { fill: "F5F1FC", border: "8250DF", titleColor: "8250DF" },
    question:  { fill: "F5F1FC", border: "8250DF", titleColor: "8250DF" },
    example:   { fill: "F5F1FC", border: "8250DF", titleColor: "8250DF" },
    warning:   { fill: "FAF5EB", border: "BF8700", titleColor: "BF8700" },
    caution:   { fill: "FBEDEE", border: "CF222E", titleColor: "CF222E" },
    failure:   { fill: "FBEDEE", border: "CF222E", titleColor: "CF222E" },
    danger:    { fill: "FBEDEE", border: "CF222E", titleColor: "CF222E" },
    bug:       { fill: "FBEDEE", border: "CF222E", titleColor: "CF222E" },
    quote:     { fill: "F3F3F3", border: "9D9D9D", titleColor: "9D9D9D" },
  };

  const { fill, border, titleColor } = colors[type] || colors.note;

  const blocks: Block[] = [];
  // 标记是否已输出标题行，用于控制后续段落间距
  let hasTitle = false;

  for (const child of Array.from(el.children)) {
    const childEl = child as HTMLElement;
    const tag = childEl.tagName?.toLowerCase();

    // ── 标题 widget <span class="callout-title"> → 粗体标题行 ──
    if (tag === "span" && childEl.classList.contains("callout-title")) {
      hasTitle = true;
      const rawTitle = childEl.textContent?.trim() || "";
      // 去掉 ::after 伪元素残留的折叠指示符 ▾ / ▸
      const cleanTitle = rawTitle.replace(/[\s]*[▾▸]$/, "").trim();
      if (cleanTitle) {
        blocks.push(
          new Paragraph({
            children: [
              new TextRun({
                text: cleanTitle,
                bold: true,
                font: HEADING_FONT,
                size: 24, // 12pt
                color: titleColor,
              }),
            ],
            shading: { type: ShadingType.CLEAR, fill },
            border: { left: { style: BorderStyle.SINGLE, size: 6, color: border } },
            indent: { left: 360 },
            spacing: { after: 0 },
          }),
        );
      }
      continue;
    }

    // ── 普通段落 <p>：跳过 .callout-title-marker ──
    if (tag === "p") {
      const pClone = childEl.cloneNode(true) as HTMLElement;
      // 移除隐藏的 [!TYPE] 标记文本
      pClone.querySelectorAll(".callout-title-marker").forEach((el) => el.remove());
      const children = parseInlines(pClone, { size: BODY_SIZE, font: DEFAULT_FONT, color: BODY_COLOR });
      if (children.length === 0) continue;
      blocks.push(
        new Paragraph({
          children,
          shading: { type: ShadingType.CLEAR, fill },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: border } },
          indent: { left: 360 },
          spacing: { after: 40, before: hasTitle ? 0 : 0 },
        }),
      );
      continue;
    }

    // ── 有序/无序列表：逐项渲染为带 callout 样式的段落 ──
    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      let idx = 0;
      for (const li of Array.from(childEl.children)) {
        if ((li as HTMLElement).tagName?.toLowerCase() !== "li") continue;
        idx++;
        const liEl = li as HTMLElement;
        const bodyRuns = parseInlines(liEl, { size: BODY_SIZE, font: DEFAULT_FONT, color: BODY_COLOR });
        if (bodyRuns.length === 0) continue;
        blocks.push(
          new Paragraph({
            children: bodyRuns,
            numbering: { reference: ordered ? NUM_OL : NUM_UL, level: 0 },
            shading: { type: ShadingType.CLEAR, fill },
            border: { left: { style: BorderStyle.SINGLE, size: 6, color: border } },
            indent: { left: 720 },
            spacing: { after: 40 },
          }),
        );
      }
      continue;
    }

    // ── 代码块 <pre>：带 callout 背景 ──
    if (tag === "pre") {
      const code = childEl.querySelector("code") || childEl;
      const text = code.textContent || "";
      const lines = text.split("\n");
      const runs: TextRun[] = [];
      lines.forEach((line, i) => {
        if (i > 0) runs.push(new TextRun({ break: 1 }));
        runs.push(new TextRun({ text: line || " ", font: CODE_FONT, size: CODE_SIZE, color: BODY_COLOR }));
      });
      blocks.push(
        new Paragraph({
          children: runs,
          shading: { type: ShadingType.CLEAR, fill },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: border } },
          indent: { left: 720 },
          spacing: { after: 40 },
        }),
      );
      continue;
    }

    // ── 其他元素递归处理（保留原有行为） ──
    blocks.push(...elementToBlocks(childEl));
  }

  return blocks;
}

/** 图片 → ImageRun Paragraph */
function imageBlock(el: HTMLElement): Paragraph | null {
  const img =
    el.tagName.toLowerCase() === "img"
      ? (el as HTMLImageElement)
      : el.querySelector("img");
  if (!img) return null;

  const src = img.getAttribute("src") || "";
  if (!src.startsWith("data:")) return null;

  const imgData = dataUrlToImageData(src);
  if (!imgData) return null;

  // 尺寸：用 HTML width/height 属性或 naturalWidth/Height 或默认值
  // 优先级：属性 > natural（避免未加载完成读到 0）
  const attrW = parseInt(img.getAttribute("width") || "", 10);
  const attrH = parseInt(img.getAttribute("height") || "", 10);
  const naturalW = img.naturalWidth || attrW || 400;
  const naturalH = img.naturalHeight || attrH || 300;

  // 防止比例失真：用属性中的宽高比（如果都有）
  let w = attrW || naturalW;
  let h = attrH || naturalH;
  if (!attrW && attrH) {
    w = Math.round((naturalW * attrH) / naturalH);
  } else if (attrW && !attrH) {
    h = Math.round((naturalH * attrW) / naturalW);
  }

  // A4 内容区宽度（扣除 Word 默认 2.54cm 左右边距），按 96 DPI 像素计
  // A4 210mm - 2*25.4mm = 159.2mm ≈ 6.27in ≈ 602px；留余量取 500px
  const PAGE_WIDTH_PX = 500;
  if (w > PAGE_WIDTH_PX) {
    h = Math.round((h * PAGE_WIDTH_PX) / w);
    w = PAGE_WIDTH_PX;
  }

  return new Paragraph({
    children: [
      new ImageRun({
        data: imgData.bytes,
        transformation: { width: w, height: h },
        type: imgData.type as "png" | "jpg" | "gif" | "bmp",
        altText: {
          title: img.alt || "",
          description: img.alt || "",
          name: "",
        },
      } as any),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
  });
}

/* ------------------------------------------------------------------ */
/*  元素分发器                                                          */
/* ------------------------------------------------------------------ */

function elementToBlocks(el: Element): Block[] {
  const tag = el.tagName.toLowerCase();

  if (HEADING_TAGS.includes(tag)) return [heading(el as HTMLElement)];
  if (tag === "p") return [paragraph(el as HTMLElement)];
  if (tag === "blockquote") {
    const bqCls = (el as HTMLElement).className || "";
    if (bqCls.includes("callout") || el.getAttribute("data-type") === "callout") {
      return callout(el as HTMLElement);
    }
    return blockquote(el as HTMLElement);
  }
  if (tag === "pre") return [codeBlock(el as HTMLElement)];
  if (tag === "ul") return list(el as HTMLElement, false);
  if (tag === "ol") return list(el as HTMLElement, true);
  if (tag === "table") return [buildTable(el as HTMLElement)];
  if (tag === "hr") return [horizontalRule()];
  if (tag === "img" || tag === "figure") {
    const ib = imageBlock(el as HTMLElement);
    return ib ? [ib] : [];
  }

  // div：可能是 mermaid 图表 / callout / 普通容器
  if (tag === "div") {
    const dataType = el.getAttribute("data-type") || "";
    const cls = (el as HTMLElement).className || "";

    // frontmatter：元数据块，不导出到文档正文中
    if (dataType === "frontmatter") return [];

    // mermaid 图表节点：提取栅格化后的 <img> 作为独立图片块
    if (dataType === "mermaid" || cls.includes("mermaid-node")) {
      const img = el.querySelector("img");
      if (img && img.getAttribute("src")?.startsWith("data:")) {
        const ib = imageBlock(el as HTMLElement);
        if (ib) return [ib];
      }
      // 如果没有栅格化成功（如没有 src），跳过该节点
      return [];
    }

    if (cls.includes("callout") || dataType === "callout") {
      return callout(el as HTMLElement);
    }
    // 普通 div 递归处理子元素
    return Array.from(el.children).flatMap(c => elementToBlocks(c));
  }

  // 其他未知元素：当作段落处理
  return [paragraph(el as HTMLElement)];
}

/* ------------------------------------------------------------------ */
/*  公开 API                                                           */
/* ------------------------------------------------------------------ */

/**
 * 将编辑器克隆的 DOM 节点转换为标准 .docx 二进制数据
 * @param raw - 包含导出内容的 HTMLElement（通常是 .export-page 内的内容）
 */
export async function exportDocxBytes(raw: HTMLElement): Promise<Uint8Array> {
  const blocks: Block[] = Array.from(raw.children).flatMap(c =>
    elementToBlocks(c),
  );

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: NUM_UL,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
        {
          reference: NUM_OL,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
        {
          reference: NUM_TASK,
          levels: [
            {
              level: 0,
              format: LevelFormat.NONE, // 无编号，仅提供缩进
              text: "",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: DEFAULT_FONT,
            size: BODY_SIZE,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch ≈ 2.54cm
              bottom: 1440,
              left: 1800,   // 1.25 inch ≈ 3.17cm
              right: 1800,
            },
          },
        },
        children: blocks,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const arrayBuf = await blob.arrayBuffer();
  return new Uint8Array(arrayBuf);
}
