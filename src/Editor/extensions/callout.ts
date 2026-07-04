import { Extension } from "@tiptap/core";
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
  bug:        { icon: "🐛", label: "Bug" },
  example:    { icon: "📋", label: "Example" },
  quote:      { icon: "💬", label: "Quote" },
  faq:        { icon: "❔", label: "FAQ" },
};

// ── 正则：/^\[!(type)\][-+]?/i  — 可选折叠修饰符 -/+ ──
const TYPE_NAMES = Object.keys(CALLOUT_TYPES).join("|");
const CALLOUT_PATTERN = new RegExp(`^\\[!(${TYPE_NAMES})\\]([-+])?`, "i");

// ── 创建标题 widget DOM（含折叠交互） ──
function createTitleWidget(
  calloutType: string,
  startCollapsed: boolean,
): HTMLElement {
  const info = CALLOUT_TYPES[calloutType];
  const span = document.createElement("span");
  span.className = `callout-title callout-title-${calloutType}`;
  span.textContent = info ? `${info.icon} ${info.label}` : calloutType;

  if (startCollapsed) {
    // 延迟绑定：等 widget 插入 DOM 后找到父级 .callout
    requestAnimationFrame(() => {
      const wrapper = span.closest(".callout") as HTMLElement | null;
      if (!wrapper) return;

      wrapper.classList.add("callout-foldable", "callout-collapsed");
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        wrapper.classList.toggle("callout-collapsed");
      });
    });
  }

  return span;
}

// ── 检测 callout ──
function detectCallout(node: ProsemirrorNode): {
  calloutType: string;
  markerEnd: number;   // [!TYPE] 长度
  collapsed: boolean;  // 是否带 - 修饰符
} | null {
  if (node.type.name !== "blockquote") return null;

  const firstChild = node.firstChild;
  if (!firstChild || firstChild.type.name !== "paragraph") return null;

  const text = firstChild.textContent;
  const match = text.match(CALLOUT_PATTERN);
  if (!match) return null;

  // match[0] = 完整匹配，如 "[!FAQ]-" 或 "[!NOTE]"
  const modifier = match[2]; // "-" 或 "+" 或 undefined
  return {
    calloutType: match[1].toLowerCase(),
    markerEnd: match[0].length,    // 含 modifier
    collapsed: modifier === "-",
  };
}

// ── 生成 decorations ──
function createCalloutDecorations(doc: ProsemirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    const info = detectCallout(node);
    if (!info) return;

    const nodeEnd = pos + node.nodeSize;

    // Node decoration: class 加到 blockquote DOM 元素上
    const classes = [`callout callout-${info.calloutType}`];
    decorations.push(
      Decoration.node(pos, nodeEnd, { class: classes.join(" ") }),
    );

    // Widget: 标题 DOM（带折叠交互）
    decorations.push(
      Decoration.widget(pos + 1, () => createTitleWidget(info.calloutType, info.collapsed), {
        side: -1,
      }),
    );

    // Inline decoration: 隐藏 [!TYPE][-+] 标记
    // blockquote(0) > paragraph(1) > text(2)，text 从 pos+2 开始
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

    state: {
      init(_, { doc }) {
        return createCalloutDecorations(doc);
      },
      apply(tr, oldDecos, _oldState, newState) {
        if (!tr.docChanged) return oldDecos;
        return createCalloutDecorations(newState.doc);
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
});
