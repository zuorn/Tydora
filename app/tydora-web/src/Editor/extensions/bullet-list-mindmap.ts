import { Extension } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

// ── 模块级状态 ──
// 分屏下每个编辑器都会创建插件实例，需收集所有 view，
// 点击图标时按 DOM 包含关系找到图标所属的 view，避免跨文档位置越界。
const pmViews: Set<EditorView> = new Set();

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

// ── 计算首个代码点的 UTF-16 宽度（emoji=2，普通字符=1） ──
// widget 若放在文本内部会切断文本节点；放在“首个完整代码点之后”既不切断 emoji 代理对，
// 又能保证 widget 渲染为 heading 的子元素（可绝对定位到行号列）
function firstCodePointWidth(text: string): number {
  if (!text) return 0;
  const c = text.charCodeAt(0);
  return c >= 0xd800 && c <= 0xdbff ? 2 : 1;
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
  span.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4a1 1 0 0 1 0 2h-2.7a7.4 7.4 0 0 0-7.2 6H20a1 1 0 0 1 0 2h-9.9a7.4 7.4 0 0 0 7.2 6H20a1 1 0 0 1 0 2h-2.7a9.4 9.4 0 0 1-9.2-8H4a1 1 0 0 1 0-2h4.1a9.4 9.4 0 0 1 9.2-8H20z" />
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
      if (!icon) return;

      e.preventDefault();
      e.stopPropagation();

      const el = icon;
      const listPos = Number(el.dataset.listPos);
      if (isNaN(listPos)) return;

      // 找到图标所属的 editor view（分屏下不同面板对应不同文档）
      let view: EditorView | null = null;
      for (const v of pmViews) {
        if (v.dom.contains(el)) {
          view = v;
          break;
        }
      }
      if (!view) return;

      // 校验位置合法性，防止文档变更后位置越界
      if (listPos < 0 || listPos >= view.state.doc.content.size) return;

      let node: ProsemirrorNode | null | undefined = null;
      try {
        node = view.state.doc.nodeAt(listPos);
      } catch {
        return;
      }
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
        (e.target as HTMLElement).closest(".bullet-list-mindmap-icon")
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

  doc.descendants((node, pos, parent) => {
    if (node.type.name !== "bulletList" && node.type.name !== "taskList") return;

    // 跳过嵌套列表 — 只在最外层列表上显示图标
    if (parent && (parent.type.name === "listItem" || parent.type.name === "taskItem")) return;

    const itemCount = countListItems(node);
    if (itemCount <= 2) return;

    const heading = findNearestHeading(doc, pos);
    const w = heading ? firstCodePointWidth(heading.text) : 0;
    // 空标题 / 单代码点标题（单个 emoji 或单字符）：找不到“完整代码点之后”的安全位置，
    // 降级为列表图标（挂在列表容器上）
    const headingUsable = !!heading && w > 0 && heading.text.length > w;

    if (headingUsable) {
      // icon 作为 heading 的 inline widget，放在“首个完整代码点之后”：
      // 渲染为 <h1> 的子元素（可相对 h1 绝对定位到行号列），且不会切断 emoji 代理对。
      // heading 内容从 heading.pos + 1 开始，首代码点占 w 个 UTF-16 单元，
      // 因此“首个完整代码点之后”是 heading.pos + 1 + w（旧写法 heading.pos + w 会
      // 在 emoji 代理对中间切分文本节点，导致 emoji 损坏）
      decorations.push(
        Decoration.widget(heading.pos + 1 + w, () =>
          createMindmapIcon(pos, heading.text),
        { side: -1 }),
      );
    } else {
      // 无 heading：给列表容器添加 class，用于隐藏首行行号
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "bullet-list-mindmap-list-container",
        }),
      );

      // 把图标放到首个列表项（li）的内容开头。
      // li 本身已设置 position:relative 且是行号的定位基准，这样图标与首行行号列对齐，
      // 不会和列表文字重叠。
      const firstItem = node.child(0);
      if (firstItem) {
        decorations.push(
          Decoration.widget(pos + 2, () =>
            createMindmapIcon(pos, ""),
          { side: 1 }),
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
      pmViews.add(view);
      installGlobalHandler();
      return {
        destroy() {
          pmViews.delete(view);
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
