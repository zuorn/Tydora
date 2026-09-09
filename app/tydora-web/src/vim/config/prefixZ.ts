// src/vim/config/prefixZ.ts
// `z` 前缀键配置（Vim 原生滚动命令，由 @replit/codemirror-vim 执行）。
//
// 被动模式：which-key 弹窗仅作视觉引导，不拦截按键。

import type { LeaderItem } from "../types";

export const prefixZConfig: { items: LeaderItem[] } = {
  items: [
    { key: "z", label: "当前行置中", action: "vim.zz" },
    { key: "t", label: "当前行置顶", action: "vim.zt" },
    { key: "b", label: "当前行置底", action: "vim.zb" },
    { key: ".", label: "置中+首字符", action: "vim.z." },
    { key: "-", label: "置底+首字符", action: "vim.z-" },
  ],
};
