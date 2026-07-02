import { useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Code from "@tiptap/extension-code";
import Blockquote from "@tiptap/extension-blockquote";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import TiptapImage from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import { WikiLink } from "./extensions/wiki-link";
import { SearchHighlight } from "./extensions/search-highlight";
import { CodeBlockToolbar } from "./extensions/code-block-toolbar";
import { executeCommand } from "./extensions/custom-commands";
import { saveImageToLocal, loadImageSettings } from "../ImageManager";
import { loadShortcuts, matchShortcut } from "./shortcuts";
import SourceEditor, { type SourceEditorHandle } from "./SourceEditor";
import { ContextMenu } from "./ContextMenu";
import type { ThemeName } from "../themes";
import type { ImageSettings } from "../ImageManager";
import type { EditorSettings } from "../Settings";
import type { EditorHandle, EditorMode } from "./types";
import "./theme.css";

const lowlight = createLowlight(common);

interface TipTapEditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: EditorMode;
  theme: ThemeName;
  typewriterMode?: boolean;
  editorSettings?: EditorSettings;
  imageSettings?: ImageSettings;
  currentFilePath?: string | null;
  activeVaultPath?: string | null;
  onWordCount?: (count: number) => void;
}

const TipTapEditor = forwardRef<EditorHandle, TipTapEditorProps>(
  ({ value, onChange, mode, editorSettings, imageSettings, currentFilePath, activeVaultPath, onWordCount }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const onChangeRef = useRef(onChange);
    const onWordCountRef = useRef(onWordCount);
    const isInternalRef = useRef(false);
    const currentFilePathRef = useRef(currentFilePath);
    const activeVaultPathRef = useRef(activeVaultPath);
    const imageSettingsRef = useRef(imageSettings);
    const sourceEditorRef = useRef<SourceEditorHandle>(null);
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

    onChangeRef.current = onChange;
    onWordCountRef.current = onWordCount;
    currentFilePathRef.current = currentFilePath;
    activeVaultPathRef.current = activeVaultPath;
    imageSettingsRef.current = imageSettings;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          codeBlock: false,
          link: false,
          bold: false,
          italic: false,
          strike: false,
          code: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
        }),
        // 单独添加扩展，禁用内置快捷键
        Bold.extend({ addKeyboardShortcuts() { return {}; } }),
        Italic.extend({ addKeyboardShortcuts() { return {}; } }),
        Strike.extend({ addKeyboardShortcuts() { return {}; } }),
        Code.extend({ addKeyboardShortcuts() { return {}; } }),
        Blockquote.extend({ addKeyboardShortcuts() { return {}; } }),
        BulletList.extend({ addKeyboardShortcuts() { return {}; } }),
        OrderedList.extend({ addKeyboardShortcuts() { return {}; } }),
        ListItem,
        Placeholder.configure({
          placeholder: "开始输入 Markdown...",
        }),
        CodeBlockLowlight.configure({
          lowlight,
        }),
        TiptapImage.configure({
          inline: true,
          allowBase64: true,
        }),
        TiptapLink.configure({
          openOnClick: false,
        }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableCell,
        TableHeader,
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        Highlight,
        Typography,
        Markdown.configure({
          html: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        WikiLink,
        SearchHighlight,
        CodeBlockToolbar,
      ],
      content: value,
      onUpdate: ({ editor: ed }) => {
        if (isInternalRef.current) {
          isInternalRef.current = false;
          return;
        }
        const md = (ed.storage as Record<string, any>).markdown.getMarkdown();
        onChangeRef.current(md);

        // 更新字数统计
        const text = ed.getText();
        const count = editorSettings?.counterType === "markdown"
          ? md.length
          : text.replace(/\s/g, "").length;
        onWordCountRef.current?.(count);
      },
      editorProps: {
        handleDOMEvents: {
          keydown: (_view: any, event: KeyboardEvent) => {
            // 拦截 Ctrl+M / Ctrl+T
            if ((event.ctrlKey || event.metaKey) && (event.key === "m" || event.key === "t")) {
              event.stopPropagation();
            }
            return false;
          },
        },
        handlePaste: (_view: any, event: ClipboardEvent) => {
          const items = event.clipboardData?.items;
          if (!items) return false;

          for (const item of items) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file && file.size > 0) {
                handleImageFile(file);
                return true;
              }
            }
          }
          return false;
        },
        handleDrop: (_view: any, event: DragEvent) => {
          const files = event.dataTransfer?.files;
          if (!files) return false;

          const imageExts = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "ico"]);
          for (const file of files) {
            const ext = file.name.split(".").pop()?.toLowerCase() || "";
            if (imageExts.has(ext) || file.type.startsWith("image/")) {
              event.preventDefault();
              handleImageFile(file);
              return true;
            }
          }
          return false;
        },
      },
    });

    // 图片处理
    const handleImageFile = useCallback(async (file: File) => {
      if (!editor) return;

      const settings = imageSettingsRef.current || loadImageSettings();
      try {
        const result = await saveImageToLocal(
          file,
          settings,
          currentFilePathRef.current ?? null,
          activeVaultPathRef.current ?? null
        );

        editor.chain().focus().setImage({
          src: result.markdownRef,
          alt: file.name,
        }).run();
      } catch (e) {
        console.error("[ImageUpload] save failed:", e);
      }
    }, [editor]);

    // 监听图片上传事件
    useEffect(() => {
      const handleImageUpload = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail?.file) {
          handleImageFile(customEvent.detail.file);
        }
      };
      window.addEventListener("image-upload-file", handleImageUpload);
      return () => window.removeEventListener("image-upload-file", handleImageUpload);
    }, [handleImageFile]);

    // 注册快捷键
    useEffect(() => {
      if (!editor) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        // 忽略输入框内的快捷键
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

        const shortcuts = loadShortcuts();

        // 快捷键ID到命令的映射
        const commandMap: Record<string, string> = {
          // 格式
          "bold": "bold",
          "italic": "italic",
          "strike": "strike",
          "inline-code": "inline-code",
          "code-block": "code",
          "link": "link",
          "quote": "quote",
          "hr": "line",
          // 列表
          "unordered-list": "list",
          "ordered-list": "ordered-list",
          "check-list": "check",
          "indent": "indent",
          "outdent": "outdent",
          "task-toggle": "task-toggle",
          // 标题
          "heading-1": "heading-1",
          "heading-2": "heading-2",
          "heading-3": "heading-3",
          "heading-4": "heading-4",
          "heading-5": "heading-5",
          "heading-6": "heading-6",
          "paragraph": "paragraph",
          // 插入
          "table": "table",
          // 表格操作
          "table-row-above": "table-row-above",
          "table-row-below": "table-row-below",
          "table-col-left": "table-col-left",
          "table-col-right": "table-col-right",
          "table-row-delete": "table-row-delete",
          "table-col-delete": "table-col-delete",
          // 编辑
          "undo": "undo",
          "redo": "redo",
          // 其他
          "footnotes": "footnotes",
          "math": "math",
        };

        for (const shortcut of shortcuts) {
          const cmdName = commandMap[shortcut.id];
          if (cmdName && matchShortcut(e, shortcut.keys)) {
            e.preventDefault();
            executeCommand(cmdName, editor);
            return;
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [editor]);

    // 暴露 API
    useImperativeHandle(ref, () => ({
      getValue: () => {
        if (!editor) return "";
        return (editor.storage as Record<string, any>).markdown.getMarkdown();
      },
      setValue: (val: string) => {
        if (!editor) return;
        isInternalRef.current = true;
        editor.commands.setContent(val);
      },
      insertTextAtCursor: (text: string) => {
        if (!editor) return;
        editor.chain().focus().insertContent(text).run();
      },
      resize: () => {
        if (!editor) return;
        editor.commands.focus();
      },
      highlightSearch: (query: string) => {
        if (!editor) return;
        editor.commands.setSearchHighlight(query);
      },
      clearHighlight: () => {
        if (!editor) return;
        editor.commands.clearSearchHighlight();
      },
      executeCommand: (name: string) => {
        executeCommand(name, editor);
      },
      scrollToHeading: (text: string, _line: number) => {
        if (!editor) return;
        const cleanText = text.replace(/[#*_`~]/g, "").trim();

        // 查找文档中的标题节点
        const { doc } = editor.state;
        let bestPos: number | null = null;
        let bestScore = 0;

        doc.descendants((node: any, pos: number) => {
          if (node.type.name === "heading") {
            const headingText = node.textContent.replace(/[#*_`~]/g, "").trim();
            let score = 0;
            if (headingText === cleanText) {
              score = 100;
            } else if (headingText.includes(cleanText) || cleanText.includes(headingText)) {
              score = (Math.min(headingText.length, cleanText.length) /
                Math.max(headingText.length, cleanText.length)) * 50;
            }
            if (score > bestScore) {
              bestScore = score;
              bestPos = pos;
            }
          }
        });

        if (bestPos !== null && bestScore > 0) {
          editor.chain().focus().setTextSelection(bestPos).run();
          // 滚动到该位置
          const { view } = editor;
          const coords = view.coordsAtPos(bestPos);
          if (coords) {
            const editorEl = containerRef.current;
            if (editorEl) {
              const editorRect = editorEl.getBoundingClientRect();
              const scrollTop = coords.top - editorRect.top - editorRect.height / 3;
              editorEl.scrollTop += scrollTop;
            }
          }
        }
      },
      scrollToLine: (line: number) => {
        if (!editor) return;
        const { doc } = editor.state;
        const totalLines = doc.textContent.split("\n").length;
        const ratio = Math.min((line - 1) / Math.max(totalLines - 1, 1), 1);
        const pos = Math.floor(ratio * doc.content.size);
        editor.chain().focus().setTextSelection(pos).run();

        const { view } = editor;
        const coords = view.coordsAtPos(pos);
        if (coords) {
          const editorEl = containerRef.current;
          if (editorEl) {
            const editorRect = editorEl.getBoundingClientRect();
            const scrollTop = coords.top - editorRect.top - editorRect.height / 3;
            editorEl.scrollTop += scrollTop;
          }
        }
      },
      getCursorOffset: () => {
        if (!editor) return -1;
        return editor.state.selection.from;
      },
      isSourceMode: () => mode === "sv",
    }));

    // 外部 value 同步
    useEffect(() => {
      if (!editor) return;
      if (isInternalRef.current) {
        isInternalRef.current = false;
        return;
      }
      const currentContent = (editor.storage as Record<string, any>).markdown.getMarkdown();
      if (value !== currentContent) {
        isInternalRef.current = true;
        editor.commands.setContent(value);
      }
    }, [value, editor]);

    if (mode === "sv") {
      return (
        <SourceEditor
          ref={sourceEditorRef}
          value={value}
          onChange={onChange}
        />
      );
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    };

    return (
      <div className="editor-wrapper">
        <div
          ref={containerRef}
          className="editor-container"
          onContextMenu={handleContextMenu}
        >
          <EditorContent editor={editor} className="tiptap-editor" />
        </div>
        <ContextMenu
          editor={editor}
          position={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
        />
      </div>
    );
  }
);

TipTapEditor.displayName = "TipTapEditor";

export default TipTapEditor;
