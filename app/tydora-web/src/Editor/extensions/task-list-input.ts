import { InputRule } from "@tiptap/core";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type MarkdownIt from "markdown-it";
import taskListPlugin from "markdown-it-task-lists";

// 输入 `- [ ] ` / `- [x] ` 的即时渲染转换：
// 1. 输入 `- ` 时 BulletList 的 inputRule 会先把行转换为 bulletList > listItem；
// 2. 继续输入 `[ ] ` / `[x] ` 后，这里把当前 bulletList 升级为 taskList，
//    使行首渲染为 checkbox（Obsidian 即时渲染同款行为）。
//
// @tiptap/extension-list v3 的 TaskItem 自带 inputRule（wrappingInputRule），
// 它在 listItem 内会把当前 paragraph 再包一层 taskItem，产生
// bulletList > listItem > taskItem 的错误嵌套，而不是生成 taskList，
// 因此这里将其禁用，统一由 TaskList 的 inputRule 处理。
export const TaskItemExt = TaskItem.extend({
  addInputRules() {
    return [];
  },
});

// 匹配当前块内文本为 `[ ] ` / `[x] `（可带 `- ` / `+ ` / `* ` 前缀，
// 覆盖 bulletList 升级与顶层段落兜底两种场景）
const taskListInputRegex = /^\s*(?:[-+*]\s)?\[([ xX])\]\s$/;

// 光标在内容中的偏移 = 原偏移 - open token - 已删除的标记文本长度
function contentOffset(parentOffset: number, rangeFrom: number, rangeTo: number): number {
  return Math.max(0, parentOffset - 1 - (rangeTo - rangeFrom));
}

// 自定义 markdown-it 插件，处理 [ ] / [x] / [X] 没有尾随空格的空任务项
//（markdown-it 对空的 inline content 会 trim 掉末尾空格，导致
// 原始的 markdown-it-task-lists 插件无法识别）
function customEmptyTaskLists(md: MarkdownIt, _options?: any) {
  (md as any).core.ruler.after("inline", "task_lists_empty", (state: any) => {
    const TokenConstructor = state.Token;
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length - 1; i++) {
      if (isTodoItemEmpty(tokens, i) && !isAlreadyTaskList(tokens[i])) {
        todoifyEmpty(tokens[i], TokenConstructor);
        attrSet(tokens[i - 2], "class", "task-list-item");
        const parentIdx = parentToken(tokens, i - 2);
        if (parentIdx >= 0) {
          attrSet(tokens[parentIdx], "class", "contains-task-list");
        }
      }
    }
  });

  function parentToken(tokens: any[], index: number) {
    const targetLevel = tokens[index].level - 1;
    for (let i = index - 1; i >= 0; i--) {
      if (tokens[i].level === targetLevel) {
        return i;
      }
    }
    return -1;
  }

  function isTodoItemEmpty(tokens: any[], index: number) {
    return (
      isInline(tokens[index]) &&
      isParagraph(tokens[index - 1]) &&
      isListItem(tokens[index - 2]) &&
      isEmptyTodoMarkdown(tokens[index])
    );
  }

  function isAlreadyTaskList(token: any) {
    return (
      token.children &&
      token.children.length > 0 &&
      token.children[0].type === "html_inline" &&
      token.children[0].content.includes("task-list-item-checkbox")
    );
  }

  function isInline(token: any) {
    return token.type === "inline";
  }

  function isParagraph(token: any) {
    return token.type === "paragraph_open";
  }

  function isListItem(token: any) {
    return token.type === "list_item_open";
  }

  function isEmptyTodoMarkdown(token: any) {
    return (
      token.content === "[ ]" || token.content === "[x]" || token.content === "[X]"
    );
  }

  function todoifyEmpty(token: any, TokenConstructor: any) {
    token.children.unshift(makeCheckboxEmpty(token, TokenConstructor));
    if (token.children[1]) {
      token.children[1].content = token.children[1].content.slice(3);
    }
    token.content = token.content.slice(3);
    attrSet(token, "class", "task-list-item");
  }

  function makeCheckboxEmpty(token: any, TokenConstructor: any) {
    const checkbox = new TokenConstructor("html_inline", "", 0);
    const disabledAttr =
      token.type === "bullet_list_open" ? 'disabled="" ' : "";
    if (token.content === "[ ]") {
      checkbox.content =
        '<input class="task-list-item-checkbox" ' +
        disabledAttr +
        'type="checkbox">';
    } else if (token.content === "[x]" || token.content === "[X]") {
      checkbox.content =
        '<input class="task-list-item-checkbox" ' +
        disabledAttr +
        'checked="" type="checkbox">';
    }
    return checkbox;
  }

  function attrSet(token: any, name: string, value: string) {
    const index = token.attrs
      ? token.attrs.findIndex((attr: any) => attr[0] === name)
      : -1;
    if (index < 0) {
      token.attrPush([name, value]);
    } else {
      token.attrs[index][1] = value;
    }
  }
}

