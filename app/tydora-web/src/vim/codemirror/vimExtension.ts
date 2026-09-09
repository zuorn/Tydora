// src/vim/codemirror/vimExtension.ts
// 封装 @replit/codemirror-vim。enabled=false 时返回空数组（零侵入）。
//
// 设计：
// - vim() 扩展自带 normal/insert/visual 三态、hjkl/d/c/y 等操作符
// - 模式切换通过 getCM().on("vim-mode-change", ...) 回调到 React Context
// - 显式 ESC keymap 确保从 insert 返回 normal（Vim.exitInsertMode）
// - Ctrl+D/U/F/B：此处 Prec.highest 自实现，覆盖 cm-vim 默认；翻页后光标始终在视口中央
// - Leader/m/g/z 前缀菜单由 useLeader hook 接管，此处只管 vim 扩展

import { Prec, EditorSelection } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { vim, getCM, Vim } from "@replit/codemirror-vim";
import type { VimMode } from "../types";

export interface VimAdapterOptions {
  enabled: boolean;
  leaderKey: string;
  onModeChange?: (mode: VimMode) => void;
}

/** cm-vim 的模式字符串到 VimMode 的映射 */
function mapVimMode(mode: string): VimMode {
  if (mode === "insert") return "insert";
  if (mode === "visual") return "visual";
  return "normal";
}

/**
 * Vim 半页 / 整页翻页 + 光标垂直居中（CodeMirror 版）。
 * 策略：先滚动视口 → posAtCoords 取视口中点设置光标 → 微调 scrollTop 使光标精确在视口中点。
 * factor > 0 向下翻；半页 |factor|=0.5，整页 |factor|=1.0。
 */
