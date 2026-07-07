import { useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { syntaxHighlighting, bracketMatching, foldGutter, indentOnInput, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";


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
    backgroundColor: "var(--bg-secondary, #f5f5f5)",
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
    { tag: tags.monospace, fontFamily: "var(--editor-font, 'Fira Code', 'Consolas', monospace)", fontSize: "0.9em" },
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
    { tag: tags.monospace, fontFamily: "var(--editor-font, 'Fira Code', 'Consolas', monospace)", fontSize: "0.9em" },
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

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onWordCount?: (count: number) => void;
  filePath?: string | null;
}

export interface CodeMirrorEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
}

const highlightCompartment = new Compartment();

const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(
  ({ value, onChange, onWordCount, filePath }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onWordCountRef = useRef(onWordCount);
    const isInternalRef = useRef(false);
    const filePathRef = useRef(filePath);
    filePathRef.current = filePath;

    onChangeRef.current = onChange;
    onWordCountRef.current = onWordCount;

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
    }));

    // 根据 filePath 获取语言扩展
    const languageExtension = useMemo(() => getLanguageExtension(filePath), [filePath]);

    useEffect(() => {
      if (!containerRef.current) return;

      const updateListener = EditorView.updateListener.of((update: { docChanged: boolean; state: { doc: { toString: () => string } } }) => {
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
          languageExtension,
          markdownTheme,
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
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;

      return () => {
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
      const currentContent = viewRef.current.state.doc.toString();
      if (value !== currentContent) {
        isInternalRef.current = true;
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: viewRef.current.state.doc.length,
            insert: value,
          },
        });
      }
    }, [value]);

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

    return (
      <div className="editor-wrapper">
        <div className="codemirror-editor-container">
          <div ref={containerRef} className="codemirror-editor" />
        </div>
      </div>
    );
  }
);

CodeMirrorEditor.displayName = "CodeMirrorEditor";

export default CodeMirrorEditor;
