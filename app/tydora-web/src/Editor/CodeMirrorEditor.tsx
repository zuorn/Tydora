import { useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, Decoration, ViewPlugin, placeholder, ViewUpdate } from "@codemirror/view";
import { EditorState, Compartment, RangeSetBuilder } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { rust } from "@codemirror/lang-rust";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { syntaxHighlighting, bracketMatching, foldGutter, indentOnInput, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { useVim, createVimExtension, useLeader, LeaderMenu, executeCodeMirrorAction } from "../vim";
import type { VimMode } from "../vim/types";
import { getCM, Vim as CMVim } from "@replit/codemirror-vim";
import { prefixMConfig } from "../vim/config/prefixM";
import { prefixGConfig } from "../vim/config/prefixG";
import { prefixZConfig } from "../vim/config/prefixZ";
import { prefixTConfig } from "../vim/config/prefixT";


// 判断是否为 Markdown 文件
function isMarkdownFile(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return ["md", "markdown", "mdx"].includes(ext);
}

// 根据文件扩展名获取 CodeMirror 语言扩展
function getLanguageExtension(filePath: string | null | undefined) {
  if (!filePath) return markdown({ base: markdownLanguage });

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript({ jsx: ext === "jsx" });
    case "ts":
    case "mts":
    case "cts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "py":
    case "pyw":
      return python();
    case "rs":
      return rust();
    case "java":
      return java();
    case "c":
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
      return cpp();
    case "html":
    case "htm":
    case "vue":
    case "svelte":
    case "astro":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "json":
    case "jsonc":
    case "geojson":
      return json();
    case "xml":
    case "svg":
    case "xsd":
      return xml();
    case "yml":
    case "yaml":
      return yaml();
    default:
      return markdown({ base: markdownLanguage });
  }
}

// 自定义 Markdown 主题
const markdownTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--bg-primary, #fff)",
    color: "var(--text-primary, #333)",
    fontFamily: "var(--editor-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
    fontSize: "var(--editor-font-size, 16px)",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "inherit",   // 覆盖 CodeMirror 默认的 monospace，继承 & 中设置的 CSS 变量字体
    fontSize: "inherit",
  },
  ".cm-content": {
    caretColor: "var(--text-primary, #333)",
    padding: "20px 0",
    // 文末留白：允许滚动到文末后继续下滚，把最后一行放到窗口中间附近
    paddingBottom: "calc(20px + var(--editor-end-scroll-space, 0px))",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-primary, #333)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgba(0, 122, 255, 0.3)",
  },
  ".cm-panels": {
    backgroundColor: "var(--bg-secondary, #f5f5f5)",
    color: "var(--text-primary, #333)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--border, #e0e0e0)",
  },
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid var(--border, #e0e0e0)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--bg-search-highlight, #fff3b0)",
    outline: "1px solid var(--border, #d0d0d0)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--bg-search-active, #ffeb3b)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--bg-hover, rgba(0, 0, 0, 0.03))",
  },
  ".cm-selectionMatch": {
    backgroundColor: "rgba(0, 122, 255, 0.15)",
  },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "rgba(0, 122, 255, 0.2)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-primary, #fff)",
    color: "var(--text-secondary, #999)",
    border: "none",
    borderRight: "1px solid var(--border, #e0e0e0)",
    minWidth: "50px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--bg-hover, rgba(0, 0, 0, 0.05))",
    color: "var(--text-primary, #333)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--bg-secondary, #f0f0f0)",
    border: "1px solid var(--border, #d0d0d0)",
    color: "var(--text-secondary, #666)",
  },
  // LaTeX 数学高亮
  ".cm-math-inline": {
    backgroundColor: "var(--bg-math, rgba(74, 158, 255, 0.08))",
    borderRadius: "3px",
  },
  ".cm-math-block": {
    backgroundColor: "var(--bg-math, rgba(74, 158, 255, 0.06))",
    borderRadius: "3px",
  },
  ".cm-math-dollars": {
    color: "var(--text-math-delim, #7a5af5)",
    fontWeight: "bold",
  },
  ".cm-tooltip": {
    border: "1px solid var(--border, #d0d0d0)",
    backgroundColor: "var(--bg-primary, #fff)",
  },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: "var(--bg-primary, #fff)",
    borderBottomColor: "var(--bg-primary, #fff)",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "var(--bg-active, #e3f2fd)",
      color: "var(--text-primary, #333)",
    },
  },
});

