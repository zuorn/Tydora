import { Node } from "@tiptap/core";
import mermaid from "mermaid";

// ── 模块级初始化 ──
let mermaidReady = false;

function initMermaid() {
  if (mermaidReady) return;
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
    });
    mermaidReady = true;
  } catch (e) {
    console.error("[Mermaid] Init failed:", e);
  }
}

// ── HTML 转义 ──
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── 渲染 ID 计数器 ──
let renderIdCounter = 0;

// ── Mermaid Node ──
export const Mermaid = Node.create({
  name: "mermaid",

  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      language: {
        default: "mermaid",
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='mermaid']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { "data-type": "mermaid", ...HTMLAttributes },
      ["pre", ["code", 0]],
    ];
  },

  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement("div");
      dom.className = "mermaid-node";
      dom.setAttribute("data-type", "mermaid");

      // 工具栏
      const toolbar = document.createElement("div");
      toolbar.className = "mermaid-toolbar";

      const label = document.createElement("span");
      label.className = "mermaid-toolbar-label";
      label.textContent = "Mermaid 图表";

      const actions = document.createElement("div");
      actions.className = "mermaid-toolbar-actions";

      // 切换按钮
      let showPreview = true;
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "mermaid-toolbar-btn";
      toggleBtn.title = "切换图表/源码";
      toggleBtn.innerHTML =
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

      // 复制按钮
      const copyBtn = document.createElement("button");
      copyBtn.className = "mermaid-toolbar-btn";
      copyBtn.title = "复制源码";
      copyBtn.innerHTML =
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;

      // 删除按钮
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "mermaid-toolbar-btn danger";
      deleteBtn.title = "删除";
      deleteBtn.innerHTML =
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

      actions.appendChild(toggleBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(deleteBtn);

      toolbar.appendChild(label);
      toolbar.appendChild(actions);

      // 源码编辑区
      const sourceArea = document.createElement("div");
      sourceArea.className = "mermaid-source";
      sourceArea.style.display = "none";

      const pre = document.createElement("pre");
      pre.className = "mermaid-source-pre";
      const code = document.createElement("code");
      pre.appendChild(code);
      sourceArea.appendChild(pre);

      // 图表预览区
      const previewArea = document.createElement("div");
      previewArea.className = "mermaid-preview";

      dom.appendChild(toolbar);
      dom.appendChild(sourceArea);
      dom.appendChild(previewArea);

      // ── 渲染函数 ──
      const render = (text: string) => {
        if (!text.trim()) {
          previewArea.innerHTML =
            `<div class="mermaid-empty">输入 Mermaid 图表代码</div>`;
          return;
        }

        previewArea.innerHTML =
          `<div class="mermaid-loading">正在渲染图表...</div>`;

        initMermaid();

        const id = `mermaid-svg-${++renderIdCounter}`;
        mermaid
          .render(id, text)
          .then((result: { svg: string }) => {
            previewArea.innerHTML = result.svg;
          })
          .catch((err: Error) => {
            previewArea.innerHTML =
              `<div class="mermaid-error">` +
              `<span>图表渲染失败</span>` +
              `<pre>${escapeHtml(err.message || String(err))}</pre>` +
              `</div>`;
          });
      };

      // 初始渲染
      render(node.textContent);

      // ── 事件处理 ──
      toggleBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPreview = !showPreview;
        sourceArea.style.display = showPreview ? "none" : "";
        previewArea.style.display = showPreview ? "" : "none";
        toggleBtn.innerHTML = showPreview
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
          : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      });

      copyBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(node.textContent);
      });

      deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = (getPos as () => number | undefined)();
        if (pos !== undefined) {
          dom.dispatchEvent(
            new CustomEvent("mermaid-delete", {
              bubbles: true,
              detail: { pos },
            }),
          );
        }
      });

      // 阻止 ProseMirror 处理工具栏点击
      toolbar.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });

      return {
        dom,
        contentDOM: code,
        update(updatedNode: any) {
          if (updatedNode.type.name !== "mermaid") return false;
          if (updatedNode.textContent !== node.textContent) {
            render(updatedNode.textContent);
          }
          return true;
        },
        ignoreMutation(mutation: any) {
          // 忽略非 contentDOM 的变更
          if (mutation.target === code || code.contains(mutation.target as globalThis.Node)) {
            return false;
          }
          return true;
        },
      };
    };
  },
}).extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("```mermaid");
          state.ensureNewLine();
          state.text(node.textContent, false);
          state.ensureNewLine();
          state.write("```");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            // 在 markdown-it 解析 fenced code blocks 后拦截 mermaid 块
            markdownit.core.ruler.after("block", "mermaid_parse", (mdState: any) => {
              // 遍历所有 token，将 mermaid fenced code blocks 转换为 mermaid 节点
              const newTokens: any[] = [];
              for (let i = 0; i < mdState.tokens.length; i++) {
                const token = mdState.tokens[i];
                if (
                  token.type === "fence" &&
                  token.info &&
                  token.info.trim().toLowerCase() === "mermaid"
                ) {
                  const content = token.content;
                  const encoded = escapeHtml(content);
                  newTokens.push(
                    new (mdState.Token as any)("html_block", "", 0),
                  );
                  newTokens[newTokens.length - 1].content =
                    `<div data-type="mermaid">${encoded}</div>`;
                } else {
                  newTokens.push(token);
                }
              }
              mdState.tokens = newTokens;
            });
          },
        },
      },
    };
  },
});
