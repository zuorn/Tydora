import { useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
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
import Heading from "@tiptap/extension-heading";
import { Markdown } from "tiptap-markdown";
import { defaultMarkdownSerializer } from "prosemirror-markdown";
import { common, createLowlight } from "lowlight";
import { Frontmatter } from "./extensions/frontmatter";
import { Callout } from "./extensions/callout";
import { Mermaid } from "./extensions/mermaid";
import { mermaidHljsLang } from "./extensions/mermaid-language";
import { WikiLink } from "./extensions/wiki-link";
import { SearchHighlight } from "./extensions/search-highlight";
import { CodeBlockToolbar } from "./extensions/code-block-toolbar";
import { TableFloatingToolbar } from "./extensions/table-floating-toolbar";
import { TableFloatingToolbar as TableFloatingToolbarComponent } from "./TableFloatingToolbar";
import { executeCommand } from "./extensions/custom-commands";
import { saveImageToLocal, loadImageSettings } from "../ImageManager";
import { loadShortcuts, matchShortcut } from "./shortcuts";
import { invoke } from "@tauri-apps/api/core";
import CodeMirrorEditor, { type CodeMirrorEditorHandle } from "./CodeMirrorEditor";
import { ContextMenu } from "./ContextMenu";
import { LinkDialog } from "./LinkDialog";
import type { ThemeName } from "../themes";
import type { ImageSettings } from "../ImageManager";
import type { EditorSettings } from "../Settings";
import type { EditorHandle, EditorMode } from "./types";
import "./theme.css";

const lowlight = createLowlight(common);
lowlight.register("mermaid", mermaidHljsLang);

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
    const prevFilePathRef = useRef(currentFilePath);
    const activeVaultPathRef = useRef(activeVaultPath);
    const imageSettingsRef = useRef(imageSettings);
    const sourceEditorRef = useRef<CodeMirrorEditorHandle>(null);
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [tableToolbar, setTableToolbar] = useState<{ table: HTMLElement } | null>(null);
    const linkEditRef = useRef<{ from: number; to: number } | null>(null);
    const [linkDialog, setLinkDialog] = useState<{ defaultText: string } | null>(null);

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
          heading: false,
        }),
        // 单独添加扩展，禁用内置快捷键，paragraph 添加 textAlign 属性
        Paragraph.extend({
          addAttributes() {
            return {
              textAlign: {
                default: null,
                parseHTML: (element) => element.style.textAlign || null,
                renderHTML: (attributes) => {
                  if (!attributes.textAlign) return {};
                  return { style: `text-align: ${attributes.textAlign}` };
                },
              },
            };
          },
          addKeyboardShortcuts() { return {}; },
        }),
        Bold.extend({ addKeyboardShortcuts() { return {}; } }),
        Italic.extend({ addKeyboardShortcuts() { return {}; } }),
        Strike.extend({ addKeyboardShortcuts() { return {}; } }),
        Code.extend({ addKeyboardShortcuts() { return {}; } }),
        Blockquote.extend({ addKeyboardShortcuts() { return {}; } }).extend({
          addStorage() {
            const defaultSerialize = defaultMarkdownSerializer.nodes.blockquote;
            return {
              markdown: {
                serialize(state: any, node: any, parent: any, index: number) {
                  const firstChild = node.firstChild;
                  if (firstChild?.type.name === "paragraph") {
                    const text: string = firstChild.textContent;
                    const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|ABSTRACT|INFO|SUCCESS|QUESTION|FAILURE|DANGER|BUG|EXAMPLE|QUOTE|FAQ)\][-+]?/i);
                    if (match) {
                      const calloutType = match[1].toUpperCase();
                      const lines = text.split("\n");
                      // 第一行：> [!TYPE] 剩余内容（不转义方括号）
                      state.write("> [!");
                      state.write(calloutType);
                      state.write("]");
                      state.write(lines[0].slice(match[0].length));
                      state.ensureNewLine();
                      // 第一段剩余行（硬换行）
                      for (let j = 1; j < lines.length; j++) {
                        state.write("> ");
                        state.write(lines[j]);
                        state.ensureNewLine();
                      }
                      // 后续子节点
                      for (let i = 1; i < node.childCount; i++) {
                        const child = node.child(i);
                        state.wrapBlock("> ", null, child, () => state.renderContent(child));
                      }
                      state.closeBlock(node);
                      return;
                    }
                  }
                  defaultSerialize(state, node, parent, index);
                },
              },
            };
          },
        }),
        BulletList.extend({ addKeyboardShortcuts() { return {}; } }),
        OrderedList.extend({ addKeyboardShortcuts() { return {}; } }),
        ListItem,
        Heading.extend({ addKeyboardShortcuts() { return {}; } }),
        Placeholder.configure({
          placeholder: "开始输入 Markdown...",
        }),
        CodeBlockLowlight.configure({
          lowlight,
        }),
        TiptapImage.extend({
          addAttributes() {
            return {
              src: { default: null },
              alt: { default: null },
              "data-abs-path": { default: null },
            };
          },
          addNodeView() {
            return ({ node }) => {
              const dom = document.createElement("img");
              // 优先使用绝对路径（data-abs-path），否则用 src
              const absPath = node.attrs["data-abs-path"] as string | null;
              const src = node.attrs.src as string;
              if (absPath) {
                dom.src = `local-file://localhost/${encodeURIComponent(absPath)}`;
              } else if (src && !src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("local-file:")) {
                dom.src = `local-file://localhost/${encodeURIComponent(src)}`;
              } else {
                dom.src = src;
              }
              dom.alt = (node.attrs.alt as string) || "";
              dom.style.maxWidth = "100%";
              dom.style.height = "auto";
              return { dom };
            };
          },
        }).configure({
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
        Frontmatter,
        Callout,
        Mermaid,
        WikiLink,
        SearchHighlight,
        CodeBlockToolbar,
        TableFloatingToolbar,
      ],
      content: value,
      onUpdate: ({ editor: ed }) => {
        const md = (ed.storage as Record<string, any>).markdown.getMarkdown();

        if (isInternalRef.current) {
          isInternalRef.current = false;
        } else {
          onChangeRef.current(md);
        }

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
          "data-abs-path": result.savedPath,
        } as any).run();
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

    // 监听链接弹窗事件
    useEffect(() => {
      const handleLinkDialogOpen = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        setLinkDialog({ defaultText: detail?.defaultText || "" });
      };
      window.addEventListener("link-dialog-open", handleLinkDialogOpen);
      return () => window.removeEventListener("link-dialog-open", handleLinkDialogOpen);
    }, []);

    // 链接弹窗确认：插入链接
    const handleLinkDialogConfirm = useCallback((text: string, url: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          const from = tr.selection.from;
          const linkMark = editor.schema.marks.link.create({ href: url });
          tr.insertText(text);
          tr.addMark(from, from + text.length, linkMark);
          return true;
        })
        .run();
      setLinkDialog(null);
    }, [editor]);

    // 链接弹窗取消
    const handleLinkDialogCancel = useCallback(() => {
      setLinkDialog(null);
      editor?.commands.focus();
    }, [editor]);

    // 将编辑中的链接源码恢复为渲染后的链接
    const restoreLinkEdit = useCallback(() => {
      const range = linkEditRef.current;
      if (!range || !editor) return;

      const { from, to } = range;
      const doc = editor.state.doc;
      const actualTo = Math.min(to, doc.content.size);
      if (actualTo <= from) {
        linkEditRef.current = null;
        return;
      }

      const text = doc.textBetween(from, actualTo);
      const m = text.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
      if (m) {
        const [, linkText, linkUrl] = m;
        editor
          .chain()
          .command(({ tr }) => {
            tr.delete(from, actualTo);
            const linkMark = editor.schema.marks.link.create({ href: linkUrl });
            tr.insertText(linkText, from);
            tr.addMark(from, from + linkText.length, linkMark);
            return true;
          })
          .run();
      }

      linkEditRef.current = null;
    }, [editor]);

    // 同步文件路径到 editor.storage，供图片 node view 解析相对路径
    useEffect(() => {
      if (editor) {
        (editor.storage as Record<string, any>).currentFilePath = currentFilePath;
        (editor.storage as Record<string, any>).activeVaultPath = activeVaultPath;
      }
    }, [editor, currentFilePath, activeVaultPath]);

    // 监听表格工具栏显示/隐藏事件
    useEffect(() => {
      const handleTableToolbarShow = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail?.table && editor) {
          setTableToolbar({ table: customEvent.detail.table });
        }
      };
      const handleTableToolbarHide = () => {
        setTableToolbar(null);
      };
      window.addEventListener("table-toolbar-show", handleTableToolbarShow);
      window.addEventListener("table-toolbar-hide", handleTableToolbarHide);
      return () => {
        window.removeEventListener("table-toolbar-show", handleTableToolbarShow);
        window.removeEventListener("table-toolbar-hide", handleTableToolbarHide);
      };
    }, [editor]);

    // Ctrl+Click 打开链接
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleClick = (e: MouseEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;

        const target = e.target as HTMLElement;
        const anchor = target.closest("a");
        if (!anchor) return;

        const href = anchor.getAttribute("href");
        if (!href || href === "#") return;

        e.preventDefault();
        e.stopPropagation();

        if (href.startsWith("http://") || href.startsWith("https://")) {
          invoke("open_url", { url: href });
        } else if (!href.startsWith("wikilink://")) {
          invoke("open_file", { filePath: href });
        }
      };

      container.addEventListener("click", handleClick, true);
      return () => container.removeEventListener("click", handleClick, true);
    }, [editor]);

    // 点击链接时在 IR 模式下显示 markdown 源码并可编辑
    useEffect(() => {
      const container = containerRef.current;
      if (!container || !editor) return;

      // 将链接元素替换为 markdown 源码文本
      const convertLinkToSource = (anchor: HTMLAnchorElement) => {
        if (!editor) return;

        let pos: number;
        try {
          pos = editor.view.posAtDOM(anchor, 0);
        } catch {
          return;
        }

        const { doc } = editor.state;
        let from = -1;
        let to = -1;
        let linkHref = "";

        // 在点击位置附近查找带 link mark 的文本节点
        doc.nodesBetween(pos, Math.min(pos + 1000, doc.content.size), (node, nodePos) => {
          if (node.isText) {
            const linkMark = node.marks.find((m: Record<string, any>) => m.type.name === "link");
            if (linkMark) {
              from = nodePos;
              to = nodePos + node.nodeSize;
              linkHref = linkMark.attrs.href as string;
              return false;
            }
          }
          return true;
        });

        if (from === -1 || !linkHref) return;

        const text = doc.textBetween(from, to);
        const md = `[${text}](${linkHref})`;

        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.delete(from, to);
            tr.insertText(md, from);
            return true;
          })
          .setTextSelection(from + md.length)
          .run();

        linkEditRef.current = { from, to: from + md.length };
      };

      const handleClick = (e: MouseEvent) => {
        if (e.ctrlKey || e.metaKey) return;

        const target = e.target as HTMLElement;
        const anchor = target.closest("a") as HTMLAnchorElement | null;

        // 点击在链接外部 → 恢复正在编辑的链接
        if (!anchor) {
          if (linkEditRef.current) {
            // 检查点击是否在编辑区域内（允许用户在源码文本中移动光标）
            try {
              const posInfo = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
              if (posInfo) {
                const { from, to } = linkEditRef.current;
                if (posInfo.pos >= from && posInfo.pos < to) {
                  return; // 点击在编辑区域内，不恢复
                }
              }
            } catch {
              // posAtCoords 可能失败，回退到恢复
            }
            restoreLinkEdit();
          }
          return;
        }

        // 跳过 wiki-link 和空链接
        if (anchor.classList.contains("wiki-link")) return;
        const href = anchor.getAttribute("href");
        if (!href || href === "#") return;

        e.preventDefault();
        e.stopPropagation();

        // 如果正在编辑另一个链接，先恢复它，再处理当前点击
        if (linkEditRef.current) {
          restoreLinkEdit();
          // 恢复后 DOM 可能已更新，用坐标重新定位链接元素
          setTimeout(() => {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const a = el?.closest("a") as HTMLAnchorElement | null;
            if (a && !a.classList.contains("wiki-link")) {
              const h = a.getAttribute("href");
              if (h && h !== "#") convertLinkToSource(a);
            }
          }, 0);
          return;
        }

        convertLinkToSource(anchor);
      };

      container.addEventListener("click", handleClick);
      return () => container.removeEventListener("click", handleClick);
    }, [editor, restoreLinkEdit]);

    // Escape 键恢复正在编辑的链接
    useEffect(() => {
      if (!editor) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && linkEditRef.current) {
          restoreLinkEdit();
          editor.commands.focus();
          e.preventDefault();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [editor, restoreLinkEdit]);

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
      replaceRangeWithWikiLink: (fromPos: number, noteName: string, heading?: string, display?: string) => {
        if (!editor) return;
        const to = editor.state.selection.from;
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: fromPos, to },
            { type: 'wikiLink' as any, attrs: { note: noteName, heading: heading || null, display: display || null } }
          )
          .run();
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
      const fileChanged = prevFilePathRef.current !== currentFilePath;
      prevFilePathRef.current = currentFilePath;

      if (fileChanged) {
        // 文件切换时始终强制更新内容
        isInternalRef.current = true;
        editor.commands.setContent(value);
      } else {
        const currentContent = (editor.storage as Record<string, any>).markdown.getMarkdown();
        if (value !== currentContent) {
          isInternalRef.current = true;
          editor.commands.setContent(value);
        }
      }
    }, [value, editor, currentFilePath]);

    if (mode === "sv") {
      return (
        <CodeMirrorEditor
          ref={sourceEditorRef}
          value={value}
          onChange={onChange}
          onWordCount={onWordCount}
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
          {tableToolbar && editor && (
            <TableFloatingToolbarComponent
              editor={editor}
              tableElement={tableToolbar.table}
              onClose={() => setTableToolbar(null)}
              onContentChange={(md) => {
                isInternalRef.current = true;
                editor.commands.setContent(md);
              }}
            />
          )}
        </div>
        <ContextMenu
          editor={editor}
          position={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
        />
        {linkDialog && (
          <LinkDialog
            defaultText={linkDialog.defaultText}
            onConfirm={handleLinkDialogConfirm}
            onCancel={handleLinkDialogCancel}
          />
        )}
      </div>
    );
  }
);

TipTapEditor.displayName = "TipTapEditor";

export default TipTapEditor;
