import { useRef, useEffect, forwardRef, useImperativeHandle, useState } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import yaml from "highlight.js/lib/languages/yaml";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";

// 注册语言
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("php", php);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("kotlin", kotlin);

// 注册 Mermaid 语法高亮
hljs.registerLanguage("mermaid", (hljsApi) => ({
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
    {
      className: "operator",
      match: /-[-.]+>|==>|-->|---|\.\.->|-.->/,
    },
    {
      className: "type",
      match: /[\[\(\{][^\]]*[\]\)\}]/,
    },
    hljsApi.NUMBER_MODE,
  ],
}));

interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  onWordCount?: (count: number) => void;
}

export interface SourceEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
}

const SourceEditor = forwardRef<SourceEditorHandle, SourceEditorProps>(
  ({ value, onChange, onWordCount }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const onChangeRef = useRef(onChange);
    const onWordCountRef = useRef(onWordCount);
    const [lineCount, setLineCount] = useState(1);

    onChangeRef.current = onChange;
    onWordCountRef.current = onWordCount;

    const updateWordCount = (text: string) => {
      const count = text.replace(/\s/g, "").length;
      onWordCountRef.current?.(count);
    };

    useImperativeHandle(ref, () => ({
      getValue: () => textareaRef.current?.value ?? "",
      setValue: (val: string) => {
        if (textareaRef.current) {
          textareaRef.current.value = val;
          updateHighlight(val);
          setLineCount(val.split("\n").length);
          updateWordCount(val);
        }
      },
      focus: () => textareaRef.current?.focus(),
    }));

    const updateHighlight = (text: string) => {
      if (!highlightRef.current) return;

      // 1. 检测语言
      let detectedLang = "markdown";
      try {
        const result = hljs.highlightAuto(text, [
          "javascript", "typescript", "python", "css", "xml",
          "json", "bash", "shell", "sql", "markdown", "yaml",
          "rust", "go", "java", "cpp", "csharp", "php", "ruby",
          "swift", "kotlin"
        ]);
        if (result.language) {
          detectedLang = result.language;
        }
      } catch {
        // 使用默认 markdown
      }

      // 2. 高亮原始文本（不修改原文）
      let highlighted: string;
      try {
        highlighted = hljs.highlight(text, { language: detectedLang }).value;
      } catch {
        highlighted = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      // 3. 后处理：在高亮 HTML 中定位 mermaid 代码块并重新高亮
      //    markdown 高亮后整个 fenced code block 包在单个 <span class="hljs-code"> 中
      highlighted = highlighted.replace(
        /<span class="hljs-code">```mermaid\n([\s\S]*?)```<\/span>/g,
        (_block: string, codeContent: string) => {
          // 反转义 HTML 实体 → 原始 mermaid 代码
          const rawText = codeContent
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#x27;/g, "'");
          try {
            const mermaidResult = hljs.highlight(rawText, { language: "mermaid" });
            return `<span class="hljs-code">\`\`\`mermaid\n${mermaidResult.value}\n\`\`\`</span>`;
          } catch {
            return _block;
          }
        }
      );

      // 4. 添加行号
      const lines = highlighted.split("\n");
      const numberedLines = lines.map((line) =>
        `<div class="source-line"><span class="source-line-content">${line}</span></div>`
      ).join("");

      highlightRef.current.innerHTML = numberedLines;
    };

    useEffect(() => {
      updateHighlight(value);
      setLineCount(value.split("\n").length);
      updateWordCount(value);
    }, [value]);

    const handleInput = () => {
      const newValue = textareaRef.current?.value ?? "";
      onChangeRef.current(newValue);
      updateHighlight(newValue);
      setLineCount(newValue.split("\n").length);
      updateWordCount(newValue);
    };

    const handleScroll = () => {
      if (textareaRef.current && highlightRef.current && lineNumbersRef.current) {
        const { scrollTop, scrollLeft } = textareaRef.current;
        highlightRef.current.scrollTop = scrollTop;
        highlightRef.current.scrollLeft = scrollLeft;
        lineNumbersRef.current.scrollTop = scrollTop;
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab 键插入制表符
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        textarea.value = value.substring(0, start) + "  " + value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;

        handleInput();
      }
    };

    return (
      <div className="editor-wrapper">
        <div className="source-editor-container">
          {/* 行号 */}
          <div className="source-line-numbers" ref={lineNumbersRef}>
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1} className="source-line-number">{i + 1}</div>
            ))}
          </div>

          {/* 高亮层 */}
          <div className="source-highlight-layer" ref={highlightRef} />

          {/* 输入层 */}
          <textarea
            ref={textareaRef}
            className="source-textarea"
            spellCheck={false}
            defaultValue={value}
            onInput={handleInput}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
    );
  }
);

SourceEditor.displayName = "SourceEditor";

export default SourceEditor;