// Markdown 语法高亮（使用 CSS 变量引用，浏览器自动响应变化）
const markdownHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading1, color: "var(--text-heading, #1a1a1a)", fontSize: "1.5em", fontWeight: "bold" },
    { tag: tags.heading2, color: "var(--text-heading, #1a1a1a)", fontSize: "1.3em", fontWeight: "bold" },
    { tag: tags.heading3, color: "var(--text-heading, #1a1a1a)", fontSize: "1.1em", fontWeight: "bold" },
    { tag: tags.heading4, color: "var(--text-heading, #1a1a1a)", fontSize: "1em", fontWeight: "bold" },
    { tag: tags.heading5, color: "var(--text-heading, #1a1a1a)", fontSize: "0.9em", fontWeight: "bold" },
    { tag: tags.heading6, color: "var(--text-heading, #1a1a1a)", fontSize: "0.85em", fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic", color: "var(--text-emphasis, #666)" },
    { tag: tags.strong, fontWeight: "bold", color: "var(--text-strong, #333)" },
    { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--text-secondary, #999)" },
    { tag: tags.link, color: "var(--text-link, #0969da)" },
    { tag: tags.url, color: "var(--text-url, #0969da)", textDecoration: "underline" },
    { tag: tags.string, color: "var(--hljs-string, #0a3069)" },
    { tag: tags.keyword, color: "var(--hljs-keyword, #cf222e)" },
    { tag: tags.atom, color: "var(--hljs-built_in, #0550ae)" },
    { tag: tags.bool, color: "var(--hljs-keyword, #0550ae)" },
    { tag: tags.number, color: "var(--hljs-number, #005cc5)" },
    { tag: tags.comment, color: "var(--hljs-comment, #6e7781)", fontStyle: "italic" },
    { tag: tags.monospace, fontFamily: "var(--font-mono, 'Fira Code', 'Consolas', monospace)", fontSize: "var(--font-mono-size, 14px)" },
    { tag: tags.processingInstruction, color: "var(--hljs-keyword, #cf222e)" },
    { tag: tags.special(tags.string), color: "var(--hljs-string, #0a3069)" },
    { tag: tags.contentSeparator, color: "var(--text-secondary, #999)" },
    { tag: tags.meta, color: "var(--hljs-comment, #6e7781)" },
  ])
);

// 代码文件语法高亮（使用 CSS 变量引用）
const codeHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.string, color: "var(--hljs-string, #0a3069)" },
    { tag: tags.keyword, color: "var(--hljs-keyword, #cf222e)" },
    { tag: tags.atom, color: "var(--hljs-built_in, #0550ae)" },
    { tag: tags.bool, color: "var(--hljs-keyword, #0550ae)" },
    { tag: tags.number, color: "var(--hljs-number, #005cc5)" },
    { tag: tags.comment, color: "var(--hljs-comment, #6e7781)", fontStyle: "italic" },
    { tag: tags.monospace, fontFamily: "var(--font-mono, 'Fira Code', 'Consolas', monospace)", fontSize: "var(--font-mono-size, 14px)" },
    { tag: tags.processingInstruction, color: "var(--hljs-keyword, #cf222e)" },
    { tag: tags.special(tags.string), color: "var(--hljs-string, #0a3069)" },
    { tag: tags.meta, color: "var(--hljs-comment, #6e7781)" },
    { tag: tags.function(tags.variableName), color: "var(--hljs-built_in, #6f42c1)" },
    { tag: tags.definition(tags.variableName), color: "var(--hljs-built_in, #005cc5)" },
    { tag: tags.typeName, color: "var(--hljs-built_in, #22863a)" },
    { tag: tags.className, color: "var(--hljs-built_in, #6f42c1)" },
    { tag: tags.propertyName, color: "var(--hljs-string, #005cc5)" },
  ])
);

// ── LaTeX 数学高亮（$...$ 行内 / $$...$$ 块级） ──
const mathInlineMark = Decoration.mark({ class: "cm-math-inline" });
const mathBlockMark = Decoration.mark({ class: "cm-math-block" });
const mathDollarMark = Decoration.mark({ class: "cm-math-dollars" });

/** 判断 pos 处是否为合法开分隔符：后一位不能是空格/制表符（行内 $ 也不能是换行或数字） */
function canOpenMath(text: string, pos: number, isBlock: boolean) {
  const next = text[pos + (isBlock ? 2 : 1)];
  if (next === undefined || next === " " || next === "\t") return false;
  if (!isBlock && (next === "\n" || (next >= "0" && next <= "9"))) return false;
  return true;
}

