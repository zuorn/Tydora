// src/vim/config/prefixM.ts
// `m` 前缀键配置（Markdown 格式化动作）。
//
// 在 normal 模式下按 m 弹出 which-key 菜单，再按对应键执行格式化。
// 例如：mb = 加粗, mi = 斜体, mh1 = H1 标题
//
// 注意：m 前缀仅 CodeMirror 源码模式 normal 态可用。
// TipTap 所见即所得模式用 ; Leader 菜单，不接入 m 前缀。

import type { LeaderItem } from "../types";

export const prefixMConfig: { items: LeaderItem[] } = {
  items: [
    { key: "b", label: "加粗", action: "editor.bold" },
    { key: "i", label: "斜体", action: "editor.italic" },
    { key: "s", label: "删除线", action: "editor.strike" },
    { key: "e", label: "行内代码", action: "editor.inline-code" },
    { key: "k", label: "超链接", action: "editor.link" },
    { key: "=", label: "高亮", action: "editor.highlight" },
    { key: "c", label: "代码块", action: "editor.code-block" },
    { key: "q", label: "引用", action: "editor.quote" },
    { key: "-", label: "分隔线", action: "editor.hr" },
    {
      key: "h",
      label: "标题",
      children: [
        { key: "1", label: "H1", action: "editor.heading-1" },
        { key: "2", label: "H2", action: "editor.heading-2" },
        { key: "3", label: "H3", action: "editor.heading-3" },
        { key: "4", label: "H4", action: "editor.heading-4" },
        { key: "5", label: "H5", action: "editor.heading-5" },
        { key: "6", label: "H6", action: "editor.heading-6" },
        { key: "0", label: "段落", action: "editor.paragraph" },
      ],
    },
    {
      key: "l",
      label: "列表",
      children: [
        { key: "u", label: "无序列表", action: "editor.unordered-list" },
        { key: "o", label: "有序列表", action: "editor.ordered-list" },
        { key: "c", label: "任务列表", action: "editor.check-list" },
        { key: "t", label: "切换任务状态", action: "editor.task-toggle" },
      ],
    },
  ],
};
