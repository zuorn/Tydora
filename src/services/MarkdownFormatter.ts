/**
 * 轻量 Markdown 格式化（保守策略）：
 * - 默认只做「安全清理」，尽量不改动文档结构与排版意图
 * - 代码块 / 行内代码 / 数学公式 / Frontmatter 等保护区不改写
 * - 「规范空行」仅折叠过多空行，不再自动在标题/列表前后插入空行
 */

export interface MarkdownFormatOptions {
  /** 保存时自动格式化 */
  formatOnSave: boolean;
  /** 中文与英文/数字之间插入空格（盘古之白风格） */
  cjkSpacing: boolean;
  /** 去掉行尾空白（保留 Markdown 硬换行所需的两个空格） */
  trimTrailingWhitespace: boolean;
  /** 文件末尾确保恰好一个换行 */
  ensureFinalNewline: boolean;
  /** 折叠连续 3 个及以上空行为 1 个（不插入新空行） */
  normalizeBlankLines: boolean;
}

export const DEFAULT_MARKDOWN_FORMAT_OPTIONS: MarkdownFormatOptions = {
  formatOnSave: false,
  cjkSpacing: false,
  trimTrailingWhitespace: true,
  ensureFinalNewline: true,
  normalizeBlankLines: true,
};

const CJK =
  "\\u2E80-\\u2EFF\\u2F00-\\u2FDF\\u3040-\\u30FF\\u3100-\\u312F\\u3200-\\u32FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";
const AN = "A-Za-z0-9";

type Segment =
  | { type: "protect"; text: string }
  | { type: "plain"; text: string };

/**
 * 拆分保护区与可格式化正文。
 * 保护区：文档开头 frontmatter、围栏代码、$$ 数学块、行内代码。
 */
function splitProtected(src: string): Segment[] {
  const segments: Segment[] = [];

  // 仅匹配文档最开头的 frontmatter（不用 m 标志，避免文中 --- 误伤）
  let offset = 0;
  const fm = src.match(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/);
  if (fm && fm.index === 0) {
    segments.push({ type: "protect", text: fm[0] });
    offset = fm[0].length;
  }

  const body = src.slice(offset);
  // 围栏代码 | $$ 块 | 行内代码
  const re =
    /(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n {0,3}\2[ \t]*(?:\n|$))|(^ {0,3}\$\$[\s\S]*?\$\$[ \t]*(?:\n|$))|(`+)((?:(?!\4)[\s\S])*?)\4/gm;

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      segments.push({ type: "plain", text: body.slice(last, m.index) });
    }
    segments.push({ type: "protect", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    segments.push({ type: "plain", text: body.slice(last) });
  }
  return segments;
}

function trimLineTrailing(line: string): string {
  // 保留恰好两个尾随空格（GFM 硬换行）
  if (/[^ \t] {2}$/.test(line)) return line;
  return line.replace(/[ \t]+$/g, "");
}

/**
 * 对纯文本做 CJK 空格；跳过表格行、链接、图片、HTML、URL、wiki-link。
 */
function applyCjkSpacing(text: string): string {
  const lines = text.split("\n");
  return lines
    .map((line) => {
      // 表格行（含对齐分隔行）完全跳过，避免打乱列对齐
      if (/^\s*\|/.test(line)) return line;
      // 纯标题行：# 后紧跟内容时不加空格到标记里；对标题正文仍可加空格
      return applyCjkSpacingToLine(line);
    })
    .join("\n");
}

function applyCjkSpacingToLine(line: string): string {
  const parts: Segment[] = [];
  // wiki / md 图片 / md 链接 / HTML / URL / 行内公式 $...$
  const re =
    /(\[\[[\s\S]*?\]\])|(!?\[[^\]]*\]\([^)]+\))|(<[^>\n]+>)|(https?:\/\/[^\s<]+)|(\$[^$\n]+\$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push({ type: "plain", text: line.slice(last, m.index) });
    parts.push({ type: "protect", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ type: "plain", text: line.slice(last) });

  const cjkAn = new RegExp(`([${CJK}])([${AN}])`, "g");
  const anCjk = new RegExp(`([${AN}])([${CJK}])`, "g");

  return parts
    .map((p) => {
      if (p.type === "protect") return p.text;
      return p.text.replace(cjkAn, "$1 $2").replace(anCjk, "$1 $2");
    })
    .join("");
}

/** 仅折叠连续 ≥3 个空行为 1 个；不插入任何新空行 */
function collapseExtraBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

function formatPlainSegment(text: string, options: MarkdownFormatOptions): string {
  let result = text;

  if (options.trimTrailingWhitespace) {
    result = result
      .split("\n")
      .map(trimLineTrailing)
      .join("\n");
  }

  if (options.cjkSpacing) {
    result = applyCjkSpacing(result);
  }

  if (options.normalizeBlankLines) {
    result = collapseExtraBlankLines(result);
  }

  return result;
}

export function formatMarkdown(
  source: string,
  partialOptions?: Partial<MarkdownFormatOptions>,
): string {
  const options: MarkdownFormatOptions = {
    ...DEFAULT_MARKDOWN_FORMAT_OPTIONS,
    ...partialOptions,
  };

  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const segments = splitProtected(normalized);

  let out = segments
    .map((seg) =>
      seg.type === "protect" ? seg.text : formatPlainSegment(seg.text, options),
    )
    .join("");

  // 保护区边界处也可能堆出多余空行
  if (options.normalizeBlankLines) {
    out = collapseExtraBlankLines(out);
  }

  if (options.ensureFinalNewline) {
    out = out.replace(/\n*$/, "\n");
  } else if (out.endsWith("\n") && !normalized.endsWith("\n")) {
    // 仅在「关闭末尾换行」时去掉我们可能多出来的末尾换行，避免无故删用户原有换行意图：
    // 若原文没有末尾换行，则去掉；若原文有则保留一个
    out = out.replace(/\n+$/, "");
  }

  return out;
}

/** 从 general settings 原始对象中读取格式化选项 */
export function readMarkdownFormatOptions(
  settings: Record<string, unknown> | null | undefined,
): MarkdownFormatOptions {
  const raw = (settings?.markdownFormat as Partial<MarkdownFormatOptions> | undefined) ?? {};
  return {
    formatOnSave: typeof raw.formatOnSave === "boolean" ? raw.formatOnSave : DEFAULT_MARKDOWN_FORMAT_OPTIONS.formatOnSave,
    cjkSpacing: typeof raw.cjkSpacing === "boolean" ? raw.cjkSpacing : DEFAULT_MARKDOWN_FORMAT_OPTIONS.cjkSpacing,
    trimTrailingWhitespace:
      typeof raw.trimTrailingWhitespace === "boolean"
        ? raw.trimTrailingWhitespace
        : DEFAULT_MARKDOWN_FORMAT_OPTIONS.trimTrailingWhitespace,
    ensureFinalNewline:
      typeof raw.ensureFinalNewline === "boolean"
        ? raw.ensureFinalNewline
        : DEFAULT_MARKDOWN_FORMAT_OPTIONS.ensureFinalNewline,
    normalizeBlankLines:
      typeof raw.normalizeBlankLines === "boolean"
        ? raw.normalizeBlankLines
        : DEFAULT_MARKDOWN_FORMAT_OPTIONS.normalizeBlankLines,
  };
}