/** 查找不以奇数个反斜杠转义的闭合 $ / $$ */
function findClosingDollar(text: string, from: number, isBlock: boolean) {
  const target = isBlock ? "$$" : "$";
  let i = from;
  while (i < text.length) {
    const idx = text.indexOf(target, i);
    if (idx === -1) return -1;
    let bs = 0;
    let k = idx - 1;
    while (k >= 0 && text[k] === "\\") {
      bs++;
      k--;
    }
    if (bs % 2 === 0) return idx;
    i = idx + target.length;
  }
  return -1;
}

/** 构建数学高亮装饰集（跳过代码围栏内的内容） */
function buildMathDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const fullText = doc.toString();
  const len = fullText.length;

  // 计算代码围栏区间，围栏内的 $ 不做数学高亮
  const fenceRanges: Array<[number, number]> = [];
  for (let lineNo = 1; lineNo <= doc.lines; ) {
    const line = doc.line(lineNo);
    if (/^(```|~~~)/.test(line.text.trim())) {
      const from = line.from;
      let closeLine = lineNo + 1;
      while (closeLine <= doc.lines && !/^(```|~~~)/.test(doc.line(closeLine).text.trim())) {
        closeLine++;
      }
      const to = closeLine <= doc.lines ? doc.line(closeLine).to : doc.length;
      fenceRanges.push([from, to]);
      lineNo = closeLine + 1;
    } else {
      lineNo++;
    }
  }
  const inFence = (pos: number) => fenceRanges.some(([a, b]) => pos >= a && pos < b);

  let i = 0;
  while (i < len) {
    if (fullText[i] !== "$" || inFence(i)) {
      i++;
      continue;
    }
    const isBlock = fullText[i + 1] === "$";
    if (!canOpenMath(fullText, i, isBlock)) {
      i++;
      continue;
    }

    const openEnd = i + (isBlock ? 2 : 1);
    const closeStart = findClosingDollar(fullText, openEnd, isBlock);
    if (closeStart === -1) {
      i++;
      continue;
    }
    const content = fullText.slice(openEnd, closeStart);
    if (!content.trim()) {
      i++;
      continue;
    }
    // 行内数学不能跨行，且闭合符前不能是空格
    if (!isBlock && (content.includes("\n") || content[content.length - 1] === " " || content[content.length - 1] === "\t")) {
      i++;
      continue;
    }

    const innerFrom = openEnd;
    const innerTo = closeStart;
    // RangeSetBuilder 要求按 from 位置升序添加，否则会抛 "Ranges must be added sorted" 错误
    builder.add(i, innerFrom, mathDollarMark);
    builder.add(innerFrom, innerTo, isBlock ? mathBlockMark : mathInlineMark);
    builder.add(innerTo, innerTo + (isBlock ? 2 : 1), mathDollarMark);
    i = innerTo + (isBlock ? 2 : 1);
  }
  return builder.finish();
}

const mathHighlighter = ViewPlugin.fromClass(
  class {
    decorations: ReturnType<typeof buildMathDecorations>;
    constructor(view: EditorView) {
      this.decorations = buildMathDecorations(view);
    }
    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildMathDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onWordCount?: (count: number) => void;
  filePath?: string | null;
  /** 选区（Markdown 源码偏移）变化时回调，用于跨模式保留光标位置 */
  onSelectionChange?: (selection: { anchor: number; head: number }) => void;
}

export interface CodeMirrorEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
  /** 设置选区（Markdown 源码偏移）并将焦点移入编辑器 */
  setSelectionAndFocus: (anchor: number, head: number) => void;
}

const highlightCompartment = new Compartment();
// Vim 扩展独立 Compartment：动态开关 vim 时不重建整个 editor
const vimCompartment = new Compartment();

// ════════════════════════════════════════════════════════════════
// t 前缀键：CodeMirror Markdown 源码表格操作
// ════════════════════════════════════════════════════════════════

/** 一行文本是否"像是 Markdown 表格的一行"（含 2+ 个 | 或首尾为 |）。 */
function looksLikeTableRow(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const pipes = (t.match(/\|/g) ?? []).length;
  return pipes >= 2 || (t.startsWith("|") && pipes >= 1);
}

/** 是否为分隔行：形如 | --- | :---: | ---: | 。 */
function isSeparatorRow(text: string): boolean {
  if (!looksLikeTableRow(text)) return false;
  const cells = splitTableRow(text).map((c) => c.trim());
  if (cells.length < 1) return false;
  return cells.every(
    (c) => /^:?-{2,}:?$/.test(c) || /^:?-{3,}:?$/.test(c)
  );
}

