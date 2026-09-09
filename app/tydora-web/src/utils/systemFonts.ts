import { invoke } from "@tauri-apps/api/core";

export interface SystemFontInfo {
  family: string;
  monospaced: boolean;
}

export const SYSTEM_FONT_SENTINEL = "system";

export const DEFAULT_EDITOR_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const DEFAULT_CODE_FONT_STACK =
  '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';

/** 内置可网页加载的字体预设（编辑器正文字体） */
export const BUILTIN_EDITOR_FONTS: { id: string; label: string; stack: string }[] = [
  { id: "lxgw-wenkai", label: "霞鹜文楷", stack: "'LXGW WenKai', system-ui, sans-serif" },
  { id: "lxgw-xinxihei", label: "霞鹜新晰黑", stack: "'LXGW XinXiHei', system-ui, sans-serif" },
];

let cachedFonts: SystemFontInfo[] | null = null;
let loadingPromise: Promise<SystemFontInfo[]> | null = null;

/** 拉取并缓存系统字体列表（失败时返回空数组）。 */
export async function listSystemFonts(force = false): Promise<SystemFontInfo[]> {
  if (!force && cachedFonts) return cachedFonts;
  if (!force && loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const fonts = await invoke<SystemFontInfo[]>("list_system_fonts");
      cachedFonts = Array.isArray(fonts) ? fonts : [];
      return cachedFonts;
    } catch {
      cachedFonts = [];
      return cachedFonts;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

function quoteFontFamily(family: string): string {
  const trimmed = family.trim();
  if (!trimmed) return trimmed;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed;
  }
  if (/[\s,]/.test(trimmed)) return `"${trimmed.replace(/"/g, '\\"')}"`;
  return trimmed;
}

/** 是否为旧版完整 CSS font-family 栈（含逗号或多个关键字）。 */
export function isFontStack(value: string): boolean {
  return value.includes(",") || /system-ui|-apple-system|sans-serif|monospace|serif/i.test(value);
}

/**
 * 解析编辑器正文字体设置值为可写入 CSS 的 font-family。
 * - `system` → 默认无衬线栈
 * - 内置 id / 完整栈 → 原样或映射
 * - 单一族名 → `"Family", <默认栈>`
 */
export function resolveEditorFont(value: string | undefined | null): string {
  if (!value || value === SYSTEM_FONT_SENTINEL) return DEFAULT_EDITOR_FONT_STACK;
  const builtin = BUILTIN_EDITOR_FONTS.find((f) => f.id === value || f.stack === value);
  if (builtin) return builtin.stack;
  if (isFontStack(value)) return value;
  return `${quoteFontFamily(value)}, ${DEFAULT_EDITOR_FONT_STACK}`;
}

/**
 * 解析代码/等宽字体设置值。
 * - `system` → 默认 mono 栈
 * - 完整栈 → 原样
 * - 单一族名 → `"Family", monospace`
 */
export function resolveCodeFont(value: string | undefined | null): string {
  if (!value || value === SYSTEM_FONT_SENTINEL) return DEFAULT_CODE_FONT_STACK;
  if (isFontStack(value)) return value;
  return `${quoteFontFamily(value)}, monospace`;
}

/** 按需注入 LXGW 网页字体（与原先 App.tsx 逻辑一致）。 */
export function ensureWebFontsLoaded(editorFontValue: string) {
  const resolved = resolveEditorFont(editorFontValue);
  if (resolved.includes("LXGW WenKai") && !document.getElementById("lxgw-wenkai-font")) {
    const link = document.createElement("link");
    link.id = "lxgw-wenkai-font";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css";
    document.head.appendChild(link);
  }
  if (resolved.includes("LXGW XinXiHei") && !document.getElementById("lxgw-xinxihei-font")) {
    const link = document.createElement("link");
    link.id = "lxgw-xinxihei-font";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/lxgw-xinxihei-webfont@1.7.0/style.css";
    document.head.appendChild(link);
  }
}

/** 将字体设置应用到 documentElement CSS 变量。 */
export function applyFontSettings(opts: {
  editorFont?: string | null;
  codeFont?: string | null;
  codeFontSize?: number | null;
}) {
  if (opts.editorFont != null) {
    ensureWebFontsLoaded(opts.editorFont);
    document.documentElement.style.setProperty("--editor-font", resolveEditorFont(opts.editorFont));
  }
  if (opts.codeFont != null) {
    document.documentElement.style.setProperty("--font-mono", resolveCodeFont(opts.codeFont));
  }
  if (typeof opts.codeFontSize === "number" && Number.isFinite(opts.codeFontSize)) {
    const size = Math.min(24, Math.max(10, Math.round(opts.codeFontSize)));
    document.documentElement.style.setProperty("--font-mono-size", `${size}px`);
  }
}

/**
 * 将已保存的值规范为 FontPicker 使用的 value：
 * - 系统默认栈 → `system`
 * - 内置栈 → 内置 id
 * - 旧版完整 CSS 栈 → 提取第一个族名
 * - 其余保留
 */
export function normalizeEditorFontValue(value: string | undefined | null): string {
  if (!value) return SYSTEM_FONT_SENTINEL;
  if (value === SYSTEM_FONT_SENTINEL) return value;
  if (value === DEFAULT_EDITOR_FONT_STACK) return SYSTEM_FONT_SENTINEL;
  const builtin = BUILTIN_EDITOR_FONTS.find((f) => f.stack === value || f.id === value);
  if (builtin) return builtin.id;
  if (value.startsWith("system-ui")) return SYSTEM_FONT_SENTINEL;
  if (isFontStack(value)) {
    const first = value.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
    if (!first || /^(system-ui|-apple-system|sans-serif|serif|monospace|ui-sans-serif)$/i.test(first)) {
      return SYSTEM_FONT_SENTINEL;
    }
    return first;
  }
  return value;
}

export function normalizeCodeFontValue(value: string | undefined | null): string {
  if (!value) return SYSTEM_FONT_SENTINEL;
  if (value === SYSTEM_FONT_SENTINEL) return value;
  if (value === DEFAULT_CODE_FONT_STACK) return SYSTEM_FONT_SENTINEL;
  if (isFontStack(value)) {
    const first = value.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
    if (!first || /^(monospace|ui-monospace)$/i.test(first)) {
      return SYSTEM_FONT_SENTINEL;
    }
    return first;
  }
  return value;
}
