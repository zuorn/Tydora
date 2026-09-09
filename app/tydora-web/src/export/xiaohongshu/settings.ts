// 小红书导出设置持久化（localStorage）
import type { XhsSettings, XhsFontSize } from "./types";
import { XHS_FONT_OPTIONS } from "./fonts";

export const XHS_SETTINGS_KEY = "zmd-xhs-settings";

/** 合法的字体 id 集合，用于兼容旧版本保存的字体值（default/serif/mono） */
const FONT_FAMILY_IDS = new Set(XHS_FONT_OPTIONS.map((o) => o.id));

/** 旧版本字号值（small/medium/large）→ 数字字号（px）映射 */
const LEGACY_FONT_SIZE: Record<string, XhsFontSize> = { small: 16, medium: 16, large: 18 };

/** 归一化字号：旧字符串值或范围外的数字一律回退到合法区间 */
function normalizeFontSize(value: unknown): XhsFontSize {
  if (typeof value === "number" && value >= 16 && value <= 26) return value as XhsFontSize;
  if (typeof value === "string" && value in LEGACY_FONT_SIZE) return LEGACY_FONT_SIZE[value];
  return 16;
}

export const DEFAULT_XHS_SETTINGS: XhsSettings = {
  format: "xiaohongshu",
  themeId: "default",
  fontSize: 16,
  ratio: "3:4",
  fontFamily: "system",
  pageNumber: true,
  gridLines: false,
};

export function loadXhsSettings(): XhsSettings {
  try {
    const raw = localStorage.getItem(XHS_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<XhsSettings>;
      const merged = { ...DEFAULT_XHS_SETTINGS, ...parsed };
      // 旧版本保存的字体值（default/serif/mono）不在新选项内时回退为系统默认
      if (!FONT_FAMILY_IDS.has(merged.fontFamily)) merged.fontFamily = "system";
      // 旧版本字号（small/medium/large）归一化为数字字号
      merged.fontSize = normalizeFontSize(merged.fontSize);
      return merged;
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_XHS_SETTINGS };
}

export function saveXhsSettings(settings: XhsSettings): void {
  try {
    localStorage.setItem(XHS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
