import { DEFAULT_SHORTCUTS, SHORTCUTS_KEY } from "../Settings";

export interface ShortcutItem {
  id: string;
  label: string;
  keys: string[];
  group?: string;
}

/** macOS（含 WKWebView）：配置里的 Ctrl 表示 Command */
export function isMacPlatform(): boolean {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("platform-macos")) {
    return true;
  }
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

/** 单键展示：macOS 上将 Ctrl→⌘、Alt→⌥、Shift→⇧ */
export function formatShortcutKey(key: string): string {
  if (!isMacPlatform()) return key;
  switch (key.toLowerCase()) {
    case "ctrl":
      return "⌘";
    case "alt":
      return "⌥";
    case "shift":
      return "⇧";
    case "meta":
    case "cmd":
      return "⌘";
    default:
      return key;
  }
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
  if (keys.length === 0) return "";
  return keys.map(formatShortcutKey).join("+");
}

// 将快捷键字符串转换为事件匹配格式
export function matchShortcut(e: KeyboardEvent, keys: string[]): boolean {
  if (keys.length === 0) return false;

  const requiredKeys = keys.map((k) => k.toLowerCase());
  const hasCtrl = requiredKeys.includes("ctrl");
  const hasShift = requiredKeys.includes("shift");
  const hasAlt = requiredKeys.includes("alt");
  const hasMeta = requiredKeys.includes("meta") || requiredKeys.includes("cmd");

  // Ctrl = 主修饰键：Windows/Linux 为 Control，macOS 为 ⌘（meta）
  const primaryMod = e.ctrlKey || e.metaKey;
  if (hasCtrl !== primaryMod) return false;
  if (hasShift !== e.shiftKey) return false;
  if (hasAlt !== e.altKey) return false;
  // 仅当配置显式写 Meta/Cmd 且未用 Ctrl 别名时，才单独校验 meta
  if (hasMeta && !hasCtrl && !e.metaKey) return false;

  // 检查主键（排除修饰键）
  const mainKey = requiredKeys.find(
    (k) => !["ctrl", "shift", "alt", "meta", "cmd"].includes(k)
  );
  if (!mainKey) return false;

  const keyLower = e.key.toLowerCase();
  if (keyLower === mainKey) return true;
  if (e.code.toLowerCase() === `key${mainKey}`) return true;
  // 标点：e.code 与配置字符对齐（如 Comma ↔ ,）
  const codeMap: Record<string, string> = {
    ",": "Comma",
    ".": "Period",
    "/": "Slash",
    "\\": "Backslash",
    "`": "Backquote",
    "-": "Minus",
    "=": "Equal",
    ";": "Semicolon",
    "'": "Quote",
    "[": "BracketLeft",
    "]": "BracketRight",
  };
  const expectedCode = codeMap[mainKey];
  if (expectedCode && e.code === expectedCode) return true;

  return false;
}
