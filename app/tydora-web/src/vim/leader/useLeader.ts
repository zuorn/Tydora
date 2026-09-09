// src/vim/leader/useLeader.ts
// Leader 菜单触发与键位匹配 hook。
//
// 职责：
// - 监听全局 keydown，在 normal 态按下 leaderKey 时打开菜单
// - 菜单打开期间监听单键，匹配则执行 action 并关闭
// - 超时自动关闭
// - 嵌套子菜单导航
//
// 编辑器无关：通过 dispatchAction 回调执行动作，由调用方决定走 CM 还是 TipTap

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeaderItem } from "../types";
import { leaderConfig } from "../config/leader";

export interface UseLeaderOptions {
  /** 是否启用（Vim 开关 + 当前编辑器支持） */
  enabled: boolean;
  /** 触发 Leader 的键（源码模式为 leaderKey，TipTap 为 tiptapLeaderKey） */
  triggerKey: string;
  /** 菜单超时 ms */
  timeout: number;
  /** 仅在 normal 态触发（TipTap 恒为 insert，但用不同触发键故可放开） */
  active: boolean;
  /** 动作分发器：返回 true 表示已处理 */
  dispatchAction: (action: string) => boolean;
  /** 自定义初始菜单项（默认用 leaderConfig.items） */
  initialItems?: LeaderItem[];
  /** 被动模式：只显示菜单但不拦截按键（g/z 前缀用，按键由 vim 扩展原生处理） */
  passive?: boolean;
}

export interface UseLeaderReturn {
  /** 菜单是否打开 */
  open: boolean;
  /** 当前显示的菜单项（顶层或某子菜单） */
  items: LeaderItem[];
  /** 当前层级路径（用于显示面包屑） */
  path: string[];
  /** 打开菜单（外部可主动调用） */
  openMenu: () => void;
  /** 关闭菜单 */
  closeMenu: () => void;
}

export function useLeader(options: UseLeaderOptions): UseLeaderReturn {
  const { enabled, triggerKey, timeout, active, dispatchAction, initialItems, passive = false } = options;
  const rootItems = initialItems ?? leaderConfig.items;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LeaderItem[]>(rootItems);
  const [path, setPath] = useState<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dispatchRef = useRef(dispatchAction);
  dispatchRef.current = dispatchAction;

  // 用 ref 持有最新的 state，避免 effect 频繁重注册 listener
  const openRef = useRef(open);
  openRef.current = open;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeRef = useRef(active);
  activeRef.current = active;
  const rootItemsRef = useRef(rootItems);
  rootItemsRef.current = rootItems;
  const passiveRef = useRef(passive);
  passiveRef.current = passive;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setItems(rootItemsRef.current);
    setPath([]);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    if (!enabled) return;
    setOpen(true);
    setItems(rootItemsRef.current);
    setPath([]);
  }, [enabled]);

  // 监听全局 keydown（只注册一次，用 ref 读最新 state）
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isOpen = openRef.current;
      const isActive = activeRef.current;
      const isPassive = passiveRef.current;

      // 弹框输入框（QuickOpen/CommandPalette 等）中不触发 Leader，
      // 避免拦截 Space / ; 等导致输入异常。菜单已打开时仍需处理关闭逻辑。
      const target = e.target as HTMLElement | null;
      if (
        !isOpen &&
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      // 菜单关闭时：仅在 active 态监听触发键
      if (!isOpen) {
        if (isActive && e.key === triggerKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (!isPassive) {
            // 主动模式：拦截触发键，防止 vim 扩展消费
            e.preventDefault();
            e.stopPropagation();
          }
          // 被动模式：不拦截，让 vim 扩展原生处理（g/z 前缀）
          openMenu();
        }
        return;
      }

      // 菜单打开期间
      if (!isPassive) {
        // 主动模式：拦截所有键
        e.preventDefault();
        e.stopPropagation();
      }

      // Escape 始终关闭菜单
      if (e.key === "Escape") {
        closeMenu();
        return;
      }

      // 被动模式：任意键关闭菜单（按键由 vim 扩展原生处理）
      if (isPassive) {
        closeMenu();
        return;
      }

      // 主动模式：优先匹配菜单项（让 triggerKey 也能作为菜单项，如 Space+Space）
      const currentItems = itemsRef.current;
      const hit = currentItems.find((it) => it.key === e.key);
      if (hit) {
        if (hit.children && hit.children.length > 0) {
          setItems(hit.children);
          setPath((p) => [...p, hit.label]);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          if (timeout > 0) {
            timeoutRef.current = setTimeout(() => {
              setOpen(false);
              setItems(rootItemsRef.current);
              setPath([]);
            }, timeout);
          }
          return;
        }

        if (hit.action) {
          dispatchRef.current(hit.action);
        }
        closeMenu();
        return;
      }

      // triggerKey 再次按下且无菜单项匹配时关闭菜单（toggle 行为）
      if (e.key === triggerKey) {
        closeMenu();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, triggerKey, openMenu, closeMenu, timeout]);

  // 菜单打开时启动超时
  useEffect(() => {
    if (open) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (timeout > 0) {
        timeoutRef.current = setTimeout(() => {
          setOpen(false);
          setItems(rootItemsRef.current);
          setPath([]);
        }, timeout);
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open, timeout]);

  return { open, items, path, openMenu, closeMenu };
}