/** 将一行表格拆成单元格数组（去掉首尾空串），保留原内容（不去空格）。 */
function splitTableRow(text: string): string[] {
  const parts = text.split("|");
  // 如果文本两端有 |，会出现两端空串，去掉
  if (parts.length >= 2 && parts[0].trim() === "") parts.shift();
  if (parts.length >= 1 && parts[parts.length - 1].trim() === "") parts.pop();
  return parts;
}

/** 单元格数组合并回表格行文本（首尾带 | ，单元格间 " | " 分隔）。 */
function joinTableRow(cells: string[], pad = " "): string {
  const inside = cells.map((c) => {
    const s = c === undefined ? "" : c;
    return s.trim() === "" ? `${pad}${pad}` : `${pad}${s}${pad}`;
  }).join("|");
  return `|${inside}|`;
}

/** Markdown 表格识别结果。 */
interface TableScope {
  startRow: number;   // 1-based，含 header
  endRow: number;     // 1-based（inclusive）
  rows: string[];     // 从 startRow 到 endRow 的每一行文本
  separatorIdx: number; // rows 数组中的分隔行下标
  colCount: number;   // 列数
  curColIdx: number;  // 光标所在列（0-based，clamp 到列数范围内）
  cursorRowIdx: number; // rows 数组中的当前行下标
}

/** 检测光标是否在 Markdown 表格中，并返回作用域信息。 */
function detectMarkdownTable(
  doc: { lineAt: (pos: number) => { text: string; number: number; from: number; to: number; length: number }; lines: number },
  cursorLineNo: number,
  cursorLineText: string,
  cursorCol: number
): TableScope | null {
  if (!looksLikeTableRow(cursorLineText)) return null;

  const totalLines = doc.lines;
  let startRow = cursorLineNo;
  while (startRow > 1) {
    const above = doc.lineAt(startRow - 1);
    if (looksLikeTableRow(above.text)) startRow -= 1; else break;
  }
  let endRow = cursorLineNo;
  while (endRow < totalLines) {
    const below = doc.lineAt(endRow + 1);
    if (looksLikeTableRow(below.text)) endRow += 1; else break;
  }
  const rows: string[] = [];
  for (let r = startRow; r <= endRow; r++) rows.push(doc.lineAt(r).text);

  // 必须存在分隔行
  let separatorIdx = -1;
  for (let i = 0; i < rows.length; i++) if (isSeparatorRow(rows[i])) { separatorIdx = i; break; }
  if (separatorIdx < 0) return null;
  // 分隔行必须在 header（index 0）之后：GFM 要求第 2 行
  if (separatorIdx !== 1) return null;

  const colCount = splitTableRow(rows[separatorIdx]).length;
  if (colCount < 1) return null;

  const cursorRowIdx = cursorLineNo - startRow;
  // 当前列：以 cursorCol（光标在该行的字符偏移）计算
  const curText = cursorLineText;
  let pipesSeen = 0;
  for (let i = 0; i < curText.length && i < cursorCol; i++) {
    if (curText[i] === "|") pipesSeen += 1;
  }
  // 第一列前有一个开头 | 或没有
  const cells = splitTableRow(curText);
  const realColCount = cells.length;
  // pipesSeen - (首字符是否为 | ? 1 : 0) 大致是第几个 cell
  const startsWithPipe = curText.trim().startsWith("|");
  let column = startsWithPipe ? pipesSeen - 1 : pipesSeen;
  if (column < 0) column = 0;
  if (column > realColCount - 1) column = realColCount - 1;
  // clamp 到 colCount（以分隔行为准）
  const curColIdx = Math.max(0, Math.min(colCount - 1, column));

  return { startRow, endRow, rows, separatorIdx, colCount, curColIdx, cursorRowIdx };
}

/** 渲染一"对齐"单元格为 Markdown 分隔行的 --- 样式。 */
function alignSeparatorCell(raw: string, align: "left" | "center" | "right"): string {
  // 保留原本的横线长度近似，只改冒号
  const dashes = "-".repeat(Math.max(3, raw.trim().replace(/[:]/g, "").length));
  if (align === "left") return `:${dashes}`;
  if (align === "right") return `${dashes}:`;
  return `:${dashes}:`;
}

