// src/Editor/extensions/tag.ts

import { Node, mergeAttributes, InputRule } from "@tiptap/core";

/** 标签字符转义 */
function encodeTag(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tag: {
      /** 插入一个标签节点 */
      setTag: (options: { tag: string }) => ReturnType;
    };
  }
}

export const Tag = Node.create({
  name: "tag",

  inline: true,
  group: "inline",
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      tag: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tag"),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-tag]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "md-tag",
        "data-tag": HTMLAttributes.tag,
      }),
      `#${HTMLAttributes.tag}`,
    ];
  },

  addCommands() {
    return {
      setTag:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addInputRules() {
    return [
      // Rule 1: 在非行首（#前面有空白）完整输入 #标签后空格/行尾 → 转为 Tag 节点
      // 支持中英文标签、斜杠子标签（如 #状态/待整理）
      // 行首的 # 留给 Markdown 标题（Heading 扩展）处理，避免歧义。
      // 用户仍可通过自动补全（Rule 2 + Enter选择）在行首插入标签。
      new InputRule({
        find: /(\s)#([^\s#\]\)\}，,。！？；;：:"'`、/\\]+(?:\/[^\s#\]\)\}，,。！？；;：:"'`、/\\]+)*)(\s|$)$/,
        handler: ({ range, match, commands }) => {
          const prefixSpace = match[1]; // 前置空格
          const tagName = match[2];
          if (!tagName || /^\d+$/.test(tagName)) return; // 排除纯数字

          // range.from 是整个匹配的起点（前置空格位置）
          // 只替换 #tag 部分（保留前置空格和尾部空格/行尾）
          const tagStart = range.from + prefixSpace.length;
          const trailingLen = match[3]?.length || 0;
          const tagEnd = range.to - trailingLen;

          // 单次替换：将 #tag 替换为 Tag 节点，尾部空格自然保留
          // 注意：不能在此之后再做第二次 insertContentAt，
          // 因为文档已被修改，旧位置会失效导致 "Position -1 out of range"
          commands.insertContentAt(
            { from: tagStart, to: tagEnd },
            {
              type: "tag",
              attrs: { tag: tagName },
            }
          );
        },
      }),

      // Rule 2: 输入 # 时触发自动补全（行首或空白之后都允许）
      new InputRule({
        find: /(^|\s)#([^\s#\]\)\}，,。！？；;：:"'`]*)$/,
        handler: ({ range, match }) => {
          const query = match[2] || "";
          let screenPos: { x: number; y: number } | null = null;
          try {
            const editor = this.editor;
            if (editor) {
              const prefixOffset = match[0].indexOf("#");
              const tagStart = range.from + prefixOffset;
              const coords = editor.view.coordsAtPos(tagStart);
              if (coords) {
                screenPos = { x: coords.left, y: coords.bottom };
              }
            }
          } catch {
            // coordsAtPos 可能失败，使用 null
          }
          window.dispatchEvent(
            new CustomEvent("tag-trigger", {
              detail: {
                query,
                editorPosition: range.from + match[0].indexOf("#"),
                screenPosition: screenPos,
              },
            })
          );
        },
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "md-tag";
      const tagName = node.attrs.tag as string;
      dom.dataset.tag = tagName;
      dom.textContent = `#${tagName}`;

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent("tag-click", {
            detail: {
              tag: tagName,
              element: dom,
            },
          })
        );
      });

      dom.addEventListener("mouseenter", () => {
        window.dispatchEvent(
          new CustomEvent("tag-hover", {
            detail: {
              tag: tagName,
              element: dom,
            },
          })
        );
      });

      dom.addEventListener("mouseleave", () => {
        window.dispatchEvent(new CustomEvent("tag-hover-end"));
      });

      return { dom };
    };
  },
}).extend({
  // 自定义 Markdown 序列化：将 Tag 节点输出为 #tag 语法
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { tag } = node.attrs;
          if (tag) {
            // 关键：检查上一个输出字符是否为空白
            // 如果不是（说明前一个标签直接相邻），需要补一个空格
            // 否则 #tag1#tag2 在解析时第二个 # 前是单词字符，(?<!\w) 匹配失败
            const out = state.out || "";
            if (out.length > 0 && !/\s$/.test(out)) {
              state.write(" ");
            }
            state.write(`#${tag}`);
          }
        },
        parse: {
          setup(markdownit: any) {
            // 在 markdown-it 解析 inline 内容之前，将 #tag 替换为 HTML span
            // Obsidian 约定：# 文本（空格）= 标题；#文本（无空格）= 标签
            // 标签名的 [^\s]+ 部分天然排除了 "# 标题"（空格后才是内容）这种写法
            markdownit.core.ruler.before("inline", "md_tag", (mdState: any) => {
              mdState.tokens.forEach((token: any) => {
                if (token.type === "inline" && token.content) {
                  // 捕获组 1: 前缀（空白或行首^），必须保留！
                  // 否则多个连续标签会因为缺少空格分隔而解析失败
                  token.content = token.content.replace(
                    /(^|\s)(?<!\w)#([^\s#\]\)\}，,。！？；;：:"'`、/\\]+(?:\/[^\s#\]\)\}，,。！？；;：:"'`、/\\]+)*)(?!\w)/g,
                    (_m: string, prefix: string, tag: string) => {
                      if (/^\d+$/.test(tag)) return _m; // 纯数字不转换
                      // 关键：必须保留 prefix（空格/行首），否则多个标签会黏在一起
                      return `${prefix}<span data-tag="${encodeTag(tag)}">#${tag}</span>`;
                    }
                  );
                }
              });
            });
          },
        },
      },
    };
  },
});
