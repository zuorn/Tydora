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

      // 全屏按钮
      const fullscreenBtn = document.createElement("button");
      fullscreenBtn.className = "mermaid-toolbar-btn";
      fullscreenBtn.title = "全屏查看";
      fullscreenBtn.innerHTML =
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>`;

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
      actions.appendChild(fullscreenBtn);
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

      // 全屏查看
      fullscreenBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const svgEl = previewArea.querySelector("svg");
        if (!svgEl) return;

        // 创建全屏遮罩
        const overlay = document.createElement("div");
        overlay.className = "mermaid-fullscreen-overlay";

        // 图表区域（滚轮缩放）
        const chartArea = document.createElement("div");
        chartArea.className = "mermaid-fullscreen-chart";
        const clonedSvg = svgEl.cloneNode(true) as SVGElement;
        clonedSvg.style.display = "block";
        clonedSvg.style.maxWidth = "100%";
        clonedSvg.style.maxHeight = "100%";
        chartArea.appendChild(clonedSvg);
        overlay.appendChild(chartArea);

        // 右上角浮动工具条
        const toolbar = document.createElement("div");
        toolbar.className = "mermaid-fullscreen-toolbar";

        const zoomOutBtn = document.createElement("button");
        zoomOutBtn.className = "mermaid-fs-btn";
        zoomOutBtn.title = "缩小";
        zoomOutBtn.textContent = "−";

        const zoomLabel = document.createElement("span");
        zoomLabel.className = "mermaid-fs-label";
        zoomLabel.textContent = "100%";

        const zoomInBtn = document.createElement("button");
        zoomInBtn.className = "mermaid-fs-btn";
        zoomInBtn.title = "放大";
        zoomInBtn.textContent = "+";

        const resetBtn = document.createElement("button");
        resetBtn.className = "mermaid-fs-btn";
        resetBtn.title = "重置";
        resetBtn.textContent = "⟳";

        const closeBtn = document.createElement("button");
        closeBtn.className = "mermaid-fs-btn mermaid-fs-close";
        closeBtn.title = "关闭 (Esc)";
        closeBtn.textContent = "✕";

        toolbar.appendChild(zoomOutBtn);
        toolbar.appendChild(zoomLabel);
        toolbar.appendChild(zoomInBtn);
        toolbar.appendChild(resetBtn);
        toolbar.appendChild(closeBtn);
        overlay.appendChild(toolbar);

        // ── 缩放 + 拖拽逻辑 ──
        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        const MIN_SCALE = 0.25;
        const MAX_SCALE = 3;
        const STEP = 0.25;

        const updateTransform = () => {
          clonedSvg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
          clonedSvg.style.transformOrigin = "0 0";
          zoomLabel.textContent = `${Math.round(scale * 100)}%`;
        };

        zoomOutBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          scale = Math.max(MIN_SCALE, scale - STEP);
          updateTransform();
        });

        zoomInBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          scale = Math.min(MAX_SCALE, scale + STEP);
          updateTransform();
        });

        resetBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          scale = 1;
          translateX = 0;
          translateY = 0;
          updateTransform();
        });

        // 滚轮缩放
        chartArea.addEventListener("wheel", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const prevScale = scale;
          if (ev.deltaY < 0) {
            scale = Math.min(MAX_SCALE, scale + STEP);
          } else {
            scale = Math.max(MIN_SCALE, scale - STEP);
          }
          // 以鼠标位置为中心缩放
          const rect = chartArea.getBoundingClientRect();
          const cx = ev.clientX - rect.left;
          const cy = ev.clientY - rect.top;
          const ratio = scale / prevScale;
          translateX = cx - ratio * (cx - translateX);
          translateY = cy - ratio * (cy - translateY);
          updateTransform();
        }, { passive: false });

        // ── 鼠标拖拽 ──
        let dragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOrigTranslateX = 0;
        let dragOrigTranslateY = 0;

        chartArea.addEventListener("mousedown", (ev) => {
          if (ev.target === chartArea || ev.target === clonedSvg) {
            dragging = true;
            dragStartX = ev.clientX;
            dragStartY = ev.clientY;
            dragOrigTranslateX = translateX;
            dragOrigTranslateY = translateY;
            chartArea.style.cursor = "grabbing";
            ev.preventDefault();
          }
        });

        window.addEventListener("mousemove", (ev) => {
          if (!dragging) return;
          translateX = dragOrigTranslateX + (ev.clientX - dragStartX);
          translateY = dragOrigTranslateY + (ev.clientY - dragStartY);
          updateTransform();
        });

        window.addEventListener("mouseup", () => {
          if (dragging) {
            dragging = false;
            chartArea.style.cursor = "";
          }
        });

        // 关闭
        const close = () => {
          overlay.classList.add("closing");
          setTimeout(() => overlay.remove(), 200);
          document.removeEventListener("keydown", onKeyDown);
        };

        closeBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          close();
        });

        toolbar.addEventListener("mousedown", (ev) => ev.stopPropagation());

        const onKeyDown = (ev: KeyboardEvent) => {
          if (ev.key === "Escape") close();
        };
        document.addEventListener("keydown", onKeyDown);

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("open"));
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