/** CodeMirror Markdown 表格动作。动作成功返回 true。 */
function executeCMTableAction(view: EditorView, op: string): boolean {
  try {
    const doc = view.state.doc;
    const head = view.state.selection.main.head;
    const curLine = doc.lineAt(head);
    const cursorCol = head - curLine.from; // 0-based，在该行中的字符偏移
    const scope = detectMarkdownTable(doc, curLine.number, curLine.text, cursorCol);
    if (!scope) return false;

    const { startRow, endRow, rows, separatorIdx, colCount, curColIdx, cursorRowIdx } = scope;
    let newRows = rows.slice();
    let nextCursor: { anchor: number; head: number } | null = null;
    let selPreferredCol = curColIdx;

    switch (op) {
      // ── 对齐（仅写分隔行对应列的冒号） ──
      case "align-left":
      case "align-center":
      case "align-right": {
        const align = op === "align-left" ? "left" : op === "align-center" ? "center" : "right";
        const sepCells = splitTableRow(newRows[separatorIdx]);
        // 以分隔行列数为准
        const idx = Math.max(0, Math.min(sepCells.length - 1, curColIdx));
        sepCells[idx] = alignSeparatorCell(sepCells[idx] ?? "---", align);
        newRows[separatorIdx] = joinTableRow(sepCells);
        break;
      }

      // ── 插入行 ────────────────────────────────────────
      case "add-row-above":
      case "add-row-below": {
        // 不能插入到 header 与 分隔行之间（分隔行必须保持 index=1）
        const below = op === "add-row-below";
        let insertAtRow = cursorRowIdx + (below ? 1 : 0);
        // 如果光标在分隔行：below 就插下一个；above 就插分隔行上方 = 会把 header/separator 隔开 → 改为插 separator 下方（等价 below）
        if (cursorRowIdx === separatorIdx) insertAtRow = below ? separatorIdx + 1 : separatorIdx + 1;
        // 如 insertAtRow 在分隔行之前 → 只能分隔行之后插（避免破坏 header+separator 紧邻）
        if (insertAtRow <= separatorIdx) insertAtRow = separatorIdx + 1;
        const emptyCells = new Array(colCount).fill("  ");
        newRows.splice(insertAtRow, 0, joinTableRow(emptyCells));
        // 光标移到新行
        const newRowIdxInArr = insertAtRow;
        const newRowIdx1Based = startRow + newRowIdxInArr;
        selPreferredCol = curColIdx;
        // 先占位，后面统一根据 newRows 算位置
        nextCursor = {
          anchor: -1, head: -1, // 稍后计算
        };
        // 存索引给下面
        (nextCursor as any)._newRowIdxInArr = newRowIdxInArr;
        (nextCursor as any)._newColIdx = selPreferredCol;
        void newRowIdx1Based;
        break;
      }

      // ── 插入列 ────────────────────────────────────────
      case "add-col-left":
      case "add-col-right": {
        const insertLeft = op === "add-col-left";
        const insertCol = insertLeft ? curColIdx : curColIdx + 1;
        for (let i = 0; i < newRows.length; i++) {
          const cells = splitTableRow(newRows[i]);
          const fill = i === separatorIdx ? "---" : "  ";
          cells.splice(Math.max(0, Math.min(cells.length, insertCol)), 0, fill);
          newRows[i] = joinTableRow(cells);
        }
        // 光标放在新列上
        ({});
        break;
      }

      // ── 合并单元格（Markdown 原生不支持 colspan ，只能内容拼接） ──
      case "merge-cells": {
        // 将当前列与其右侧一列内容合并到当前列（内容用空格连接），右列置空。
        if (curColIdx + 1 >= colCount) return false;
        const targetRow = cursorRowIdx === separatorIdx ? separatorIdx + 1 : cursorRowIdx;
        if (targetRow >= newRows.length) return false;
        const cells = splitTableRow(newRows[targetRow]);
        const lCol = Math.max(0, Math.min(cells.length - 1, curColIdx));
        const rCol = Math.min(cells.length - 1, lCol + 1);
        const merged = (cells[lCol] ?? "").trim() + (cells[rCol] ?? "").trim() ? ` ${(cells[rCol] ?? "").trim()}` : "";
        cells[lCol] = (cells[lCol] ?? "").trim() + merged;
        cells[rCol] = "  ";
        newRows[targetRow] = joinTableRow(cells);
        break;
      }

      // ── 拆分单元格（按空白/分隔符拆分内容 → 两列；没可拆分的等价加空列） ──
      case "split-cell": {
        const targetRow = cursorRowIdx === separatorIdx ? separatorIdx + 1 : cursorRowIdx;
        if (targetRow >= newRows.length) return false;
        const cells = splitTableRow(newRows[targetRow]);
        const idx = Math.max(0, Math.min(cells.length - 1, curColIdx));
        const content = (cells[idx] ?? "").trim();
        // 尝试按空白/制表符/逗号拆成两段
        let first = content;
        let second = "";
        const m = content.match(/^(\S+)\s+(.*)$/) || content.match(/^(.+?)\s*[,，|/\\]\s*(.*)$/);
        if (m) { first = m[1]; second = m[2]; }
        cells[idx] = ` ${first} `;
        cells.splice(idx + 1, 0, second ? ` ${second} ` : "  ");
        newRows[targetRow] = joinTableRow(cells);
        break;
      }

      default:
        return false;
    }

    // 构建 changes
    const fromLine = doc.lineAt(startRow);
    const toLine = doc.lineAt(endRow);
    const insertText = newRows.join("\n");

    // 光标恢复：优先放到新行/新列的起始处，否则保持原偏移
    let newHead = head;
    try {
      // 需要在新 doc 中算位置：先构造新 doc lines 布局 → 简单做法：
      // 保留 (fromLine.from) 之前不变；insertText 的行中取目标行的第 N 个单元格起点
      const tmpDocLines = insertText.split("\n");
      let baseOff = fromLine.from;
      let targetRowInArr = 0;
      let targetColInRow = 0;
      if (nextCursor && (nextCursor as any)._newRowIdxInArr != null) {
        targetRowInArr = (nextCursor as any)._newRowIdxInArr;
        targetColInRow = (nextCursor as any)._newColIdx ?? 0;
      } else if (op.startsWith("add-col-")) {
        targetRowInArr = cursorRowIdx;
        targetColInRow = op === "add-col-left" ? curColIdx : curColIdx + 1;
      } else {
        targetRowInArr = cursorRowIdx;
        targetColInRow = curColIdx;
      }
      // 计算偏移：跳 targetRowInArr 行 + 在目标行中找第 targetColInRow 个 | 后面
      for (let i = 0; i < targetRowInArr; i++) baseOff += tmpDocLines[i].length + 1;
      const targetLineStr = tmpDocLines[targetRowInArr] ?? "";
      const cells = splitTableRow(targetLineStr);
      const col = Math.max(0, Math.min(cells.length - 1, targetColInRow));
      // 找到该行内第 col 个单元格起点的字符偏移
      let pipesPassed = 0;
      let off = 0;
      // 如果首字符是 |，那么 col 0 在第一个 | 之后
      const leadingPipe = targetLineStr.startsWith("|");
      if (leadingPipe) off = 1;
      pipesPassed = leadingPipe ? 1 : 0;
      while (pipesPassed - (leadingPipe ? 1 : 0) < col && off < targetLineStr.length) {
        if (targetLineStr[off] === "|") pipesPassed += 1;
        if (pipesPassed - (leadingPipe ? 1 : 0) >= col) break;
        off += 1;
      }
      // 跳过紧接的空格
      while (off < targetLineStr.length && targetLineStr[off] === " ") off += 1;
      newHead = baseOff + off;
    } catch { /* ignore */ }

    view.dispatch({
      changes: [{ from: fromLine.from, to: toLine.to, insert: insertText }],
      selection: { anchor: newHead, head: newHead },
    });
    return true;
  } catch {
    return false;
  }
}

