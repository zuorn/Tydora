// src/vim/config/leader.ts
// Leader 菜单配置（which-key 风格）。
//
// 说明：
// - 这是 Leader 菜单的唯一真实配置源（useLeader.ts 直接 import 本文件）。
// - action 命名空间：editor.* / app.* / vim.*

import type { LeaderItem } from "../types";

export interface LeaderConfig {
  leader: string;
  timeout: number;
  items: LeaderItem[];
}

// <Leader> 键映射（空格触发）
export const leaderConfig: LeaderConfig = {
  leader: " ",
  timeout: 3000,
  items: [
    // 文件操作
    { key: "e", label: "文件树", action: "app.toggle-sidebar" },
    { key: " ", label: "打开文件", action: "app.quick-open" },
    { key: "o", label: "打开文件", action: "app.quick-open" },
    { key: "s", label: "全局搜索", action: "app.global-search" },

    // 视图
    { key: "m", label: "模式切换", action: "app.toggle-mode" },

    // 分屏
    { key: "\\", label: "水平分屏", action: "app.split-horizontal" },
    { key: "-", label: "垂直分屏", action: "app.split-vertical" },

    // 窗格管理
    { key: "x", label: "关闭窗格", action: "app.close-pane" },
    { key: "h", label: "焦点 ←", action: "app.focus-left" },
    { key: "j", label: "焦点 ↓", action: "app.focus-down" },
    { key: "k", label: "焦点 ↑", action: "app.focus-up" },
    { key: "l", label: "焦点 →", action: "app.focus-right" },
    { key: "H", label: "移动到最左", action: "app.move-pane-left" },
    { key: "J", label: "移动到最下", action: "app.move-pane-down" },
    { key: "K", label: "移动到最上", action: "app.move-pane-up" },
    { key: "L", label: "移动到最右", action: "app.move-pane-right" },

    // 其他
    { key: "/", label: "命令面板", action: "app.command-palette" },
    { key: "p", label: "命令面板", action: "app.command-palette" },
  ],
};
