/**
 * 表格单元格内代码块拦截规则单元测试。
 *
 * 回归目标：单元格里的代码块无法序列化回 Markdown 表格行（会拆坏整张表），
 * 但 TipTap 的 tableCell/tableHeader content 是 "block+"，schema 不拦，
 * 所以规则必须自己分清「放进单元格的代码块」和「其他一切改动」。
 *
 * 运行：node --experimental-strip-types <本文件>
 */
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import {
  addsCodeBlockToTableCell,
  countCodeBlocksInTableCell,
  transactionCarriesCodeBlock,
} from "./table-code-block-rule.ts";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: { group: "inline" },
    codeBlock: { group: "block", content: "text*", code: true },
    table: { group: "block", content: "tableRow+" },
    tableRow: { content: "(tableCell | tableHeader)*", tableRole: "row" },
    tableCell: { content: "block+", tableRole: "cell", isolating: true },
    tableHeader: { content: "block+", tableRole: "header_cell", isolating: true },
  },
});

const p = (t: string) => schema.nodes.paragraph.create(null, t ? schema.text(t) : undefined);
const cb = (t: string) => schema.nodes.codeBlock.create(null, t ? schema.text(t) : undefined);
const cell = (...blocks: ReturnType<typeof p>[]) => schema.nodes.tableCell.create(null, blocks);
const row = (...cells: ReturnType<typeof cell>[]) => schema.nodes.tableRow.create(null, cells);
const table = (...rows: ReturnType<typeof row>[]) => schema.nodes.table.create(null, rows);
const docOf = (...blocks: ReturnType<typeof p>[]) => schema.nodes.doc.create(null, blocks);

// 文档：段落 + 一张 1×2 表格
const plainDoc = docOf(p("before"), table(row(cell(p("a")), cell(p("b")))), p("after"));
const cellParaPos = 11; // 第一个单元格内段落的起点（doc>table>row>cell 各占 1）
const outsideParaPos = 0;
const cellParaEnd = cellParaPos + p("a").nodeSize;

// 文档：单元格里已经有一个历史遗留代码块（拦截规则不应因此冻结文档）
const legacyDoc = docOf(table(row(cell(cb("legacy")))));
const legacyCbPos = 3;
const legacyCbEnd = legacyCbPos + cb("legacy").nodeSize;

const plainState = EditorState.create({ doc: plainDoc, schema });
const legacyState = EditorState.create({ doc: legacyDoc, schema });

console.log("countCodeBlocksInTableCell");
assertEqual(countCodeBlocksInTableCell(plainDoc), 0, "普通表格计数为 0");
assertEqual(countCodeBlocksInTableCell(legacyDoc), 1, "历史遗留单元格代码块计数为 1");

console.log("应拦截");
assertEqual(
  addsCodeBlockToTableCell(plainState.tr.replaceWith(cellParaPos, cellParaEnd, cb("x")), plainDoc),
  true,
  "单元格内插入代码块",
);
assertEqual(
  addsCodeBlockToTableCell(plainState.tr.setBlockType(cellParaPos, cellParaEnd, schema.nodes.codeBlock), plainDoc),
  true,
  "单元格内段落转成代码块（toggleCodeBlock / setBlockType 路径）",
);
assertEqual(
  addsCodeBlockToTableCell(plainState.tr.insert(cellParaEnd, cb("x")), plainDoc),
  true,
  "单元格内追加代码块",
);
assertEqual(
  addsCodeBlockToTableCell(legacyState.tr.replaceWith(legacyCbPos, legacyCbPos, cb("second")), legacyDoc),
  true,
  "已有一个违规代码块时再插入第二个",
);

console.log("不应拦截");
assertEqual(
  addsCodeBlockToTableCell(plainState.tr.replaceWith(outsideParaPos, outsideParaPos + p("before").nodeSize, cb("x")), plainDoc),
  false,
  "表格外插入代码块",
);
assertEqual(addsCodeBlockToTableCell(plainState.tr.insertText("z", cellParaPos + 1), plainDoc), false, "单元格内打字");
assertEqual(
  addsCodeBlockToTableCell(plainState.tr.insertText("z", cellParaPos + 1), plainDoc) &&
    transactionCarriesCodeBlock(plainState.tr.insertText("z", cellParaPos + 1)),
  false,
  "打字事务本身不携带代码块切片",
);
assertEqual(
  addsCodeBlockToTableCell(legacyState.tr.delete(legacyCbPos, legacyCbEnd), legacyDoc),
  false,
  "删除历史遗留代码块（清理路径必须放行）",
);
assertEqual(
  addsCodeBlockToTableCell(legacyState.tr.setBlockType(legacyCbPos, legacyCbEnd, schema.nodes.paragraph), legacyDoc),
  false,
  "历史遗留代码块转回段落",
);
assertEqual(
  addsCodeBlockToTableCell(
    legacyState.tr.replaceWith(legacyCbPos, legacyCbEnd, p("plain")),
    legacyDoc,
  ),
  false,
  "历史遗留代码块整体替换为段落",
);
assertEqual(addsCodeBlockToTableCell(plainState.tr.insertText("", cellParaPos), plainDoc), false, "空文本插入");
assertEqual(
  addsCodeBlockToTableCell(plainState.tr.delete(cellParaPos, cellParaEnd), plainDoc),
  false,
  "删除单元格段落",
);

console.log("单元格内的非代码块块级节点不受影响");
assertEqual(
  addsCodeBlockToTableCell(plainState.tr.insert(cellParaEnd, schema.nodes.table.create(null, [row(cell(p("inner")))])), plainDoc),
  false,
  "单元格里插入嵌套表格（规则只针对代码块）",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
