// 小红书卡片正文字体选项：与「设置 → 外观 → 编辑器字体」的选项保持一致
import type { XhsFontFamily } from "./types";

export interface XhsFontOption {
  id: XhsFontFamily;
  /** i18n key（xhs.fonts.<labelKey>） */
  labelKey: string;
  /** CSS font-family 值 */
  family: string;
  /** 需要按需加载的 Web 字体样式（可选） */
  webFont?: { linkId: string; href: string };
}

export const XHS_FONT_OPTIONS: XhsFontOption[] = [
  { id: "system", labelKey: "system", family: "system-ui, -apple-system, sans-serif" },
  {
    id: "wenkai",
    labelKey: "wenkai",
    family: "'LXGW WenKai', system-ui, sans-serif",
    webFont: {
      linkId: "lxgw-wenkai-font",
      href: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css",
    },
  },
  {
    id: "xinxihei",
    labelKey: "xinxihei",
    family: "'LXGW XinXiHei', system-ui, sans-serif",
    webFont: {
      linkId: "lxgw-xinxihei-font",
      href: "https://cdn.jsdelivr.net/npm/lxgw-xinxihei-webfont@1.7.0/style.css",
    },
  },
  { id: "inter", labelKey: "inter", family: "'Inter', system-ui, sans-serif" },
  { id: "noto-sans", labelKey: "notoSans", family: "'Noto Sans SC', system-ui, sans-serif" },
  { id: "segoe", labelKey: "segoe", family: "ui-sans-serif, 'Segoe UI', system-ui, sans-serif" },
  { id: "roboto", labelKey: "roboto", family: "'Roboto', system-ui, sans-serif" },
  { id: "source-sans", labelKey: "sourceSans", family: "'Source Sans 3', system-ui, sans-serif" },
];

/** 字体 id → CSS font-family 映射（渲染时直接取值） */
export const XHS_FONT_FAMILIES = Object.fromEntries(
  XHS_FONT_OPTIONS.map((o) => [o.id, o.family]),
) as Record<XhsFontFamily, string>;

/** 确保选中的字体（如需 Web 字体）已按需加载到当前文档 */
export function ensureXhsWebFont(fontFamily: XhsFontFamily): void {
  const opt = XHS_FONT_OPTIONS.find((o) => o.id === fontFamily);
  if (!opt?.webFont) return;
  if (document.getElementById(opt.webFont.linkId)) return;
  const link = document.createElement("link");
  link.id = opt.webFont.linkId;
  link.rel = "stylesheet";
  link.href = opt.webFont.href;
  document.head.appendChild(link);
}
