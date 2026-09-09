import { useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { markInputRule } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import { TextSelection } from "@tiptap/pm/state";
import Placeholder from "@tiptap/extension-placeholder";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Code from "@tiptap/extension-code";
import Blockquote from "@tiptap/extension-blockquote";
import { BulletListExt as BulletList } from "./extensions/bullet-list-input";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import CodeBlockLowlight from "./extensions/code-block-lowlight-safe";
import TiptapImage from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import { serializeMarkdownUrl } from "./extensions/markdown-safe-url";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskListExt as TaskList, TaskItemExt as TaskItem } from "./extensions/task-list-input";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import Heading from "@tiptap/extension-heading";
import HardBreak from "@tiptap/extension-hard-break";
import { Markdown } from "tiptap-markdown";
import { defaultMarkdownSerializer } from "prosemirror-markdown";
import { common, createLowlight } from "lowlight";
import { Frontmatter } from "./extensions/frontmatter";
import { StripStyle } from "./extensions/strip-style";
import { Callout } from "./extensions/callout";
import { Mermaid } from "./extensions/mermaid";
import { WikiLink } from "./extensions/wiki-link";
import { Tag } from "./extensions/tag";
import { SearchHighlight } from "./extensions/search-highlight";
import { HeadingHighlight } from "./extensions/heading-highlight";
import { CodeBlockToolbar } from "./extensions/code-block-toolbar";
import { TableFloatingToolbar } from "./extensions/table-floating-toolbar";
import { BulletListMindmap } from "./extensions/bullet-list-mindmap";
import { HardBreakCleanup } from "./extensions/hardbreak-cleanup";
import { TableFloatingToolbar as TableFloatingToolbarComponent } from "./TableFloatingToolbar";
import { executeCommand } from "./extensions/custom-commands";
import { Math as MathExtension } from "./extensions/math";
import { saveImageToLocal, loadImageSettings, resolveRelativePath, dirName, ImageSaveCancelledError } from "../services";
import { LinkIndexService } from "../wikilink";
import { loadShortcuts, matchShortcut } from "./shortcuts";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import CodeMirrorEditor, { type CodeMirrorEditorHandle } from "./CodeMirrorEditor";
import { useVim, useLeader, LeaderMenu, createTiptapVimExtensions, syncVimMode, exitTiptapVisualMode, enterTiptapInsertMode } from "../vim";
import { prefixMConfig } from "../vim/config/prefixM";
import { getVimMode } from "vim-prose/tiptap";
import type { VimMode } from "../vim/types";
import { prefixGConfig } from "../vim/config/prefixG";
import { prefixZConfig } from "../vim/config/prefixZ";
import { prefixTConfig } from "../vim/config/prefixT";
import { buildPositionMap, mdOffsetToPmPos, pmPosToMdOffset } from "./markdown-position-map";
import { ContextMenu } from "./ContextMenu";
import { LinkDialog } from "./LinkDialog";
import { MathDialog } from "./MathDialog";
import type { ThemeName } from "../themes";
import type { ImageSettings } from "../services";
import type { EditorSettings } from "../Settings";
import type { EditorHandle, EditorMode } from "./types";
import "./theme.css";
import "katex/dist/katex.min.css";
import "../tags/Tag.css";

/**
 * 安全获取 TipTap EditorView。
 * —— useEditor() 生成的 editor 对象在视图未挂载/已销毁时访问 editor.view 会抛错：
 *    "The editor view is not available. Cannot access view['coordsAtPos']."
 *    用此 helper 统一兜底：isDestroyed / !editor.view 时返回 null，
 *    后续 coordsAtPos 等调用前 ?. 判断即可避免报错。
 */
function getEditorView(editor: any): import("prosemirror-view").EditorView | null {
  if (!editor) return null;
  try {
    if (editor.isDestroyed) return null;
    const view = editor.view;
    return view ?? null;
  } catch {
    return null;
  }
}

/** macOS WKWebView：折叠选区后清掉原生 Selection 残留（尤其跨块选区后点击）。 */
function syncCollapsedDomSelection(view: EditorView | null | undefined, force = false) {
  if (!view) return;
  const { empty, from } = view.state.selection;
  if (!empty) return;
  const domSel = window.getSelection();
  if (!domSel) return;
  // WebKit 跨块选区后可能 rangeCount>1，或 isCollapsed 但仍有视觉残留
  if (!force && domSel.isCollapsed && domSel.rangeCount <= 1) return;
  domSel.removeAllRanges();
  // WebKit 专有 empty()：比 removeAllRanges 更能打掉合成层上的幽灵高亮
  try {
    (domSel as Selection & { empty?: () => void }).empty?.();
  } catch {
    /* ignore */
  }
  try {
    const start = view.domAtPos(from);
    const range = document.createRange();
    if (start.node.nodeType === Node.TEXT_NODE) {
      range.setStart(start.node, start.offset);
    } else if (start.node.childNodes[start.offset]) {
      range.setStart(start.node.childNodes[start.offset], 0);
    } else {
      range.setStart(start.node, Math.min(start.offset, start.node.childNodes.length));
    }
    range.collapse(true);
    domSel.addRange(range);
  } catch {
    // ignore: pos 可能落在 atom/node boundary
  }
  // 强制一次布局，促使 WebKit 丢掉旧选区合成层（不改 decoration / user-select，避免闪烁）
  void view.dom.offsetHeight;
}

function isPlatformMacos(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("platform-macos")
  );
}

/** 跨块选区后点击：记录 mousedown 时是否已有非折叠选区 */
let macPointerHadDomRange = false;

const lowlight = createLowlight(common);
// 额外语言（vim/dockerfile/haskell 等 14 种）在首帧渲染后动态 import 注册，
// 避免启动时同步加载这些语言定义（移入独立 chunk）。
let extraLanguagesRegistered = false;
function ensureExtraLanguages() {
  if (extraLanguagesRegistered) return;
  extraLanguagesRegistered = true;
  import("./extra-lowlight-languages").then(({ registerExtraLanguages }) => {
    registerExtraLanguages(lowlight);
  }).catch(() => {});
}

// 图片源码编辑面板：同一时刻只允许一个（所有图片 node view 共享）
let activeImageSourceEditorClose: (() => void) | null = null;
// 图片预览弹层：同一时刻只允许一个（所有图片 node view 共享）
let activeImagePreviewClose: (() => void) | null = null;

