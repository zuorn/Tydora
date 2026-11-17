/**
 * 「表格单元格内不得放代码块」的判定规则（纯函数，便于 node 直接跑单测）。
 *
 * 为什么要拦：tiptap-markdown 的 table 序列化只把每个单元格的 firstChild 当行内
 * 内容渲染，代码块的围栏和换行会被直接写进表格行；单元格一旦有多个块则整张表退化
 * 成 HTML。两种情况都回不了 Markdown。TipTap 的 tableCell / tableHeader
 * content 是 "block+"，schema 层并不禁止，所以只能在事务层拦。
 *
 * 判定方式是「违规数量是否因本次事务增加」，而不是「文档里有没有违规」：
 * 删除或拆出历史遗留的代码块时切片里没有 codeBlock 节点，违规数也不会下降，
 * 因此老文档里已存在的违规内容仍可正常编辑和清理。
 */
import type { Node as PMNode, Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

const FORBIDDEN_BLOCK = "codeBlock";
const CELL_NODES = new Set(["tableCell", "tableHeader"]);

/** 单元格直接子级里的代码块数量（嵌套在引用块等里面的不计，插入路径不会产生） */
export function countCodeBlocksInTableCell(doc: PMNode): number {
  let count = 0;
  doc.descendants((node, _pos, parent) => {
    if (node.type.name === FORBIDDEN_BLOCK && parent && CELL_NODES.has(parent.type.name)) {
      count++;
      return false;
    }
    return true;
  });
  return count;
}

/** 事务的某个步骤是否试图把代码块节点放进文档（删除/改写代码块的切片是空的或段落） */
export function transactionCarriesCodeBlock(tr: Transaction): boolean {
  const hasForbidden = (node: PMNode): boolean => {
    if (node.type.name === FORBIDDEN_BLOCK) return true;
    let found = false;
    node.descendants((child) => {
      if (child.type.name === FORBIDDEN_BLOCK) {
        found = true;
        return false;
      }
      return true;
    });
    return found;
  };
  const sliceCarries = (slice: Slice | undefined): boolean => {
    if (!slice || slice.size === 0) return false;
    let found = false;
    slice.content.forEach((node) => {
      if (found) return false;
      if (hasForbidden(node)) {
        found = true;
        return false;
      }
      return true;
    });
    return found;
  };

  for (const step of tr.steps) {
    const slice = (step as { slice?: Slice }).slice;
    if (sliceCarries(slice)) return true;
  }
  return false;
}

/**
 * 本次事务是否会新增「单元格内的代码块」。
 * @param beforeDoc 事务生效前的文档（dispatch 时编辑器状态里的就是它）
 */
export function addsCodeBlockToTableCell(tr: Transaction, beforeDoc: PMNode): boolean {
  if (!tr.docChanged || !transactionCarriesCodeBlock(tr)) return false;
  return countCodeBlocksInTableCell(tr.doc) > countCodeBlocksInTableCell(beforeDoc);
}
