/**
 * 终端设置核心模块。
 *
 * 集中管理终端的全部可配置项（配色方案、字体、字号），包括：
 * - 数据模型与默认值
 * - localStorage 持久化
 * - 配色预设（参考 Windows Terminal 内置方案）与字体预设
 * - 全局内存 store + 订阅，供 TerminalView / Settings UI 共享
 * - 基于 Tauri 事件的跨窗口同步（设置窗口修改后，主窗口已挂载终端实时热更新）
 *
 * 设计要点：所有终端相关的"状态 + 行为"都收敛在本文件，TerminalView 只消费，
 * Settings UI 只读写，避免终端配置散落在多处。
 */
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── 字号常量（从 terminalApi.ts 迁移集中管理） ─────────────────────

export const TERMINAL_MIN_FONT_SIZE = 8;
export const TERMINAL_MAX_FONT_SIZE = 40;
export const TERMINAL_DEFAULT_FONT_SIZE = 13;

// ── 数据模型 ───────────────────────────────────────────────────────

/**
 * 终端配色方案：要么是预设 id，要么是 "auto"（跟随应用明暗主题）。
 */
export type TerminalColorSchemeId =
  | "auto"
  | "campbell"
  | "campbell-powershell"
  | "one-half-dark"
  | "one-half-light"
  | "solarized-dark"
  | "solarized-light"
  | "tango-dark"
  | "tango-light"
  | "vintage"
  | "dracula"
  | "retro";

export interface TerminalSettings {
  /** 配色方案 id；auto 表示跟随应用明暗主题（由 TerminalView 根据 theme prop 解析）。 */
  colorScheme: TerminalColorSchemeId;
  /** 字体族字符串（CSS font-family），可为预设 id 或自定义字体名。 */
  fontFamily: string;
  /** 字号（pt），范围 TERMINAL_MIN_FONT_SIZE ~ TERMINAL_MAX_FONT_SIZE。 */
  fontSize: number;
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  colorScheme: "auto",
  fontFamily: "auto",
  fontSize: TERMINAL_DEFAULT_FONT_SIZE,
};

// ── 存储键 ─────────────────────────────────────────────────────────

export const TERMINAL_SETTINGS_KEY = "tydora.terminal.settings";
/** 跨窗口同步事件名（设置窗口 emit，所有窗口 listen）。 */
const TERMINAL_SETTINGS_SYNC_EVENT = "tydora:terminal-settings-sync";

// ── 配色预设（参考 Windows Terminal 内置 schemes） ────────────────

/** xterm 主题色板（16 色 + 背景/前景/光标/选区）。 */
export interface XtermThemeColors {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface TerminalColorScheme {
  id: TerminalColorSchemeId;
  /** 显示名称（i18n key：settings.terminal.scheme.<id>）。 */
  nameKey: string;
  /** 用于设置页色块预览的代表性颜色（背景 + 前景 + 红/绿/蓝）。 */
  preview: { bg: string; fg: string; red: string; green: string; blue: string };
  /** 明暗倾向，auto 模式回退用。 */
  tone: "light" | "dark" | "auto";
  /** 该方案在明/暗主题下的具体色板（auto 方案需由调用方根据应用主题选择）。 */
  light?: XtermThemeColors;
  dark?: XtermThemeColors;
}

// auto 方案的两个分支（与原 TerminalView 内置 light/dark 一致，保持向后兼容）
const AUTO_LIGHT: XtermThemeColors = {
  background: "#ffffff",
  foreground: "#1f2328",
  cursor: "#1f2328",
  cursorAccent: "#ffffff",
  selectionBackground: "#b3d4ff",
  black: "#1f2328",
  red: "#cf222e",
  green: "#1a7f37",
  yellow: "#9a6700",
  blue: "#0969da",
  magenta: "#8250df",
  cyan: "#0598bc",
  white: "#586069",
  brightBlack: "#6e7781",
  brightRed: "#ff6b6b",
  brightGreen: "#3fb950",
  brightYellow: "#d4a72c",
  brightBlue: "#58a6ff",
  brightMagenta: "#bc8cff",
  brightCyan: "#39d0d8",
  brightWhite: "#ffffff",
};

const AUTO_DARK: XtermThemeColors = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#264f78",
  black: "#1e1e1e",
  red: "#f44747",
  green: "#6a9955",
  yellow: "#dcdcaa",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#d4d4d4",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#6a9955",
  brightYellow: "#dcdcaa",
  brightBlue: "#569cd6",
  brightMagenta: "#c586c0",
  brightCyan: "#4ec9b0",
  brightWhite: "#ffffff",
};

