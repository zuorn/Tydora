import { Extension } from "@tiptap/core";
import { addsCodeBlockToTableCell } from "./table-code-block-rule";

/**
 * 禁止在表格单元格里插入代码块。
 *
 * 拦截点在事务派发处，命令（右键菜单 / 快捷键）、``` 输入规则、粘贴、拖拽、
 * 程序化 insertContent 都会经过，因此无需在每个入口分别设防：
 * 会让「单元格内代码块」变多的事务直接丢弃，文档与光标保持原样。
 */
export const TableCellCodeBlockGuard = Extension.create({
  name: "tableCellCodeBlockGuard",

  dispatchTransaction({ transaction, next }) {
    if (addsCodeBlockToTableCell(transaction, this.editor.state.doc)) return;
    next(transaction);
  },
});
