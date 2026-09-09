import { Extension } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";

// ── 支持的 callout 类型 ──
const CALLOUT_TYPES: Record<string, { icon: string; label: string }> = {
  note:       { icon: "ℹ️", label: "Note" },
  tip:        { icon: "💡", label: "Tip" },
  important:  { icon: "❗", label: "Important" },
  warning:    { icon: "⚠️", label: "Warning" },
  caution:    { icon: "🚫", label: "Caution" },
  abstract:   { icon: "📝", label: "Abstract" },
  info:       { icon: "ℹ️", label: "Info" },
  success:    { icon: "✅", label: "Success" },
  question:   { icon: "❓", label: "Question" },
  failure:    { icon: "❌", label: "Failure" },
  danger:     { icon: "⛔", label: "Danger" },
  bug:        { icon: "🕷", label: "Bug" },
  example:    { icon: "📋", label: "Example" },
  quote:      { icon: "💬", label: "Quote" },
  faq:        { icon: "❔", label: "FAQ" },
};

// ── 正则：/^\[!(type)\][-+]?/i  — 可选折叠修饰符 -/+ ──
const TYPE_NAMES = Object.keys(CALLOUT_TYPES).join("|");
const CALLOUT_PATTERN = new RegExp(`^\\[!(${TYPE_NAMES})\\]([-+])?`, "i");

// ── 模块级状态 ──
let pmView: EditorView | null = null;
// 追踪被用户切换过折叠状态的 callout（key = blockquote pos）
const userToggledState = new Map<number, boolean>();

// ── 标题 widget DOM 工厂 ──
function createTitleWidget(
  calloutType: string,
  blockPos: number,
  hasToggle: boolean,
): HTMLElement {
  const info = CALLOUT_TYPES[calloutType];
  const span = document.createElement("span");
  span.className = `callout-title callout-title-${calloutType}`;
  span.textContent = info ? `${info.icon} ${info.label}` : calloutType;

  if (hasToggle) {
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!pmView) return;

      const current = userToggledState.get(blockPos);
      if (current === undefined) {
        // 第一次点击：从初始状态翻转（- 修饰符 → 初始 collapsed=true → 翻转为 false）
        // 我们不知道初始状态，但修饰符已通过 Node decoration 处理。
        // 这里简单翻转当前 DOM 状态不影响下次 re-render。
        // 我们通过 userToggledState 记录用户意图。
      }
      // 读取当前 wrapper 上的实际状态来翻转
      const wrapper = span.closest(".callout") as HTMLElement | null;
      if (wrapper) {
        const nowCollapsed = wrapper.classList.contains("callout-collapsed");
        userToggledState.set(blockPos, !nowCollapsed);
      }

      // dispatch 空事务触发 decorations 重新计算
      const tr = pmView.state.tr;
      tr.setMeta("calloutToggle", blockPos);
      pmView.dispatch(tr);
    });
  }

  return span;
}

// ── 检测 callout ──
function detectCallout(node: ProsemirrorNode): {
  calloutType: string;
  markerEnd: number;
  toggleModifier: string | undefined;
} | null {
  if (node.type.name !== "blockquote") return null;

  const firstChild = node.firstChild;
  if (!firstChild || firstChild.type.name !== "paragraph") return null;

  const text = firstChild.textContent;
  const match = text.match(CALLOUT_PATTERN);
  if (!match) return null;

  return {
    calloutType: match[1].toLowerCase(),
    markerEnd: match[0].length,
    toggleModifier: match[2], // "-" | "+" | undefined
  };
}

// ── 生成 decorations ──
function createCalloutDecorations(doc: ProsemirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    const info = detectCallout(node);
    if (!info) return;

    const nodeEnd = pos + node.nodeSize;
    const hasToggle = info.toggleModifier === "-" || info.toggleModifier === "+";

    // 确定折叠状态：用户手动切换优先，否则用修饰符初始状态
    let collapsed: boolean;
    const userVal = userToggledState.get(pos);
    if (userVal !== undefined) {
      collapsed = userVal;
    } else {
      collapsed = info.toggleModifier === "-";
    }

    // Node decoration classes
    const classList = [`callout callout-${info.calloutType}`];
    if (hasToggle) classList.push("callout-foldable");
    if (collapsed) classList.push("callout-collapsed");

    decorations.push(
      Decoration.node(pos, nodeEnd, { class: classList.join(" ") }),
    );

    // Widget: 标题
    decorations.push(
      Decoration.widget(pos + 1, () => createTitleWidget(info.calloutType, pos, hasToggle), {
        side: -1,
      }),
    );

    // Inline: 隐藏 [!TYPE][-+] 标记
    decorations.push(
      Decoration.inline(pos + 2, pos + 2 + info.markerEnd, {
        class: "callout-title-marker",
      }),
    );
  });

  return DecorationSet.create(doc, decorations);
}

// ── 插件 ──
const calloutPluginKey = new PluginKey("callout");

function createCalloutPlugin() {
  return new Plugin({
    key: calloutPluginKey,

    view(view) {
      pmView = view;
      return {
        destroy() {
          pmView = null;
          userToggledState.clear();
        },
      };
    },

    state: {
      init(_, { doc }) {
        return createCalloutDecorations(doc);
      },
      apply(tr, oldDecos, _oldState, newState) {
        // 用户点击折叠按钮或文档内容变化时重新计算
        if (tr.docChanged || tr.getMeta("calloutToggle") !== undefined) {
          return createCalloutDecorations(newState.doc);
        }
        return oldDecos;
      },
    },

    props: {
      decorations(state) {
        return calloutPluginKey.getState(state);
      },
    },
  });
}

// ── TipTap Extension ──
export const Callout = Extension.create({
  name: "callout",

  addProseMirrorPlugins() {
    return [createCalloutPlugin()];
  },

  addStorage() {
    return {
      markdown: {
        parse: {
          // 让 markdown-it 在 callout blockquote 内把换行解析为硬换行 <br>
          setup(markdownit: any) {
            markdownit.core.ruler.push("callout_hard_breaks", (state: any) => {
              let inCallout = false;
              for (const token of state.tokens) {
                if (token.type === "blockquote_open") {
                  // 查看下一个 inline token 是否以 [!TYPE] 开头
                  const next = state.tokens[state.tokens.indexOf(token) + 1];
                  if (next && next.type === "paragraph_open") {
                    const inline = state.tokens[state.tokens.indexOf(next) + 1];
                    if (
                      inline &&
                      inline.type === "inline" &&
                      CALLOUT_PATTERN.test(inline.content)
                    ) {
                      inCallout = true;
                    }
                  }
                } else if (token.type === "blockquote_close") {
                  inCallout = false;
                } else if (inCallout && token.type === "inline") {
                  // 把 inline 内容中的 \n 替换为 hard_break token
                  // markdown-it 渲染时 <br> 就是换行
                  token.content = token.content.replace(/\n/g, "<br>\n");
                }
              }
            });
          },
        },
      },
    };
  },
});