export const TERMINAL_COLOR_SCHEMES: TerminalColorScheme[] = [
  {
    id: "auto",
    nameKey: "settings.terminal.scheme.auto",
    preview: { bg: "#1e1e1e", fg: "#d4d4d4", red: "#f44747", green: "#6a9955", blue: "#569cd6" },
    tone: "auto",
    light: AUTO_LIGHT,
    dark: AUTO_DARK,
  },
  {
    id: "campbell",
    nameKey: "settings.terminal.scheme.campbell",
    preview: { bg: "#0c0c0c", fg: "#cccccc", red: "#c50f1f", green: "#13a10e", blue: "#0037da" },
    tone: "dark",
    dark: {
      background: "#0c0c0c", foreground: "#cccccc", cursor: "#cccccc", cursorAccent: "#0c0c0c",
      selectionBackground: "#264f78",
      black: "#0c0c0c", red: "#c50f1f", green: "#13a10e", yellow: "#c19c00",
      blue: "#0037da", magenta: "#881798", cyan: "#3a96dd", white: "#cccccc",
      brightBlack: "#767676", brightRed: "#e74856", brightGreen: "#16c60c", brightYellow: "#f9f1a5",
      brightBlue: "#3b78ff", brightMagenta: "#b4009e", brightCyan: "#61d6d6", brightWhite: "#f2f2f2",
    },
  },
  {
    id: "campbell-powershell",
    nameKey: "settings.terminal.scheme.campbell-powershell",
    preview: { bg: "#012456", fg: "#cccccc", red: "#c50f1f", green: "#13a10e", blue: "#0037da" },
    tone: "dark",
    dark: {
      background: "#012456", foreground: "#cccccc", cursor: "#cccccc", cursorAccent: "#012456",
      selectionBackground: "#264f78",
      black: "#0c0c0c", red: "#c50f1f", green: "#13a10e", yellow: "#c19c00",
      blue: "#0037da", magenta: "#881798", cyan: "#3a96dd", white: "#cccccc",
      brightBlack: "#767676", brightRed: "#e74856", brightGreen: "#16c60c", brightYellow: "#f9f1a5",
      brightBlue: "#3b78ff", brightMagenta: "#b4009e", brightCyan: "#61d6d6", brightWhite: "#f2f2f2",
    },
  },
  {
    id: "one-half-dark",
    nameKey: "settings.terminal.scheme.one-half-dark",
    preview: { bg: "#282c34", fg: "#dcdfe4", red: "#e06c75", green: "#98c379", blue: "#61afef" },
    tone: "dark",
    dark: {
      background: "#282c34", foreground: "#dcdfe4", cursor: "#dcdfe4", cursorAccent: "#282c34",
      selectionBackground: "#474e5d",
      black: "#282c34", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#dcdfe4",
      brightBlack: "#5a6374", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b",
      brightBlue: "#61afef", brightMagenta: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#dcdfe4",
    },
  },
  {
    id: "one-half-light",
    nameKey: "settings.terminal.scheme.one-half-light",
    preview: { bg: "#fafafa", fg: "#383a42", red: "#e45649", green: "#50a14f", blue: "#4078f2" },
    tone: "light",
    light: {
      background: "#fafafa", foreground: "#383a42", cursor: "#383a42", cursorAccent: "#fafafa",
      selectionBackground: "#bfceff",
      black: "#383a42", red: "#e45649", green: "#50a14f", yellow: "#c18401",
      blue: "#4078f2", magenta: "#a626a4", cyan: "#0184bc", white: "#a0a1a7",
      brightBlack: "#5c6370", brightRed: "#e45649", brightGreen: "#50a14f", brightYellow: "#c18401",
      brightBlue: "#4078f2", brightMagenta: "#a626a4", brightCyan: "#0184bc", brightWhite: "#f0f0f0",
    },
  },
  {
    id: "solarized-dark",
    nameKey: "settings.terminal.scheme.solarized-dark",
    preview: { bg: "#002b36", fg: "#839496", red: "#dc322f", green: "#859900", blue: "#268bd2" },
    tone: "dark",
    dark: {
      background: "#002b36", foreground: "#839496", cursor: "#839496", cursorAccent: "#002b36",
      selectionBackground: "#073642",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83",
      brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
    },
  },
  {
    id: "solarized-light",
    nameKey: "settings.terminal.scheme.solarized-light",
    preview: { bg: "#fdf6e3", fg: "#657b83", red: "#dc322f", green: "#859900", blue: "#268bd2" },
    tone: "light",
    light: {
      background: "#fdf6e3", foreground: "#657b83", cursor: "#657b83", cursorAccent: "#fdf6e3",
      selectionBackground: "#eee8d5",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83",
      brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
    },
  },
  {
    id: "tango-dark",
    nameKey: "settings.terminal.scheme.tango-dark",
    preview: { bg: "#000000", fg: "#ffffff", red: "#cc0000", green: "#4e9a06", blue: "#3465a4" },
    tone: "dark",
    dark: {
      background: "#000000", foreground: "#ffffff", cursor: "#ffffff", cursorAccent: "#000000",
      selectionBackground: "#5a7daa",
      black: "#000000", red: "#cc0000", green: "#4e9a06", yellow: "#c4a000",
      blue: "#3465a4", magenta: "#75507b", cyan: "#06989a", white: "#d3d7cf",
      brightBlack: "#555753", brightRed: "#ef2929", brightGreen: "#8ae234", brightYellow: "#fce94f",
      brightBlue: "#729fcf", brightMagenta: "#ad7fa8", brightCyan: "#34e2e2", brightWhite: "#eeeeec",
    },
  },
  {
    id: "tango-light",
    nameKey: "settings.terminal.scheme.tango-light",
    preview: { bg: "#ffffff", fg: "#000000", red: "#cc0000", green: "#4e9a06", blue: "#3465a4" },
    tone: "light",
    light: {
      background: "#ffffff", foreground: "#000000", cursor: "#000000", cursorAccent: "#ffffff",
      selectionBackground: "#5a7daa",
      black: "#000000", red: "#cc0000", green: "#4e9a06", yellow: "#c4a000",
      blue: "#3465a4", magenta: "#75507b", cyan: "#06989a", white: "#d3d7cf",
      brightBlack: "#555753", brightRed: "#ef2929", brightGreen: "#8ae234", brightYellow: "#fce94f",
      brightBlue: "#729fcf", brightMagenta: "#ad7fa8", brightCyan: "#34e2e2", brightWhite: "#eeeeec",
    },
  },
  {
    id: "vintage",
    nameKey: "settings.terminal.scheme.vintage",
    preview: { bg: "#000000", fg: "#c0c0c0", red: "#a80000", green: "#00a800", blue: "#0000a8" },
    tone: "dark",
    dark: {
      background: "#000000", foreground: "#c0c0c0", cursor: "#c0c0c0", cursorAccent: "#000000",
      selectionBackground: "#a80000",
      black: "#000000", red: "#a80000", green: "#00a800", yellow: "#a8a800",
      blue: "#0000a8", magenta: "#a800a8", cyan: "#00a8a8", white: "#c0c0c0",
      brightBlack: "#808080", brightRed: "#fc54fc", brightGreen: "#54fc54", brightYellow: "#fcfc54",
      brightBlue: "#5454fc", brightMagenta: "#fc54fc", brightCyan: "#54fcfc", brightWhite: "#ffffff",
    },
  },
  {
    id: "dracula",
    nameKey: "settings.terminal.scheme.dracula",
    preview: { bg: "#282a36", fg: "#f8f8f2", red: "#ff5555", green: "#50fa7b", blue: "#bd93f9" },
    tone: "dark",
    dark: {
      background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", cursorAccent: "#282a36",
      selectionBackground: "#44475a",
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e67", brightGreen: "#5af78e", brightYellow: "#f4f99f",
      brightBlue: "#caa9fa", brightMagenta: "#ff92d0", brightCyan: "#9aedfe", brightWhite: "#ffffff",
    },
  },
  {
    id: "retro",
    nameKey: "settings.terminal.scheme.retro",
    preview: { bg: "#000000", fg: "#33ff00", red: "#ff3333", green: "#33ff00", blue: "#3333ff" },
    tone: "dark",
    dark: {
      background: "#000000", foreground: "#33ff00", cursor: "#33ff00", cursorAccent: "#000000",
      selectionBackground: "#003300",
      black: "#000000", red: "#ff3333", green: "#33ff00", yellow: "#ffff33",
      blue: "#3333ff", magenta: "#ff33ff", cyan: "#33ffff", white: "#cccccc",
      brightBlack: "#666666", brightRed: "#ff6666", brightGreen: "#66ff66", brightYellow: "#ffff66",
      brightBlue: "#6666ff", brightMagenta: "#ff66ff", brightCyan: "#66ffff", brightWhite: "#ffffff",
    },
  },
];

