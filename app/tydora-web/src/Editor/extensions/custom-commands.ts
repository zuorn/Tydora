import type { Editor } from "@tiptap/core";
import { TextSelection } from "prosemirror-state";
import type { Node } from "prosemirror-model";

export function executeCommand(name: string, editor: Editor | null) {
  if (!editor) return;

  const chain = editor.chain().focus();

  // 标题
  if (name.startsWith("heading-")) {
    const level = parseInt(name.replace("heading-", "")) as 1 | 2 | 3 | 4 | 5 | 6;

    // 修复：粘贴的多行纯文本会被 hardBreak 节点连在同一个 paragraph 内，
    // 直接 toggleHeading 会把整段（含多行）都变成标题。
    // 这里在 toggleHeading 之前先把当前 paragraph 按 hardBreak 分裂为多个 paragraph，
    // 并把光标移到光标所在行对应的新 paragraph 末尾，使 toggleHeading 只作用于当前行。
    chain
      .command(({ tr, state }) => {
        const { selection, schema } = state;
        const $pos = selection.$from;

        // 仅在光标（collapsed selection）、位于 paragraph 内、含 hardBreak 时分裂
        let hasHardBreak = false;
        $pos.parent.content.forEach((n: Node) => {
          if (n.type.name === "hardBreak") hasHardBreak = true;
        });
        const needSplit =
          selection.empty &&
          $pos.parent.type.name === "paragraph" &&
          hasHardBreak;

        // 不满足条件时不修改任何事务，让后续 toggleHeading 按原行为执行
        if (!needSplit) return true;

        const paragraph = $pos.parent;
        const offset = $pos.parentOffset;

        // 按 hardBreak 把 paragraph content 分裂为多行，并计算光标所在行索引
        let lineIdx = 0;
        let pos = 0;
        const lines: Node[][] = [];
        let current: Node[] = [];

        paragraph.content.forEach((node: Node) => {
          if (node.type.name === "hardBreak") {
            // 光标在 hardBreak 之后（offset > pos）时属于下一行
            if (offset > pos) lineIdx++;
            lines.push(current);
            current = [];
          } else {
            current.push(node);
          }
          pos += node.nodeSize;
        });
        lines.push(current);

        // 为每行创建新的 paragraph 节点
        const newParagraphs: Node[] = lines.map((content) =>
          schema.nodes.paragraph.create(null, content)
        );

        const paraStart = $pos.before($pos.depth);
        const paraEnd = paraStart + paragraph.nodeSize;

        // 用新的 paragraphs 替换原 paragraph
        tr.replaceWith(paraStart, paraEnd, newParagraphs);

        // 计算光标所在行的新 paragraph 起止位置
        let targetParaStart = paraStart;
        for (let i = 0; i < lineIdx; i++) {
          targetParaStart += newParagraphs[i].nodeSize;
        }
        const targetParaEnd =
          targetParaStart + newParagraphs[lineIdx].nodeSize;

        // 把光标移到目标 paragraph 末尾（closing tag 之前）
        const $targetEnd = tr.doc.resolve(targetParaEnd - 1);
        tr.setSelection(TextSelection.near($targetEnd, -1));

        return true;
      })
      .toggleHeading({ level })
      .run();
    return;
  }

  switch (name) {
    case "paragraph":
      chain.setParagraph().run();
      break;

    // 行内格式
    case "bold":
      chain.toggleBold().run();
      break;
    case "italic":
      chain.toggleItalic().run();
      break;
    case "strike":
      chain.toggleStrike().run();
      break;
    case "inline-code":
      chain.toggleCode().run();
      break;
    case "highlight":
      chain.toggleHighlight().run();
      break;
    case "link": {
      const sel = window.getSelection();
      const defaultText = sel?.toString() || "";
      // 触发弹窗事件，让 TipTapEditor 组件显示 LinkDialog
      window.dispatchEvent(new CustomEvent("link-dialog-open", {
        detail: { defaultText }
      }));
      break;
    }

    // 块级格式
    case "quote":
      chain.toggleBlockquote().run();
      break;
    case "list":
      chain.toggleBulletList().run();
      break;
    case "ordered-list":
      chain.toggleOrderedList().run();
      break;
    case "check":
      chain.toggleTaskList().run();
      break;
    case "indent":
      chain.sinkListItem("listItem").run();
      break;
    case "outdent":
      chain.liftListItem("listItem").run();
      break;
    case "task-toggle": {
      const { state } = editor;
      const { from } = state.selection;
      const node = state.doc.nodeAt(from);
      if (node && node.type.name === "taskItem") {
        const checked = node.attrs.checked;
        editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(from, undefined, { checked: !checked });
          return true;
        }).run();
      }
      break;
    }
    case "code":
      chain.toggleCodeBlock().run();
      break;
    case "hr":
      chain.setHorizontalRule().run();
      break;

    // 表格
    case "table":
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      break;
    case "table-row-above":
      chain.addRowBefore().run();
      break;
    case "table-row-below":
      chain.addRowAfter().run();
      break;
    case "table-col-left":
      chain.addColumnBefore().run();
      break;
    case "table-col-right":
      chain.addColumnAfter().run();
      break;
    case "table-row-delete":
      chain.deleteRow().run();
      break;
    case "table-col-delete":
      chain.deleteColumn().run();
      break;
    case "table-align-left":
      editor.chain().focus().command(({ tr, state }) => {
        const { $from } = state.selection;
        const cell = $from.node(-1);
        if (cell && (cell.type.name === "tableCell" || cell.type.name === "tableHeader")) {
          tr.setNodeMarkup($from.before(-1), undefined, { ...cell.attrs, textAlign: "left" });
          return true;
        }
        return false;
      }).run();
      break;
    case "table-align-center":
      editor.chain().focus().command(({ tr, state }) => {
        const { $from } = state.selection;
        const cell = $from.node(-1);
        if (cell && (cell.type.name === "tableCell" || cell.type.name === "tableHeader")) {
          tr.setNodeMarkup($from.before(-1), undefined, { ...cell.attrs, textAlign: "center" });
          return true;
        }
        return false;
      }).run();
      break;
    case "table-align-right":
      editor.chain().focus().command(({ tr, state }) => {
        const { $from } = state.selection;
        const cell = $from.node(-1);
        if (cell && (cell.type.name === "tableCell" || cell.type.name === "tableHeader")) {
          tr.setNodeMarkup($from.before(-1), undefined, { ...cell.attrs, textAlign: "right" });
          return true;
        }
        return false;
      }).run();
      break;

    // 编辑
    case "undo":
      chain.undo().run();
      break;
    case "redo":
      chain.redo().run();
      break;

    // 其他
    case "footnotes":
      chain.insertContent("[^1]: ").run();
      break;
    case "math": {
      // 打开公式编辑弹窗（含实时预览），确认后插入块级公式
      window.dispatchEvent(
        new CustomEvent("math-dialog-open", {
          detail: { latex: "", block: true },
        })
      );
      break;
    }
    case "wiki-link": {
      const { from } = editor.state.selection;
      chain.insertContent("[[").run();
      // 手动触发 WikiLink 自动补全
      // from 是 [[ 插入前的位置，即 [[ 的起始位置
      let screenPos: { x: number; y: number } | null = null;
      try {
        const coords = editor.view.coordsAtPos(from);
        if (coords) {
          screenPos = { x: coords.left, y: coords.bottom };
        }
      } catch {}
      window.dispatchEvent(new CustomEvent("wiki-link-trigger", {
        detail: {
          query: "",
          editorPosition: from,
          screenPosition: screenPos,
        }
      }));
      break;
    }

    // 剪贴板
    case "cut":
      document.execCommand("cut");
      break;
    case "copy":
      document.execCommand("copy");
      break;
    case "paste":
      document.execCommand("paste");
      break;
    case "delete":
      chain.deleteSelection().run();
      break;

    // 上传图像
    case "upload": {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = async () => {
        const files = input.files;
        if (!files) return;
        for (const file of Array.from(files)) {
          // 触发自定义事件让父组件处理
          window.dispatchEvent(new CustomEvent("image-upload-file", {
            detail: { file }
          }));
        }
      };
      input.click();
      break;
    }
  }
}
