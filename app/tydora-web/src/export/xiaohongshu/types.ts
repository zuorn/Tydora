// 小红书图文导出：类型定义

/** 平台（v1 仅内置小红书，结构为多平台预留） */
export type XhsFormat = "xiaohongshu";

/** 正文字号选项（px），范围 16-26 */
export const XHS_FONT_SIZES = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] as const;
export type XhsFontSize = (typeof XHS_FONT_SIZES)[number];

/** 卡片宽高比 */
export type XhsRatio = "3:4" | "3:5" | "1:1";

/** 正文字体（与「设置 → 外观 → 编辑器字体」的选项保持一致） */
export type XhsFontFamily =
  | "system"
  | "wenkai"
  | "xinxihei"
  | "inter"
  | "noto-sans"
  | "segoe"
  | "roboto"
  | "source-sans";

export interface XhsSettings {
  format: XhsFormat;
  themeId: string;
  fontSize: XhsFontSize;
  ratio: XhsRatio;
  fontFamily: XhsFontFamily;
  pageNumber: boolean;
  /** 卡片上显示构图网格线（辅助对齐/检查溢出） */
  gridLines: boolean;
}

/**
 * 卡片主题：通过覆盖编辑器 CSS 变量（--bg-primary / --text-primary 等）
 * 实现卡片配色，作用域为 `.xhs-themed[data-xhs-theme="<id>"]`。
 */
export interface XhsTheme {
  id: string;
  /** 中文名（UI 优先取 i18n key `xhs.theme.<id>`，缺省回退到该值） */
  name: string;
  vars: Record<string, string>;
}

/** 生成的一张卡片 */
export interface XhsCard {
  /** 0-based，含封面 */
  index: number;
  total: number;
  isCover: boolean;
  pngDataUrl: string;
  /** 输出像素尺寸 */
  width: number;
  height: number;
}

/**
 * 用户拖拽调整后的图片位置（卡片逻辑坐标，px）。
 * key = cyrb53(图片 data URL)，value 为相对原始位置的偏移量。
 */
export type XhsImagePositions = Record<string, { dx: number; dy: number }>;

/** 预览用的卡片 DOM（未栅格化，可直接挂载交互） */
export interface XhsCardDom {
  el: HTMLElement;
  index: number;
  total: number;
  isCover: boolean;
  from: number;
  to: number;
}
