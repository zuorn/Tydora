// src/vim/panes/types.ts
// 分屏布局树类型。App.tsx 与 PaneNavigator 共享，避免循环依赖。
//
// 布局语义：
// - dir="lr"：水平分屏，children 从左到右排列
// - dir="tb"：垂直分屏，children 从上到下排列
// - 通过嵌套 group 支持混合方向分屏（例：左右分屏中的某一边再上下分）

export interface PaneLeaf {
  type: "leaf";
  paneId: string;
  flex: number;
}

export interface SplitGroup {
  type: "group";
  groupId: string;
  dir: "lr" | "tb";
  flex: number; // 该组作为父组 child 时的 flex 占比
  children: SplitNode[];
}

export type SplitNode = PaneLeaf | SplitGroup;

/** 窗格导航方向 */
export type NavDir = "left" | "right" | "up" | "down";