// ── 字体预设 ───────────────────────────────────────────────────────

export interface TerminalFontPreset {
  /** 显示名称（i18n key：settings.terminal.font.<id>）。 */
  nameKey: string;
  /** 实际写入 xterm 的 font-family 字符串。 */
  value: string;
}

export const TERMINAL_FONT_PRESETS: TerminalFontPreset[] = [
  { nameKey: "settings.terminal.font.auto", value: "auto" },
  { nameKey: "settings.terminal.font.consolas", value: "Consolas, \"Cascadia Code\", monospace" },
  { nameKey: "settings.terminal.font.cascadia", value: "\"Cascadia Code\", Consolas, monospace" },
  { nameKey: "settings.terminal.font.jetbrains", value: "\"JetBrains Mono\", Consolas, monospace" },
  { nameKey: "settings.terminal.font.fira", value: "\"Fira Code\", Consolas, monospace" },
  { nameKey: "settings.terminal.font.sourceCodePro", value: "\"Source Code Pro\", Consolas, monospace" },
  { nameKey: "settings.terminal.font.menlo", value: "Menlo, Monaco, \"Courier New\", monospace" },
  { nameKey: "settings.terminal.font.monaco", value: "Monaco, Menlo, \"Courier New\", monospace" },
  { nameKey: "settings.terminal.font.courier", value: "\"Courier New\", Courier, monospace" },
];

