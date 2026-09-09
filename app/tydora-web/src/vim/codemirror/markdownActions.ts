// src/vim/codemirror/markdownActions.ts
// CodeMirror 源码模式下的 Markdown 格式化动作。
// 与 TipTap 的 executeCommand 对应——TipTap 走 ProseMirror schema，
// CodeMirror 直接插入/包裹 Markdown 语法。
//
// 设计：每个动作接收 EditorView，操作当前选区或光标位置。
// 复用于 Leader 菜单的 editor.* 动作。

import type { EditorView } from "@codemirror/view";

/** 用指定前后缀包裹当前选区；无选区时插入占位并选中 */
function wrapSelection(view: EditorView, before: string, after: string = before): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);
  const insert = before + selected + after;
  view.dispatch({
    changes: { from, to, insert },
    selection: selected
      ? { anchor: from + before.length, head: from + before.length + selected.length }
      : { anchor: from + before.length, head: from + before.length },
  });
  view.focus();
}

/** 在行首插入前缀（如 # / - / >）；多行则每行加 */
function prefixLines(view: EditorView, prefix: string): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const lineFrom = state.doc.lineAt(from);
  const lineTo = state.doc.lineAt(to);
  const changes: { from: number; insert: string }[] = [];
  for (let l = lineFrom.number; l <= lineTo.number; l++) {
    const line = state.doc.line(l);
    changes.push({ from: line.from, insert: prefix });
  }
  view.dispatch({ changes });
  view.focus();
}

/** 移除行首前缀（如 # / - / > ），用于 toggle */
function unprefixLines(view: EditorView, prefixRegex: RegExp): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const lineFrom = state.doc.lineAt(from);
  const lineTo = state.doc.lineAt(to);
  const changes: { from: number; to: number }[] = [];
  for (let l = lineFrom.number; l <= lineTo.number; l++) {
    const line = state.doc.line(l);
    const m = line.text.match(prefixRegex);
    if (m) {
      changes.push({ from: line.from, to: line.from + m[0].length });
    }
  }
  if (changes.length) view.dispatch({ changes });
  view.focus();
}

/** 切换行首前缀：有则移除，无则添加 */
function toggleLinePrefix(view: EditorView, prefix: string, prefixRegex: RegExp): void {
  const { state } = view;
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  if (prefixRegex.test(line.text)) {
    unprefixLines(view, prefixRegex);
  } else {
    prefixLines(view, prefix);
  }
}

/**
 * 执行 CodeMirror 下的 editor.* 动作。
 * @param actionId 动作 id（与 shortcuts.json editor 段一致，如 "bold"）
 * @param view CodeMirror EditorView
 * @returns 是否已处理（未知动作返回 false）
 */
export function executeCodeMirrorAction(actionId: string, view: EditorView): boolean {
  switch (actionId) {
    case "bold":
      wrapSelection(view, "**");
      return true;
    case "italic":
      wrapSelection(view, "*");
      return true;
    case "strike":
      wrapSelection(view, "~~");
      return true;
    case "inline-code":
      wrapSelection(view, "`");
      return true;
    case "highlight":
      wrapSelection(view, "==");
      return true;
    case "link":
      // [text](url)；无选区时占位 "链接文本"，光标停在 url 处待输入
      {
        const { state } = view;
        const { from, to } = state.selection.main;
        const selected = state.sliceDoc(from, to);
        const text = selected || "链接文本";
        const insert = `[${text}](url)`;
        const urlStart = from + text.length + 3; // `[text](` 的长度
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: urlStart, head: urlStart + 3 },
        });
        view.focus();
      }
      return true;
    case "code-block":
      wrapSelection(view, "```\n", "\n```");
      return true;
    case "quote":
      toggleLinePrefix(view, "> ", /^>\s?/);
      return true;
    case "hr":
      // 在当前行下方插入分隔线
      {
        const { state } = view;
        const line = state.doc.lineAt(state.selection.main.from);
        view.dispatch({
          changes: { from: line.to, insert: "\n\n---\n" },
        });
        view.focus();
      }
      return true;
    case "unordered-list":
      toggleLinePrefix(view, "- ", /^[-*+]\s+/);
      return true;
    case "ordered-list":
      toggleLinePrefix(view, "1. ", /^\d+\.\s+/);
      return true;
    case "check-list":
      toggleLinePrefix(view, "- [ ] ", /^-\s\[[\sx]\]\s/);
      return true;
    case "task-toggle":
      // 切换 - [ ] ↔ - [x]
      {
        const { state } = view;
        const line = state.doc.lineAt(state.selection.main.from);
        const m = line.text.match(/^(-\s\[)([\sx])(\]\s)/);
        if (m) {
          const newMark = m[2] === " " ? "x" : " ";
          view.dispatch({
            changes: {
              from: line.from + m[1].length,
              to: line.from + m[1].length + 1,
              insert: newMark,
            },
          });
        }
        view.focus();
      }
      return true;
    case "heading-1":
      toggleLinePrefix(view, "# ", /^#{1,6}\s+/);
      return true;
    case "heading-2":
      toggleLinePrefix(view, "## ", /^#{1,6}\s+/);
      return true;
    case "heading-3":
      toggleLinePrefix(view, "### ", /^#{1,6}\s+/);
      return true;
    case "heading-4":
      toggleLinePrefix(view, "#### ", /^#{1,6}\s+/);
      return true;
    case "heading-5":
      toggleLinePrefix(view, "##### ", /^#{1,6}\s+/);
      return true;
    case "heading-6":
      toggleLinePrefix(view, "###### ", /^#{1,6}\s+/);
      return true;
    case "paragraph":
      // 移除行首 # 前缀
      unprefixLines(view, /^#{1,6}\s+/);
      return true;
    default:
      return false;
  }
}
