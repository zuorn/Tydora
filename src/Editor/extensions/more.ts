import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";

/**
 * Hexo / WordPress 风格的摘要分割标记 `<!--more-->`。
 * 在 IR 模式中渲染为可视化分隔条，序列化时写回原注释，避免被 TipTap 吃掉。
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    more: {
      /** 在光标处插入 `<!--more-->` 摘要分割 */
      setMore: () => ReturnType;
    };
  }
}

const MORE_LINE_RE = /^\s*<!--\s*more\s*-->\s*$/i;
const MORE_INPUT_RE = /^<!--\s*more\s*-->$/i;

/** 将源码中的独立 `<!--more-->` 行替换为可解析的 HTML（跳过代码围栏） */
function replaceMoreTags(src: string): string {
  const lines = src.split("\n");
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = fence[0];
        fenceLen = fence.length;
      } else if (
        fence[0] === fenceChar &&
        fence.length >= fenceLen &&
        /^[`~]+\s*$/.test(line)
      ) {
        inFence = false;
        fenceChar = "";
        fenceLen = 0;
      }
      continue;
    }
    if (!inFence && MORE_LINE_RE.test(line)) {
      lines[i] = '<div data-type="more"></div>';
    }
  }

  return lines.join("\n");
}

export const More = Node.create({
  name: "more",

  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="more"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": "more", class: "more-separator" },
        HTMLAttributes,
      ),
    ];
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div");
      dom.className = "more-separator";
      dom.setAttribute("data-type", "more");
      dom.contentEditable = "false";

      const left = document.createElement("span");
      left.className = "more-separator-line";
      const label = document.createElement("span");
      label.className = "more-separator-label";
      label.textContent = "more";
      const right = document.createElement("span");
      right.className = "more-separator-line";

      dom.appendChild(left);
      dom.appendChild(label);
      dom.appendChild(right);

      return { dom };
    };
  },

  addCommands() {
    return {
      setMore:
        () =>
        ({ commands }) =>
          commands.insertContent([
            { type: this.name },
            { type: "paragraph" },
          ]),
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: MORE_INPUT_RE,
        type: this.type,
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("<!--more-->");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.core.ruler.before("block", "more_tag", (state: any) => {
              state.src = replaceMoreTags(state.src);
            });
          },
        },
      },
    };
  },
});
