/**
 * Mermaid 语言定义 — 轻量模块，仅包含高亮相关代码
 * 不含 mermaid 渲染库、TipTap、highlight.js 等重量级依赖
 */

import { EditorView as CMView } from "@codemirror/view";
import { syntaxHighlighting, HighlightStyle, StreamLanguage } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// ── highlight.js 语言函数（供 hljs / lowlight 注册） ──
export const mermaidHljsLang = (hljsApi: any) => ({
  name: "Mermaid",
  aliases: ["mermaid"],
  keywords: {
    keyword:
      "graph flowchart sequenceDiagram classDiagram stateDiagram erDiagram " +
      "gantt pie gitGraph mindmap timeline requirementDiagram quadrantDiagram " +
      "sankeyDiagram xychartDiagram blockDiagram architectureDiagram journeyDiagram " +
      "TB TD BT RL LR subgraph end class style click link call callbacks " +
      "title section dateFormat axisFormat tickInterval exclusive " +
      "activate deactivate loop alt opt par and rect else note over participant " +
      "autonumber namespace",
    literal: "true false yes no",
  },
  contains: [
    hljsApi.COMMENT("%%", "$"),
    hljsApi.C_LINE_COMMENT_MODE,
    hljsApi.QUOTE_STRING_MODE,
    hljsApi.APOS_STRING_MODE,
    { className: "operator", match: /-[-.]+>|==>|-->|---|\.\.->|-.->/ },
    { className: "type", match: /[\[\(\{][^\]]*[\]\)\}]/ },
    hljsApi.NUMBER_MODE,
  ],
});

// ── CodeMirror 主题 ──
export const mermaidTheme = CMView.theme({
  "&": { backgroundColor: "var(--bg-secondary, #f8f9fa)", color: "var(--text-primary, #333)", fontSize: "13px", borderRadius: "0 0 8px 8px" },
  ".cm-content": { caretColor: "var(--text-primary, #333)", padding: "16px 16px", fontFamily: "var(--editor-font, 'JetBrains Mono', 'Fira Code', monospace)", minHeight: "80px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text-primary, #333)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(0, 122, 255, 0.3)" },
  ".cm-gutters": { backgroundColor: "var(--bg-secondary, #f5f5f5)", color: "var(--text-secondary, #999)", border: "none", borderRight: "1px solid var(--border, #e0e0e0)" },
  ".cm-activeLine": { backgroundColor: "var(--bg-hover, rgba(0,0,0,0.03))" },
  ".cm-activeLineGutter": { backgroundColor: "var(--bg-hover, rgba(0,0,0,0.05))", color: "var(--text-primary, #333)" },
});

// ── 语法高亮样式 ──
export const mermaidHighlightStyle = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: "var(--hljs-keyword, #8250df)" },
  { tag: tags.string, color: "var(--hljs-string, #0a3069)" },
  { tag: tags.comment, color: "var(--hljs-comment, #6e7781)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--hljs-built_in, #cf222e)" },
  { tag: tags.number, color: "var(--hljs-number, #0550ae)" },
  { tag: tags.typeName, color: "var(--hljs-number, #0550ae)" },
  { tag: tags.atom, color: "var(--hljs-number, #0550ae)" },
]));

// ── CodeMirror Mermaid 语法 ──
export const mermaidLanguage = StreamLanguage.define<{ inString: boolean; stringChar: string }>({
  startState: () => ({ inString: false, stringChar: "" }),
  token(stream, state) {
    // 字符串
    if (state.inString) {
      stream.eatWhile((ch) => ch !== state.stringChar);
      if (stream.eat(state.stringChar)) state.inString = false;
      return "string";
    }
    if (stream.eat("\"") || stream.eat("'")) {
      state.stringChar = stream.current()!.slice(-1);
      state.inString = true;
      return "string";
    }
    // 注释 %%
    if (stream.match("%%", true)) {
      stream.skipToEnd();
      return "comment";
    }
    // 箭头/运算符
    if (stream.match(/-->|---|==>|\.\.->|-.->|:::|-[-.]+>|\|/, true)) {
      return "operator";
    }
    // 节点形状 [label] (label) {label}
    if (stream.match(/[\[\(\{<]/, true)) {
      const closeBracket: Record<string, string> = { "[": "]", "(": ")", "{": "}", "<": ">" };
      const bracket = stream.current!();
      const close = closeBracket[bracket] || "";
      if (close) stream.eatWhile((ch) => ch !== close);
      if (close) stream.eat(close);
      return "type";
    }
    // 数字
    if (stream.match(/[\d.]+/, true)) {
      return "number";
    }
    // 单词：关键词或普通
    if (stream.match(/[a-zA-Z_]\w*/, true)) {
      const word = stream.current!();
      const keywords = new Set([
        "graph", "flowchart", "sequenceDiagram", "classDiagram", "stateDiagram",
        "erDiagram", "gantt", "pie", "gitGraph", "mindmap", "timeline",
        "requirementDiagram", "quadrantDiagram", "sankeyDiagram", "xychartDiagram",
        "blockDiagram", "architectureDiagram", "journeyDiagram",
        "TB", "TD", "BT", "RL", "LR",
        "subgraph", "end", "class", "style", "click", "link", "call", "callbacks",
        "title", "section", "dateFormat", "axisFormat", "tickInterval", "exclusive",
        "activate", "deactivate", "loop", "alt", "opt", "par", "rect", "and", "else",
        "note", "over", "participant", "actor", "autonumber", "namespace",
      ]);
      if (keywords.has(word)) return "keyword";
      if (word === "true" || word === "false" || word === "yes" || word === "no") return "atom";
      return "string";
    }
    // 其他字符
    stream.next();
    return null;
  },
});
