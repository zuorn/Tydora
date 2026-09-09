/**
 * 临时验证脚本：校验 markdown-position-map 的光标映射逻辑。
 * 使用 prosemirror-markdown 的默认序列化器构造“伪编辑器”，
 * 验证 IR↔SV 双向映射的往返一致性（round-trip）与已知位置。
 */
import { defaultMarkdownSerializer } from "prosemirror-markdown";
import { Schema } from "prosemirror-model";
import {
  buildPositionMap,
  mdOffsetToPmPos,
  pmPosToMdOffset,
  type MarkdownPositionMap,
} from "../app/tydora-web/src/Editor/markdown-position-map";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", parseDOM: [{ tag: "p" }] },
    heading: { content: "inline*", group: "block", attrs: { level: { default: 1 } }, parseDOM: [{ tag: "h1" }] },
    blockquote: { content: "block+", group: "block", parseDOM: [{ tag: "blockquote" }] },
    bullet_list: { content: "list_item+", group: "block", parseDOM: [{ tag: "ul" }] },
    list_item: { content: "paragraph block*", parseDOM: [{ tag: "li" }] },
    code_block: { content: "text*", group: "block", attrs: { params: { default: "" } }, parseDOM: [{ tag: "pre" }] },
    hard_break: { inline: true, group: "inline", parseDOM: [{ tag: "br" }] },
    text: { group: "inline" },
  },
  marks: {
    em: { parseDOM: [{ tag: "i" }] },
    strong: { parseDOM: [{ tag: "b" }] },
    link: { attrs: { href: {}, title: { default: null } }, inclusive: false, parseDOM: [{ tag: "a" }] },
    code: { parseDOM: [{ tag: "code" }] },
  },
});

function makeDoc() {
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "bold", marks: [{ type: "strong" }] },
          { type: "text", text: " and " },
          { type: "text", text: "italic", marks: [{ type: "em" }] },
          { type: "text", text: " world" },
        ],
      },
      {
        type: "bullet_list",
        content: [
          {
            type: "list_item",
            content: [{ type: "paragraph", content: [{ type: "text", text: "item one" }] }],
          },
          {
            type: "list_item",
            content: [{ type: "paragraph", content: [{ type: "text", text: "item two" }] }],
          },
        ],
      },
      {
        type: "code_block",
        attrs: { params: "js" },
        content: [{ type: "text", text: "const x = 1;\nconsole.log(x);" }],
      },
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "quote line" }] }],
      },
    ],
  });
}

function makeEditor(doc: any) {
  return {
    state: { doc },
    storage: { markdown: { serializer: defaultMarkdownSerializer } },
  };
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("  FAIL:", msg);
  }
}

