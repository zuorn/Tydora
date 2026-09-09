// src/vim/navigation/useWindowNavigation.ts
// Vim 风格窗格导航（tmux 风格面板间跳转）。
//
// Ctrl+h/j/k/l（大小写不敏感）→ 焦点切换（左/下/上/右）
// 仅在 Normal 模式拦截；insert/visual 态让渡给 vim（Ctrl+h=退格 等）
// 移动窗格位置（move-pane）由 Leader 菜单 H/J/K/L 提供（leader.ts）
//
// 通过 vim-app-action 事件分发到 App.tsx 的 focusPane，
// focusPane 用 PaneNavigator 做方向感知的相邻窗格查找。

import { useEffect, useRef } from "react";
import { useVim } from "../VimProvider";

export function useWindowNavigation(): void {
  const { enabled, mode } = useVim();
  // 用 ref 运行时判断，effect 永久挂载，避免状态变化导致监听未及时注册
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    // ── 诊断：确认 listener 是否挂载（确认后删除）──
    console.log("[vim-nav] effect 挂载，enabled:", enabledRef.current, "mode:", modeRef.current);

    const handleKeyDown = (e: KeyboardEvent) => {
      // ── 诊断：捕获阶段最早点，打印所有 Ctrl+hjkl（确认后删除）──
      if (e.ctrlKey && !e.altKey && !e.metaKey && "hjklHJKL".includes(e.key)) {
        console.log("[vim-nav] capture", e.key, {
          enabled: enabledRef.current,
          mode: modeRef.current,
          targetTag: (e.target as HTMLElement).tagName,
          targetClass: ((e.target as HTMLElement).className || "").slice(0, 40),
        });
      }
      if (!enabledRef.current) return;
      // 仅 Normal 模式拦截 Ctrl+hjkl；insert/visual 让渡给 vim（Ctrl+h 退格、Ctrl+j 换行等）
      if (modeRef.current !== "normal") return;
      if (!e.ctrlKey || e.altKey || e.metaKey) return;

      const dirMap: Record<string, "left" | "down" | "up" | "right"> = {
        h: "left", j: "down", k: "up", l: "right",
        H: "left", J: "down", K: "up", L: "right",
      };
      const dir = dirMap[e.key];
      if (!dir) return;

      // 不拦截原生输入框（搜索框、QuickOpen、终端 textarea）
      // 编辑器（ProseMirror / CodeMirror 的 contentEditable）不在此列 → 允许切面板
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      e.preventDefault();
      e.stopPropagation();

      window.dispatchEvent(new CustomEvent("vim-app-action", { detail: { action: `app.focus-${dir}` } }));
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