/** 默认字体族（auto 时实际使用的字符串，与原 TerminalView 硬编码一致）。 */
export const TERMINAL_DEFAULT_FONT_FAMILY =
  'Consolas, "Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace';

// ── 持久化 ─────────────────────────────────────────────────────────

/** 从 localStorage 读取终端设置，合并默认值。 */
export function loadTerminalSettings(): TerminalSettings {
  try {
    const saved = localStorage.getItem(TERMINAL_SETTINGS_KEY);
    if (!saved) return { ...DEFAULT_TERMINAL_SETTINGS };
    const parsed = JSON.parse(saved) as Partial<TerminalSettings>;
    return {
      colorScheme: parsed.colorScheme ?? DEFAULT_TERMINAL_SETTINGS.colorScheme,
      fontFamily: parsed.fontFamily ?? DEFAULT_TERMINAL_SETTINGS.fontFamily,
      fontSize: clampFontSize(parsed.fontSize ?? DEFAULT_TERMINAL_SETTINGS.fontSize),
    };
  } catch {
    return { ...DEFAULT_TERMINAL_SETTINGS };
  }
}

/** 持久化终端设置到 localStorage（不广播）。 */
function persistTerminalSettings(settings: TerminalSettings): void {
  try {
    localStorage.setItem(TERMINAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 不可用时忽略
  }
}

function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return TERMINAL_DEFAULT_FONT_SIZE;
  return Math.min(TERMINAL_MAX_FONT_SIZE, Math.max(TERMINAL_MIN_FONT_SIZE, Math.round(size)));
}

// ── 全局内存 store + 订阅 ──────────────────────────────────────────

let currentSettings: TerminalSettings = loadTerminalSettings();
const settingsListeners = new Set<(s: TerminalSettings) => void>();

/** 读取当前全局终端设置。 */
export function getTerminalSettings(): TerminalSettings {
  return currentSettings;
}

/**
 * 设置终端设置：校验 → 持久化 → 更新内存 → 广播给本窗口订阅者 → 跨窗口 emit 同步。
 * 用于设置页交互（每次单项修改都会调用）。
 */
export function setTerminalSettings(next: TerminalSettings): void {
  const normalized: TerminalSettings = {
    colorScheme: next.colorScheme,
    fontFamily: next.fontFamily || TERMINAL_DEFAULT_FONT_FAMILY,
    fontSize: clampFontSize(next.fontSize),
  };
  if (
    normalized.colorScheme === currentSettings.colorScheme &&
    normalized.fontFamily === currentSettings.fontFamily &&
    normalized.fontSize === currentSettings.fontSize
  ) {
    return;
  }
  currentSettings = normalized;
  persistTerminalSettings(normalized);
  // 本窗口订阅者（主窗口已挂载的终端）立即热更新
  settingsListeners.forEach((fn) => fn(normalized));
  // 跨窗口同步（设置窗口 → 主窗口；主窗口自身 emit 也会被本窗口监听到，幂等）
  emit(TERMINAL_SETTINGS_SYNC_EVENT, normalized).catch(() => {
    // emit 失败不影响本窗口
  });
}

