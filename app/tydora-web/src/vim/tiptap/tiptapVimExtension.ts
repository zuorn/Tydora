// src/vim/tiptap/tiptapVimExtension.ts
// vim-prose 与 TipTap 编辑器的集成封装。
//
// 职责：
// - 条件性注入 vim-prose 的 VimMode 扩展（enabled=false 时返回空数组）
// - 监听 editor transaction，同步 vim-prose 模式到 VimProvider
// - 将 vim-prose 的 5 种模式映射到应用的 3 态 VimMode
//
// 设计要点：
// - vim-prose 在 insert 模式只拦截 Esc/Ctrl-c，其余按键透传给 ProseMirror 原生处理
// - Leader 键（Space）由 useLeader 在 capture 阶段拦截，vim-prose 收不到
// - g/z 前缀用 passive 模式，which-key 仅作视觉引导，按键由 vim-prose 原生处理

import type { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { VimMode, getVimMode } from "vim-prose/tiptap";
import { getVimStateFromEditorState } from "vim-prose";
import { TextSelection } from "@tiptap/pm/state";
import type { VimMode as AppVimMode } from "../types";

/**
 * vim-prose 模式 → 应用 VimMode 类型。
 * vim-prose 有 5 种模式，应用只需 3 态：
 * - normal → normal
 * - insert → insert
 * - visual / visual-line / replace → visual
 */
export function mapVimMode(mode: string): AppVimMode {
  if (mode === "normal" || mode === "insert") return mode;
  return "visual";
}

/**
 * 条件性返回 vim-prose 的 VimMode 扩展。
 * enabled=false 时返回空数组（不注入任何扩展，零侵入）。
 * enabled=true 时返回 [VimMode]（TipTap Editor 通过 useEditor deps 重建时注入）。
 */
export function createTiptapVimExtensions(enabled: boolean): Extension[] {
  return enabled ? [VimMode] : [];
}

/**
 * 把 vim-prose 立刻回到 normal 状态。
 *
 * 兼容 3 种当前模式：
 * - visual / visual-line：折叠选区到 head，清空 visualAnchor/visualHead。
 *   用于 Leader / m 前缀动作执行完毕后自动退出 visual 选择。
 * - insert / replace：直接把 vimState.mode 改为 normal，cursor 保持在原位置
 *   （向左回退 1 格，等价 Vim ESC 在 insert 退出后的光标语义）。
 *   用于 INSERT 态下按 ESC / Ctrl+[ / jk 快速序列等方式回到 normal。
 * - normal：空操作。
 */
export function exitTiptapVisualMode(editor: Editor): void {
  try {
    const state = (editor.state as unknown) as import("prosemirror-state").EditorState;
    const view = (editor.view as unknown) as import("prosemirror-view").EditorView | undefined;
    if (!view || !state) return;
    const vimState = getVimStateFromEditorState(state) as any;
    if (!vimState) return;

    const curMode: string = vimState.mode ?? "normal";

    // visual 系：折叠选区到 head（原有语义）
    if (curMode === "visual" || curMode === "visual-line") {
      const pos = vimState.visualHead ?? selectionHead(state);
      vimState.mode = "normal";
      vimState.visualAnchor = null;
      vimState.visualHead = null;
      vimState.searchHighlightsVisible = false;
      try {
        vimState.operatorPending = null;
        vimState.count = "";
        vimState.gPending = false;
      } catch {}
      const tr = state.tr.setSelection(TextSelection.create(state.doc, pos));
      view.dispatch(tr);
      return;
    }

    // insert / replace：切回 normal；cursor 左移 1（模拟真实 Vim ESC 退出 insert 后停在「最后一个可打印字符上」）
    if (curMode === "insert" || curMode === "replace") {
      const head = selectionHead(state);
      const clamped = Math.max(0, Math.min(state.doc.content.size, head - 1));
      vimState.mode = "normal";
      try {
        vimState.operatorPending = null;
        vimState.count = "";
        vimState.gPending = false;
      } catch {}
      const tr = state.tr.setSelection(TextSelection.create(state.doc, clamped));
      view.dispatch(tr);
      return;
    }

    // normal：空转（但仍清理 pending，避免悬挂的 operator/count）
    vimState.mode = "normal";
    try {
      vimState.operatorPending = null;
      vimState.count = "";
      vimState.gPending = false;
      vimState.visualAnchor = null;
      vimState.visualHead = null;
      vimState.searchHighlightsVisible = false;
    } catch {}
  } catch {
    // ignore
  }
}

/**
 * 手动把 vim-prose 切换到 insert 模式。
 * 典型用途：在 TipTap 的 normal 态捕获 i/a/I/A/o/O 等进入 insert 的键，
 * 由我们自己完成语义切换并 preventDefault，避免浏览器把这些字母当普通字符写入文档。
 *
 * @param editor TipTap Editor
 * @param place  进入 insert 的光标语义：
 *               - "i"    保持当前 cursor（在 cursor 前插入）
 *               - "a"    cursor 右移 1 格（在 cursor 后插入 / append）
 *               - "I"    当前行首非空白后插入
 *               - "A"    当前行尾插入
 *               - "o"    下方新开一行并进入 insert
 *               - "O"    上方新开一行并进入 insert
 *               - "s"    删除光标下字符并 insert (substitute char)
 *               - "S"    删除整行内容并在行首 insert (substitute line)
 */
export function enterTiptapInsertMode(
  editor: Editor,
  place: "i" | "a" | "I" | "A" | "o" | "O" | "s" | "S"
): void {
  try {
    const state = (editor.state as unknown) as import("prosemirror-state").EditorState;
    const view = (editor.view as unknown) as import("prosemirror-view").EditorView | undefined;
    if (!view || !state) return;
    const vimState = getVimStateFromEditorState(state) as any;
    if (!vimState) return;

    const doc = state.doc;
    const $cursor = (state.selection as unknown as { $anchor?: { pos: number } })?.$anchor ?? null;
    const head = (state.selection as unknown as { $head?: { pos: number } })?.$head?.pos ?? state.selection.from ?? 0;
    const anchor = state.selection.from ?? 0;
    const from = Math.min(head, anchor);
    const to = Math.max(head, anchor);
    const hasVisual = state.selection.from !== state.selection.to;

    let tr = state.tr;

    // visual 态下的 i/a/I/A：先退出 visual，折叠到 head，再进入 insert
    const wasVisual =
      vimState.mode === "visual" || vimState.mode === "visual-line" || hasVisual;
    if (wasVisual) {
      vimState.visualAnchor = null;
      vimState.visualHead = null;
      vimState.searchHighlightsVisible = false;
    }

    let targetPos = head;

    switch (place) {
      case "i": {
        // 保持 cursor 位置不变
        if (wasVisual) targetPos = from; // 选中时 i = 在选中块起始前插入
        break;
      }
      case "a": {
        // cursor 后移 1；如果是 visual/aic end 则停在 to
        if (wasVisual) {
          targetPos = to;
        } else {
          targetPos = Math.min(doc.content.size, $cursor ? $cursor.pos + 1 : head + 1);
        }
        break;
      }
      case "I": {
        // 行首：$from.before(1) -> 扫到该 paragraph 起点，跳过 leading 空白
        const $from = doc.resolve(from);
        const paraStart = $from.start($from.depth);
        // 跳 leading white space
        let pos = paraStart;
        const max = Math.min(paraStart + 200, $from.after($from.depth));
        while (pos < max) {
          const node = doc.nodeAt(pos);
          const ch = node ? (node.isText ? (node.text ?? "").charAt(0) : "") : "";
          if (ch === " " || ch === "\t" || ch === "\u00a0") pos += 1;
          else break;
        }
        targetPos = pos;
        break;
      }
      case "A": {
        const $from = doc.resolve(from);
        targetPos = $from.after($from.depth);
        break;
      }
      case "o": {
        // 下方插入新 paragraph；如果当前块不是 paragraph 也尽量走 split
        try {
          const $from = doc.resolve(from);
          const paraEnd = $from.after($from.depth);
          const paragraphType = state.schema.nodes.paragraph;
          const newPara = paragraphType?.create
            ? paragraphType.create()
            : null;
          if (newPara) {
            tr = tr.insert(paraEnd, newPara);
            const afterPara = paraEnd + 1; // newPara 的 start
            targetPos = Math.min(tr.doc.content.size, afterPara);
          } else {
            targetPos = paraEnd;
          }
        } catch {
          targetPos = head;
        }
        break;
      }
      case "O": {
        try {
          const $from = doc.resolve(from);
          const paraStart = $from.start($from.depth);
          const paragraphType = state.schema.nodes.paragraph;
          const newPara = paragraphType?.create ? paragraphType.create() : null;
          if (newPara) {
            tr = tr.insert(paraStart, newPara);
            // 插入后，新 paragraph 在当前 paraStart 位置
            const insertedStart = paraStart;
            const insertedEnd = insertedStart + 1;
            targetPos = Math.min(tr.doc.content.size, insertedStart < insertedEnd ? insertedEnd - 0 : insertedEnd);
            targetPos = Math.min(tr.doc.content.size, paraStart + 1);
          } else {
            targetPos = paraStart;
          }
        } catch {
          targetPos = head;
        }
        break;
      }
      case "s": {
        // substitute char：如果有 visual 选中则删除选中；否则删除 cursor 下 1 字符
        const dFrom = wasVisual ? from : head;
        const dTo = wasVisual ? to : Math.min(doc.content.size, head + 1);
        tr = tr.delete(dFrom, dTo);
        targetPos = dFrom;
        break;
      }
      case "S": {
        // substitute line：删除当前 paragraph 内容后在起点插入
        const $from = doc.resolve(from);
        const pStart = $from.start($from.depth);
        const pEnd = $from.after($from.depth);
        tr = tr.delete(pStart, pEnd);
        targetPos = pStart;
        break;
      }
    }

    vimState.mode = "insert";
    try {
      vimState.operatorPending = null;
      vimState.count = "";
      vimState.gPending = false;
    } catch {}

    targetPos = Math.max(0, Math.min(tr.doc.content.size, targetPos));
    tr = tr.setSelection(TextSelection.create(tr.doc, targetPos));
    view.dispatch(tr);
  } catch {
    // ignore
  }
}

function selectionHead(state: import("prosemirror-state").EditorState): number {
  try {
    return (state.selection as unknown as { $head?: { pos: number } })?.$head?.pos ?? state.selection.from ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 监听 editor transaction，将 vim-prose 模式同步到 VimProvider。
 * 返回清理函数（取消监听）。
 */
export function syncVimMode(
  editor: Editor,
  setMode: (mode: AppVimMode) => void
): () => void {
  const handler = () => {
    const mode = getVimMode(editor);
    setMode(mapVimMode(mode));
  };
  editor.on("transaction", handler);
  // 初始同步
  handler();
  return () => {
    editor.off("transaction", handler);
  };
}
