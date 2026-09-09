// src/vim/types.ts
// Vim 模块类型定义。仅模块内部使用，不对外导出（对外入口见 index.ts）。

/** Vim 三态模式。CodeMirror 与 TipTap 均由各自 vim 扩展驱动。 */
export type VimMode = "normal" | "insert" | "visual";

/** Vim 模块运行时状态 */
export interface VimState {
  /** 是否启用 Vim 模式（默认 false，关闭时模块零开销） */
  enabled: boolean;
  /** 当前模式（CodeMirror 与 TipTap 均有效，由各自 vim 扩展驱动） */
  mode: VimMode;
  /** Leader 键（默认 " " 空格，仅 normal 态触发，源码/所见即所得统一） */
  leaderKey: string;
  /** Leader 菜单超时自动关闭（ms） */
  menuTimeout: number;
}

/** Vim 设置（持久化在 localStorage["zmd-vim-config"]） */
export interface VimConfig {
  enabled: boolean;
  leaderKey: string;
  menuTimeout: number;
  /** 冲突快捷键让渡配置：key="ctrl+d", value=true(让渡给 Vim)/false(App 快捷键生效) */
  conflictKeys?: Record<string, boolean>;
  /** 配置版本号：用于向后兼容迁移（缺省=1，当前=2） */
  __v?: number;
}

/** Leader 菜单项 */
export interface LeaderItem {
  /** 触发键（单字符，如 "b"） */
  key: string;
  /** 显示名 */
  label: string;
  /** 动作 id（命名空间：editor.* / app.* / vim.*） */
  action?: string;
  /** 子菜单（与 action 互斥） */
  children?: LeaderItem[];
}

/** Leader 菜单根配置 */
export interface LeaderConfig {
  leader: string;
  timeout: number;
  items: LeaderItem[];
}