/** 订阅终端设置变化（注册时立即收到当前值）；返回取消订阅函数。 */
export function subscribeTerminalSettings(fn: (s: TerminalSettings) => void): () => void {
  settingsListeners.add(fn);
  fn(currentSettings);
  return () => {
    settingsListeners.delete(fn);
  };
}

// ── 跨窗口同步：监听其他窗口的设置变更 ────────────────────────────

let crossWindowUnlisten: UnlistenFn | null = null;
let crossWindowStarted = false;

/** 注册跨窗口同步监听（幂等，仅注册一次）。在主窗口启动时调用。 */
export function startTerminalSettingsSync(): void {
  if (crossWindowStarted) return;
  crossWindowStarted = true;
  listen<TerminalSettings>(TERMINAL_SETTINGS_SYNC_EVENT, (event) => {
    const incoming = event.payload;
    if (!incoming || typeof incoming !== "object") return;
    const normalized: TerminalSettings = {
      colorScheme: (incoming.colorScheme as TerminalColorSchemeId) ?? currentSettings.colorScheme,
      fontFamily: incoming.fontFamily || TERMINAL_DEFAULT_FONT_FAMILY,
      fontSize: clampFontSize(incoming.fontSize ?? currentSettings.fontSize),
    };
    if (
      normalized.colorScheme === currentSettings.colorScheme &&
      normalized.fontFamily === currentSettings.fontFamily &&
      normalized.fontSize === currentSettings.fontSize
    ) {
      return;
    }
    currentSettings = normalized;
    persistTerminalSettings(normalized);
    settingsListeners.forEach((fn) => fn(normalized));
  })
    .then((fn) => {
      crossWindowUnlisten = fn;
    })
    .catch(() => {
      crossWindowStarted = false;
    });
}

/** 停止跨窗口同步监听（可选，应用退出时调用）。 */
export function stopTerminalSettingsSync(): void {
  crossWindowUnlisten?.();
  crossWindowUnlisten = null;
  crossWindowStarted = false;
}

// ── 便捷读取：字号（兼容旧 terminalApi 的导出） ────────────────────

/** 读取当前终端字号。 */
export function getTerminalFontSize(): number {
  return currentSettings.fontSize;
}

/** 设置终端字号（单独修改字号，保持其他设置不变）。 */
export function setTerminalFontSize(size: number): void {
  setTerminalSettings({ ...currentSettings, fontSize: clampFontSize(size) });
}

/** 订阅终端字号变化（注册时立即收到当前值）；返回取消订阅函数。 */
export function subscribeTerminalFontSize(fn: (size: number) => void): () => void {
  const wrapper = (s: TerminalSettings) => fn(s.fontSize);
  return subscribeTerminalSettings(wrapper);
}

// ── 解析助手：把设置转换为 xterm 可用的具体值 ──────────────────────

/**
 * 根据 colorScheme id 与当前应用明暗主题，解析出具体的 xterm 主题色板。
 * @param schemeId 配色方案 id
 * @param appTheme 当前应用主题（"light" | "dark"），auto 方案据此回退
 */
export function resolveXtermTheme(
  schemeId: TerminalColorSchemeId,
  appTheme: "light" | "dark",
): XtermThemeColors {
  const scheme = TERMINAL_COLOR_SCHEMES.find((s) => s.id === schemeId) ?? TERMINAL_COLOR_SCHEMES[0];
  if (scheme.id === "auto") {
    return appTheme === "light" ? (scheme.light ?? AUTO_LIGHT) : (scheme.dark ?? AUTO_DARK);
  }
  // 非 auto 方案优先用对应 tone 的色板；若只有单侧则回退到已有侧
  if (scheme.tone === "light") return scheme.light ?? scheme.dark ?? AUTO_LIGHT;
  if (scheme.tone === "dark") return scheme.dark ?? scheme.light ?? AUTO_DARK;
  return appTheme === "light" ? (scheme.light ?? AUTO_LIGHT) : (scheme.dark ?? AUTO_DARK);
}

/**
 * 解析字体族字符串：若为 "auto" 则返回默认字体族，否则原样返回。
 */
export function resolveFontFamily(fontFamily: string): string {
  return fontFamily === "auto" || !fontFamily ? TERMINAL_DEFAULT_FONT_FAMILY : fontFamily;
}
