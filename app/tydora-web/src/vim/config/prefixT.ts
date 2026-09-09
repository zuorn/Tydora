// src/vim/config/prefixT.ts
// `t` 前缀键配置（Table 表格操作）。
//
// 设计原则：
//   - 对齐类用 小写 h/m/l  （Horizontal Left / Middle / Right）
//   - 插入行列用 大写 H/J/K/L（方向语义 + "插入" 强动作，避免与小写 h/j/k/l 移动冲突）
//       J = 下方插入行 (Down, insert below)
//       K = 上方插入行 (Up, insert above)
//       H = 左侧插入列 (Left, insert left)
//       L = 右侧插入列 (Right, insert right)
//   - 合并/拆分用  M / s
//       M = Merge 合并单元格（大写，与 m=居中 区分）
//       s = Split 拆分单元格（小写无冲突）
//
// normal/visual 态按 t 弹出 which-key 菜单，再按对应键执行。
// 两个编辑器（TipTap IR / CodeMirror 源码）均通过 `table.*` 命名空间处理。

import type { LeaderItem } from "../types";

export const prefixTConfig: { items: LeaderItem[] } = {
  items: [
    // ── 对齐 ─────────────────────────────────────────
    { key: "h", label: "左对齐",         action: "table.align-left" },
    { key: "m", label: "居中对齐",       action: "table.align-center" },
    { key: "l", label: "右对齐",         action: "table.align-right" },

    // ── 插入行 ───────────────────────────────────────
    { key: "K", label: "上方插入行",     action: "table.add-row-above" },
    { key: "J", label: "下方插入行",     action: "table.add-row-below" },

    // ── 插入列 ───────────────────────────────────────
    { key: "H", label: "左侧插入列",     action: "table.add-col-left" },
    { key: "L", label: "右侧插入列",     action: "table.add-col-right" },

    // ── 合并 / 拆分 ──────────────────────────────────
    { key: "M", label: "合并单元格",     action: "table.merge-cells" },
    { key: "s", label: "拆分单元格",     action: "table.split-cell" },
  ],
};
