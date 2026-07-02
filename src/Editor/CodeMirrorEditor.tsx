import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";

// 自定义 Markdown 主题
const markdownTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--bg-primary, #fff)",
    color: "var(--text-primary, #333)",
    fontFamily: "var(--editor-font, 'JetBrains Mono', 'Fira Code', 'Consolas', monospace)",
    fontSize: "var(--editor-font-size, 14px)",
    height: "100%",
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

// Markdown 语法高亮
import { HighlightStyle } from "@codemirror/language";

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
    { tag: tags.string, color: "var(--text-string, #0a3069)" },
    { tag: tags.keyword, color: "var(--text-keyword, #cf222e)" },
    { tag: tags.atom, color: "var(--text-atom, #0550ae)" },
    { tag: tags.bool, color: "var(--text-bool, #0550ae)" },
    { tag: tags.comment, color: "var(--text-comment, #6e7781)", fontStyle: "italic" },
    { tag: tags.monospace, fontFamily: "var(--editor-font, 'JetBrains Mono', 'Fira Code', monospace)", fontSize: "0.9em" },
    { tag: tags.processingInstruction, color: "var(--text-code, #cf222e)" },
    { tag: tags.special(tags.string), color: "var(--text-code, #cf222e)" },
    { tag: tags.contentSeparator, color: "var(--text-secondary, #999)" },
    { tag: tags.meta, color: "var(--text-meta, #6e7781)" },
  ])
);

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export interface CodeMirrorEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
}

const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(
  ({ value, onChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const isInternalRef = useRef(false);

    onChangeRef.current = onChange;

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
        }
      });

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
          markdown({ base: markdownLanguage }),
          markdownTheme,
          markdownHighlighting,
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
    }, []);

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