const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(
  ({ value, onChange, onWordCount, filePath, onSelectionChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onWordCountRef = useRef(onWordCount);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const isInternalRef = useRef(false);
    const filePathRef = useRef(filePath);
    filePathRef.current = filePath;
    const prevFilePathForScrollRef = useRef(filePath);

    onChangeRef.current = onChange;
    onWordCountRef.current = onWordCount;
    onSelectionChangeRef.current = onSelectionChange;

    useImperativeHandle(ref, () => ({
      getValue: () => {
        if (!viewRef.current) return "";
        return viewRef.current.state.doc.toString();
      },
      setValue: (val: string) => {
        if (!viewRef.current) return;
        isInternalRef.current = true;
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: viewRef.current.state.doc.length,
            insert: val,
          },
        });
      },
      focus: () => {
        viewRef.current?.focus();
      },
      setSelectionAndFocus: (anchor: number, head: number) => {
        const view = viewRef.current;
        if (!view) return;
        const len = view.state.doc.length;
        const a = Math.max(0, Math.min(anchor, len));
        const h = Math.max(0, Math.min(head, len));
        view.dispatch({ selection: { anchor: a, head: h } });
        view.focus();
      },
    }));

    // 根据 filePath 获取语言扩展
    const languageExtension = useMemo(() => getLanguageExtension(filePath), [filePath]);

    // Vim 模式状态（默认 enabled=false，关闭时零开销）
    const { enabled: vimEnabled, leaderKey, mode: vimMode, menuTimeout, setMode: onModeChange } = useVim();
    const vimModeRef = useRef<VimMode>(vimMode);
    vimModeRef.current = vimMode;

    // Leader 菜单：normal 态按 Space 触发，匹配动作后按命名空间分发
    const dispatchAction = useCallback((action: string) => {
      const wasVisual = vimModeRef.current === "visual";
      let handled = false;
      if (action.startsWith("editor.")) {
        const view = viewRef.current;
        if (!view) return false;
        handled = executeCodeMirrorAction(action.slice("editor.".length), view);
      } else if (action.startsWith("app.")) {
        // app.* 动作通过全局事件分发到 App.tsx，Vim 模块不依赖 App 内部 handler
        window.dispatchEvent(new CustomEvent("vim-app-action", {
          detail: { action: action.slice("app.".length) }
        }));
        handled = true;
      } else if (action.startsWith("table.")) {
        const view = viewRef.current;
        if (!view) return false;
        handled = executeCMTableAction(view, action.slice("table.".length));
      }
      // Visual 态执行完任何动作后立刻回到 normal 态（对齐真实 Vim 的操作体验）
      if (handled && wasVisual) {
        try {
          const cm = viewRef.current ? getCM(viewRef.current) : null;
          if (cm) (CMVim.exitVisualMode as any)(cm, true);
        } catch {
          // ignore
        }
      }
      return handled;
    }, []);

    const leader = useLeader({
      enabled: vimEnabled,
      triggerKey: leaderKey,
      timeout: menuTimeout,
      active: vimMode !== "insert",
      dispatchAction,
    });

    // m 前缀键：normal/visual 态按 m 弹出 Markdown 格式化菜单（mb=加粗, mi=斜体…）
    const prefixM = useLeader({
      enabled: vimEnabled,
      triggerKey: "m",
      timeout: menuTimeout,
      active: vimMode !== "insert" && !leader.open,
      dispatchAction,
      initialItems: prefixMConfig.items,
    });

    // g 前缀键：被动模式，弹窗仅作视觉引导，按键由 vim 扩展原生处理
    const prefixG = useLeader({
      enabled: vimEnabled,
      triggerKey: "g",
      timeout: menuTimeout,
      active: vimMode !== "insert" && !leader.open && !prefixM.open,
      dispatchAction,
      initialItems: prefixGConfig.items,
      passive: true,
    });

    // z 前缀键：被动模式，弹窗仅作视觉引导，按键由 vim 扩展原生处理
    const prefixZ = useLeader({
      enabled: vimEnabled,
      triggerKey: "z",
      timeout: menuTimeout,
      active: vimMode !== "insert" && !leader.open && !prefixM.open && !prefixG.open,
      dispatchAction,
      initialItems: prefixZConfig.items,
      passive: true,
    });

    // t 前缀键：主动模式，Markdown 源码表格操作（对齐/插入行列/合并拆分）。
    // 优先级排在 g/z 之后，即 normal/visual 下 Space/m/g/z 都未开启时才由 t 激活。
    const prefixT = useLeader({
      enabled: vimEnabled,
      triggerKey: "t",
      timeout: menuTimeout,
      active: vimMode !== "insert" && !leader.open && !prefixM.open && !prefixG.open && !prefixZ.open,
      dispatchAction,
      initialItems: prefixTConfig.items,
    });
    // 显式引用：避免 TS6133 unused-var。hook 通过内部 keydown listener 生效。
    void leader.open; void prefixM.open; void prefixG.open; void prefixZ.open; void prefixT.open;

    useEffect(() => {
      if (!containerRef.current) return;

      const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
        const main = update.state.selection.main;
        onSelectionChangeRef.current?.({ anchor: main.anchor, head: main.head });
        if (update.docChanged) {
          if (isInternalRef.current) {
            isInternalRef.current = false;
            return;
          }
          const newValue = update.state.doc.toString();
          onChangeRef.current(newValue);
          const count = newValue.replace(/\s/g, "").length;
          onWordCountRef.current?.(count);
        }
      });

      // 根据语言类型选择高亮主题
      const useMarkdownHighlighting = isMarkdownFile(filePathRef.current);

      // Markdown 文件启用 LaTeX 数学高亮
      const mathExtensions = useMarkdownHighlighting ? [mathHighlighter] : [];

      const state = EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          foldGutter(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightSelectionMatches(),
          // Markdown 文件空内容时提示输入 @ 插入 wiki-link
          ...(useMarkdownHighlighting ? [placeholder("输入@插入")] : []),
          languageExtension,
          markdownTheme,
          ...mathExtensions,
          // 使用 Compartment 包装高亮，支持动态切换
          highlightCompartment.of(
            useMarkdownHighlighting ? markdownHighlighting : codeHighlighting
          ),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...completionKeymap,
            ...closeBracketsKeymap,
            indentWithTab,
          ]),
          updateListener,
          EditorView.lineWrapping,
          // Vim 扩展通过独立 Compartment 动态开关（enabled=false 时为空数组，零影响）
          vimCompartment.of([]),
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;
      onSelectionChangeRef.current?.({
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
      });

      // 文末留白：到达文末后仍可继续向下滚动，让最后一行能滚到窗口中间附近（手动滚动）
      const wrapper = containerRef.current.closest(".editor-wrapper") as HTMLElement | null;
      const updateEndScrollSpace = () => {
        if (!wrapper) return;
        const space = Math.max(120, Math.round(view.scrollDOM.clientHeight / 2));
        wrapper.style.setProperty("--editor-end-scroll-space", `${space}px`);
      };
      updateEndScrollSpace();
      const endSpaceObserver = new ResizeObserver(updateEndScrollSpace);
      endSpaceObserver.observe(view.scrollDOM);

      return () => {
        endSpaceObserver.disconnect();
        view.destroy();
        viewRef.current = null;
      };
    }, [languageExtension]);

    // 外部 value 同步
    useEffect(() => {
      if (!viewRef.current) return;
      if (isInternalRef.current) {
        isInternalRef.current = false;
        return;
      }
      const fileChanged = prevFilePathForScrollRef.current !== filePath;
      prevFilePathForScrollRef.current = filePath;
      const currentContent = viewRef.current.state.doc.toString();
      if (value !== currentContent) {
        isInternalRef.current = true;
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: viewRef.current.state.doc.length,
            insert: value,
          },
          // 文件切换时重置光标到文档开头，避免后续 focus() 将旧选区位置滚动到视图中
          selection: fileChanged ? { anchor: 0 } : undefined,
        });
        // 文件切换时重置滚动位置到顶部
        if (fileChanged) {
          requestAnimationFrame(() => {
            const scroller = viewRef.current?.scrollDOM;
            if (scroller) {
              scroller.scrollTop = 0;
              scroller.scrollLeft = 0;
            }
          });
        }
      }
    }, [value, filePath]);

    // 监听代码主题变化，通过 Compartment reconfigure 实时切换高亮
    useEffect(() => {
      const handleCodeThemeChanged = () => {
        if (!viewRef.current) return;
        const useMarkdownHighlighting = isMarkdownFile(filePathRef.current);
        viewRef.current.dispatch({
          effects: highlightCompartment.reconfigure(
            useMarkdownHighlighting ? markdownHighlighting : codeHighlighting
          ),
        });
      };
      window.addEventListener("code-theme-changed", handleCodeThemeChanged);
      return () => window.removeEventListener("code-theme-changed", handleCodeThemeChanged);
    }, [markdownHighlighting, codeHighlighting]);

    // Vim 扩展动态注入：enabled 切换或 leaderKey 变化时通过 Compartment reconfigure
    // enabled=false 时 reconfigure 为空数组 → 完全移除 vim 行为，零残留
    useEffect(() => {
      if (!viewRef.current) return;
      viewRef.current.dispatch({
        effects: vimCompartment.reconfigure(
          createVimExtension({
            enabled: vimEnabled,
            leaderKey,
            onModeChange,
          })
        ),
      });
    }, [vimEnabled, leaderKey, onModeChange]);

    return (
      <div className="editor-wrapper">
        <div className="codemirror-editor-container">
          <div ref={containerRef} className="codemirror-editor" />
        </div>
        <LeaderMenu
          open={leader.open || prefixM.open || prefixG.open || prefixZ.open}
          items={
            leader.open ? leader.items
            : prefixM.open ? prefixM.items
            : prefixG.open ? prefixG.items
            : prefixZ.items
          }
          path={
            leader.open ? leader.path
            : prefixM.open ? prefixM.path
            : prefixG.open ? prefixG.path
            : prefixZ.path
          }
        />
      </div>
    );
  }
);

CodeMirrorEditor.displayName = "CodeMirrorEditor";

export default CodeMirrorEditor;
