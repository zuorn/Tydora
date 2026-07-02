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

interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export interface SourceEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
}

const SourceEditor = forwardRef<SourceEditorHandle, SourceEditorProps>(
  ({ value, onChange }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const onChangeRef = useRef(onChange);
    const [lineCount, setLineCount] = useState(1);

    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      getValue: () => textareaRef.current?.value ?? "",
      setValue: (val: string) => {
        if (textareaRef.current) {
          textareaRef.current.value = val;
          updateHighlight(val);
          setLineCount(val.split("\n").length);
        }
      },
      focus: () => textareaRef.current?.focus(),
    }));

    const updateHighlight = (text: string) => {
      if (!highlightRef.current) return;

      // 检测语言
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

      // 高亮代码
      let highlighted: string;
      try {
        highlighted = hljs.highlight(text, { language: detectedLang }).value;
      } catch {
        highlighted = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      // 添加行号
      const lines = highlighted.split("\n");
      const numberedLines = lines.map((line) =>
        `<div class="source-line"><span class="source-line-content">${line || " "}</span></div>`
      ).join("");

      highlightRef.current.innerHTML = numberedLines;
    };

    useEffect(() => {
      updateHighlight(value);
      setLineCount(value.split("\n").length);
    }, []);

    const handleInput = () => {
      const newValue = textareaRef.current?.value ?? "";
      onChangeRef.current(newValue);
      updateHighlight(newValue);
      setLineCount(newValue.split("\n").length);
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
