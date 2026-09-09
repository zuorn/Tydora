// src/vim/panes/index.ts
// 窗格导航模块：分屏布局树类型 + tmux 风格方向查找。
//
// 使用：
//   import { findAdjacentPane, collectPaneIds } from "../panes";
//   const next = findAdjacentPane(layout, activePaneId, "right");

export type { PaneLeaf, SplitGroup, SplitNode, NavDir } from "./types";
export { collectPaneIds, findAdjacentPane } from "./PaneNavigator";