function vimPageScrollCenterCM(view: EditorView, factor: number, isFullPage: boolean): boolean {
  try {
    const sc = view.scrollDOM;
    if (!sc) return false;
    const viewportH = Math.max(1, sc.clientHeight);
    const docLen = view.state.doc.length;
    const scrollMax = Math.max(0, sc.scrollHeight - viewportH);

    // 行高估算（整页留 2 行 overlap，类 Vim 行为）
    let approxLH = 20;
    try {
      const head = view.state.selection.main.head;
      const c = view.coordsAtPos(head);
      if (c && c.bottom - c.top > 6) approxLH = c.bottom - c.top;
    } catch { /* ignore */ }

    // 1) 先滚视口
    let deltaPx = factor * viewportH;
    if (isFullPage) {
      deltaPx = deltaPx > 0
        ? Math.max(approxLH * 2, deltaPx - approxLH * 2)
        : Math.min(-approxLH * 2, deltaPx + approxLH * 2);
    }
    sc.scrollTop = Math.min(scrollMax, Math.max(0, sc.scrollTop + deltaPx));

    // 2) 视口中心坐标 → posAtCoords → 文档位置
    const rect = sc.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let targetPos: number | null = null;
    try {
      const pos = view.posAtCoords({ x: cx, y: cy });
      if (typeof pos === "number") targetPos = pos;
    } catch { /* ignore */ }
    if (targetPos == null) {
      // fallback：按当前位置做字符级估算偏移
      const head = view.state.selection.main.head;
      const charsPerPx = Math.max(0.002, docLen / Math.max(1, sc.scrollHeight));
      targetPos = Math.max(0, Math.min(docLen, head + Math.round(deltaPx * charsPerPx)));
    }
    targetPos = Math.max(0, Math.min(docLen, targetPos));

    // 3) 设置选区：visual 模式保留原 anchor，只改 head
    const main = view.state.selection.main;
    const isVisual = main.anchor !== main.head;
    const anchor = isVisual ? main.anchor : targetPos;
    view.dispatch({
      selection: EditorSelection.single(anchor, targetPos),
      scrollIntoView: false,
    });

    // 4) 微调让光标精确落到视口中央
    const finalPos = targetPos;
    requestAnimationFrame(() => {
      try {
        const c = view.coordsAtPos(finalPos);
        if (!c) return;
        const r2 = sc.getBoundingClientRect();
        const lineCenterInContent =
          (c.top + c.bottom) / 2 - r2.top + sc.scrollTop;
        sc.scrollTop = Math.min(
          scrollMax,
          Math.max(0, lineCenterInContent - sc.clientHeight / 2)
        );
      } catch { /* ignore */ }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * CodeMirror Vim 扩展工厂。
 * - enabled=false：返回空数组，不注入任何扩展（零侵入）
 * - enabled=true：返回 [vim() + 模式监听 + 显式 ESC handler]
 */
export function createVimExtension(options: VimAdapterOptions): Extension[] {
  if (!options.enabled) return [];

  const extensions: Extension[] = [
    vim({
      status: false,
    }),

    // 显式 ESC 处理：确保从 insert/visual 返回 normal
    // @replit/codemirror-vim 内置了 ESC 绑定，但某些场景下可能被其他 keymap 截获。
    // 这里用 Prec.highest 确保优先级最高，直接调用 Vim.exitInsertMode。
    Prec.highest(
      keymap.of([
        // Ctrl+D / Ctrl+U / Ctrl+F / Ctrl+B：
        // 覆盖 @replit/codemirror-vim 默认实现（只用 scrollIntoView，不做居中）。
        // 仅在 normal / visual 模式下生效；insert 模式下让系统默认处理
        // （如 Ctrl+D 在某些编辑器是减少缩进）。
        {
          key: "Ctrl-d",
          run: (view: EditorView): boolean => {
            try {
              const cm = getCM(view);
              const mode = (cm as unknown as { state?: { vim?: { mode?: string } } })?.state?.vim?.mode;
              if (mode === "insert") return false;
            } catch { /* ignore */ }
            return vimPageScrollCenterCM(view, +0.5, false);
          },
          preventDefault: true,
        },
        {
          key: "Ctrl-u",
          run: (view: EditorView): boolean => {
            try {
              const cm = getCM(view);
              const mode = (cm as unknown as { state?: { vim?: { mode?: string } } })?.state?.vim?.mode;
              if (mode === "insert") return false;
            } catch { /* ignore */ }
            return vimPageScrollCenterCM(view, -0.5, false);
          },
          preventDefault: true,
        },
        {
          key: "Ctrl-f",
          run: (view: EditorView): boolean => {
            try {
              const cm = getCM(view);
              const mode = (cm as unknown as { state?: { vim?: { mode?: string } } })?.state?.vim?.mode;
              if (mode === "insert") return false;
            } catch { /* ignore */ }
            return vimPageScrollCenterCM(view, +1.0, true);
          },
          preventDefault: true,
        },
        {
          key: "Ctrl-b",
          run: (view: EditorView): boolean => {
            try {
              const cm = getCM(view);
              const mode = (cm as unknown as { state?: { vim?: { mode?: string } } })?.state?.vim?.mode;
              if (mode === "insert") return false;
            } catch { /* ignore */ }
            return vimPageScrollCenterCM(view, -1.0, true);
          },
          preventDefault: true,
        },
        {
          key: "Escape",
          run: (view: EditorView): boolean => {
            try {
              const cm = getCM(view);
              if (!cm) return false;
              const vimState = (cm as unknown as { state?: { vim?: { mode?: string } } }).state;
              const mode = vimState?.vim?.mode;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const cmAny = cm as any;
              if (mode === "insert") {
                Vim.exitInsertMode(cmAny);
                return true;
              }
              if (mode === "visual") {
                Vim.exitVisualMode(cmAny);
                return true;
              }
              // normal 态不拦截，让其他 handler 处理（如关闭 Leader 菜单）
              if (mode === "normal") {
                return false;
              }
              // 未知模式也尝试退出 insert
              Vim.exitInsertMode(cmAny);
              return true;
            } catch {
              return false;
            }
          },
          preventDefault: true,
        },
        // Ctrl+[ 等价 ESC：退出 insert/visual 回 normal（Vim 传统行为）
        {
          key: "Ctrl-[",
          run: (view: EditorView): boolean => {
            try {
              const cm = getCM(view);
              if (!cm) return false;
              const vimState = (cm as unknown as { state?: { vim?: { mode?: string } } }).state;
              const mode = vimState?.vim?.mode;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const cmAny = cm as any;
              if (mode === "insert") {
                Vim.exitInsertMode(cmAny);
                return true;
              }
              if (mode === "visual") {
                Vim.exitVisualMode(cmAny);
                return true;
              }
              if (mode === "normal") return false;
              Vim.exitInsertMode(cmAny);
              return true;
            } catch {
              return false;
            }
          },
          preventDefault: true,
        },
      ])
    ),

    // 模式监听：cm-vim 通过 CodeMirror 事件系统派发 vim-mode-change
    EditorView.updateListener.of((viewUpdate) => {
      if (!viewUpdate.view.dom.dataset.vimModeListenerAttached) {
        viewUpdate.view.dom.dataset.vimModeListenerAttached = "1";
        try {
          const cm = getCM(viewUpdate.view);
          if (cm && options.onModeChange) {
            cm.on("vim-mode-change", (e: { mode: string }) => {
              options.onModeChange?.(mapVimMode(e.mode));
            });
            options.onModeChange("normal");
          }
          // jk 快速序列（insert 态）退出 insert：等价 <Esc>
          // 绑定一次即可，cm-vim 全局 map 不随 view 销毁失效
          if (cm) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (Vim as any).map?.("jk", "<Esc>", "insert");
            } catch { /* ignore */ }
          }
        } catch {
          // getCM 在非 vim 扩展环境下会抛错，安全忽略
        }
      }
    }),
  ];

  return extensions;
}
