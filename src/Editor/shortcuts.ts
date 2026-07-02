import { DEFAULT_SHORTCUTS, SHORTCUTS_KEY } from "../Settings";

export interface ShortcutItem {
  id: string;
  label: string;
  keys: string[];
  group?: string;
}

export function loadShortcuts(): ShortcutItem[] {
  try {
    const saved = localStorage.getItem(SHORTCUTS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return DEFAULT_SHORTCUTS.map((def) => {
        const savedItem = parsed.find((s: ShortcutItem) => s.id === def.id);
        return savedItem ? { ...def, keys: savedItem.keys } : def;
      });
    }
  } catch {}
  return DEFAULT_SHORTCUTS;
}

export function getShortcutKeys(shortcuts: ShortcutItem[], id: string): string[] {
  const item = shortcuts.find((s) => s.id === id);
  return item?.keys || [];
}

export function formatShortcutDisplay(keys: string[]): string {
  return keys.join("+");
}

// 将快捷键字符串转换为事件匹配格式
export function matchShortcut(e: KeyboardEvent, keys: string[]): boolean {
  if (keys.length === 0) return false;

  const requiredKeys = keys.map((k) => k.toLowerCase());
  const hasCtrl = requiredKeys.includes("ctrl");
  const hasShift = requiredKeys.includes("shift");
  const hasAlt = requiredKeys.includes("alt");
  const hasMeta = requiredKeys.includes("meta") || requiredKeys.includes("cmd");

  // 检查修饰键
  if (hasCtrl !== (e.ctrlKey || e.metaKey)) return false;
  if (hasShift !== e.shiftKey) return false;
  if (hasAlt !== e.altKey) return false;
  if (hasMeta !== e.metaKey) return false;

  // 检查主键（排除修饰键）
  const mainKey = requiredKeys.find(
    (k) => !["ctrl", "shift", "alt", "meta", "cmd"].includes(k)
  );
  if (!mainKey) return false;

  return e.key.toLowerCase() === mainKey || e.code.toLowerCase() === `key${mainKey}`;
}
