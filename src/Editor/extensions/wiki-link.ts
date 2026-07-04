import { Node, mergeAttributes, InputRule } from "@tiptap/core";

/** HTML 属性值转义，防止 XSS */
function encodeNote(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function encodeHeading(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 将 [[note#heading|display]] 转为 HTML <a> 标签，供 markdown-it 解析 */
function replaceWikiLinkSyntax(_match: string, content: string): string {
  let note = content;
  let heading = '';
  let display = '';

  const pipeIdx = note.lastIndexOf('|');
  if (pipeIdx >= 0) {
    display = note.slice(pipeIdx + 1).trim();
    note = note.slice(0, pipeIdx).trim();
  }

  const hashIdx = note.indexOf('#');
  if (hashIdx >= 0) {
    heading = note.slice(hashIdx + 1).trim();
    note = note.slice(0, hashIdx).trim();
  }

  if (!note) return _match;

  const displayText = display || note;
  const headingAttr = heading ? ` data-heading="${encodeHeading(heading)}"` : '';
  return `<a data-note="${encodeNote(note)}"${headingAttr}>${displayText}</a>`;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (options: { note: string; heading?: string; display?: string }) => ReturnType;
    };
  }
}

export const WikiLink = Node.create({
  name: "wikiLink",

  inline: true,
  group: "inline",
  draggable: true,

  addAttributes() {
    return {
      note: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-note"),
      },
      heading: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-heading"),
      },
      display: { default: null },
    };
  },

  parseHTML() {
    return [
      { tag: 'a[data-note]' },
      { tag: 'span[data-note]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, {
      class: "wiki-link",
      "data-note": HTMLAttributes.note,
      "data-heading": HTMLAttributes.heading,
      href: "#",
    }), HTMLAttributes.display || HTMLAttributes.note];
  },

  addCommands() {
    return {
      setWikiLink: (options) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        });
      },
    };
  },

  addInputRules() {
    return [
      // Rule 1: 完整 [[note]]/[[note#heading]]/[[note|alias]] → WikiLink 节点
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ range, match, commands }) => {
          const content = match[1];

          let noteName: string;
          let heading: string | null = null;
          let display: string | null = null;

          // 解析 |别名
          const pipeIndex = content.lastIndexOf('|');
          if (pipeIndex >= 0) {
            display = content.slice(pipeIndex + 1).trim() || null;
            noteName = content.slice(0, pipeIndex);
          } else {
            noteName = content;
          }

          // 解析 #标题 (在别名部分之前)
          const hashIndex = noteName.indexOf('#');
          if (hashIndex >= 0) {
            heading = noteName.slice(hashIndex + 1).trim() || null;
            noteName = noteName.slice(0, hashIndex).trim();
          } else {
            noteName = noteName.trim();
          }

          if (!noteName) return;

          commands.insertContentAt(range, {
            type: 'wikiLink',
            attrs: {
              note: noteName,
              heading: heading,
              display: display,
            },
          });
        },
      }),
      // Rule 2: 部分 [[ 触发自动补全
      new InputRule({
        find: /\[\[([^\]]*)$/,
        handler: ({ range, match }) => {
          const query = match[1];
          // 计算屏幕坐标用于下拉菜单定位
          let screenPos: { x: number; y: number } | null = null;
          try {
            const editor = this.editor;
            if (editor) {
              const coords = editor.view.coordsAtPos(range.from);
              if (coords) {
                screenPos = { x: coords.left, y: coords.bottom };
              }
            }
          } catch {
            // coordsAtPos 可能失败，使用 null
          }
          window.dispatchEvent(new CustomEvent("wiki-link-trigger", {
            detail: {
              query,
              editorPosition: range.from,
              screenPosition: screenPos,
            }
          }));
        },
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("a");
      dom.className = "wiki-link";
      dom.dataset.note = node.attrs.note as string;
      dom.dataset.heading = node.attrs.heading as string;
      dom.textContent = (node.attrs.display as string) || (node.attrs.note as string);
      dom.href = "#";

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("wiki-link-click", {
          detail: {
            noteName: node.attrs.note,
            heading: node.attrs.heading
          }
        }));
      });

      return { dom };
    };
  },
}).extend({
  // 自定义 Markdown 序列化：将 WikiLink 节点输出为 [[note]] 语法
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { note, heading, display } = node.attrs;
          let link = note || '';
          if (heading) link += '#' + heading;
          if (display) link += '|' + display;
          state.write(`[[${link}]]`);
        },
        parse: {
          setup(markdownit: any) {
            // 在 markdown-it 解析 inline 内容之前，将 [[note]] 替换为 HTML <a> 标签
            markdownit.core.ruler.before('inline', 'wiki_link', (mdState: any) => {
              mdState.tokens.forEach((token: any) => {
                if (token.type === 'inline' && token.content) {
                  token.content = token.content.replace(
                    /\[\[([^\]]+)\]\]/g,
                    replaceWikiLinkSyntax
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
