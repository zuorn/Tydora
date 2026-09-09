// src/vim/config/prefixG.ts
// `g` 前缀键配置（Vim 原生命令，由 @replit/codemirror-vim 执行）。
//
// 被动模式：which-key 弹窗仅作视觉引导，不拦截按键。
// 用户按 g 后弹窗显示所有 g 子命令，再按对应键由 vim 扩展原生执行。

import type { LeaderItem } from "../types";

export const prefixGConfig: { items: LeaderItem[] } = {
  items: [
    { key: "g", label: "跳到文件首行", action: "vim.gg" },
    { key: "J", label: "连接行（不插空格）", action: "vim.gJ" },
    { key: "0", label: "屏幕行首", action: "vim.g0" },
    { key: "^", label: "首个非空字符", action: "vim.g^" },
    { key: "$", label: "屏幕行尾", action: "vim.g$" },
    { key: "~", label: "切换大小写", action: "vim.g~" },
    { key: "u", label: "转为小写", action: "vim.gu" },
    { key: "U", label: "转为大写", action: "vim.gU" },
    { key: "f", label: "打开光标下文件", action: "vim.gf" },
    { key: "x", label: "打开光标下链接", action: "vim.gx" },
    { key: ";", label: "较旧光标位置", action: "vim.g;" },
    { key: ",", label: "较新光标位置", action: "vim.g," },
    { key: "_", label: "行末非空字符", action: "vim.g_" },
  ],
};