/** 将图片节点属性序列化为 Markdown 源码（与 addStorage.serialize 一致） */
function imageNodeToMarkdown(attrs: Record<string, any>): string {
  const src = (attrs.src as string) || "";
  if (!src) return "";
  // Obsidian 嵌入图片语法 ![[name|width]]
  if (attrs["data-wiki-embed"]) {
    return `![[${src}${attrs.width ? `|${attrs.width}` : ""}]]`;
  }
  const escAlt = (s: string) => s.replace(/[`*\\~[\]_]/g, "\\$&");
  const alt = escAlt((attrs.alt as string) || "") + (attrs.width ? `|${attrs.width}` : "");
  return (
    "![" + alt + "](" +
    serializeMarkdownUrl(src) +
    (attrs.title ? ' "' + String(attrs.title).replace(/"/g, '\\"') + '"' : "") +
    ")"
  );
}

interface TipTapEditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: EditorMode;
  theme: ThemeName;
  typewriterMode?: boolean;
  previewMaxWidth?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
  codeLineHeight?: number;
  irLineNumbers?: boolean;
  editorSettings?: EditorSettings;
  imageSettings?: ImageSettings;
  currentFilePath?: string | null;
  activeVaultPath?: string | null;
  onWordCount?: (count: number) => void;
  /** 该编辑器是否为当前激活窗格（多窗格时只有激活窗格的 Leader 菜单才生效） */
  active?: boolean;
}

// ── Vim motions：vim-prose 未实现的补齐 ──────────────────────────────
/** 将光标移动到下一个 word 末尾（e）。兼容富文本中的 paragraph/table 等结构。 */
function moveWordEndForward(editor: Editor): void {
  try {
    const { state, view } = editor as unknown as { state: any; view: any };
    if (!state || !view) return;
    const doc = state.doc;
    const selection = state.selection;
    const head = selection.$head?.pos ?? selection.from;
    const docSize = doc.nodeSize ?? doc.content?.size ?? 0;

    let inWord = false;
    let wordBoundary = -1;
    for (let pos = head + 1; pos <= docSize; pos++) {
      let ch = "";
      try {
        const $pos = doc.resolve(pos);
        const parent = $pos.parent;
        // 到达节点边界（段落末尾、单元格末尾等）也视作 word 末尾
        if ($pos.parentOffset === 0 && pos > head + 1) {
          // 进入新节点：若之前有字，前一个位置就是候选
          if (inWord) {
            wordBoundary = pos - 1;
            break;
          }
          continue;
        }
        const idx = $pos.parentOffset - 1;
        if (parent && parent.textContent && idx >= 0 && idx < parent.textContent.length) {
          ch = parent.textContent[idx];
        }
      } catch {
        ch = "";
      }
      const isWord = ch.length > 0 && /[\p{L}\p{N}_]/u.test(ch);
      if (!inWord && isWord) {
        inWord = true;
      } else if (inWord && !isWord) {
        wordBoundary = pos - 1;
        break;
      }
    }
    if (wordBoundary === -1 && inWord) {
      wordBoundary = docSize - 1;
    }
    if (wordBoundary > head) {
      const tr = state.tr.setSelection(TextSelection.create(doc, wordBoundary));
      view.dispatch(tr);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Vim 半页 / 整页翻页 + 光标垂直居中（TipTap 版）。
 * 策略：先滚动视口 → posAtCoords 取视口中点设置光标 → 最后微调 scrollTop 使光标精确在视口中点。
 * factor > 0 向下翻，factor < 0 向上翻。半页 |factor|=0.5，整页 |factor|=1.0。
 */
function vimPageScrollCenterTipTap(
  editor: Editor,
  factor: number,
  isFullPage: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>
): void {
  try {
    const view = getEditorView(editor);
    const state = (editor as unknown as { state: any }).state;
    if (!view || !state) return;
    const doc = state.doc;

    // 滚动容器：与打字机模式一致（.tiptap-editor）
    const sc = containerRef.current?.querySelector('.tiptap-editor') as HTMLElement | null
      ?? view.dom as HTMLElement | null;
    if (!sc) return;
    const scEl: HTMLElement = sc;
    const viewportH = Math.max(1, scEl.clientHeight);
    const scrollMax = Math.max(0, scEl.scrollHeight - viewportH);

    // 行高估算（用于整页时留 2 行上下文，类 Vim Ctrl+F/B 行为）
    let approxLH = 22;
    try {
      const curSel = state.selection;
      const headPos = curSel?.$head?.pos ?? curSel?.from ?? 0;
      const coords = view.coordsAtPos?.(headPos) as { top: number; bottom: number } | undefined | null;
      if (coords && coords.bottom - coords.top > 6) approxLH = coords.bottom - coords.top;
    } catch { /* ignore */ }

    // 1) 计算滚动量并先滚视口
    let deltaPx = factor * viewportH;
    if (isFullPage) {
      // Vim 整页会留 2 行 overlap，使翻页更连续
      deltaPx = deltaPx > 0
        ? Math.max(approxLH * 2, deltaPx - approxLH * 2)
        : Math.min(-approxLH * 2, deltaPx + approxLH * 2);
    } else {
      // 半页：factor=±0.5 已经是半页高度
    }
    scEl.scrollTop = Math.min(scrollMax, Math.max(0, scEl.scrollTop + deltaPx));

    // 2) 计算"视口中心"这个屏幕坐标对应的文档位置
    const rect = scEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let targetPos: number | null = null;
    try {
      const hit = view.posAtCoords?.({ left: cx, top: cy }) as
        | { pos: number; inside: number }
        | null
        | undefined;
      if (hit && typeof hit.pos === "number") targetPos = hit.pos;
    } catch {
      targetPos = null;
    }
    if (targetPos == null) {
      // fallback：相对原来位置移动若干字符（保守方案）
      const curHead = state.selection?.$head?.pos ?? state.selection?.from ?? 0;
      targetPos = Math.max(0, Math.min((doc?.nodeSize ?? curHead) - 1, curHead + Math.round(deltaPx)));
    }
    targetPos = Math.max(0, Math.min((doc?.nodeSize ?? targetPos) - 1, targetPos));

    // 3) 设置选区（visual 模式保留原 anchor，只移动 head）
    const curSel = state.selection;
    const isVisual =
      !!curSel &&
      (curSel.$anchor?.pos !== curSel.$head?.pos || curSel.from !== curSel.to);
    const anchorPos = isVisual ? (curSel.$anchor?.pos ?? curSel.from ?? targetPos) : targetPos;
    let tr = state.tr;
    if (anchorPos === targetPos) {
      tr = tr.setSelection(TextSelection.create(doc, targetPos));
    } else {
      tr = tr.setSelection(TextSelection.create(doc, anchorPos, targetPos));
    }
    // 不 scrollIntoView：我们自己精确控制 scrollTop
    view.dispatch(tr);

    // 4) 微调：把光标所在行精确移到视口垂直中点（下一帧执行，确保选区已生效）
    const finalPos = targetPos;
    requestAnimationFrame(() => {
      try {
        const coords = view.coordsAtPos?.(finalPos) as
          | { top: number; bottom: number }
          | null
          | undefined;
        if (!coords) return;
        const r2 = scEl.getBoundingClientRect();
        const lineCenterInContent =
          (coords.top + coords.bottom) / 2 - r2.top + scEl.scrollTop;
        scEl.scrollTop = Math.min(
          scrollMax,
          Math.max(0, lineCenterInContent - scEl.clientHeight / 2)
        );
      } catch { /* ignore */ }
    });
  } catch {
    /* ignore */
  }
}

const TipTapEditor = forwardRef<EditorHandle, TipTapEditorProps>(
  ({ value, onChange, mode, typewriterMode, previewMaxWidth, lineHeight, paragraphSpacing, codeLineHeight, irLineNumbers, editorSettings, imageSettings, currentFilePath, activeVaultPath, onWordCount, active = true }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const onChangeRef = useRef(onChange);
    const onWordCountRef = useRef(onWordCount);
    const isInternalRef = useRef(false);
    const mountingRef = useRef(true);
    const currentFilePathRef = useRef(currentFilePath);
    const prevFilePathRef = useRef(currentFilePath);
    const activeVaultPathRef = useRef(activeVaultPath);
    const typewriterModeRef = useRef(typewriterMode);
    const typewriterRafRef = useRef<number | null>(null);
    typewriterModeRef.current = typewriterMode;

    // 打字机模式：给内容区上下预留约半屏内边距，使首行/末行也能垂直居中
    useEffect(() => {
      const wrapper = containerRef.current?.closest('.editor-wrapper') as HTMLElement | null;
      if (!wrapper) return;
      const applyPad = () => {
        const sc = containerRef.current?.querySelector('.tiptap-editor') as HTMLElement | null;
        if (!sc) return;
        if (typewriterMode) {
          const pad = Math.max(0, Math.floor(sc.clientHeight * 0.45));
          wrapper.style.setProperty('--typewriter-pad', `${pad}px`);
        } else {
          wrapper.style.removeProperty('--typewriter-pad');
        }
      };
      applyPad();
      // 开启时立即将当前光标所在行居中
      if (typewriterMode) {
        const sc = containerRef.current?.querySelector('.tiptap-editor') as HTMLElement | null;
        if (sc && editor) {
          const { from } = editor.state.selection;
          const view = getEditorView(editor);
          const coords = view?.coordsAtPos?.(from);
          if (coords) {
            const lineCenterInContent =
              (coords.top + coords.bottom) / 2 - sc.getBoundingClientRect().top + sc.scrollTop;
            sc.scrollTop = Math.max(0, lineCenterInContent - sc.clientHeight / 2);
          }
        }
      }
      window.addEventListener('resize', applyPad);
      return () => {
        window.removeEventListener('resize', applyPad);
        wrapper.style.removeProperty('--typewriter-pad');
      };
    }, [typewriterMode]);

    const imageSettingsRef = useRef(imageSettings);
    const sourceEditorRef = useRef<CodeMirrorEditorHandle>(null);
    // 记录源码编辑器中最近一次的选区（Markdown 源码偏移），用于 SV → IR 时恢复光标
    const sourceSelectionRef = useRef<{ anchor: number; head: number }>({ anchor: 0, head: 0 });
    const handleSourceSelectionChange = useCallback((selection: { anchor: number; head: number }) => {
      sourceSelectionRef.current = selection;
    }, []);
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [tableToolbar, setTableToolbar] = useState<{ table: HTMLElement } | null>(null);
    const linkEditRef = useRef<{ from: number; to: number } | null>(null);
    const [linkDialog, setLinkDialog] = useState<{ defaultText: string } | null>(null);
    const [mathDialog, setMathDialog] = useState<{ latex: string; block: boolean; pos: number | null } | null>(null);
    const mathDialogRef = useRef(mathDialog);
    mathDialogRef.current = mathDialog;

    onChangeRef.current = onChange;
    onWordCountRef.current = onWordCount;
    currentFilePathRef.current = currentFilePath;
    activeVaultPathRef.current = activeVaultPath;
    imageSettingsRef.current = imageSettings;

    // 首帧渲染后异步注册额外 lowlight 语言（vim/haskell 等 14 种）
    useEffect(() => { ensureExtraLanguages(); }, []);

    // 安全读取 `editor.storage.markdown.getMarkdown()`：
    // Tiptap 的 storage 是各扩展在「addStorage()」执行阶段才挂上去的，
    // 部分扩展的 storage 初始化会异步 defer 到首帧后（Markdown 扩展就是其中之一）。
    // 窗口秒开后 React/PassiveEffect 运行得比 Tiptap 扩展初始化更早，
    // 就会出现 `editor.storage.markdown` 还没被写入、读取 undefined.getMarkdown() 的抛错。
    // 加一个统一 helper：storage 不存在就返回 null（调用方按"无法比较 / 先不同步"处理）。
    const getMarkdownSafe = (ed: Editor | null | undefined): string | null => {
      if (!ed) return null;
      const storage = (ed.storage as Record<string, any> | null | undefined)?.markdown;
      if (!storage || typeof storage.getMarkdown !== "function") return null;
      try {
        return storage.getMarkdown() as string;
      } catch {
        return null;
      }
    };

    // Vim 配置（需在 useEditor 前读取，用于条件注入 vim-prose 扩展）
    const { enabled: vimEnabled, leaderKey: vimLeaderKey, menuTimeout: vimMenuTimeout, mode: vimMode, setMode: onVimModeChange, conflictKeys: vimConflictKeys } = useVim();
    const vimModeRef = useRef<VimMode>(vimMode);
    vimModeRef.current = vimMode;
    // 冲突键让渡配置 ref：给 handleDOMEvents 闭包读取
    const vimConflictKeysRef = useRef<Record<string, boolean>>(vimConflictKeys ?? {});
    vimConflictKeysRef.current = vimConflictKeys ?? {};
    // jk 快速序列（insert → normal）追踪：记录上次 j 按下的时间戳
    const vimJkRef = useRef<{ lastJAt: number }>({ lastJAt: 0 });

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          paragraph: false,
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
          hardBreak: false,
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
        // 以下 Markdown 输入规则移除了官方正则中的 (?:^|\s) 前缀限制，
        // 使 `**加粗**`、`*斜体*`、`~~删除线~~` 在行中（前面有字）也能即时渲染，
        // 与行首输入行为保持一致（Obsidian 即时渲染同款行为）
        Bold.extend({
          addKeyboardShortcuts() { return {}; },
          addInputRules() {
            return [
              markInputRule({ find: /(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/, type: this.type }),
              markInputRule({ find: /(__(?!\s+__)((?:[^_]+))__(?!\s+__))$/, type: this.type }),
            ];
          },
        }),
        Italic.extend({
          addKeyboardShortcuts() { return {}; },
          addInputRules() {
            return [
              // (?<!\*) / (?<!_) 保证 * / _ 前面不能是相同的星号/下划线，
              // 避免输入 **加粗** 时中间状态 **加粗* 被斜体规则从第二个星号处提前匹配为 *加粗*
              markInputRule({ find: /(?<!\*)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/, type: this.type }),
              markInputRule({ find: /(?<!_)(_(?!\s+_)((?:[^_]+))_(?!\s+_))$/, type: this.type }),
            ];
          },
        }),
        Strike.extend({
          addKeyboardShortcuts() { return {}; },
          addInputRules() {
            return [
              markInputRule({ find: /(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))$/, type: this.type }),
            ];
          },
        }),
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
        BulletList,
        OrderedList.extend({ addKeyboardShortcuts() { return {}; } }),
        ListItem,
        HardBreak.extend({
          addStorage() {
            return {
              markdown: {
                serialize(state: any, node: any, parent: any, index: number) {
                  for (let i = index + 1; i < parent.childCount; i++)
                    if (parent.child(i).type !== node.type) {
                      state.write(state.inTable ? "<br>" : "  \n");
                      return;
                    }
                },
                parse: {
                  // handled by markdown-it
                },
              },
            };
          },
        }),
        Heading.extend({ addKeyboardShortcuts() { return {}; } }),
        Placeholder.configure({
          placeholder: "输入@插入",
        }),
        CodeBlockLowlight.configure({
          lowlight,
        }),
        TiptapImage.extend({
          addAttributes() {
            return {
              src: { default: null },
              alt: { default: null },
              title: { default: null },
              width: {
                default: null,
                parseHTML: (element) => {
                  const w = element.getAttribute("width");
                  if (!w) return null;
                  const n = parseInt(w, 10);
                  return Number.isFinite(n) && n > 0 ? n : null;
                },
                renderHTML: (attributes) => {
                  if (!attributes.width) return {};
                  return { width: String(attributes.width) };
                },
              },
              "data-abs-path": { default: null },
              "data-wiki-embed": { default: null },
            };
          },
          addStorage() {
            return {
              markdown: {
                serialize(state: any, node: any) {
                  const src = node.attrs.src;
                  if (!src) return;
                  // Obsidian 嵌入图片：保留 `![[name|width]]` 语法
                  if (node.attrs["data-wiki-embed"]) {
                    state.write(`![[${src}${node.attrs.width ? `|${node.attrs.width}` : ""}]]`);
                    return;
                  }
                  // 缩放宽度以 Obsidian 风格 `![alt|300](src)` 持久化到 Markdown
                  const alt = (node.attrs.alt || "") + (node.attrs.width ? `|${node.attrs.width}` : "");
                  state.write(
                    "![" + state.esc(alt) + "](" +
                    serializeMarkdownUrl(src) +
                    (node.attrs.title ? ' "' + node.attrs.title.replace(/"/g, '\\"') + '"' : "") +
                    ")"
                  );
                },
                parse: {
                  // 解析 `![alt|300](src)` 中的宽度（Obsidian 风格）
                  setup(md: any) {
                    if ((md as any).__tydoraImageWidthPatched) return;
                    (md as any).__tydoraImageWidthPatched = true;
                    const esc = (v: string) =>
                      String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    md.renderer.rules.image = (tokens: any[], idx: number) => {
                      const token = tokens[idx];
                      const src = token.attrGet("src") || "";
                      const alt = token.content || "";
                      const m = alt.match(/^(.*)\|(\d+)$/);
                      const width = m && m[1] !== "" ? m[2] : null;
                      const realAlt = width ? m[1] : alt;
                      const title = token.attrGet("title");
                      let html = `<img src="${esc(src)}" alt="${esc(realAlt)}"`;
                      if (title) html += ` title="${esc(title)}"`;
                      if (width) html += ` width="${width}"`;
                      return html + ">";
                    };
                  },
                },
              },
            };
          },
          addNodeView() {
            return ({ node, editor, getPos }) => {
              const wrapper = document.createElement("div");
              wrapper.className = "image-node-view";
              wrapper.style.display = "inline-block";
              wrapper.style.position = "relative";
              wrapper.style.lineHeight = "0";

              const dom = document.createElement("img");
              const absPath = node.attrs["data-abs-path"] as string | null;
              const src = node.attrs.src as string;
              dom.alt = (node.attrs.alt as string) || "";
              dom.style.maxWidth = "100%";
              dom.style.height = "auto";
              dom.loading = "lazy";

              const initialWidth = node.attrs.width ? Number(node.attrs.width) : null;
              if (initialWidth) {
                dom.style.width = `${initialWidth}px`;
                dom.setAttribute("width", String(initialWidth));
              }

              if (absPath) {
                dom.setAttribute("data-abs-path", absPath);
                dom.src = convertFileSrc(absPath);
              } else if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
                // 网络图片：通过 Rust 后端代理下载，绕过 CORS 和 WebView2 限制。
                // src 可能为已编码（%20）或经 decodeURIComponent 后的空格/竖线形式，
                // 统一交给 Rust 端 encode_url_safe 处理（只编码空格/竖线，不二次编码 %xx）。
                const retryOnce = () => {
                  if (dom.dataset.remoteRetried) return false;
                  dom.dataset.remoteRetried = "1";
                  return true;
                };
                const tryLoad = (refresh = false) => {
                  invoke<string>("fetch_remote_image", { url: src, refresh })
                    .then((dataUrl) => {
                      dom.src = dataUrl;
                      // 缓存内容损坏（如 MIME 类型错误）时 data URL 渲染失败，
                      // 监听 error 触发刷新缓存重试一次，避免破图残留。
                      if (!dom.dataset.remoteChecked) {
                        dom.dataset.remoteChecked = "1";
                        dom.addEventListener(
                          "error",
                          () => {
                            console.warn("Remote image data URL failed to render, refreshing:", src);
                            if (retryOnce()) tryLoad(true);
                            else dom.src = src;
                          },
                          { once: true }
                        );
                      }
                    })
                    .catch((err) => {
                      console.error("fetch_remote_image failed", src, err);
                      if (!refresh && retryOnce()) {
                        tryLoad(true); // 请求本身失败，刷新缓存重试一次
                      } else {
                        dom.src = src; // 最终回退到原始 URL
                      }
                    });
                };
                tryLoad(false);
              } else if (src && !src.startsWith("data:") && !src.startsWith("asset:")) {
                let resolvedPath = src;
                const basePath = currentFilePathRef.current
                  ? dirName(currentFilePathRef.current)
                  : activeVaultPathRef.current;
                if (src.startsWith("/")) {
                  // 仓库根绝对路径：/assets/image.png → vaultPath/assets/image.png
                  if (activeVaultPathRef.current) {
                    resolvedPath = resolveRelativePath(activeVaultPathRef.current, src.slice(1));
                  }
                } else if (node.attrs["data-wiki-embed"]) {
                  // Obsidian 嵌入图片：优先按文件名在 vault 中查找，失败则回退相对路径解析
                  const found = LinkIndexService.findImageByBaseName(src);
                  if (found) {
                    resolvedPath = found;
                  } else if (basePath && (src.startsWith("./") || src.startsWith("../") || !src.match(/^[a-zA-Z]:\\/))) {
                    resolvedPath = resolveRelativePath(basePath, src);
                  }
                } else if (basePath && (src.startsWith("./") || src.startsWith("../") || !src.match(/^[a-zA-Z]:\\/))) {
                  resolvedPath = resolveRelativePath(basePath, src);
                }
                dom.setAttribute("data-abs-path", resolvedPath);
                dom.src = convertFileSrc(resolvedPath);
              } else {
                dom.src = src;
              }

              wrapper.appendChild(dom);

              // 右下角缩放手柄：悬停或选中图片时显示，拖动调整大小（L 形拐角）
              const handle = document.createElement("div");
              handle.className = "image-resize-handle";
              handle.title = "拖动调整图片大小";
              wrapper.appendChild(handle);

              // 右上角工具栏：预览 / 源码（图标按钮）
              const toolbar = document.createElement("div");
              toolbar.className = "image-hover-toolbar";
              const previewBtn = document.createElement("button");
              previewBtn.type = "button";
              previewBtn.className = "image-toolbar-btn";
              previewBtn.title = "预览图片";
              previewBtn.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
              const sourceBtn = document.createElement("button");
              sourceBtn.type = "button";
              sourceBtn.className = "image-toolbar-btn";
              sourceBtn.title = "编辑图片源码";
              sourceBtn.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
              toolbar.appendChild(previewBtn);
              toolbar.appendChild(sourceBtn);
              wrapper.appendChild(toolbar);

              const getPosSafe = (): number | null => {
                try {
                  return getPos() ?? null;
                } catch {
                  return null;
                }
              };

              // ---------- 预览：弹出大图 ----------
              previewBtn.addEventListener("click", () => {
                activeImagePreviewClose?.();
                const overlay = document.createElement("div");
                overlay.className = "image-preview-overlay";
                const previewImg = document.createElement("img");
                previewImg.src = dom.currentSrc || dom.src;
                previewImg.alt = dom.alt || "";
                const closeBtn = document.createElement("button");
                closeBtn.type = "button";
                closeBtn.className = "image-preview-close";
                closeBtn.textContent = "✕";
                closeBtn.title = "关闭预览";
                const closeSelf = () => {
                  overlay.removeEventListener("click", onOverlayClick);
                  document.removeEventListener("keydown", onKey);
                  overlay.remove();
                  if (activeImagePreviewClose === closeSelf) activeImagePreviewClose = null;
                };
                const onOverlayClick = (e: MouseEvent) => {
                  if (e.target === overlay || e.target === closeBtn) closeSelf();
                };
                const onKey = (e: KeyboardEvent) => {
                  if (e.key === "Escape") closeSelf();
                };
                overlay.addEventListener("click", onOverlayClick);
                document.addEventListener("keydown", onKey);
                overlay.appendChild(previewImg);
                overlay.appendChild(closeBtn);
                document.body.appendChild(overlay);
                activeImagePreviewClose = closeSelf;
              });

              // ---------- 源码编辑：图片上方显示可编辑的 Markdown 源码 ----------
              let sourceBox: HTMLDivElement | null = null;
              let sourceClosed = false;

              // 点击面板外部（文档其他位置）→ 关闭源码弹窗
              // 使用捕获阶段监听：编辑器/ProseMirror 可能拦截 mousedown 冒泡，捕获阶段必然最先收到
              const onDocMouseDown = (e: MouseEvent) => {
                const target = e.target as Node;
                if (!sourceBox) return;
                // 面板内部点击 → 不关闭
                if (sourceBox.contains(target)) return;
                // 图片工具栏（源码/预览按钮）点击 → 不关闭，由 click 事件处理 toggle
                if (toolbar.contains(target)) return;
                closeSourceEditor();
              };

              const closeSourceEditor = () => {
                if (sourceClosed) return;
                sourceClosed = true;
                if (sourceBox) {
                  sourceBox.remove();
                  sourceBox = null;
                }
                if (activeImageSourceEditorClose === closeSourceEditor) {
                  activeImageSourceEditorClose = null;
                }
                document.removeEventListener("mousedown", onDocMouseDown, true);
              };

              const confirmSourceEdit = () => {
                if (!sourceBox) return;
                const ta = sourceBox.querySelector("textarea");
                if (!ta) return;
                const pos = getPosSafe();
                if (pos == null) return;
                const text = ta.value.trim();
                if (!text) {
                  ta.classList.add("error");
                  return;
                }
                try {
                  const parsedHtml = (editor.storage as Record<string, any>).markdown.parser.parse(text, {
                    inline: true,
                  });
                  const tmp = document.createElement("div");
                  tmp.innerHTML = parsedHtml;
                  const imgs = Array.from(tmp.querySelectorAll("img"));
                  const hasText = Array.from(tmp.childNodes).some(
                    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim() !== ""
                  );
                  const otherEls = Array.from(tmp.children).filter(
                    (el) => el.tagName !== "IMG" && el.tagName !== "BR"
                  );
                  if (imgs.length !== 1 || hasText || otherEls.length > 0) {
                    ta.classList.add("error");
                    return;
                  }
                  const el = imgs[0];
                  const rawWidth = el.getAttribute("width");
                  const widthNum = rawWidth ? parseInt(rawWidth, 10) : null;
                  const currentAtPos = editor.state.doc.nodeAt(pos);
                  if (!currentAtPos || currentAtPos.type.name !== "image") {
                    closeSourceEditor();
                    return;
                  }
                  const view = getEditorView(editor);
                  if (!view) {
                    closeSourceEditor();
                    return;
                  }
                  view.dispatch(
                    view.state.tr.setNodeMarkup(pos, undefined, {
                      src: el.getAttribute("src"),
                      alt: el.getAttribute("alt") || null,
                      title: el.getAttribute("title") || null,
                      width: widthNum && Number.isFinite(widthNum) && widthNum > 0 ? widthNum : null,
                      "data-abs-path": null,
                      "data-wiki-embed": el.getAttribute("data-wiki-embed") || null,
                    })
                  );
                  closeSourceEditor();
                } catch {
                  ta.classList.add("error");
                }
              };

              const openSourceEditor = () => {
                // 再次点击源码按钮：关闭
                if (sourceBox) {
                  closeSourceEditor();
                  return;
                }
                const pos = getPosSafe();
                if (pos == null) return;
                const current = editor.state.doc.nodeAt(pos);
                if (!current || current.type.name !== "image") return;

                activeImageSourceEditorClose?.();
                activeImageSourceEditorClose = closeSourceEditor;

                sourceClosed = false;
                sourceBox = document.createElement("div");
                sourceBox.className = "image-source-editor";

                const ta = document.createElement("textarea");
                ta.className = "image-source-input";
                ta.value = imageNodeToMarkdown(current.attrs);
                ta.rows = 2;
                ta.spellcheck = false;
                ta.placeholder = "![描述|宽度](路径)";

                const actions = document.createElement("div");
                actions.className = "image-source-actions";
                const okBtn = document.createElement("button");
                okBtn.type = "button";
                okBtn.className = "primary";
                okBtn.textContent = "确定";
                const cancelBtn = document.createElement("button");
                cancelBtn.type = "button";
                cancelBtn.textContent = "取消";
                actions.appendChild(okBtn);
                actions.appendChild(cancelBtn);

                const stopEvent = (e: Event) => {
                  e.preventDefault();
                  e.stopPropagation();
                };
                sourceBox.addEventListener("mousedown", stopEvent);
                sourceBox.addEventListener("click", stopEvent);
                sourceBox.addEventListener("dblclick", stopEvent);
                // textarea 只阻止冒泡、不阻止默认行为，保证点击能获得焦点
                ta.addEventListener("mousedown", (e: MouseEvent) => {
                  e.stopPropagation();
                });
                const closeAndFocus = () => {
                  closeSourceEditor();
                  editor.commands.focus();
                };
                ta.addEventListener("keydown", (e: KeyboardEvent) => {
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    closeAndFocus();
                  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    confirmSourceEdit();
                    if (!sourceBox) editor.commands.focus();
                  }
                });
                ta.addEventListener("input", () => {
                  ta.classList.remove("error");
                });
                okBtn.addEventListener("click", () => {
                  confirmSourceEdit();
                  if (!sourceBox) editor.commands.focus();
                });
                cancelBtn.addEventListener("click", closeAndFocus);

                sourceBox.appendChild(ta);
                sourceBox.appendChild(actions);
                wrapper.appendChild(sourceBox);

                // 图片顶部空间不足时，面板显示在图片下方
                requestAnimationFrame(() => {
                  if (!sourceBox) return;
                  const rect = wrapper.getBoundingClientRect();
                  if (rect.top < 160) sourceBox.classList.add("below");
                  // 图片较窄时面板左对齐，避免向右溢出编辑器
                  if (rect.width < 360) sourceBox.classList.add("left-align");
                });

                // 点击面板外部时关闭源码弹窗（捕获阶段，不受冒泡拦截影响）
                document.addEventListener("mousedown", onDocMouseDown, true);

                ta.focus();
              };
              sourceBtn.addEventListener("click", openSourceEditor);

              // 阻止工具栏点击触发编辑器选区变化
              const stopToolbarEvent = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
              };
              toolbar.addEventListener("mousedown", stopToolbarEvent);
              toolbar.addEventListener("click", stopToolbarEvent);

              let dragging = false;
              let startX = 0;
              let startWidth = 0;
              let moveHandler: ((e: MouseEvent) => void) | null = null;
              let upHandler: ((e: MouseEvent) => void) | null = null;

              const stopDrag = () => {
                dragging = false;
                wrapper.classList.remove("image-resizing");
                if (moveHandler) document.removeEventListener("mousemove", moveHandler);
                if (upHandler) document.removeEventListener("mouseup", upHandler);
                moveHandler = null;
                upHandler = null;
              };

              handle.addEventListener("mousedown", (e: MouseEvent) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                dragging = true;
                wrapper.classList.add("image-resizing");
                startX = e.clientX;
                startWidth =
                  dom.getBoundingClientRect().width ||
                  dom.naturalWidth ||
                  initialWidth ||
                  100;

                moveHandler = (ev: MouseEvent) => {
                  ev.preventDefault();
                  if (!dragging) return;
                  const w = Math.max(20, Math.round(startWidth + (ev.clientX - startX)));
                  dom.style.width = `${w}px`;
                  dom.style.height = "auto";
                };
                upHandler = (ev: MouseEvent) => {
                  if (!dragging) return;
                  const w = Math.max(20, Math.round(startWidth + (ev.clientX - startX)));
                  stopDrag();
                  dom.style.width = `${w}px`;
                  dom.setAttribute("width", String(w));

                  const pos = getPosSafe();
                  if (pos == null) return;
                  const current = editor.state.doc.nodeAt(pos);
                  if (!current || current.type.name !== "image") return;
                  const view = getEditorView(editor);
                  if (!view) return;
                  view.dispatch(
                    view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, width: w })
                  );
                };
                document.addEventListener("mousemove", moveHandler);
                document.addEventListener("mouseup", upHandler);
              });

              return {
                dom: wrapper,
                destroy: () => {
                  stopDrag();
                  closeSourceEditor();
                },
              };
            };
          },
        }).configure({
          inline: true,
          allowBase64: true,
        }),
        TiptapLink.extend({
          // 徽章 `[![alt](img)](href)` 的外层链接：tiptap-markdown 解析时会
          // decodeURIComponent(href)（%20→空格、%7C→|），序列化时必须用 <...>
          // 包裹含空白/竖线的 URL，否则往返解析时 markdown-it 会在空格处截断。
          addStorage() {
            return {
              markdown: {
                serialize: {
                  open: "[",
                  close: (_state: any, mark: any) => {
                    const href = serializeMarkdownUrl(mark.attrs.href);
                    return mark.attrs.title
                      ? `](${href} "${mark.attrs.title.replace(/"/g, '\\"')}")`
                      : `](${href})`;
                  },
                },
              },
            };
          },
          // @tiptap/extension-link v3 移除了 markInputRule，输入时只有 URL
          // autolink 能即时生成链接，`[中文](README_ZH.md)` 这类相对路径/本地
          // 路径链接不会自动变成链接。这里补一个 markInputRule：
          // 链接文本是最后一个捕获组（mark 应用位置），URL 从完整匹配中提取。
          // 注意必须用 ^ $ 锚点：InputRule 的 range 计算假设匹配从段落开头
          // 开始（忽略 match.index），否则段落中间输入时位置会错位损坏文本。
          addInputRules() {
            return [
              markInputRule({
                find: /^\[([^\]]+)\]\((?:[^)\s]+)\)$/,
                type: this.type,
                getAttributes: (match) => {
                  const m = match[0].match(/^\[[^\]]+\]\(([^)\s]+)\)$/);
                  return {
                    href: m ? m[1] : "",
                    target: null,
                    rel: null,
                    class: null,
                  };
                },
              }),
            ];
          },
        }).configure({
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
        // 高亮标记（==text==）同样去掉 (?:^|\s) 前缀限制，支持行中即时渲染
        Highlight.extend({
          addInputRules() {
            return [
              markInputRule({ find: /(==(?!\s+==)((?:[^=]+))==(?!\s+==))$/, type: this.type }),
            ];
          },
        }),
        Typography,
        Markdown.configure({
          html: true,
          breaks: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        StripStyle,
        ...(editorSettings?.frontmatter !== false ? [Frontmatter] : []),
        ...(editorSettings?.callout !== false ? [Callout] : []),
        ...(editorSettings?.mermaid !== false ? [Mermaid] : []),
        ...(editorSettings?.wikiLink !== false ? [WikiLink] : []),
        ...(editorSettings?.math !== false
          ? [
              MathExtension.configure({
                onClick: (node: any, pos: number) => {
                  setMathDialog({
                    latex: node.attrs.latex || "",
                    block: node.type.name === "blockMath",
                    pos,
                  });
                },
              }),
            ]
          : []),
        Tag,
        SearchHighlight,
        HeadingHighlight,
        CodeBlockToolbar,
        ...(editorSettings?.tableToolbar !== false ? [TableFloatingToolbar] : []),
        BulletListMindmap,
        HardBreakCleanup,
        // vim-prose：Vim 模态扩展（enabled=false 时返回空数组，零侵入）
        ...createTiptapVimExtensions(vimEnabled),
      ],
      content: value || "",
      onUpdate: ({ editor: ed }) => {
        const md = getMarkdownSafe(ed);

        if (isInternalRef.current) {
          isInternalRef.current = false;
        } else if (!mountingRef.current && md != null) {
          onChangeRef.current(md);
        }

        const text = ed.getText();
        const count = editorSettings?.counterType === "markdown"
          ? (md ?? "").length
          : text.replace(/\s/g, "").length;
        onWordCountRef.current?.(count);

        // 全选后删除会把文档清空：部分浏览器下视图的 DOM 选区会失同步，
        // 导致光标不再闪烁。此时重新同步 DOM 选区即可恢复光标闪烁。
        if (ed.isEmpty && ed.isFocused) {
          requestAnimationFrame(() => {
            if (ed.isEmpty && ed.isFocused) {
              ed.commands.focus();
            }
          });
        }
      },
      onSelectionUpdate: ({ editor: ed }) => {
        // macOS WebKit：折叠后清原生残留（跨块选区后尤其明显）
        if (isPlatformMacos() && ed.state.selection.empty) {
          requestAnimationFrame(() => syncCollapsedDomSelection(getEditorView(ed), macPointerHadDomRange));
        }

        if (!typewriterModeRef.current) return;
        if (typewriterRafRef.current) return; // 已排帧，跳过
        typewriterRafRef.current = requestAnimationFrame(() => {
          typewriterRafRef.current = null;
          const scrollContainer = containerRef.current?.querySelector('.tiptap-editor') as HTMLElement | null;
          if (!scrollContainer) return;
          const { from } = ed.state.selection;
          const view = getEditorView(ed);
          const coords = view?.coordsAtPos?.(from);
          if (!coords) return;
          // 以光标所在行的垂直中心为基准，而非行顶
          const lineCenter = (coords.top + coords.bottom) / 2;
          const containerTop = scrollContainer.getBoundingClientRect().top;
          const lineCenterInContent = lineCenter - containerTop + scrollContainer.scrollTop;
          const targetScroll = lineCenterInContent - scrollContainer.clientHeight / 2;
          // 内容区上下已预留半屏内边距，故首行/末行也能居中（无需 clamp 到 0）
          scrollContainer.scrollTop = Math.max(0, targetScroll);
        });
      },
      editorProps: {
        handleDOMEvents: {
          // 记录左键按下时是否已有跨块选区，供 mouseup / selectionUpdate 强制清幽灵高亮
          mousedown: (_view: EditorView, event: MouseEvent) => {
            if (!isPlatformMacos() || event.button !== 0 || event.shiftKey) {
              macPointerHadDomRange = false;
              return false;
            }
            const domSel = window.getSelection();
            macPointerHadDomRange = !!(domSel && (!domSel.isCollapsed || domSel.rangeCount > 1));
            // 跨块选区后立刻清原生 Selection，减轻 WebKit 在 heading/code 上留下的合成层残影
            if (macPointerHadDomRange) {
              domSel!.removeAllRanges();
              try {
                (domSel as Selection & { empty?: () => void }).empty?.();
              } catch {
                /* ignore */
              }
            }
            return false;
          },
          // macOS：左键抬起后再对齐一次（勿连清两轮，避免 metadata 闪烁）
          mouseup: (view: EditorView, event: MouseEvent) => {
            if (event.button !== 0 || !isPlatformMacos()) return false;
            const hadRange = macPointerHadDomRange;
            macPointerHadDomRange = false;
            requestAnimationFrame(() => {
              syncCollapsedDomSelection(view, hadRange);
            });
            return false;
          },
          keydown: (_view: any, event: KeyboardEvent) => {
            // 拦截 Ctrl+/（防止被当作 HTML 注释快捷键，模式切换由 App.tsx 全局处理）
            if ((event.ctrlKey || event.metaKey) && event.key === "/") {
              event.preventDefault();
              event.stopPropagation();
              return true;
            }

            // 拦截 Ctrl+M（防止打开思维导图窗口）
            if ((event.ctrlKey || event.metaKey) && event.key === "m") {
              event.stopPropagation();
            }

            // ── Vim 模态优先：normal/visual 模式下跳过 shortcuts 层
            // vim-prose 在内部处理 Ctrl+d/u/f/b、hjkl、w/b 等大量按键；
            // 若让 shortcuts 先处理会把 Ctrl+D（删除线）/Ctrl+U（代码块）等拦截掉。
            //
            // 冲突键让渡：用户可在设置中关闭某个冲突键的让渡（conflictKeys[id]===false），
            // 关闭后该键不翻页，直接 fall through 到下方 shortcuts 层执行 App 快捷键。
            if (vimEnabled && editor) {
              const vmode = getVimMode(editor);

              // ── Insert/Replace 态：Ctrl+[（等价 ESC）以及 jk 快速序列退出 insert ──
              if (vmode === "insert" || vmode === "replace") {
                // Ctrl+[ 等价 ESC：退出 insert/replace → normal
                if (event.key === "[" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  event.stopPropagation();
                  exitTiptapVisualMode(editor); // 内部会设 mode=normal + 折叠选区（安全）
                  return true;
                }
                // jk 快速序列：在 ~300ms 内按 j 再按 k → 回删 jk 两个字符 + 退出 insert
                if (!event.ctrlKey && !event.metaKey && !event.altKey) {
                  if (event.key === "j") {
                    vimJkRef.current.lastJAt = Date.now();
                    // 不用 return true：让 j 字符正常输入文档
                  } else if (event.key === "k") {
                    const now = Date.now();
                    if (vimJkRef.current.lastJAt > 0 && now - vimJkRef.current.lastJAt <= 320) {
                      vimJkRef.current.lastJAt = 0;
                      event.preventDefault();
                      event.stopPropagation();
                      // 回退刚输入的 "j" + 未输入的 "k"，总共删 2 个字符
                      try {
                        editor
                          .chain()
                          .focus()
                          .deleteRange({
                            from: Math.max(0, editor.state.selection.anchor - 1),
                            to: editor.state.selection.anchor,
                          })
                          .run();
                      } catch { /* ignore */ }
                      exitTiptapVisualMode(editor);
                      return true;
                    }
                    // k 独立输入 → 不标记 j
                    vimJkRef.current.lastJAt = 0;
                  } else {
                    // 其它字符打断 jk 序列
                    vimJkRef.current.lastJAt = 0;
                  }
                }
              } else {
                // 默认跳过 shortcuts 层（交给 vim-prose）；非让渡的冲突键会改为 false
                let skipShortcuts = true;

                // ── 进入 insert 的键：i/a/I/A/o/O s/S 手动切 insert，并 preventDefault
                // vim-prose 内部虽然能切 insert，但经常无法 preventDefault，导致字母
                // 被写入文档（例如 normal 态按 i 文档中会多出一个 "i" 字符）。
                // 因此我们在 handleDOMEvents 更早的阶段手动切换，return true 阻止 DOM 默认。
                if (!event.ctrlKey && !event.metaKey && !event.altKey) {
                  const k = event.key;
                  if (k === "i" || k === "a" || k === "I" || k === "A" ||
                      k === "o" || k === "O" || k === "s" || k === "S") {
                    event.preventDefault();
                    event.stopPropagation();
                    enterTiptapInsertMode(editor, k as "i"|"a"|"I"|"A"|"o"|"O"|"s"|"S");
                    return true;
                  }
                  // x = delete char under cursor：vim-prose 有时也没拦住 x 字符写入
                  if (k === "x") {
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                      const { from, to } = editor.state.selection;
                      if (from !== to) {
                        editor.chain().focus().deleteRange({ from, to }).run();
                      } else {
                        editor.chain().focus().deleteRange({ from, to: Math.min(from + 1, editor.state.doc.content.size) }).run();
                      }
                    } catch { /* ignore */ }
                    return true;
                  }
                }

                // ── Ctrl+D/U/F/B：自实现半页/整页翻页 + 光标垂直居中 ──
                if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                  const k = event.key.toLowerCase();
                  if (k === "d" || k === "u" || k === "f" || k === "b") {
                    const keyId = `ctrl+${k}`;
                    const yielded = vimConflictKeysRef.current[keyId] !== false; // 默认 true
                    if (yielded) {
                      event.preventDefault();
                      event.stopPropagation();
                      const isFull = (k === "f" || k === "b");
                      const factor =
                        (k === "d" || k === "f") ? (isFull ? +1.0 : +0.5) : (isFull ? -1.0 : -0.5);
                      vimPageScrollCenterTipTap(editor, factor, isFull, containerRef);
                      return true;
                    }
                    // 不让渡：放行到下方 shortcuts 层（Ctrl+D=删除线 / Ctrl+U=代码块 等）
                    skipShortcuts = false;
                  }
                }

                // vim-prose 未实现的缺失键：e / ge（始终由 vim 接管，非冲突键）
                if (!event.ctrlKey && !event.metaKey && !event.altKey) {
                  if (event.key === "e") {
                    event.preventDefault();
                    moveWordEndForward(editor);
                    return true;
                  }
                }

                // 非让渡的冲突键 → fall through 到下方 shortcuts 层
                if (skipShortcuts) return false;
              }
            }

            // 自定义快捷键处理（在 ProseMirror keymap 之前执行）
            const target = event.target as HTMLElement;
            if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
              const shortcuts = loadShortcuts();
              const commandMap: Record<string, string> = {
                "bold": "bold", "italic": "italic", "strike": "strike",
                "inline-code": "inline-code", "code-block": "code",
                "link": "link", "highlight": "highlight", "quote": "quote",
                "hr": "line", "unordered-list": "list",
                "ordered-list": "ordered-list", "check-list": "check",
                "indent": "indent", "outdent": "outdent", "task-toggle": "task-toggle",
                "heading-1": "heading-1", "heading-2": "heading-2",
                "heading-3": "heading-3", "heading-4": "heading-4",
                "heading-5": "heading-5", "heading-6": "heading-6",
                "paragraph": "paragraph", "table": "table",
                "table-row-above": "table-row-above", "table-row-below": "table-row-below",
                "table-col-left": "table-col-left", "table-col-right": "table-col-right",
                "table-row-delete": "table-row-delete", "table-col-delete": "table-col-delete",
                "footnotes": "footnotes", "math": "math",
              };
              for (const shortcut of shortcuts) {
                const cmdName = commandMap[shortcut.id];
                if (cmdName && matchShortcut(event, shortcut.keys)) {
                  // table-row-delete 与 app 级 split-tb 共用 Ctrl+-：
                  // 仅当光标在表格内时执行删行并阻止冒泡（避免同时触发分屏）；
                  // 不在表格内则跳过本条，让事件冒泡到 window 触发上下分屏。
                  if (shortcut.id === "table-row-delete") {
                    const { $from } = editor.state.selection;
                    let inTable = false;
                    for (let d = $from.depth; d > 0; d--) {
                      const n = $from.node(d);
                      if (n.type.name === "tableRow" || n.type.name === "table") {
                        inTable = true;
                        break;
                      }
                    }
                    if (!inTable) continue;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  executeCommand(cmdName, editor);
                  return true;
                }
              }
            }

            // Tab / Shift-Tab：列表缩进/反缩进
            if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
              const { state } = editor;
              const { $from } = state.selection;

              // 判断光标是否在列表项内（listItem 或 taskItem）
              let listType: string | null = null;
              for (let d = $from.depth; d >= 0; d--) {
                const node = $from.node(d);
                if (node.type.name === "listItem" || node.type.name === "taskItem") {
                  listType = node.type.name;
                  break;
                }
              }

              if (listType) {
                event.preventDefault();
                if (event.shiftKey) {
                  editor.chain().focus().liftListItem(listType).run();
                } else {
                  editor.chain().focus().sinkListItem(listType).run();
                }
                return true;
              }
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
        clipboardTextSerializer: (content: any) => {
          return content.content.textBetween(0, content.content.size, '\n', '\n');
        },
      },
    }, [vimEnabled]);

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
        // 用户取消了目录选择，静默忽略
        if (e instanceof ImageSaveCancelledError) return;
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

    // 监听数学公式弹窗事件
    useEffect(() => {
      const handleMathDialogOpen = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        setMathDialog({
          latex: detail?.latex || "",
          block: detail?.block !== false,
          pos: null,
        });
      };
      window.addEventListener("math-dialog-open", handleMathDialogOpen);
      return () => window.removeEventListener("math-dialog-open", handleMathDialogOpen);
    }, []);

    // 编辑器挂载后的静默期（500ms），防止初始化规范化操作触发保存
    useEffect(() => {
      if (!editor) return;
      mountingRef.current = true;
      const timer = setTimeout(() => {
        mountingRef.current = false;
      }, 500);
      return () => clearTimeout(timer);
    }, [editor]);

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

    // 数学公式弹窗确认：插入新公式或更新已有公式
    const handleMathDialogConfirm = useCallback(
      (latex: string, block: boolean) => {
        if (!editor) return;
        const dialog = mathDialogRef.current;
        if (dialog?.pos != null) {
          // 编辑已有公式
          const node = editor.state.doc.nodeAt(dialog.pos);
          if (node) {
            if (node.type.name === "blockMath") {
              editor.chain().focus().updateBlockMath({ latex, pos: dialog.pos }).run();
            } else if (node.type.name === "inlineMath") {
              editor.chain().focus().updateInlineMath({ latex, pos: dialog.pos }).run();
            }
          }
        } else {
          // 插入新公式
          const from = editor.state.selection.from;
          if (block) {
            editor.chain().focus().insertBlockMath({ latex, pos: from }).run();
          } else {
            editor.chain().focus().insertInlineMath({ latex, pos: from }).run();
          }
        }
        setMathDialog(null);
        editor.commands.focus();
      },
      [editor]
    );

    // 数学公式弹窗取消
    const handleMathDialogCancel = useCallback(() => {
      setMathDialog(null);
      editor?.commands.focus();
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
          // 相对路径链接（如 README_ZH.md）：基于当前文档目录解析为绝对路径
          let filePath = href;
          const hashIdx = filePath.search(/[#?]/);
          if (hashIdx !== -1) filePath = filePath.slice(0, hashIdx);
          const basePath = currentFilePathRef.current
            ? dirName(currentFilePathRef.current)
            : activeVaultPathRef.current;
          const isAbs =
            /^[a-zA-Z]:[\\/]/.test(filePath) ||
            filePath.startsWith("/") ||
            filePath.startsWith("\\\\") ||
            filePath.startsWith("file://");
          if (basePath && !isAbs && filePath) {
            filePath = resolveRelativePath(basePath, filePath);
          }
          if (filePath) {
            if (/\.(md|markdown|mdx|txt)$/i.test(filePath)) {
              emit("open-file", { path: filePath }); // 文档类链接在应用内打开
            } else {
              invoke("open_file", { filePath }); // 其他文件用系统默认程序
            }
          }
        }
      };

      container.addEventListener("click", handleClick, true);
      return () => container.removeEventListener("click", handleClick, true);
    }, [editor, mode]); // mode 变化时重新绑定，确保 DOM 重建后事件监听器有效

    // 点击链接时在 IR 模式下显示 markdown 源码并可编辑
    useEffect(() => {
      const container = containerRef.current;
      if (!container || !editor) return;

      // 将链接元素替换为 markdown 源码文本
      const convertLinkToSource = (anchor: HTMLAnchorElement) => {
        if (!editor) return;

        let pos: number;
        const posView = getEditorView(editor);
        if (!posView) return;
        try {
          pos = posView.posAtDOM(anchor, 0);
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
            const coordsView = getEditorView(editor);
            if (coordsView) {
              try {
                const posInfo = coordsView.posAtCoords({ left: e.clientX, top: e.clientY });
                if (posInfo) {
                  const { from, to } = linkEditRef.current;
                  if (posInfo.pos >= from && posInfo.pos < to) {
                    return; // 点击在编辑区域内，不恢复
                  }
                }
              } catch {
                /* 视图未就绪时忽略，回退到恢复 */
              }
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
    }, [editor, restoreLinkEdit, mode]); // mode 变化时重新绑定，确保 DOM 重建后事件监听器有效

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

    // 快捷键已移至 handleDOMEvents.keydown 中处理

    // Vim mode 同步：vim-prose 模式变化 → VimProvider
    useEffect(() => {
      if (!editor || !vimEnabled) return;
      const cleanup = syncVimMode(editor, onVimModeChange);
      return cleanup;
    }, [editor, vimEnabled, onVimModeChange]);

    const vimEditorRef = useRef<Editor | null>(editor);
    vimEditorRef.current = editor;

    // leader.ts 的 editor.* ID 与 TipTap executeCommand 名称的映射差异
    const tipTapActionMap: Record<string, string> = {
      "code-block": "code",
      "unordered-list": "list",
      "check-list": "check",
    };

    const dispatchTipTapAction = useCallback((action: string) => {
      const wasVisual = vimModeRef.current === "visual";
      let handled = false;
      if (action.startsWith("editor.")) {
        const ed = vimEditorRef.current;
        if (!ed) return false;
        const actionId = action.slice("editor.".length);
        executeCommand(tipTapActionMap[actionId] ?? actionId, ed);
        handled = true;
      } else if (action.startsWith("app.")) {
        window.dispatchEvent(new CustomEvent("vim-app-action", {
          detail: { action: action.slice("app.".length) }
        }));
        handled = true;
      } else if (action.startsWith("table.")) {
        const ed = vimEditorRef.current;
        if (!ed) return false;
        const op = action.slice("table.".length);
        try {
          switch (op) {
            // ── 对齐：单元格内用 setCellAttribute，段落内用 updateAttributes ──
            case "align-left":
            case "align-center":
            case "align-right": {
              const align = op === "align-left" ? "left"
                         : op === "align-center" ? "center" : "right";
              // 先试 table 单元格级（光标在单元格内时生效，setCellAttribute 返回 false 时 fallback 到段落）
              let ok = false;
              try {
                ok = (ed.chain().focus() as any).setCellAttribute?.("textAlign", align)?.run?.() ?? false;
              } catch { ok = false; }
              if (!ok) {
                ok = ed.chain().focus().updateAttributes("paragraph", { textAlign: align }).run();
              }
              handled = !!ok;
              break;
            }
            // ── 插入行 / 列（Tiptap Table 官方 command，避免手工拼节点） ──
            case "add-row-above":
              handled = ed.chain().focus().addRowBefore().run();
              break;
            case "add-row-below":
              handled = ed.chain().focus().addRowAfter().run();
              break;
            case "add-col-left":
              handled = ed.chain().focus().addColumnBefore().run();
              break;
            case "add-col-right":
              handled = ed.chain().focus().addColumnAfter().run();
              break;
            // ── 合并 / 拆分 ──
            case "merge-cells":
              handled = ed.chain().focus().mergeCells().run();
              break;
            case "split-cell":
              handled = ed.chain().focus().splitCell().run();
              break;
          }
        } catch {
          handled = false;
        }
      }
      // Visual 态执行完任何动作后立刻回到 normal 态（对齐真实 Vim 的操作体验）
      if (handled && wasVisual) {
        const ed = vimEditorRef.current;
        if (ed) exitTiptapVisualMode(ed);
      }
      return handled;
    }, []);

    // Leader 菜单（Space 触发，normal/visual 态激活，与 CodeMirror 源码模式统一）
    // 多窗格时只有激活窗格（active=true）的 Leader 才生效，避免重复触发动作
    const leader = useLeader({
      enabled: vimEnabled,
      triggerKey: vimLeaderKey,
      timeout: vimMenuTimeout,
      active: active && vimMode !== "insert",
      dispatchAction: dispatchTipTapAction,
    });

    // m 前缀键：normal/visual 态按 m 弹出 Markdown 格式化菜单（mb=加粗, mi=斜体…）
    const prefixM = useLeader({
      enabled: vimEnabled,
      triggerKey: "m",
      timeout: vimMenuTimeout,
      active: active && vimMode !== "insert" && !leader.open,
      dispatchAction: dispatchTipTapAction,
      initialItems: prefixMConfig.items,
    });

    // g 前缀键：被动模式，弹窗仅作视觉引导，按键由 vim-prose 原生处理
    const prefixG = useLeader({
      enabled: vimEnabled,
      triggerKey: "g",
      timeout: vimMenuTimeout,
      active: active && vimMode !== "insert" && !leader.open && !prefixM.open,
      dispatchAction: dispatchTipTapAction,
      initialItems: prefixGConfig.items,
      passive: true,
    });

    // z 前缀键：被动模式，弹窗仅作视觉引导，按键由 vim-prose 原生处理
    const prefixZ = useLeader({
      enabled: vimEnabled,
      triggerKey: "z",
      timeout: vimMenuTimeout,
      active: active && vimMode !== "insert" && !leader.open && !prefixM.open && !prefixG.open,
      dispatchAction: dispatchTipTapAction,
      initialItems: prefixZConfig.items,
      passive: true,
    });

    // t 前缀键：主动模式，表格操作（对齐/插入行列/合并拆分）。dispatchAction 处理 table.* 动作。
    // 优先级排在 g/z 后面（normal/visual 态下 Space/m/g/z 都未开启时，按 t 激活）。
    const prefixT = useLeader({
      enabled: vimEnabled,
      triggerKey: "t",
      timeout: vimMenuTimeout,
      active: active && vimMode !== "insert" && !leader.open && !prefixM.open && !prefixG.open && !prefixZ.open,
      dispatchAction: dispatchTipTapAction,
      initialItems: prefixTConfig.items,
    });
    // 显式引用：确保 useLeader 返回值被 TS 认定为 "已读"，避免 unused-var。
    // hook 本身通过内部 keydown listener 生效，不需要显式调用其方法。
    void leader.open; void prefixM.open; void prefixG.open; void prefixZ.open; void prefixT.open;

    // 暴露 API
    useImperativeHandle(ref, () => ({
      getValue: () => {
        if (!editor) return "";
        return getMarkdownSafe(editor) ?? "";
      },
      setValue: (val: string) => {
        if (!editor) return;
        isInternalRef.current = true;
        editor.commands.setContent(val);
      },
      focus: () => {
        // SV 模式下聚焦源码编辑器，否则聚焦 TipTap view
        if (mode === "sv") {
          sourceEditorRef.current?.focus();
        } else if (editor) {
          editor.commands.focus();
        }
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
      replaceRangeWithTag: (fromPos: number, tag: string) => {
        if (!editor) return;
        const to = editor.state.selection.from;
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: fromPos, to },
            { type: 'tag' as any, attrs: { tag } }
          )
          // 插入一个空格方便继续输入
          .insertContent(" ")
          .run();
      },
      resize: () => {
        if (!editor) return;
        const scrollContainer = containerRef.current?.querySelector('.tiptap-editor') as HTMLElement | null;
        const savedScrollTop = scrollContainer?.scrollTop ?? 0;
        editor.commands.focus();
        // 恢复滚动位置，避免 focus() 导致跳到底部
        if (scrollContainer) {
          requestAnimationFrame(() => {
            scrollContainer.scrollTop = savedScrollTop;
          });
        }
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
          
          // 高亮标题文字 1.5 秒
          editor.commands.highlightHeading(bestPos, 1500);
          
          // 使用 requestAnimationFrame 确保编辑器更新后滚动
          requestAnimationFrame(() => {
            // 滚动容器是 .tiptap-editor，不是 editor-container
            const scrollContainer = containerRef.current?.querySelector('.tiptap-editor');
            if (!scrollContainer) return;
            
            const view = getEditorView(editor);
            const coords = view?.coordsAtPos?.(bestPos!);
            if (coords) {
              const containerRect = scrollContainer.getBoundingClientRect();
              // 计算滚动距离：元素在视口的位置 - 容器在视口的位置 - 顶部边距
              const scrollDistance = coords.top - containerRect.top - 20;
              scrollContainer.scrollTop += scrollDistance;
            }
          });
        }
      },
      scrollToLine: (line: number) => {
        if (!editor) return;
        const { doc } = editor.state;
        const totalLines = doc.textContent.split("\n").length;
        const ratio = Math.min((line - 1) / Math.max(totalLines - 1, 1), 1);
        const pos = Math.floor(ratio * doc.content.size);
        editor.chain().focus().setTextSelection(pos).run();

        requestAnimationFrame(() => {
          const scrollContainer = containerRef.current?.querySelector('.tiptap-editor');
          if (!scrollContainer) return;
          
          const view = getEditorView(editor);
          const coords = view?.coordsAtPos?.(pos);
          if (coords) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const scrollTop = coords.top - containerRect.top - containerRect.height / 3;
            scrollContainer.scrollTop += scrollTop;
          }
        });
      },
      getCursorOffset: () => {
        if (!editor) return -1;
        return editor.state.selection.from;
      },
      isSourceMode: () => mode === "sv",
      // 返回当前渲染内容的克隆（用于导出）。源码模式下视图被销毁，返回 null。
      getContentElement: () => {
        if (!editor || !editor.view?.dom) return null;
        return (editor.view.dom as HTMLElement).cloneNode(true) as HTMLElement;
      },
      findMatches: (query: string) => {
        if (!editor || !query) return [];
        const results: Array<{ from: number; to: number }> = [];
        const content = editor.state.doc.textContent;
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let startIndex = 0;
        while (startIndex < lowerContent.length) {
          const idx = lowerContent.indexOf(lowerQuery, startIndex);
          if (idx === -1) break;
          results.push({ from: idx + 1, to: idx + query.length + 1 });
          startIndex = idx + 1;
        }
        return results;
      },
      selectMatch: (from: number, to: number) => {
        if (!editor) return;
        editor.chain().setTextSelection({ from, to }).run();
        requestAnimationFrame(() => {
          const scrollContainer = containerRef.current?.querySelector('.tiptap-editor') as HTMLElement | null;
          if (!scrollContainer) return;
          const view = getEditorView(editor);
          const coords = view?.coordsAtPos?.(from);
          if (coords) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const targetScroll = scrollContainer.scrollTop + coords.top - containerRect.top - containerRect.height / 3;
            scrollContainer.scrollTop = targetScroll;
          }
        });
      },
      selectAndScroll: (from: number, to: number) => {
        if (!editor) return;
        editor.chain().focus().setTextSelection({ from, to }).run();
        requestAnimationFrame(() => {
          const scrollContainer = containerRef.current?.querySelector('.tiptap-editor') as HTMLElement | null;
          if (!scrollContainer) return;
          const view = getEditorView(editor);
          const coords = view?.coordsAtPos?.(from);
          if (coords) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const targetScroll = scrollContainer.scrollTop + coords.top - containerRect.top - containerRect.height / 3;
            scrollContainer.scrollTop = targetScroll;
          }
        });
      },
      replaceAt: (from: number, to: number, replacement: string) => {
        if (!editor) return;
        editor.chain().focus().setTextSelection({ from, to }).insertContent(replacement).run();
      },
    }));

    // 外部 value 同步
    // 追踪上一次的 mode，用于检测 SV→IR 切换
    const prevModeRef = useRef(mode);
    useEffect(() => {
      if (!editor) return;
      if (mode === "sv") {
        prevModeRef.current = mode;
        return;
      }
      // 从 SV 切换到 IR 时，强制同步内容（编辑器 view 在 SV 期间被销毁重建）
      const modeSwitchedToIR = prevModeRef.current === "sv" && mode === "ir";
      prevModeRef.current = mode;

      if (isInternalRef.current) {
        isInternalRef.current = false;
        if (!modeSwitchedToIR) return;
        // mode 切换导致的 isInternalRef 残留：清除标志但继续同步
      }
      const fileChanged = prevFilePathRef.current !== currentFilePath;
      prevFilePathRef.current = currentFilePath;

      if (fileChanged || modeSwitchedToIR) {
        // 文件切换或从 SV 切换回 IR 时强制更新内容
        isInternalRef.current = true;
        editor.commands.setContent(value);
        // setContent 默认把选区放到文档末尾。后续 openFile 在 60ms 后调用 focus()，
        // ProseMirror 会把当前选区滚动到视图中 → 光标在末尾就导致跳到底部。
        // 重置光标到文档开头，使 focus() 不再向下滚动。
        editor.commands.setTextSelection(1);
        // 文件切换时重置滚动位置到顶部
        requestAnimationFrame(() => {
          const scrollContainer = containerRef.current?.querySelector('.tiptap-editor');
          if (scrollContainer) {
            scrollContainer.scrollTop = 0;
          }
        });
      } else {
        const currentContent = getMarkdownSafe(editor);
        // storage.markdown 未就绪时：不比较，保守地不同步（避免覆盖文档内容/引发 setContent 震荡）。
        // 下一帧 onUpdate 回调里会带着 md 再执行 onChange，不会因此丢失 value。
        if (currentContent != null && value !== currentContent) {
          isInternalRef.current = true;
          editor.commands.setContent(value);
        }
      }
    }, [value, editor, currentFilePath, mode]);

    // 在 IR ↔ SV 之间切换时保留焦点与光标位置：
    // 模式切换发生在同一 React 提交中，CodeMirrorEditor 挂载/卸载完成后，
    // 旧编辑器的选区仍可通过各自的状态/ref 读取，据此在两个表示之间映射光标。
    const prevModeForCursorRef = useRef(mode);
    useEffect(() => {
      const prevMode = prevModeForCursorRef.current;
      prevModeForCursorRef.current = mode;
      if (!editor) return;

      if (mode === "sv" && prevMode === "ir") {
        // IR → SV：把 PM 光标映射为 Markdown 源码偏移，在 CodeMirror 中恢复并聚焦
        const { from, to } = editor.state.selection;
        const map = buildPositionMap(editor);
        sourceEditorRef.current?.setSelectionAndFocus(
          pmPosToMdOffset(map, from),
          pmPosToMdOffset(map, to),
        );
      } else if (mode === "ir" && prevMode === "sv") {
        // SV → IR：把源码中的偏移映射回 PM 位置，聚焦并恢复选区
        const sel = sourceSelectionRef.current;
        const map = buildPositionMap(editor);
        const anchorPos = mdOffsetToPmPos(map, sel.anchor);
        const headPos = mdOffsetToPmPos(map, sel.head);
        const from = Math.min(anchorPos, headPos);
        const to = Math.max(anchorPos, headPos);
        editor.chain().focus().setTextSelection({ from, to }).run();
      }
    }, [mode, editor]);

    // 文末留白：文本到达末尾后仍可继续向下滚动，让最后一行能滚到窗口中间附近（手动滚动，非打字机模式）
    useEffect(() => {
      if (!editor) return;
      const wrapper = containerRef.current?.closest(".editor-wrapper") as HTMLElement | null;
      const scrollContainer = containerRef.current?.querySelector(".tiptap-editor") as HTMLElement | null;
      if (!wrapper || !scrollContainer) return;

      const updateEndScrollSpace = () => {
        // 留白高度约为可视区高度的一半，保证最后一行可以滚到窗口中部
        const space = Math.max(120, Math.round(scrollContainer.clientHeight / 2));
        wrapper.style.setProperty("--editor-end-scroll-space", `${space}px`);
      };

      updateEndScrollSpace();
      const endSpaceObserver = new ResizeObserver(updateEndScrollSpace);
      endSpaceObserver.observe(scrollContainer);
      return () => endSpaceObserver.disconnect();
    }, [editor, mode]);

    const openContextMenuAt = useCallback((x: number, y: number) => {
      setContextMenuPos({ x, y });
    }, []);

    // WebKit 在右键 mousedown（捕获阶段）就会选中单词。
    // 必须在捕获阶段 preventDefault；部分环境下还会抑制 contextmenu，故一并打开菜单。
    useEffect(() => {
      if (mode === "sv") return;
      const el = containerRef.current;
      if (!el) return;
      const onMouseDownCapture = (e: MouseEvent) => {
        if (e.button !== 2) return;
        e.preventDefault();
        openContextMenuAt(e.clientX, e.clientY);
      };
      const onContextMenuCapture = (e: MouseEvent) => {
        e.preventDefault();
        openContextMenuAt(e.clientX, e.clientY);
      };
      el.addEventListener("mousedown", onMouseDownCapture, true);
      el.addEventListener("contextmenu", onContextMenuCapture, true);
      return () => {
        el.removeEventListener("mousedown", onMouseDownCapture, true);
        el.removeEventListener("contextmenu", onContextMenuCapture, true);
      };
    }, [openContextMenuAt, mode, editor]);

    if (mode === "sv") {
      return (
        <CodeMirrorEditor
          ref={sourceEditorRef}
          value={value}
          onChange={onChange}
          onWordCount={onWordCount}
          filePath={currentFilePath}
          onSelectionChange={handleSourceSelectionChange}
        />
      );
    }

    return (
      <div
        className={`editor-wrapper${typewriterMode ? ' typewriter-mode' : ''}${irLineNumbers === false ? ' hide-ir-line-numbers' : ''}`}
        style={{
          '--editor-max-width': previewMaxWidth ? `${previewMaxWidth}px` : '880px',
          '--editor-line-height': lineHeight ?? 1.6,
          '--editor-paragraph-spacing': `${paragraphSpacing ?? 0.5}em`,
          '--code-line-height': codeLineHeight ?? 1.5,
        } as React.CSSProperties}
      >
        <div
          ref={containerRef}
          className="editor-container"
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
        {mathDialog && (
          <MathDialog
            latex={mathDialog.latex}
            block={mathDialog.block}
            lockBlock={mathDialog.pos != null}
            onConfirm={handleMathDialogConfirm}
            onCancel={handleMathDialogCancel}
          />
        )}
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

TipTapEditor.displayName = "TipTapEditor";

export default TipTapEditor;
