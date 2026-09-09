import { Extension } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import type MarkdownIt from "markdown-it";

// ============================================================================
// markdown-it 数学插件
// 解析行内 $...$ 与块级 $$...$$（支持跨行），渲染为 Tydora 数学节点 DOM
// （span[data-type="inline-math"] / div[data-type="block-math"]），
// 再由 ProseMirror DOMParser 还原为 inlineMath / blockMath 节点。
// 分隔符校验规则借鉴 markdown-it-mathjax3，可避免误判货币、价格等场景。
// ============================================================================

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // 换行转字符引用：HTML 解析器会把属性值中的字面换行规范化为空格，导致多行公式丢失换行
    .replace(/\n/g, "&#10;");
}

/** 判断 $ 是否为合法分隔符（前后空格 / 后跟数字均不合法） */
function isValidDelim(state: any, pos: number) {
  const max = state.posMax;
  let canOpen = true;
  let canClose = true;
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
  const nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;
  // 前一位是空格/制表符，或后一位是数字时，不能作为闭合符（避免把「价格 $5」误判为数学）
  if (prevChar === 32 || prevChar === 9 || (nextChar >= 48 && nextChar <= 57)) {
    canClose = false;
  }
  // 后一位是空格/制表符时，不能作为开始符
  if (nextChar === 32 || nextChar === 9) {
    canOpen = false;
  }
  return { canOpen, canClose };
}

/** 行内 $...$ */
function mathInline(state: any, silent: boolean) {
  if (state.src[state.pos] !== "$") return false;

  const res = isValidDelim(state, state.pos);
  if (!res.canOpen) {
    if (!silent) state.pending += "$";
    state.pos += 1;
    return true;
  }

  const start = state.pos + 1;
  let match = start;
  while ((match = state.src.indexOf("$", match)) !== -1) {
    // 找到闭合 $（前面不能是奇数个反斜杠，即转义过的 $）
    let pos = match - 1;
    while (state.src[pos] === "\\") pos -= 1;
    if ((match - pos) % 2 === 1) break;
    match += 1;
  }

  if (match === -1) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }
  if (match - start === 0) {
    if (!silent) state.pending += "$$";
    state.pos = start + 1;
    return true;
  }

  const resClose = isValidDelim(state, match);
  if (!resClose.canClose) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = "$";
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

/** 块级 $$...$$（支持跨行） */
function mathBlock(state: any, start: number, end: number, silent: boolean) {
  let next = start;
  let lastPos = 0;
  let found = false;
  let pos = state.bMarks[start] + state.tShift[start];
  let max = state.eMarks[start];
  let lastLine = "";

  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== "$$") return false;

  pos += 2;
  let firstLine = state.src.slice(pos, max);
  if (silent) return true;

  // 起始行直接闭合：$$...$$
  if (firstLine.trim().slice(-2) === "$$") {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }

  while (!found) {
    next++;
    if (next >= end) break;
    pos = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    // 以 $$ 结尾的行作为闭合行
    if (state.src.slice(pos, max).trim().slice(-2) === "$$") {
      lastPos = state.src.slice(0, max).lastIndexOf("$$");
      lastLine = state.src.slice(pos, lastPos);
      found = true;
    }
  }

  state.line = next + 1;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content =
    (firstLine && firstLine.trim() ? firstLine + "\n" : "") +
    state.getLines(start + 1, next, state.tShift[start], true) +
    (lastLine && lastLine.trim() ? lastLine : "");
  token.map = [start, state.line];
  token.markup = "$$";
  return true;
}

export interface MathMarkdownItRenderer {
  inline?: (latex: string) => string;
  block?: (latex: string) => string;
}

/**
 * markdown-it 数学插件
 * 默认输出 Tydora 数学节点 DOM；传入 renderer 可自定义输出（如 KaTeX HTML）
 */
export function mathMarkdownItPlugin(md: MarkdownIt, renderer?: MathMarkdownItRenderer) {
  md.inline.ruler.after("escape", "math_inline", mathInline as any);
  md.block.ruler.after("blockquote", "math_block", mathBlock as any, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules.math_inline = (tokens: any, idx: number) =>
    renderer?.inline?.(tokens[idx].content) ??
    `<span data-type="inline-math" data-latex="${escapeHtml(tokens[idx].content)}"></span>`;
  md.renderer.rules.math_block = (tokens: any, idx: number) =>
    renderer?.block?.(tokens[idx].content) ??
    `<div data-type="block-math" data-latex="${escapeHtml(tokens[idx].content)}"></div>`;
}

// ============================================================================
// Math 扩展：行内数学 + 块级数学（KaTeX 渲染）
// ============================================================================

export interface MathOptions {
  /** 点击公式时回调（node, pos） */
  onClick?: (node: any, pos: number) => void;
  /** KaTeX 渲染选项 */
  katexOptions?: Record<string, unknown>;
}

export const Math = Extension.create<MathOptions>({
  name: "math",
  addOptions() {
    return { onClick: undefined, katexOptions: undefined };
  },
  addExtensions() {
    const { onClick, katexOptions } = this.options;
    return [
      InlineMath.extend({
        addOptions() {
          return { onClick, katexOptions };
        },
        addStorage() {
          return {
            markdown: {
              parse: {
                // 解析规则在此统一注册（含行内与块级），BlockMath 无需重复注册
                setup: mathMarkdownItPlugin,
                updateDOM() {},
              },
              serialize(state: any, node: any) {
                const latex = (node.attrs.latex as string) || "";
                state.write("$" + latex + "$");
              },
            },
          };
        },
      }),
      BlockMath.extend({
        addOptions() {
          return { onClick, katexOptions };
        },
        addStorage() {
          return {
            markdown: {
              parse: {
                setup() {},
                updateDOM() {},
              },
              serialize(state: any, node: any) {
                const latex = (node.attrs.latex as string) || "";
                state.ensureNewLine();
                state.write("$$\n");
                state.text(latex, false);
                state.ensureNewLine();
                state.write("$$");
                state.closeBlock(node);
              },
            },
          };
        },
      }),
    ];
  },
});
