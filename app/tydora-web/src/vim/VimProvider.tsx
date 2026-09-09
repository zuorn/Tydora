// src/vim/VimProvider.tsx
// Vim 模块状态 Provider。默认关闭；关闭时不注入任何编辑器扩展、不监听键盘。
//
// 设计要点：
// - 配置存 localStorage["zmd-vim-config"]，跨窗口经 storage 事件同步（与 zmd-general-settings 同模式）
// - 模式（normal/insert/visual）由 CodeMirror vim 扩展驱动，通过 setMode 更新
// - 对外只通过 useVim() 消费，内部细节不外泄

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { VimConfig, VimMode, VimState } from "./types";
import { DEFAULT_VIM_CONFIG, VIM_CONFIG_KEY, loadVimConfig, saveVimConfig } from "./config/configLoader";

interface VimContextValue extends VimState {
  /** 冲突快捷键让渡配置 */
  conflictKeys: Record<string, boolean>;
  /** 更新配置并持久化（设置面板调用） */
  updateConfig: (patch: Partial<VimConfig>) => void;
  /** CodeMirror vim 扩展回调：模式切换时同步到 Context */
  setMode: (mode: VimMode) => void;
}

const VimContext = createContext<VimContextValue | null>(null);

/**
 * Vim 模块 Provider。在 App 根节点包裹。
 * 默认 enabled=false 时，仅维持一个轻量 state，不注入任何编辑器扩展。
 */
export function VimProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<VimConfig>(() => loadVimConfig());
  // 模式：由 CodeMirror vim 扩展或 vim-prose（TipTap）驱动，通过 setMode 更新
  const [mode, setMode] = useState<VimMode>("normal");

  // 跨窗口同步：设置窗口改动 → 主窗口 storage 事件
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === VIM_CONFIG_KEY) {
        setConfig(loadVimConfig());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // 同窗口内设置面板改动：设置面板调 updateConfig → 同步 state + 持久化 + 广播
  const updateConfig = (patch: Partial<VimConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveVimConfig(next);
      // 关闭时重置模式，避免残留 normal 态
      if (patch.enabled === false) setMode("normal");
      return next;
    });
  };

  const value = useMemo<VimContextValue>(
    () => ({
      enabled: config.enabled,
      mode,
      leaderKey: config.leaderKey,
      menuTimeout: config.menuTimeout,
      conflictKeys: config.conflictKeys ?? {},
      updateConfig,
      setMode,
    }),
    [config, mode]
  );

  return <VimContext.Provider value={value}>{children}</VimContext.Provider>;
}

/** 消费 Vim 模块状态。未在 Provider 内使用时返回安全的禁用态默认值。 */
export function useVim(): VimContextValue {
  const ctx = useContext(VimContext);
  // Provider 未挂载时返回禁用态默认值，保证未启用时调用方安全
  return ctx ?? {
    enabled: false,
    mode: "insert",
    leaderKey: DEFAULT_VIM_CONFIG.leaderKey,
    menuTimeout: DEFAULT_VIM_CONFIG.menuTimeout,
    conflictKeys: DEFAULT_VIM_CONFIG.conflictKeys ?? {},
    updateConfig: () => {},
    setMode: () => {},
  };
}
