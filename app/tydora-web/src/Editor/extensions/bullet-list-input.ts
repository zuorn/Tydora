import { InputRule } from "@tiptap/core";
import BulletList from "@tiptap/extension-bullet-list";
import { findWrapping, canJoin } from "@tiptap/pm/transform";
import { TextSelection } from "@tiptap/pm/state";

// 复刻 tiptap 默认的 bulletList 输入规则（`- ` / `+ ` / `* ` 转列表），
// 并修复默认实现的一个缺陷：在【空段落】上输入 `- ` 时，
// ProseMirror 的 wrap 会"插入"一个空列表并把原空段落留在后面，
// 产生多余的尾随空块（<ul>...</ul><p></p>），导致后续输入像"换行"。
// 这里在空段落场景直接替换整个空段落，不产生尾随空块。
export const BulletListExt = BulletList.extend({
  addKeyboardShortcuts() {
    return {};
  },
  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: /^\s*([-+*])\s$/,
        handler: ({ state, range }) => {
          const { tr, schema } = state;

          const listItemType = schema.nodes.listItem;
          const paragraphType = schema.nodes.paragraph;
          if (!listItemType || !paragraphType) return null;

          // 在删除前判断：删除 `- ` 后当前段落是否为空，并记录段落边界。
          // 注意：必须在 delete 之前 resolve（删除后文档变短，旧的段落
          // 边界位置会越界，且空段落边界会被解析到 doc 层）。
          const $before = state.doc.resolve(range.from);
          const parent = $before.parent;
          const willBeEmpty =
            parent.type.name === "paragraph" && parent.content.size === range.to - range.from;
          const blockStart = $before.before();
          const blockEnd = $before.after();

          if (willBeEmpty) {
            // 空段落：不先 delete，直接在【原始文档】上用一次 replaceWith
            // 把整个段落（含 `- ` 标记文本）替换为 bulletList > listItem > paragraph，
            // 避免默认 wrap 在空段落留下多余的尾随空块。
            const bulletList = type.create(
              null,
              listItemType.create(null, paragraphType.create(null)),
            );
            tr.replaceWith(blockStart, blockEnd, bulletList);
            // bulletList open + listItem open + paragraph open 之后即内容开始
            const cursorPos = blockStart + 3;
            tr.setSelection(TextSelection.create(tr.doc, cursorPos, cursorPos));
          } else {
            // 非空段落：与 tiptap 默认 wrappingInputRule 行为一致
            tr.delete(range.from, range.to);
            const $start = tr.doc.resolve(range.from);
            const blockRange = $start.blockRange();
            const wrapping = blockRange && findWrapping(blockRange, type);
            if (!wrapping) return null;
            tr.wrap(blockRange, wrapping);
          }

          // 与前面的同类型列表合并（tiptap 默认行为）
          const before = tr.doc.resolve(range.from - 1).nodeBefore;
          if (before && before.type === type && canJoin(tr.doc, range.from - 1)) {
            tr.join(range.from - 1);
          }
          return undefined;
        },
      }),
    ];
  },
});
