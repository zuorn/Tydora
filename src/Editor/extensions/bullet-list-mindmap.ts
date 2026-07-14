import { Extension } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

// ── 模块级状态 ──
let pmView: EditorView | null = null;

// ── 从 bulletList / taskList 节点提取 Markdown ──
function extractListMarkdown(node: ProsemirrorNode, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  node.forEach((child) => {
    if (child.type.name === "listItem" || child.type.name === "taskItem") {
      let text = "";
      child.forEach((p) => {
        if (p.type.name === "paragraph") {
          text += p.textContent;
        }
      });

      if (child.type.name === "taskItem") {
        const checked = child.attrs.checked ? "x" : " ";
        lines.push(`${indent}- [${checked}] ${text}`);
      } else {
        lines.push(`${indent}- ${text}`);
      }

      child.forEach((nested) => {
        if (nested.type.name === "bulletList" || nested.type.name === "orderedList" || nested.type.name === "taskList") {
          lines.push(extractListMarkdown(nested, depth + 1));
        }
      });
    }
  });

  return lines.join("\n");
}

// ── 计算列表的直接 listItem / taskItem 子节点数 ──
function countListItems(node: ProsemirrorNode): number {
  let count = 0;
  node.forEach((child) => {
    if (child.type.name === "listItem" || child.type.name === "taskItem") count++;
  });
  return count;
}

// ── 查找列表上方紧邻的 heading（仅当中间无其他有效块级元素时关联） ──
function findNearestHeading(
  doc: ProsemirrorNode,
  listPos: number,
): { pos: number; nodeSize: number; text: string } | null {
  let nearestHeading: { pos: number; nodeSize: number; text: string } | null = null;
  let pos = 1; // doc open token 之后

  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    if (pos >= listPos) break;

    if (child.type.name === "heading") {
      nearestHeading = { pos, nodeSize: child.nodeSize, text: child.textContent };
    } else if (child.type.name === "paragraph" && child.textContent.trim() === "") {
      // 空白行（空段落）— 允许，保持 nearestHeading 不变
    } else {
      // 其他块级元素（分割线、代码块、另一个列表、非空段落等）— 打断关联
      nearestHeading = null;
    }

    pos += child.nodeSize;
  }

  return nearestHeading;
}

// ── 创建思维导图图标 widget ──
function createMindmapIcon(listPos: number, headingText: string): HTMLElement {
  const span = document.createElement("span");
  // 有 heading 时用 heading-icon（absolute），无 heading 时用 list-icon（inline）
  span.className = headingText
    ? "bullet-list-mindmap-icon heading-icon"
    : "bullet-list-mindmap-icon list-icon";
  span.dataset.listPos = String(listPos);
  span.dataset.heading = headingText;
  span.title = "在思维导图中查看";
  span.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="5" r="2.5" />
    <circle cx="18" cy="4" r="2" />
    <circle cx="15" cy="11" r="2" />
    <circle cx="6" cy="18" r="3" />
    <line x1="8.2" y1="6.5" x2="16" y2="4.8" />
    <line x1="8.2" y1="7" x2="13.2" y2="10.2" />
    <line x1="6" y1="10.5" x2="6" y2="15" />
  </svg>`;
  return span;
}

// ── 全局事件处理 ──
let globalHandlerInstalled = false;

function installGlobalHandler() {
  if (globalHandlerInstalled) return;
  globalHandlerInstalled = true;

  document.addEventListener(
    "mousedown",
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const icon = target.closest(".bullet-list-mindmap-icon") as HTMLElement | null;
      // taskList 无 heading 时用 Decoration.node + CSS ::before，检测 <ul> 上的点击
      const tasklist = !icon
        ? (target.closest("ul.bullet-list-mindmap-tasklist") as HTMLElement | null)
        : null;
      if (!icon && !tasklist) return;

      e.preventDefault();
      e.stopPropagation();

      const el = icon || tasklist!;
      const listPos = Number(el.dataset.listPos);
      if (!pmView || isNaN(listPos)) return;

      const node = pmView.state.doc.nodeAt(listPos);
      if (!node || (node.type.name !== "bulletList" && node.type.name !== "taskList")) return;

      const headingText = el.dataset.heading || "";
      const listMd = extractListMarkdown(node);
      if (!listMd) return;

      const markdown = headingText
        ? `# ${headingText}\n\n${listMd}`
        : listMd;

      localStorage.setItem("zmd-mindmap-mode", "list");
      localStorage.setItem("zmd-mindmap-content", markdown);
      emit("mindmap-content-update", { content: markdown }).catch(() => {});
      invoke("open_mindmap_window").catch(() => {});
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      if (
        (e.target as HTMLElement).closest(".bullet-list-mindmap-icon") ||
        (e.target as HTMLElement).closest("ul.bullet-list-mindmap-tasklist")
      ) {
        e.stopPropagation();
      }
    },
    true
  );
}

// ── 生成 decorations ──
function createBulletListDecorations(doc: ProsemirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "bulletList" && node.type.name !== "taskList") return;

    const itemCount = countListItems(node);
    if (itemCount <= 2) return;

    const heading = findNearestHeading(doc, pos);

    if (heading) {
      // 给 heading 添加 class（position:relative 已由行号 CSS 提供，此 class 用于标识/扩展）
      decorations.push(
        Decoration.node(heading.pos, heading.pos + heading.nodeSize, {
          class: "bullet-list-mindmap-heading",
        }),
      );
      // icon 放在 heading 之后，利用 <h1..6> 已有的 position:relative 绝对定位
      decorations.push(
        Decoration.widget(heading.pos + heading.nodeSize, () =>
          createMindmapIcon(pos, heading.text),
        { side: 1 }),
      );
    } else {
      // 无 heading：图标放在第一个列表项右侧
      const isTaskList = node.type.name === "taskList";

      if (isTaskList) {
        // taskList 的 taskItem 有 NodeView，其 update 会清除非扩展属性
        // 改用 Decoration.node 作用在 taskList 的 <ul> 上（无 NodeView），CSS ::before 显示图标
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: "bullet-list-mindmap-tasklist",
            "data-list-pos": String(pos),
          }),
        );
      } else {
        // bulletList 无 NodeView，widget 方式正常工作
        decorations.push(
          Decoration.widget(pos + 3, () =>
            createMindmapIcon(pos, ""),
          { side: 0 }),
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

// ── 插件 ──
const bulletListMindmapKey = new PluginKey("bulletListMindmap");

function createBulletListMindmapPlugin() {
  return new Plugin({
    key: bulletListMindmapKey,

    view(view) {
      pmView = view;
      installGlobalHandler();
      return {
        destroy() {
          if (pmView === view) pmView = null;
        },
      };
    },

    state: {
      init(_, { doc }) {
        return createBulletListDecorations(doc);
      },
      apply(tr, oldDecos, _oldState, newState) {
        if (tr.docChanged) {
          return createBulletListDecorations(newState.doc);
        }
        return oldDecos;
      },
    },

    props: {
      decorations(state) {
        return bulletListMindmapKey.getState(state);
      },
    },
  });
}

// ── TipTap Extension ──
export const BulletListMindmap = Extension.create({
  name: "bulletListMindmap",

  addProseMirrorPlugins() {
    return [createBulletListMindmapPlugin()];
  },
});
