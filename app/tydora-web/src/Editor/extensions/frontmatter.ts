import { Node, findChildren } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { NodeView, ViewMutationRecord } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { common, createLowlight } from "lowlight";

// ── HTML 转义 ──
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── lowlight 实例（YAML 高亮） ──
const lowlight = createLowlight(common);

// ── 解析 lowlight 节点树为 {text, classes} 数组 ──
function parseNodes(
  nodes: any[],
  className: string[] = [],
): { text: string; classes: string[] }[] {
  return nodes.flatMap((node) => {
    const classes = [
      ...className,
      ...(node.properties ? node.properties.className : []),
    ];
    if (node.children) {
      return parseNodes(node.children, classes);
    }
    return { text: node.value as string, classes };
  });
}

function getHighlightNodes(result: any) {
  return result.value || result.children || [];
}

// ── 根据文档生成 YAML 高亮 decorations ──
function getFrontmatterDecorations(doc: ProsemirrorNode) {
  const decorations: Decoration[] = [];

  findChildren(doc, (node) => node.type.name === "frontmatter").forEach(
    (block) => {
      const from = block.pos + 1;
      const text = block.node.textContent;

      if (!text) return;

      let nodes: { text: string; classes: string[] }[];
      try {
        const result = lowlight.highlight("yaml", text);
        nodes = parseNodes(getHighlightNodes(result));
      } catch {
        return;
      }

      let pos = from;
      nodes.forEach((node) => {
        const to = pos + node.text.length;
        if (node.classes.length) {
          decorations.push(
            Decoration.inline(pos, to, { class: node.classes.join(" ") }),
          );
        }
        pos = to;
      });
    },
  );

  return DecorationSet.create(doc, decorations);
}

// ── Frontmatter 高亮插件 ──
const highlightPluginKey = new PluginKey("frontmatterHighlight");

function createHighlightPlugin() {
  return new Plugin({
    key: highlightPluginKey,

    state: {
      init: (_, { doc }) => getFrontmatterDecorations(doc),
      apply: (transaction, decorationSet, oldState, newState) => {
        const oldNodeName = oldState.selection.$head.parent.type.name;
        const newNodeName = newState.selection.$head.parent.type.name;
        const oldNodes = findChildren(
          oldState.doc,
          (node) => node.type.name === "frontmatter",
        );
        const newNodes = findChildren(
          newState.doc,
          (node) => node.type.name === "frontmatter",
        );

        if (
          transaction.docChanged &&
          ([oldNodeName, newNodeName].includes("frontmatter") ||
            newNodes.length !== oldNodes.length ||
            transaction.steps.some((step) => {
              return (
                (step as any).from !== undefined &&
                (step as any).to !== undefined &&
                oldNodes.some(
                  (node) =>
                    node.pos >= (step as any).from &&
                    node.pos + node.node.nodeSize <= (step as any).to,
                )
              );
            }))
        ) {
          return getFrontmatterDecorations(transaction.doc);
        }

        return decorationSet.map(transaction.mapping, transaction.doc);
      },
    },

    props: {
      decorations(state) {
        return highlightPluginKey.getState(state);
      },
    },
  });
}


/**
 * Frontmatter NodeView：扁平 DOM（无 pre/code 嵌套），避免 WKWebView
 * 跨块选区后在 nested pre 上留下幽灵高亮。标题条 contentEditable=false，
 * 与代码块工具栏同策略。
 *
 * 注意：不要用 clip-path / overflow:hidden 裁圆角——会再次触发选区残影。
 */
class FrontmatterView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  constructor() {
    const wrap = document.createElement("div");
    wrap.dataset.type = "frontmatter";
    wrap.className = "frontmatter-node";

    const label = document.createElement("div");
    label.className = "frontmatter-label";
    label.contentEditable = "false";
    label.textContent = "METADATA";
    label.setAttribute("aria-hidden", "true");

    // 直接用 code 承载文本（white-space: pre-wrap），不要包一层 pre
    const code = document.createElement("code");
    code.className = "frontmatter-content";

    wrap.appendChild(label);
    wrap.appendChild(code);

    this.dom = wrap;
    this.contentDOM = code;
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    // 忽略标题条上的变更，避免与 PM 内容同步打架
    const target = mutation.target;
    if (!(target instanceof globalThis.Node)) return false;
    const el =
      target.nodeType === globalThis.Node.TEXT_NODE
        ? target.parentElement
        : (target as HTMLElement);
    return !!el?.closest?.(".frontmatter-label");
  }
}

// ── Frontmatter Node 扩展 ──

export const Frontmatter = Node.create({
  name: "frontmatter",

  group: "block",
  content: "text*",
  marks: "", // 禁止行内格式标记
  code: true, // 内容作为纯文本，不解析行内 markdown
  defining: true,
  // 不用 isolating：跨块选区时 isolating 边界会让 WKWebView 更容易留下幽灵高亮

  parseHTML() {
    return [{ tag: "div[data-type='frontmatter']" }];
  },

  renderHTML({ HTMLAttributes }) {
    // 导出/SSR：扁平结构，与 NodeView 一致
    return [
      "div",
      { "data-type": "frontmatter", class: "frontmatter-node", ...HTMLAttributes },
      0,
    ];
  },

  addNodeView() {
    return () => new FrontmatterView();
  },

  addProseMirrorPlugins() {
    return [createHighlightPlugin()];
  },

  addStorage() {
    return {
      markdown: {
        // 序列化：输出 ---\n{YAML}\n---
        serialize(state: any, node: any) {
          state.write("---");
          state.ensureNewLine();
          state.text(node.textContent, false);
          state.ensureNewLine();
          state.write("---");
          state.closeBlock(node);
        },
        parse: {
          // 解析：用 core.ruler 在 block 规则之前替换源文本中的 frontmatter
          setup(markdownit: any) {
            markdownit.core.ruler.before(
              "block",
              "frontmatter",
              (state: any) => {
                const src = state.src;
                const match = src.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
                if (!match) return;

                const yamlContent = match[1];
                const replacement =
                  `<div data-type="frontmatter">${escapeHtml(yamlContent)}</div>\n\n`;
                state.src = replacement + state.src.slice(match[0].length);
              },
            );
          },
        },
      },
    };
  },
});
