// src/vim/panes/PaneNavigator.ts
// tmux 风格的窗格方向导航：在分屏布局树里按方向找最近相邻窗格。
//
// 算法（select-pane -L/-R/-U/-D 语义）：
// 1. 从当前 paneId 沿父 group 链向根遍历
// 2. 找到最近的、方向匹配的 group（left/right→lr，up/down→tb）
// 3. 在该 group 内取前/后相邻 child；若相邻 child 是子树，取其靠近起点的叶子
// 4. 找不到（已到该方向边界）→ 返回 null，由调用方决定是否跨界到侧栏

import type { SplitNode, SplitGroup, NavDir } from "./types";

/**
 * 收集整棵树中所有叶子 paneId（深度优先，按 children 顺序）。
 * 用于删除窗格后的孤儿缓冲清理、窗格计数等。
 */
export function collectPaneIds(root: SplitNode): string[] {
  const out: string[] = [];
  const walk = (n: SplitNode) => {
    if (n.type === "leaf") out.push(n.paneId);
    else n.children.forEach(walk);
  };
  walk(root);
  return out;
}

interface PathStep {
  group: SplitGroup;
  childIndex: number;
}

/** 找到 paneId 在树中的路径（从根到叶的 group 链）。 */
function pathToPane(root: SplitNode, paneId: string): PathStep[] | null {
  const result: PathStep[] = [];
  const walk = (n: SplitNode): boolean => {
    if (n.type === "leaf") return n.paneId === paneId;
    for (let i = 0; i < n.children.length; i++) {
      result.push({ group: n, childIndex: i });
      if (walk(n.children[i])) return true;
      result.pop();
    }
    return false;
  };
  return walk(root) ? result : null;
}

/**
 * 取一个子树"靠近起点"的叶子：
 * - right/down → 子树第一个叶（最左/最上，离起点最近）
 * - left/up    → 子树最后一个叶（最右/最下，离起点最近）
 */
function leafAtEdge(node: SplitNode, dir: NavDir): string | null {
  if (node.type === "leaf") return node.paneId;
  const wantFirst = dir === "right" || dir === "down";
  const child = wantFirst ? node.children[0] : node.children[node.children.length - 1];
  return leafAtEdge(child, dir);
}

/**
 * tmux 风格方向相邻窗格查找。
 * @returns 目标 paneId；null 表示该方向已到边界（无相邻窗格）
 */
export function findAdjacentPane(root: SplitNode, fromPaneId: string, dir: NavDir): string | null {
  const path = pathToPane(root, fromPaneId);
  if (!path) return null;

  const horizontal = dir === "left" || dir === "right";
  const delta = dir === "left" || dir === "up" ? -1 : 1;

  // 从叶子向根，找最近的方向匹配 group
  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i];
    const group = step.group;
    const dirMatches = horizontal ? group.dir === "lr" : group.dir === "tb";
    if (!dirMatches) continue;

    const targetIdx = step.childIndex + delta;
    if (targetIdx < 0 || targetIdx >= group.children.length) continue;

    // 相邻 child：leaf 直接用；group 取其靠近起点的叶子
    return leafAtEdge(group.children[targetIdx], dir);
  }
  return null;
}
