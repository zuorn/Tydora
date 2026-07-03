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
    case "link": {
      const sel = window.getSelection();
      const text = sel?.toString() || "";
      if (text.includes("\n")) {
        const firstLine = text.split("\n")[0];
        if (!firstLine) return;
        const url = prompt("链接地址:", "https://");
        if (url) {
          // 处理多行：只处理第一行
          const md = (editor.storage as any).markdown.getMarkdown();
          const idx = md.indexOf(firstLine);
          if (idx !== -1) {
            const newMd = md.slice(0, idx) + "[" + firstLine + "](" + url + ")" + md.slice(idx + firstLine.length);
            editor.commands.setContent(newMd);
          }
        }
        return;
      }
      const url = prompt("链接地址:", "https://");
      if (url) {
        chain.setLink({ href: url }).run();
      }
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
