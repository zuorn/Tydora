import { Node } from "@tiptap/core";
import mermaid from "mermaid";
import hljs from "highlight.js/lib/common";
import { EditorView as CMView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState as CMState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  mermaidHljsLang,
  mermaidLanguage,
  mermaidTheme,
  mermaidHighlightStyle,
} from "./mermaid-language";

// ── 注册 mermaid 语法高亮 ──
hljs.registerLanguage("mermaid", mermaidHljsLang);

// ── 模块级初始化 ──
let mermaidReady = false;
function initMermaid() {
  if (mermaidReady) return;
  try { mermaid.initialize({ startOnLoad: false, theme: "default" }); mermaidReady = true; }
  catch (e) { console.error("[Mermaid] Init failed:", e); }
}

// ── HTML 转义 ──
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  addAttributes() { return { language: { default: "mermaid" } }; },
  parseHTML() { return [{ tag: "div[data-type='mermaid']" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "mermaid", ...HTMLAttributes }, ["pre", ["code", 0]]];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div");
      dom.className = "mermaid-node";
      dom.setAttribute("data-type", "mermaid");

      // ── 工具栏 ──
      const toolbar = document.createElement("div");
      toolbar.className = "mermaid-toolbar";
      const label = document.createElement("span");
      label.className = "mermaid-toolbar-label";
      label.textContent = "Mermaid 图表";
      const actions = document.createElement("div");
      actions.className = "mermaid-toolbar-actions";

      const makeBtn = (cls: string, title: string, inner: string) => {
        const b = document.createElement("button");
        b.className = "mermaid-toolbar-btn " + cls;
        b.title = title;
        b.innerHTML = inner;
        return b;
      };

      const iconCode = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
      const iconEye = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      const iconFullscreen = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>`;
      const iconCopy = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
      const iconDelete = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

      const toggleBtn = makeBtn("", "切换图表/源码", iconCode);
      const fullscreenBtn = makeBtn("", "全屏查看", iconFullscreen);
      const copyBtn = makeBtn("", "复制源码", iconCopy);
      const deleteBtn = makeBtn("danger", "删除", iconDelete);

      actions.appendChild(toggleBtn);
      actions.appendChild(fullscreenBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(deleteBtn);
      toolbar.appendChild(label);
      toolbar.appendChild(actions);

      // ── 预览区 ──
      const previewArea = document.createElement("div");
      previewArea.className = "mermaid-preview";

      // ── 源码区 (CodeMirror) ──
      const sourceArea = document.createElement("div");
      sourceArea.className = "mermaid-source";
      sourceArea.style.display = "none";
      const cmContainer = document.createElement("div");
      cmContainer.className = "mermaid-cm-container";
      sourceArea.appendChild(cmContainer);

      dom.appendChild(toolbar);
      dom.appendChild(sourceArea);
      dom.appendChild(previewArea);

      // ── Mermaid 渲染 ──
      const render = (text: string) => {
        if (!text.trim()) {
          previewArea.innerHTML = `<div class="mermaid-empty">输入 Mermaid 图表代码</div>`;
          return;
        }
        previewArea.innerHTML = `<div class="mermaid-loading">正在渲染图表...</div>`;
        initMermaid();
        const id = `mermaid-svg-${++renderIdCounter}`;
        mermaid.render(id, text)
          .then((r: { svg: string }) => { previewArea.innerHTML = r.svg; })
          .catch((err: Error) => { previewArea.innerHTML = `<div class="mermaid-error"><span>图表渲染失败</span><pre>${escapeHtml(err.message || String(err))}</pre></div>`; });
      };

      render(node.textContent);

      // ── CodeMirror ──
      let cmView: CMView | null = null;
      let cmSyncing = false;

      const createCM = () => {
        if (cmView) return cmView;

        const updateListener = CMView.updateListener.of((update) => {
          if (update.docChanged && !cmSyncing) {
            cmSyncing = true;
            const newText = update.state.doc.toString();
            const pos = (getPos as () => number | undefined)();
            if (pos !== undefined && editor) {
              const pmNode = editor.state.doc.nodeAt(pos);
              if (pmNode) {
                const tr = editor.state.tr.replaceWith(
                  pos + 1,
                  pos + pmNode.nodeSize - 1,
                  editor.state.schema.text(newText),
                );
                editor.view.dispatch(tr);
              }
            }
            cmSyncing = false;
          }
        });

        const state = CMState.create({
          doc: node.textContent,
          extensions: [
            lineNumbers(),
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
            mermaidLanguage,
            CMView.lineWrapping,
            mermaidTheme,
            mermaidHighlightStyle,
            updateListener,
          ],
        });

        cmView = new CMView({ state, parent: cmContainer });
        return cmView;
      };

      const syncCMFromNode = (text?: string) => {
        if (!cmView) return;
        const content = text ?? node.textContent;
        const cmContent = cmView.state.doc.toString();
        if (cmContent !== content) {
          cmSyncing = true;
          cmView.dispatch({
            changes: { from: 0, to: cmView.state.doc.length, insert: content },
          });
          cmSyncing = false;
        }
      };

      // ── 切换图表/源码 ──
      let showPreview = true;

      const setViewMode = (preview: boolean) => {
        showPreview = preview;
        sourceArea.style.display = preview ? "none" : "";
        previewArea.style.display = preview ? "" : "none";
        toggleBtn.innerHTML = preview ? iconCode : iconEye;

        if (!preview) {
          const cv = createCM();
          syncCMFromNode();
          requestAnimationFrame(() => cv.focus());
        }
      };

      // ── 事件处理 ──
      toggleBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); setViewMode(!showPreview); });

      fullscreenBtn.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const svgEl = previewArea.querySelector("svg");
        if (!svgEl) return;

        const overlay = document.createElement("div");
        overlay.className = "mermaid-fullscreen-overlay";

        const chartArea = document.createElement("div");
        chartArea.className = "mermaid-fullscreen-chart";
        const clonedSvg = svgEl.cloneNode(true) as SVGElement;
        clonedSvg.style.cssText = "display:block;max-width:100%;max-height:100%";
        chartArea.appendChild(clonedSvg);
        overlay.appendChild(chartArea);

        const fsToolbar = document.createElement("div");
        fsToolbar.className = "mermaid-fullscreen-toolbar";

        const zoomOutBtn = document.createElement("button");
        zoomOutBtn.className = "mermaid-fs-btn"; zoomOutBtn.title = "缩小"; zoomOutBtn.textContent = "−";
        const zoomLabel = document.createElement("span");
        zoomLabel.className = "mermaid-fs-label"; zoomLabel.textContent = "100%";
        const zoomInBtn = document.createElement("button");
        zoomInBtn.className = "mermaid-fs-btn"; zoomInBtn.title = "放大"; zoomInBtn.textContent = "+";
        const resetBtn = document.createElement("button");
        resetBtn.className = "mermaid-fs-btn"; resetBtn.title = "重置"; resetBtn.textContent = "⟳";
        const closeBtn = document.createElement("button");
        closeBtn.className = "mermaid-fs-btn mermaid-fs-close"; closeBtn.title = "关闭 (Esc)"; closeBtn.textContent = "✕";

        fsToolbar.appendChild(zoomOutBtn);
        fsToolbar.appendChild(zoomLabel);
        fsToolbar.appendChild(zoomInBtn);
        fsToolbar.appendChild(resetBtn);
        fsToolbar.appendChild(closeBtn);
        overlay.appendChild(fsToolbar);

        let scale = 1, tx = 0, ty = 0;
        const MIN = 0.25, MAX = 3, STEP = 0.25;

        const updateTrans = () => {
          clonedSvg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
          clonedSvg.style.transformOrigin = "0 0";
          zoomLabel.textContent = `${Math.round(scale * 100)}%`;
        };

        zoomOutBtn.addEventListener("click", (ev) => { ev.stopPropagation(); scale = Math.max(MIN, scale - STEP); updateTrans(); });
        zoomInBtn.addEventListener("click", (ev) => { ev.stopPropagation(); scale = Math.min(MAX, scale + STEP); updateTrans(); });
        resetBtn.addEventListener("click", (ev) => { ev.stopPropagation(); scale = 1; tx = 0; ty = 0; updateTrans(); });

        chartArea.addEventListener("wheel", (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const prevScale = scale;
          scale = ev.deltaY < 0 ? Math.min(MAX, scale + STEP) : Math.max(MIN, scale - STEP);
          const rect = chartArea.getBoundingClientRect();
          const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
          const ratio = scale / prevScale;
          tx = cx - ratio * (cx - tx);
          ty = cy - ratio * (cy - ty);
          updateTrans();
        }, { passive: false });

        let dragging = false, dsx = 0, dsy = 0, otx = 0, oty = 0;
        chartArea.addEventListener("mousedown", (ev) => {
          if (ev.target === chartArea || ev.target === clonedSvg) {
            dragging = true; dsx = ev.clientX; dsy = ev.clientY; otx = tx; oty = ty;
            chartArea.style.cursor = "grabbing"; ev.preventDefault();
          }
        });
        window.addEventListener("mousemove", (ev) => { if (!dragging) return; tx = otx + (ev.clientX - dsx); ty = oty + (ev.clientY - dsy); updateTrans(); });
        window.addEventListener("mouseup", () => { if (dragging) { dragging = false; chartArea.style.cursor = ""; } });

        const close = () => { overlay.classList.add("closing"); setTimeout(() => overlay.remove(), 200); document.removeEventListener("keydown", onKeyDown); };
        closeBtn.addEventListener("click", (ev) => { ev.stopPropagation(); close(); });
        fsToolbar.addEventListener("mousedown", (ev) => ev.stopPropagation());
        const onKeyDown = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
        document.addEventListener("keydown", onKeyDown);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("open"));
      });

      copyBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(node.textContent); });

      deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const pos = (getPos as () => number | undefined)();
        if (pos !== undefined && editor) {
          const pmNode = editor.state.doc.nodeAt(pos);
          if (pmNode) {
            editor.view.dispatch(editor.state.tr.delete(pos, pos + pmNode.nodeSize));
          }
        }
      });

      toolbar.addEventListener("mousedown", (e) => e.stopPropagation());

      return {
        dom,
        update(updatedNode: any) {
          if (updatedNode.type.name !== "mermaid") return false;
          if (updatedNode.textContent !== node.textContent) {
            render(updatedNode.textContent);
            if (!showPreview) syncCMFromNode(updatedNode.textContent);
          }
          return true;
        },
        destroy() {
          cmView?.destroy();
          cmView = null;
        },
        ignoreMutation() { return true; },
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
            markdownit.core.ruler.after("block", "mermaid_parse", (mdState: any) => {
              const newTokens: any[] = [];
              for (let i = 0; i < mdState.tokens.length; i++) {
                const token = mdState.tokens[i];
                if (token.type === "fence" && token.info && token.info.trim().toLowerCase() === "mermaid") {
                  newTokens.push(new (mdState.Token as any)("html_block", "", 0));
                  newTokens[newTokens.length - 1].content = `<div data-type="mermaid">${escapeHtml(token.content)}</div>`;
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