export const TaskListExt = TaskList.extend({
  addAttributes() {
    return {
      // 与 tiptap-markdown 的 MarkdownTightLists 对 bulletList/orderedList 的处理
      // 保持一致：让序列化器 renderList 识别为紧凑列表，避免 IR 模式下输入/生成的
      // 任务列表在切换到源码模式时每项之间出现空行（prosemirror-markdown 的
      // renderList 在节点没有 tight 属性时回退到 tightLists=false 的宽松渲染）。
      tight: {
        default: true,
        parseHTML: (element) =>
          element.getAttribute("data-tight") === "true" ||
          !element.querySelector("p"),
        renderHTML: (attributes) => ({
          "data-tight": attributes.tight ? "true" : null,
        }),
      },
    };
  },
  addInputRules() {
    return [
      new InputRule({
        find: taskListInputRegex,
        handler: ({ state, range, match }) => {
          const { tr, schema } = state;
          const $from = state.doc.resolve(range.from);
          const checked = match[1].toLowerCase() === "x";

          const taskListType = schema.nodes.taskList;
          const taskItemType = schema.nodes.taskItem;
          if (!taskListType || !taskItemType) return null;

          // —— 结构检查（在修改 tr 之前完成，失败时返回 null 不产生任何变更）——
          if ($from.parent.type.name !== "paragraph") return null;

          // 当前光标是否位于某个 listItem 内（记录其深度）
          let listItemDepth = -1;
          for (let d = $from.depth - 1; d >= 1; d--) {
            if ($from.node(d).type.name === "listItem") {
              listItemDepth = d;
              break;
            }
          }

          // 情况 A：bulletList > listItem > paragraph → 将整个 bulletList 升级为 taskList
          if (listItemDepth !== -1) {
            if ($from.node(listItemDepth - 1).type.name !== "bulletList") return null;
            // 注意：index(depth) 返回的是该层节点的子节点索引，
            // 要取 listItem 在 bulletList 中的索引需用 index(listItemDepth - 1)
            const currentIndex = $from.index(listItemDepth - 1);
            const cursorContentOffset = contentOffset($from.parentOffset, range.from, range.to);

            tr.delete(range.from, range.to);

            // 删除后文档已变短，必须在 tr.doc 上重新定位列表位置
            const $after = tr.doc.resolve(range.from);
            let d = $after.depth;
            while (d > 0 && $after.node(d).type.name !== "listItem") d--;
            if (d <= 0) return null;
            const listDepth = d - 1;
            if ($after.node(listDepth).type.name !== "bulletList") return null;
            const listStart = $after.before(listDepth);
            const listEnd = $after.after(listDepth);

            const bulletList = tr.doc.nodeAt(listStart);
            if (!bulletList || bulletList.type.name !== "bulletList") return null;

            // 保留列表中的其它 listItem（转为未勾选的 taskItem），当前项设置 checked
            const items: ReturnType<typeof taskItemType.create>[] = [];
            bulletList.forEach((item, index) => {
              items.push(
                taskItemType.create(
                  { checked: index === currentIndex ? checked : false },
                  item.content,
                ),
              );
            });
            const taskList = taskListType.create({}, items);

            // 光标位置：直接按新结构计算，避免 mapping 对替换区间内位置映射失真。
            // 新 taskList 从 listStart 开始：open + 前序 items + taskItem open + paragraph open
            const prefixSizes = items.slice(0, currentIndex).reduce((sum, it) => sum + it.nodeSize, 0);
            tr.replaceWith(listStart, listEnd, taskList);
            const cursorPos = listStart + 1 + prefixSizes + 1 + 1 + cursorContentOffset;
            tr.setSelection(TextSelection.create(tr.doc, cursorPos, cursorPos));
            return undefined;
          }

          // 情况 B（兜底）：顶层段落中直接输入 `- [ ] ` 时转换
          if ($from.depth !== 1) return null;

          const cursorContentOffset = contentOffset($from.parentOffset, range.from, range.to);
          tr.delete(range.from, range.to);
          const $pos = tr.doc.resolve(range.from);
          // 删除后段落已空，仍须为 taskItem 包裹一个 paragraph，
          // 否则 taskItem 没有内联内容节点，光标无法落入（TextSelection 报错）
          const content =
            $pos.parent.type.name === "paragraph" ? $pos.parent.content : Fragment.empty;
          const paragraph = schema.nodes.paragraph.create(null, content);
          const taskItem = taskItemType.create({ checked }, paragraph);
          const taskList = taskListType.create({}, taskItem);
          const start = $pos.before();
          tr.replaceWith(start, $pos.after(), taskList);
          // taskList open + taskItem open + paragraph open
          const cursorPos = start + 3 + cursorContentOffset;
          tr.setSelection(TextSelection.create(tr.doc, cursorPos, cursorPos));
          return undefined;
        },
      }),
    ];
  },
  addStorage() {
    const parent = (this as any).parent;
    return {
      ...(parent?.storage || {}),
      markdown: {
        ...(parent?.storage?.markdown || {}),
        parse: {
          setup: (markdownit: any) => {
            // 必须同时注册官方 markdown-it-task-lists 插件：
            // 覆盖 addStorage 的 parse 会整体替换 tiptap-markdown 内置的
            // taskList 默认 spec（其 setup 会 use 官方插件），若这里只注册
            // customEmptyTaskLists，带内容的任务项 `- [ ] xxx` 将无法被识别。
            markdownit.use(taskListPlugin);
            markdownit.use(customEmptyTaskLists);
          },
          updateDOM: (element: HTMLElement) => {
            [...element.querySelectorAll(".contains-task-list")].forEach(
              (list) => {
                list.setAttribute("data-type", "taskList");
              },
            );
            [...element.querySelectorAll(".task-list-item")].forEach(
              (item) => {
                const input = item.querySelector("input");
                item.setAttribute("data-type", "taskItem");
                if (input) {
                  item.setAttribute(
                    "data-checked",
                    (input as HTMLInputElement).checked.toString(),
                  );
                  input.remove();
                }
              },
            );
          },
        },
      },
    };
  },
});
