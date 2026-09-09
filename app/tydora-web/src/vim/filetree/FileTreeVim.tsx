// src/vim/filetree/FileTreeVim.tsx
// 文件树 neo-tree 风格快捷键 HOC。
//
// 架构：本文件只负责激活判定 + 键盘 → vim-sidebar-action CustomEvent 的翻译；
// 真正的状态修改（光标跳跃、目录展开、文件新建/重命名/删除/复制等）全部在
// Sidebar/FileTree 组件内部通过监听 vim-sidebar-action 完成，保证 j/k 高亮
// 永远**不触发 onSelect**（只有 confirm-open / l/Enter/o 才真正打开文件）。

import { useEffect, useRef, type ComponentType } from "react";
import { useVim } from "../VimProvider";

type Detail = { action: string; path?: string; delta?: number };
function act(action: string, extra?: Partial<Detail>) {
  window.dispatchEvent(new CustomEvent<Detail>("vim-sidebar-action", {
    detail: { action, ...extra },
  }));
}

export function FileTreeVim<P extends object>(Wrapped: ComponentType<P>): ComponentType<P> {
  return function VimFileTreeWrapper(props: P) {
    const { enabled } = useVim();
    const treeActiveRef = useRef(false);
    const gPendingRef = useRef(false);

    useEffect(() => {
      if (!enabled) return;

      const activate = () => { treeActiveRef.current = true; };

      const handleClick = (e: MouseEvent) => {
        // 用 closest 定位点击所在的 sidebar / sidebar-tree，确保两个侧栏各自独立激活
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const tree = target.closest<HTMLElement>(".sidebar-tree");
        const sidebar = target.closest<HTMLElement>(".sidebar");
        if ((tree && tree.contains(target)) || (sidebar && sidebar.contains(target))) {
          activate();
          // 真实点击某个 tree-node → 把 Vim 光标对齐到该节点（之后 j/k 从这里起步）
          const tn = target.closest?.<HTMLElement>(".tree-node[data-path]");
          if (tn?.dataset.path) act("highlight-path", { path: tn.dataset.path });
        } else {
          treeActiveRef.current = false;
        }
      };

      const handleFocus = (e: FocusEvent) => {
        const el = e.target as Node | null;
        if (!el) return;
        const tree = (el as HTMLElement)?.closest?.(".sidebar-tree");
        const sidebar = (el as HTMLElement)?.closest?.(".sidebar");
        if ((tree && tree.contains(el)) || (sidebar && sidebar.contains(el))) activate();
      };

      document.addEventListener("click", handleClick, true);
      document.addEventListener("focusin", handleFocus, true);

      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        // 上下文菜单或弹窗已开时：不拦截
        if (document.querySelector(".context-menu, .modal, [role='dialog']")) return;

        // 用当前焦点所在的 sidebar 找它的 tree（支持左右两个侧栏，而不是全局第一个）
        const sidebarEl = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>(".sidebar")
          ?? document.querySelector<HTMLElement>(".sidebar");
        if (!sidebarEl) return;
        const tree = sidebarEl.querySelector<HTMLElement>(".sidebar-tree");
        if (!tree) return;

        const activated = treeActiveRef.current
          || (sidebarEl.contains(document.activeElement) || sidebarEl === document.activeElement);
        if (!activated) return;

        // 焦点仍在编辑器中：不拦截（即使侧栏刚被 click 激活，只要用户又点回编辑器就应该让编辑器 Vim 接手）
        const editorHost =
          document.querySelector(".ProseMirror") as HTMLElement | null
          ?? document.querySelector(".codemirror-editor") as HTMLElement | null;
        if (editorHost && editorHost.contains(document.activeElement)) return;

        const key = e.key;
        const noMods = !e.ctrlKey && !e.altKey && !e.metaKey;

        let handled = true;
        if (noMods) {
          switch (key) {
            // 导航：只 highlight，不打开
            case "j":
            case "ArrowDown":
              act("highlight-next");
              break;
            case "k":
            case "ArrowUp":
              act("highlight-prev");
              break;
            case "Home":
              act("highlight-first");
              break;
            case "End":
              act("highlight-last");
              break;
            case "H":
              act("highlight-first");
              break;
            case "G":
              act("highlight-last");
              break;
            case "g":
              gPendingRef.current = true;
              window.setTimeout(() => { gPendingRef.current = false; }, 450);
              handled = false; // 单独的 g 不做 preventDefault，让浏览器默认过
              break;

            case "h":
            case "Backspace":
              // 已展开目录 → 折叠；文件 / 未展开目录 → 高亮父目录
              act("h-toggle");
              break;
            case "p":
              act("highlight-parent");
              break;

            // 目录结构
            case "W":
              act("collapse-all");
              break;
            case "E":
              act("expand-all");
              break;
            case "C":
              act("collapse-branch");
              break;

            // 真正打开 / 展开
            case "l":
            case "Enter":
            case "o":
              act("confirm-open");
              break;

            // 分屏打开：\ 水平分屏(lr)，- 垂直分屏(tb) —— 等价于先分屏再在新窗格中打开选中文件
            case "\\":
            case "-": {
              const p = document
                .querySelector<HTMLElement>(".tree-node.pending-active[data-path]")
                ?.dataset.path;
              if (p) {
                window.dispatchEvent(new CustomEvent("vim-sidebar-action", {
                  detail: {
                    action: key === "\\" ? "open-split-lr" : "open-split-tb",
                    path: p,
                  },
                }));
                treeActiveRef.current = false;
              }
              break;
            }

            // 文件操作：直接走 Sidebar 内部同逻辑（避免依赖右键菜单 DOM 查找）
            case "a":
            case "%":
              act("new-file");
              break;
            case "A":
              act("new-folder");
              break;
            case "r":
              act("rename");
              break;
            case "d":
              act("delete");
              break;
            case "D":
            case "c":
              act("duplicate");
              break;
            case "x":
              act("move-to");
              break;
            case "y":
              act("copy-path");
              break;

            case "R":
              // App 级 refresh：让 treeRefreshKey++ 重新 loadRoot
              window.dispatchEvent(new CustomEvent("vim-sidebar-action", {
                detail: { action: "refresh" },
              }));
              break;

            case "q":
              treeActiveRef.current = false;
              // 通过 App 的窗格系统聚焦激活编辑器（兼容多窗格，避免 raw DOM focus 找错窗格）
              window.dispatchEvent(new CustomEvent("vim-app-action", {
                detail: { action: "focus-editor" },
              }));
              break;

            default:
              handled = false;
              break;
          }
        } else if (e.ctrlKey && !e.altKey && !e.metaKey) {
          // 侧栏文件树半页滚动：Ctrl+D 下翻 / Ctrl+U 上翻（仅侧栏激活时）。
          // 编辑器持有焦点时 line 59 的 contentEditable 守卫已 return，不会走到这里，
          // 因此不会与编辑器 Vim 的 Ctrl+D/U 翻页冲突。
          const k = key.toLowerCase();
          if (k === "d" || k === "u") {
            const half = Math.max(40, Math.floor(tree.clientHeight / 2));
            tree.scrollBy({ top: k === "d" ? half : -half });
            handled = true;
          } else {
            handled = false;
          }
        } else {
          // 其它带修饰键（Alt/Meta）的组合：文件树不处理，交给编辑器 / 全局快捷键。
          handled = false;
        }

        // gg → 首项（g-pending 窗口内再按一次 g）
        if (!handled && noMods && key === "g" && gPendingRef.current) {
          gPendingRef.current = false;
          act("highlight-first");
          handled = true;
        }

        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      window.addEventListener("keydown", handleKeyDown, true);
      return () => {
        document.removeEventListener("click", handleClick, true);
        document.removeEventListener("focusin", handleFocus, true);
        window.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [enabled]);

    return <Wrapped {...props} />;
  };
}