function verifyRoundTrip(map: MarkdownPositionMap, doc: any) {
  const docSize = doc.content.size;
  const md = defaultMarkdownSerializer.serialize(doc);
  check(map.markers[map.markers.length - 1].md === md.length, `末尾 marker md(${map.markers[map.markers.length - 1].md}) === markdown 长度(${md.length})`);
  check(map.docSize === docSize, `docSize(${map.docSize}) === ${docSize}`);

  // 单调性：pmPos 与 md 都单调不减（md 相邻允许相等，不出现回退）
  for (let i = 1; i < map.markers.length; i++) {
    check(
      map.markers[i].pmPos >= map.markers[i - 1].pmPos && map.markers[i].md >= map.markers[i - 1].md,
      `markers[${i}] 单调 (${JSON.stringify(map.markers[i])} >= ${JSON.stringify(map.markers[i - 1])})`,
    );
  }

  // 收集文本节点开区间（不含起始/结束边界），用于限定“文本内部必须精确”
  const textRanges: Array<[number, number]> = [];
  doc.descendants((node: any, pos: number) => {
    if (node.isText) textRanges.push([pos, pos + node.nodeSize]);
  });

  // 往返一致性：md → pm → md 应回到原位置。
  // 文本内部必须精确；节点边界（块/列表项起止等）不占 md 字符，会被就近
  // 吸附到相邻文本，因此允许少量误差（≤2）。
  let maxErr = 0;
  let maxTextErr = 0;
  let firstErr: string | null = null;
  const detail: string[] = [];
  for (let pos = 0; pos <= docSize; pos++) {
    const mdOff = pmPosToMdOffset(map, pos);
    const back = mdOffsetToPmPos(map, mdOff);
    const err = Math.abs(back - pos);
    if (err > maxErr) maxErr = err;
    const insideText = textRanges.some(([a, b]) => pos > a && pos < b);
    if (err > 0) {
      detail.push(`pos=${pos} → md=${mdOff} → back=${back}`);
      if (insideText && err > maxTextErr) maxTextErr = err;
    }
    if (back !== pos && !firstErr) firstErr = `pos=${pos} → md=${mdOff} → back=${back}`;
  }
  console.log("  round-trip 最大误差:", maxErr, "| 文本内部最大误差:", maxTextErr);
  console.log("  全部误差位置:", detail.join(", ") || "无");
  check(maxTextErr <= 0, `文本内部往返误差应为 0，实际 ${maxTextErr}（首处: ${firstErr}）`);
  check(maxErr <= 2, `全部位置往返最大误差应 ≤ 2（仅节点边界），实际 ${maxErr}（首处: ${firstErr}）`);
}

function verifyKnownPositions(map: MarkdownPositionMap, doc: any) {
  const md = defaultMarkdownSerializer.serialize(doc);
  const textNodes: Array<{ text: string; pos: number }> = [];
  doc.descendants((node: any, pos: number) => {
    if (node.isText) textNodes.push({ text: node.text, pos });
  });

  const findText = (t: string) => textNodes.find((n) => n.text === t)?.pos;

  const assertMdAtPmPos = (pmPos: number | undefined, expectedMd: number, label: string) => {
    if (pmPos === undefined) {
      check(false, `${label}: 未找到对应文本节点`);
      return;
    }
    const got = pmPosToMdOffset(map, pmPos);
    check(got === expectedMd, `${label}: pmPos=${pmPos} → md=${got}，期望 ${expectedMd}`);
  };

  // 标题文本起点：md 偏移 = 2（"# " 之后）
  assertMdAtPmPos(findText("Title"), 2, "标题文本起点");
  // bold 起点：md 偏移 = "## " 后的 "**" 之后
  const boldPm = findText("bold");
  const boldExpected = md.indexOf("**") + 2;
  assertMdAtPmPos(boldPm, boldExpected, "bold 起点");
  // italic 起点：md 偏移 = 紧随其后的 "italic"
  const italicPm = findText("italic");
  assertMdAtPmPos(italicPm, md.indexOf("italic"), "italic 起点");
  // 代码块内容起点：md 偏移 = ```js\n 之后
  const codePm = findText("const x = 1;\nconsole.log(x);");
  const codeExpected = md.indexOf("const x = 1;");
  assertMdAtPmPos(codePm, codeExpected, "code_block 内容起点");
  // 代码块内容中间
  assertMdAtPmPos(codePm !== undefined ? codePm + 4 : undefined, codeExpected + 4, "code_block 内容中间");
  // 引用块文本起点
  assertMdAtPmPos(findText("quote line"), md.indexOf("quote line"), "blockquote 文本起点");
}

const doc = makeDoc();
const map = buildPositionMap(makeEditor(doc));
process.stderr.write("markers 数量: " + map.markers.length + "\n");
process.stderr.write("markers: " + JSON.stringify(map.markers.slice(0, 30)) + "\n");
process.stderr.write("markdown: " + JSON.stringify(defaultMarkdownSerializer.serialize(doc)) + "\n");

verifyRoundTrip(map, doc);
verifyKnownPositions(map, doc);

if (failures === 0) {
  console.log("\n全部通过 ✓");
} else {
  console.error(`\n${failures} 处失败 ✗`);
  process.exit(1);
}
