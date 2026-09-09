/** 菜单项密度：影响右键菜单、下拉菜单等条目的内边距与行高 */
export type MenuDensity = "comfortable" | "normal" | "compact";

export function normalizeMenuDensity(value: unknown): MenuDensity {
  if (value === "comfortable" || value === "normal" || value === "compact") {
    return value;
  }
  return "compact";
}

export function applyMenuDensity(density: MenuDensity): void {
  document.documentElement.dataset.menuDensity = density;
}

/** 从通用设置同步编辑器段落/代码间距 CSS 变量 */
export function applyEditorSpacingFromSettings(settings: {
  paragraphSpacing?: unknown;
  codeLineHeight?: unknown;
}): void {
  const paragraphSpacing =
    typeof settings.paragraphSpacing === "number"
      ? Math.min(2, Math.max(0, settings.paragraphSpacing))
      : 0.5;
  const codeLineHeight =
    typeof settings.codeLineHeight === "number"
      ? Math.min(2.4, Math.max(1.2, settings.codeLineHeight))
      : 1.5;
  document.documentElement.style.setProperty(
    "--editor-paragraph-spacing",
    `${paragraphSpacing}em`,
  );
  document.documentElement.style.setProperty("--code-line-height", String(codeLineHeight));
}

/**
 * 清除曾由通用设置写入的侧栏玻璃不透明度内联样式，
 * 避免盖过主题 CSS 变量（迁移后一次性清理即可）。
 */
function clearLegacySidebarChromeInlineStyles(): void {
  document.documentElement.style.removeProperty("--sidebar-chrome-opacity");
  document.documentElement.style.removeProperty("--sidebar-tab-active-opacity");
}

/** 从 localStorage 读取并应用到当前窗口（供各窗口入口尽早调用） */
export function applyMenuDensityFromStorage(): void {
  clearLegacySidebarChromeInlineStyles();
  try {
    const raw = localStorage.getItem("zmd-general-settings");
    const settings = raw ? JSON.parse(raw) : {};
    applyMenuDensity(normalizeMenuDensity(settings.menuDensity));
    applyEditorSpacingFromSettings(settings);
  } catch {
    applyMenuDensity("compact");
    applyEditorSpacingFromSettings({});
  }
}
