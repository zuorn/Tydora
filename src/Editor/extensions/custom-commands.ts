import type { Editor } from "@tiptap/core";

export function executeCommand(name: string, editor: Editor | null) {
  if (!editor) return;

  const chain = editor.chain().focus();

  // 标题
  if (name.startsWith("heading-")) {
    const level = parseInt(name.replace("heading-", "")) as 1 | 2 | 3 | 4 | 5 | 6;
    chain.toggleHeading({ level }).run();
    return;
  }

  switch (name) {
    case "paragraph":
      chain.setParagraph().run();
      break;

    // 行内格式：有选区时先应用标记再清除 stored marks，避免后续输入继承标记
    case "bold": {
      const hadSelection = !editor.state.selection.empty;
      chain.toggleBold().run();
      if (hadSelection) editor.chain().unsetBold().run();
      break;
    }
    case "italic": {
      const hadSelection = !editor.state.selection.empty;
      chain.toggleItalic().run();
      if (hadSelection) editor.chain().unsetItalic().run();
      break;
    }
    case "strike": {
      const hadSelection = !editor.state.selection.empty;
      chain.toggleStrike().run();
      if (hadSelection) editor.chain().unsetStrike().run();
      break;
    }
    case "inline-code": {
      const hadSelection = !editor.state.selection.empty;
      chain.toggleCode().run();
      if (hadSelection) editor.chain().unsetCode().run();
      break;
    }
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
    case "math":
      chain.insertContent("$$\n\n$$").run();
      break;

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
