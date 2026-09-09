// src/vim/leader/LeaderMenu.tsx
// which-key 风格 Leader 菜单。
// 纯展示组件：接收 useLeader 的状态，渲染菜单与子菜单导航。
//
// 设计：
// - 右下角浮层，背景完全透明
// - 每项：左侧键（kbd 风格）+ 右侧动作名
// - 子菜单用面包屑显示路径
// - 不处理键位（由 useLeader 的全局监听接管）

import { createPortal } from "react-dom";
import type { LeaderItem } from "../types";
import "./LeaderMenu.css";

interface LeaderMenuProps {
  open: boolean;
  items: LeaderItem[];
  path: string[];
}

export function LeaderMenu({ open, items, path }: LeaderMenuProps) {
  if (!open) return null;

  return createPortal(
    <div className="vim-leader-overlay" role="dialog" aria-label="Vim which-key 菜单">
      <div className="vim-leader-menu">
        {path.length > 0 && (
          <div className="vim-leader-breadcrumb">
            {path.map((p, i) => (
              <span key={i} className="vim-leader-breadcrumb-item">
                {p}
                {i < path.length - 1 && <span className="vim-leader-breadcrumb-sep">›</span>}
              </span>
            ))}
          </div>
        )}
        <ul className="vim-leader-list">
          {items.map((item) => (
            <li key={item.key} className="vim-leader-item">
              <kbd className="vim-leader-key">{item.key === " " ? "␣" : item.key}</kbd>
              <span className="vim-leader-label">{item.label}</span>
              {item.children && <span className="vim-leader-arrow">▸</span>}
            </li>
          ))}
        </ul>
        <div className="vim-leader-footer">
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
