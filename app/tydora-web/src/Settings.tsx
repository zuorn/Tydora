import React, { useState, useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors } from "@tauri-apps/api/window";
import { clampWindowToMonitor } from "./services/windowState";
import { invoke } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { useTheme, type ThemeName, type ThemePair } from "./themes";
import { loadImageSettings, saveImageSettings, type ImageSettings, type StorageMode, type FilenameFormat } from "./services";
import { checkForUpdate, downloadAndInstall, relaunchApp, exitApp, isStoreVersion, isPortableVersion, type UpdateInfo } from "./services";
import { PublishSettings } from "./publish";
import { loadCanvasSettings, saveCanvasSettings, type CanvasSettings } from "./Canvas/canvas-settings";
import { TerminalSettingsContent } from "./Terminal/TerminalSettingsContent";
import { VimSettingsPanel } from "./vim/settings/VimSettingsPanel";
import { loadTerminalSettings, type TerminalSettings } from "./Terminal/terminal-settings";
import {
  mergeWithSchema,
  buildThemeEditorSections,
  getBuiltinColorMap,
  type ThemeEditorSectionView,
} from "./themes/themeTokens";
import {
  CODE_THEME_COLOR_SCHEMA,
  CODE_THEME_SAMPLE_SNIPPETS,
  mergeCodeThemeWithSchema,
  codeThemeVarsToPreviewStyle,
} from "./themes/codeThemeTokens";
import { ThemeColorField } from "./themes/ThemeColorField";
import { ThemeSizeField } from "./themes/ThemeSizeField";
import { syncAccentRgb } from "./themes/colorUtils";
import { CODE_THEMES, type CustomCodeTheme } from "./themes";
import { getCodeThemeCss, type ThemeVariable, type ThemeManifest, parseCssVariables, getCustomThemeCss, resolveThemePreviewColors } from "./themes/CustomThemeManager";
import appIcon from "./assets/icon.png";
import { useLanguage } from "./i18n/LanguageContext";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./i18n";
import { FontPicker } from "./components/FontPicker";
import { SettingsSelect } from "./components/SettingsSelect";
import { normalizeCodeFontValue, normalizeEditorFontValue } from "./utils/systemFonts";
import {
  applyMenuDensity,
  applyEditorSpacingFromSettings,
  normalizeMenuDensity,
  type MenuDensity,
} from "./utils/menuDensity";
import shortcutsConfig from "./config/shortcuts.json";
import { formatShortcutKey, matchShortcut, loadShortcuts, getShortcutKeys } from "./Editor/shortcuts";
import { isAnalyticsEnabled, setAnalyticsEnabled, track, trackPageview, ANALYTICS_EVENTS } from "./analytics";
import "./Settings.css";

// ── Types ────────────────────────────────────────────────────────────

type SettingsTab = "general" | "theme" | "shortcuts" | "mindmap" | "graph" | "image" | "canvas" | "terminal" | "publish" | "vim" | "about";

interface NavItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
  searchTerms?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// ── Editor Settings ─────────────────────────────────────────────

export interface EditorSettings {
  // 编辑模式
  defaultMode: "ir" | "sv";
  // 编辑行为
  counterType: "markdown" | "text";
  // 扩展功能
  callout: boolean;
  mermaid: boolean;
  math: boolean;
  wikiLink: boolean;
  frontmatter: boolean;
  tableToolbar: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  defaultMode: "ir",
  counterType: "text",
  callout: true,
  mermaid: true,
  math: true,
  wikiLink: true,
  frontmatter: true,
  tableToolbar: true,
};

export const EDITOR_SETTINGS_KEY = "zmd-editor-settings";

export function loadEditorSettings(): EditorSettings {
  try {
    const saved = localStorage.getItem(EDITOR_SETTINGS_KEY);
    return saved ? { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(saved) } : DEFAULT_EDITOR_SETTINGS;
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

/** 代码块工具栏样式：minimal = 右上角浮动语言选择；classic = 顶栏 + 复制/删除 */
export type CodeBlockToolbarStyle = "minimal" | "classic";

export type SidebarTab = "files" | "search" | "outline" | "bookmarks";
export type SidebarSide = "left" | "right";
export type SidebarTabPlacement = Record<SidebarTab, SidebarSide>;

interface GeneralSettings {
  appearance: "system" | "light" | "dark";
  fontSize: number;
  editorFont: string;
  /** 代码 / 等宽字体（`system` 或系统字体族名） */
  codeFont: string;
  /** 代码 / 等宽字号（px） */
  codeFontSize: number;
  autoSave: boolean;
  autoHideTopbar: boolean;
  autoHideTopbarOnCollapse: boolean;
  previewMaxWidth: number;
  typewriterMode: boolean;
  lineHeight: number;
  /** 段落上下外边距（em） */
  paragraphSpacing: number;
  /** 代码块行高 */
  codeLineHeight: number;
  irLineNumbers: boolean;
  expandOutlineOnOpen: boolean;
  /** 代码块工具栏样式 */
  codeBlockToolbarStyle: CodeBlockToolbarStyle;
  /** 菜单项高度密度 */
  menuDensity: MenuDensity;
  /** 侧栏 tab 在左/右侧栏的分配 */
  sidebarTabPlacement: SidebarTabPlacement;
}

interface ShortcutItem {
  id: string;
  label: string;
  keys: string[];
  group?: string;
}

// ── Default values ──────────────────────────────────────────────────

export const DEFAULT_GENERAL: GeneralSettings = {
  appearance: "system",
  fontSize: 16,
  editorFont: "system",
  codeFont: "system",
  codeFontSize: 14,
  autoSave: true,
  autoHideTopbar: true,
  autoHideTopbarOnCollapse: true,
  previewMaxWidth: 800,
  typewriterMode: false,
  lineHeight: 1.6,
  paragraphSpacing: 0.5,
  codeLineHeight: 1.5,
  irLineNumbers: true,
  expandOutlineOnOpen: true,
  codeBlockToolbarStyle: "minimal",
  menuDensity: "compact",
  sidebarTabPlacement: {
    files: "left",
    search: "left",
    outline: "right",
    bookmarks: "left",
  },
};

interface MindmapSettings {
  maxWidth: number;
  duration: number;
  initialExpandLevel: number;
  spacingHorizontal: number;
  spacingVertical: number;
  lineWidth: number;
  colorFreezeLevel: number;
}

const DEFAULT_MINDMAP: MindmapSettings = {
  maxWidth: 200,
  duration: 300,
  initialExpandLevel: 2,
  spacingHorizontal: 80,
  spacingVertical: 5,
  lineWidth: 1.5,
  colorFreezeLevel: 0,
};

interface GraphSettings {
  openInNewWindow: boolean;
  nodeSize: number;
  linkDistance: number;
  chargeStrength: number;
  edgeOpacity: number;
  labelFontSize: number;
}

const DEFAULT_GRAPH: GraphSettings = {
  openInNewWindow: false,
  nodeSize: 15,
  linkDistance: 160,
  chargeStrength: -200,
  edgeOpacity: 0.8,
  labelFontSize: 11,
};

// 默认快捷键统一从 src/config/shortcuts.json 读取（设置面板中的自定义仍存储在 localStorage）
const DEFAULT_SHORTCUTS: ShortcutItem[] = shortcutsConfig.editor as ShortcutItem[];

const ALL_SIDEBAR_TABS: SidebarTab[] = ["files", "search", "outline", "bookmarks"];

function normalizeSidebarTabPlacement(raw: unknown): SidebarTabPlacement {
  const base = { ...DEFAULT_GENERAL.sidebarTabPlacement };
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<Record<SidebarTab, unknown>>;
  for (const tab of ALL_SIDEBAR_TABS) {
    const v = src[tab];
    if (v === "left" || v === "right") base[tab] = v;
  }
  return base;
}

/** 根据分配计算指定侧的 tab 列表，顺序固定 files→search→outline→bookmarks */
export function sidebarTabsForSide(
  placement: SidebarTabPlacement,
  side: SidebarSide,
): SidebarTab[] {
  return ALL_SIDEBAR_TABS.filter((t) => placement[t] === side);
}

export { ALL_SIDEBAR_TABS };

// ── Storage keys ────────────────────────────────────────────────────

const GENERAL_SETTINGS_KEY = "zmd-general-settings";
export const SHORTCUTS_KEY = "zmd-shortcuts";
export const MINDMAP_SETTINGS_KEY = "zmd-mindmap-settings";
export const GRAPH_SETTINGS_KEY = "zmd-graph-settings";
export type { MindmapSettings, GraphSettings };

export { DEFAULT_SHORTCUTS, DEFAULT_MINDMAP, DEFAULT_GRAPH };

// ── Components ──────────────────────────────────────────────────────

function GeneralSettingsContent({
  settings,
  onChange,
}: {
  settings: GeneralSettings;
  onChange: (s: GeneralSettings) => void;
}) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.language")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.languageDesc")}</span>
          </div>
          <SettingsSelect
            value={language}
            onChange={(v) => setLanguage(v as SupportedLanguage)}
            options={SUPPORTED_LANGUAGES.map((lang) => ({
              value: lang.code,
              label: lang.label,
            }))}
          />
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.previewMaxWidth")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.previewMaxWidthDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min={600}
              max={1200}
              step={20}
              value={settings.previewMaxWidth}
              onChange={(e) => onChange({ ...settings, previewMaxWidth: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.previewMaxWidth}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.editorFont")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.editorFontDesc")}</span>
          </div>
          <FontPicker
            mode="editor"
            value={normalizeEditorFontValue(settings.editorFont)}
            onChange={(editorFont) => onChange({ ...settings, editorFont })}
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.codeFont")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.codeFontDesc")}</span>
          </div>
          <FontPicker
            mode="code"
            value={normalizeCodeFontValue(settings.codeFont)}
            onChange={(codeFont) => onChange({ ...settings, codeFont })}
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.fontSize")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.fontSizeDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="10"
              max="24"
              value={settings.fontSize}
              onChange={(e) => onChange({ ...settings, fontSize: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.fontSize}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.codeFontSize")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.codeFontSizeDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="10"
              max="24"
              value={settings.codeFontSize}
              onChange={(e) => onChange({ ...settings, codeFontSize: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.codeFontSize}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.lineHeight")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.lineHeightDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min={14}
              max={28}
              step={1}
              value={Math.round(settings.lineHeight * 10)}
              onChange={(e) => onChange({ ...settings, lineHeight: Number(e.target.value) / 10 })}
            />
            <span className="canvas-settings-unit">{settings.lineHeight.toFixed(1)}</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.paragraphSpacing")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.paragraphSpacingDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min={0}
              max={20}
              step={1}
              value={Math.round(settings.paragraphSpacing * 10)}
              onChange={(e) =>
                onChange({ ...settings, paragraphSpacing: Number(e.target.value) / 10 })
              }
            />
            <span className="canvas-settings-unit">{settings.paragraphSpacing.toFixed(1)}</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.codeLineHeight")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.codeLineHeightDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min={12}
              max={24}
              step={1}
              value={Math.round(settings.codeLineHeight * 10)}
              onChange={(e) =>
                onChange({ ...settings, codeLineHeight: Number(e.target.value) / 10 })
              }
            />
            <span className="canvas-settings-unit">{settings.codeLineHeight.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.typewriterMode")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.typewriterModeDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.typewriterMode}
              onChange={(e) => onChange({ ...settings, typewriterMode: e.target.checked })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.showLineNumbers")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.showLineNumbersDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.irLineNumbers}
              onChange={(e) => onChange({ ...settings, irLineNumbers: e.target.checked })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.codeBlockToolbarStyle")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.codeBlockToolbarStyleDesc")}</span>
          </div>
          <SettingsSelect
            value={settings.codeBlockToolbarStyle}
            onChange={(v) =>
              onChange({
                ...settings,
                codeBlockToolbarStyle: v as CodeBlockToolbarStyle,
              })
            }
            options={[
              { value: "minimal", label: t("settings.appearance.codeBlockToolbarMinimal") },
              { value: "classic", label: t("settings.appearance.codeBlockToolbarClassic") },
            ]}
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.menuDensity")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.menuDensityDesc")}</span>
          </div>
          <SettingsSelect
            value={settings.menuDensity}
            onChange={(v) =>
              onChange({
                ...settings,
                menuDensity: v as MenuDensity,
              })
            }
            options={[
              { value: "compact", label: t("settings.appearance.menuDensityCompact") },
              { value: "normal", label: t("settings.appearance.menuDensityNormal") },
              { value: "comfortable", label: t("settings.appearance.menuDensityComfortable") },
            ]}
          />
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.autoSave")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.autoSaveDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.autoSave}
              onChange={(e) => onChange({ ...settings, autoSave: e.target.checked })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.autoHideTopbar")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.autoHideTopbarDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.autoHideTopbar}
              onChange={(e) => onChange({ ...settings, autoHideTopbar: e.target.checked })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.autoHideTopbarOnCollapse")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.autoHideTopbarOnCollapseDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.autoHideTopbarOnCollapse}
              onChange={(e) => onChange({ ...settings, autoHideTopbarOnCollapse: e.target.checked })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.appearance.expandOutlineOnOpen")}</span>
            <span className="canvas-settings-row-desc">{t("settings.appearance.expandOutlineOnOpenDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.expandOutlineOnOpen}
              onChange={(e) => onChange({ ...settings, expandOutlineOnOpen: e.target.checked })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>

      <div className="canvas-settings-card sidebar-settings-card">
        <div className="sidebar-settings-card-header">
          <h3 className="settings-section-title">{t("settings.sidebar.title")}</h3>
          <p className="sidebar-settings-card-desc">{t("settings.sidebar.desc")}</p>
        </div>
        {ALL_SIDEBAR_TABS.map((tab, idx) => {
          const showDivider = idx === 1; // files|search 与 outline|bookmarks 之间的分组线
          return (
            <div key={tab}>
              {showDivider && <div className="sidebar-settings-divider" />}
              <div className="canvas-settings-row sidebar-settings-row">
                <div className="canvas-settings-row-label sidebar-settings-label">
                  <div className="sidebar-settings-icon">
                    {tab === "files" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    )}
                    {tab === "search" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    )}
                    {tab === "outline" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                    )}
                    {tab === "bookmarks" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <span className="canvas-settings-row-title">{t(`settings.sidebar.${tab}`)}</span>
                    <span className="canvas-settings-row-desc">
                      {settings.sidebarTabPlacement[tab] === "left"
                        ? t("settings.sidebar.left")
                        : t("settings.sidebar.right")}
                    </span>
                  </div>
                </div>
                <div className="canvas-settings-row-control">
                  <SettingsSelect
                    value={settings.sidebarTabPlacement[tab]}
                    onChange={(v) =>
                      onChange({
                        ...settings,
                        sidebarTabPlacement: {
                          ...settings.sidebarTabPlacement,
                          [tab]: v as SidebarSide,
                        },
                      })
                    }
                    options={[
                      { value: "left", label: t("settings.sidebar.left") },
                      { value: "right", label: t("settings.sidebar.right") },
                    ]}
                    minWidth={128}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MindmapSettingsContent({
  settings,
  onChange,
}: {
  settings: MindmapSettings;
  onChange: (s: MindmapSettings) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.mindmap.maxNodeWidth")}</span>
            <span className="canvas-settings-row-desc">{t("settings.mindmap.maxNodeWidthDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="0"
              max="500"
              step="10"
              value={settings.maxWidth}
              onChange={(e) => onChange({ ...settings, maxWidth: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.maxWidth}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.mindmap.horizontalSpacing")}</span>
            <span className="canvas-settings-row-desc">{t("settings.mindmap.horizontalSpacingDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="20"
              max="200"
              step="5"
              value={settings.spacingHorizontal}
              onChange={(e) => onChange({ ...settings, spacingHorizontal: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.spacingHorizontal}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.mindmap.verticalSpacing")}</span>
            <span className="canvas-settings-row-desc">{t("settings.mindmap.verticalSpacingDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="1"
              max="30"
              value={settings.spacingVertical}
              onChange={(e) => onChange({ ...settings, spacingVertical: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.spacingVertical}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.mindmap.edgeWidth")}</span>
            <span className="canvas-settings-row-desc">{t("settings.mindmap.edgeWidthDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="0.5"
              max="4"
              step="0.5"
              value={settings.lineWidth}
              onChange={(e) => onChange({ ...settings, lineWidth: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.lineWidth}px</span>
          </div>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.mindmap.initialExpandLevel")}</span>
            <span className="canvas-settings-row-desc">{t("settings.mindmap.initialExpandLevelDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="-1"
              max="10"
              value={settings.initialExpandLevel}
              onChange={(e) => onChange({ ...settings, initialExpandLevel: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.initialExpandLevel === -1 ? t("settings.mindmap.all") : t("settings.mindmap.expandLevel", { level: settings.initialExpandLevel })}</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.mindmap.animationDuration")}</span>
            <span className="canvas-settings-row-desc">{t("settings.mindmap.animationDurationDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="0"
              max="1000"
              step="50"
              value={settings.duration}
              onChange={(e) => onChange({ ...settings, duration: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.duration}ms</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.mindmap.colorFreezeLevel")}</span>
            <span className="canvas-settings-row-desc">{t("settings.mindmap.colorFreezeLevelDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="0"
              max="10"
              value={settings.colorFreezeLevel}
              onChange={(e) => onChange({ ...settings, colorFreezeLevel: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.colorFreezeLevel === 0 ? "不冻结" : settings.colorFreezeLevel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GraphSettingsContent({
  settings,
  onChange,
}: {
  settings: GraphSettings;
  onChange: (s: GraphSettings) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.graph.openInNewWindow")}</span>
            <span className="canvas-settings-row-desc">{t("settings.graph.openInNewWindowDesc")}</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.openInNewWindow} onChange={(e) => onChange({ ...settings, openInNewWindow: e.target.checked })} />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.graph.maxNodeSize")}</span>
            <span className="canvas-settings-row-desc">{t("settings.graph.maxNodeSizeDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="5"
              max="30"
              value={settings.nodeSize}
              onChange={(e) => onChange({ ...settings, nodeSize: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.nodeSize}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.graph.labelFontSize")}</span>
            <span className="canvas-settings-row-desc">{t("settings.graph.labelFontSizeDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="8"
              max="18"
              value={settings.labelFontSize}
              onChange={(e) => onChange({ ...settings, labelFontSize: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.labelFontSize}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.graph.edgeDistance")}</span>
            <span className="canvas-settings-row-desc">{t("settings.graph.edgeDistanceDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="60"
              max="300"
              step="10"
              value={settings.linkDistance}
              onChange={(e) => onChange({ ...settings, linkDistance: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.linkDistance}px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.graph.repulsion")}</span>
            <span className="canvas-settings-row-desc">{t("settings.graph.repulsionDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="-500"
              max="-50"
              step="10"
              value={settings.chargeStrength}
              onChange={(e) => onChange({ ...settings, chargeStrength: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.chargeStrength}</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.graph.edgeOpacity")}</span>
            <span className="canvas-settings-row-desc">{t("settings.graph.edgeOpacityDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min="0.1"
              max="1"
              step="0.05"
              value={settings.edgeOpacity}
              onChange={(e) => onChange({ ...settings, edgeOpacity: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{Math.round(settings.edgeOpacity * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getThemeSlotSelection(id: string, pair: ThemePair): "none" | "light" | "dark" | "both" {
  const light = pair.light === id;
  const dark = pair.dark === id;
  if (light && dark) return "both";
  if (light) return "light";
  if (dark) return "dark";
  return "none";
}

function ThemeSettingsContent() {
  const { t } = useTranslation();
  const {
    theme,
    appearanceMode,
    setAppearanceMode,
    resolvedMode,
    preferredAppTheme,
    preferredCodeTheme,
    setPreferredAppTheme,
    setPreferredCodeTheme,
    customThemes,
    deleteTheme,
    updateThemeVariables,
    previewThemeVariables,
    createThemeFromBuiltin,
    createThemeFromTemplate,
    codeTheme,
    customCodeThemes,
    deleteCodeTheme,
    createCodeThemeFromBuiltin,
    updateCodeThemeVariables,
    previewCodeThemeVariables,
    renameAppTheme,
    renameCodeTheme,
    exportCurrentThemePack,
    importThemePack,
  } = useTheme();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemeManifest | null>(null);
  const [editVariables, setEditVariables] = useState<ThemeVariable[]>([]);
  const [editPreview, setEditPreview] = useState<{
    bg: string;
    accent: string;
    text: string;
    strong: string;
    border: string;
    codeBg: string;
    codeText: string;
    radiusInline: string;
    paddingInlineY: string;
    paddingInlineX: string;
  }>({
    bg: "#ffffff",
    accent: "#4eb289",
    text: "#1e293b",
    strong: "#bd387d",
    border: "#a5cfc0",
    codeBg: "rgba(78, 178, 137, 0.08)",
    codeText: "#e83e8c",
    radiusInline: "4px",
    paddingInlineY: "3px",
    paddingInlineX: "6px",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { kind: "app"; name: string; id: string }
    | { kind: "code"; name: string; id: string }
    | null
  >(null);
  const [nameDialog, setNameDialog] = useState<{
    open: boolean;
    mode: "export-pack" | "rename-app" | "rename-code";
    id: string;
    defaultName: string;
  }>({ open: false, mode: "export-pack", id: "", defaultName: "" });
  const [themeName, setThemeName] = useState("");
  const [forking, setForking] = useState(false);
  const previewTimerRef = useRef<number | null>(null);

  const [editingCodeTheme, setEditingCodeTheme] = useState<CustomCodeTheme | null>(null);
  const [editCodeVariables, setEditCodeVariables] = useState<ThemeVariable[]>([]);
  const [codeSampleLang, setCodeSampleLang] = useState(CODE_THEME_SAMPLE_SNIPPETS[0].id);
  const [forkingCode, setForkingCode] = useState(false);
  const [themeKindTab, setThemeKindTab] = useState<"app" | "code">("app");
  const codePreviewTimerRef = useRef<number | null>(null);

  const [codeSampleHtml, setCodeSampleHtml] = useState("");
  useEffect(() => {
    let cancelled = false;
    const snippet =
      CODE_THEME_SAMPLE_SNIPPETS.find((s) => s.id === codeSampleLang) ?? CODE_THEME_SAMPLE_SNIPPETS[0];
    import("highlight.js")
      .then(({ default: hljs }) => {
        if (cancelled) return;
        try {
          setCodeSampleHtml(hljs.highlight(snippet.code, { language: snippet.language }).value);
        } catch {
          setCodeSampleHtml(hljs.highlightAuto(snippet.code).value);
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [codeSampleLang]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
      if (codePreviewTimerRef.current) window.clearTimeout(codePreviewTimerRef.current);
    };
  }, []);

  const builtinThemes: { value: ThemeName; label: string; colors: string[] }[] = [
    { value: "white", label: t("settings.theme.white"), colors: ["#ffffff", "#2563eb", "#1e293b", "#d1d9e6"] },
    { value: "mint", label: "Mint", colors: ["#ffffff", "#4eb289", "#1e293b", "#a5cfc0"] },
    { value: "mint-dark", label: "Mint Dark", colors: ["#272729", "#4eb289", "#cccccc", "#39393a"] },
    { value: "modern-dark", label: "Modern Dark", colors: ["#1b1d24", "#74a7fe", "#cccccc", "#111217"] },
    { value: "claude-code", label: "Claude Code", colors: ["#faf8f5", "#c47a2a", "#1a1a1a", "#ddd6cc"] },
    { value: "purple", label: "Purple", colors: ["#faf5ff", "#7c3aed", "#1e1b2e", "#ddd6ee"] },
    { value: "hermes", label: "Hermes", colors: ["#f0f1ff", "#0000f2", "#1a1a4e", "rgba(0,0,242,0.12)"] },
    { value: "next", label: "NexT", colors: ["#fffef8", "#00796b", "#4a4a4a", "#e0ddd6"] },
    { value: "slate", label: "Slate", colors: ["#f8fafc", "#475569", "#0f172a", "#e2e8f0"] },
    { value: "ocean", label: "Ocean", colors: ["#f0f9ff", "#0891b2", "#0c4a6e", "#a5f3fc"] },
  ];

  const renderThemeSlotLabel = (id: string, pair: ThemePair) => {
    const slot = getThemeSlotSelection(id, pair);
    if (slot === "none") return null;
    const labelKey =
      slot === "both" ? "slotLabelBoth" : slot === "dark" ? "slotLabelDark" : "slotLabelLight";
    return (
      <span className={`settings-theme-slot-label slot-${slot}`}>
        {t(`settings.theme.${labelKey}`)}
      </span>
    );
  };

  const updateEditPreview = useCallback((vars: ThemeVariable[]) => {
    const get = (name: string, fallback: string) =>
      vars.find((v) => v.name === name)?.value || fallback;
    setEditPreview({
      bg: get("--bg-primary", "#ffffff"),
      accent: get("--accent", "#4eb289"),
      text: get("--text-primary", "#1e293b"),
      strong: get("--text-strong", "#bd387d"),
      border: get("--border", "#a5cfc0"),
      codeBg: get("--bg-code-inline", "rgba(78, 178, 137, 0.08)"),
      codeText: get("--text-code", "#e83e8c"),
      radiusInline: get("--radius-code-inline", "4px"),
      paddingInlineY: get("--padding-code-inline-y", "3px"),
      paddingInlineX: get("--padding-code-inline-x", "6px"),
    });
  }, []);

  const schedulePreview = useCallback((id: string, vars: ThemeVariable[]) => {
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      previewThemeVariables(id, vars);
    }, 120);
  }, [previewThemeVariables]);

  const handleExportPack = useCallback(() => {
    const lightName =
      customThemes.find((m) => `custom-${m.id}` === preferredAppTheme.light)?.name
      || preferredAppTheme.light;
    setNameDialog({
      open: true,
      mode: "export-pack",
      id: "",
      defaultName: lightName,
    });
    setThemeName(lightName);
  }, [customThemes, preferredAppTheme.light]);

  const handleImportPack = useCallback(async () => {
    try {
      setImporting(true);
      const result = await importThemePack();
      if (!result) return;
    } catch (err) {
      console.error(t("settings.theme.importPackFailed"), err);
      alert(`${t("settings.theme.importPackFailed")} ${err instanceof Error ? err.message : t("settings.theme.unknownError")}`);
    } finally {
      setImporting(false);
    }
  }, [importThemePack, t]);

  const handleConfirmNameDialog = useCallback(async () => {
    const name = themeName.trim() || nameDialog.defaultName;
    try {
      if (nameDialog.mode === "export-pack") {
        setExporting(true);
        await exportCurrentThemePack(name);
        setNameDialog({ open: false, mode: "export-pack", id: "", defaultName: "" });
      } else if (nameDialog.mode === "rename-app") {
        await renameAppTheme(nameDialog.id, name);
        setNameDialog({ open: false, mode: "export-pack", id: "", defaultName: "" });
      } else if (nameDialog.mode === "rename-code") {
        await renameCodeTheme(nameDialog.id, name);
        setNameDialog({ open: false, mode: "export-pack", id: "", defaultName: "" });
      }
    } catch (err) {
      console.error(t("settings.theme.renameFailed"), err);
      alert(`${t("settings.theme.renameFailed")} ${err instanceof Error ? err.message : t("settings.theme.unknownError")}`);
    } finally {
      setExporting(false);
    }
  }, [themeName, nameDialog, exportCurrentThemePack, renameAppTheme, renameCodeTheme, t]);

  const handleRenameApp = useCallback((manifest: ThemeManifest) => {
    setNameDialog({ open: true, mode: "rename-app", id: manifest.id, defaultName: manifest.name });
    setThemeName(manifest.name);
  }, []);

  const handleRenameCode = useCallback((manifest: CustomCodeTheme) => {
    setNameDialog({ open: true, mode: "rename-code", id: manifest.id, defaultName: manifest.name });
    setThemeName(manifest.name);
  }, []);

  const handleDelete = useCallback(async (manifest: ThemeManifest) => {
    setDeleteConfirm({ kind: "app", name: manifest.name, id: manifest.id });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.kind === "app") {
      await deleteTheme(deleteConfirm.id);
    } else {
      await deleteCodeTheme(deleteConfirm.id);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteTheme, deleteCodeTheme]);

  const openEditor = useCallback((manifest: ThemeManifest, variables: ThemeVariable[]) => {
    const merged = syncAccentRgb(
      mergeWithSchema(variables, getBuiltinColorMap("mint") ?? undefined),
    ) as ThemeVariable[];
    setEditVariables(merged);
    updateEditPreview(merged);
    setEditingTheme(manifest);
    setPreferredAppTheme(resolvedMode, `custom-${manifest.id}`);
    previewThemeVariables(manifest.id, merged);
  }, [previewThemeVariables, resolvedMode, setPreferredAppTheme, updateEditPreview]);

  const handleStartEdit = useCallback(async (manifest: ThemeManifest) => {
    try {
      const css = await getCustomThemeCss(manifest.id);
      openEditor(manifest, parseCssVariables(css));
    } catch (err) {
      console.error(t("settings.theme.loadThemeFailed"), err);
    }
  }, [openEditor, t]);

  const handleForkBuiltin = useCallback(async (builtinId: string, label: string) => {
    try {
      setForking(true);
      const name = t("settings.theme.forkedName", { name: label });
      const manifest = await createThemeFromBuiltin(builtinId, name);
      await handleStartEdit(manifest);
    } catch (err) {
      console.error(t("settings.theme.forkFailed"), err);
    } finally {
      setForking(false);
    }
  }, [createThemeFromBuiltin, handleStartEdit, t]);

  const handleCreateBlank = useCallback(async (kind: "light" | "dark") => {
    try {
      setForking(true);
      const name = t("settings.theme.newTheme");
      const manifest = await createThemeFromTemplate(kind, name);
      await handleStartEdit(manifest);
    } catch (err) {
      console.error(t("settings.theme.forkFailed"), err);
    } finally {
      setForking(false);
    }
  }, [createThemeFromTemplate, handleStartEdit, t]);

  const handleVariableChange = useCallback((name: string, newValue: string) => {
    setEditVariables((prev) => {
      let next = prev.map((v) => (v.name === name ? { ...v, value: newValue } : v));
      if (name === "--accent") {
        next = syncAccentRgb(next) as ThemeVariable[];
      }
      updateEditPreview(next);
      if (editingTheme) {
        schedulePreview(editingTheme.id, next);
      }
      return next;
    });
  }, [editingTheme, schedulePreview, updateEditPreview]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingTheme) return;
    const synced = syncAccentRgb(editVariables) as ThemeVariable[];
    await updateThemeVariables(editingTheme.id, synced);
    setEditingTheme(null);
  }, [editingTheme, editVariables, updateThemeVariables]);

  const handleCancelEdit = useCallback(async () => {
    if (editingTheme) {
      try {
        const css = await getCustomThemeCss(editingTheme.id);
        previewThemeVariables(editingTheme.id, parseCssVariables(css));
      } catch {
        /* ignore */
      }
    }
    setEditingTheme(null);
  }, [editingTheme, previewThemeVariables]);

  const handleDeleteCodeTheme = useCallback((m: CustomCodeTheme) => {
    setDeleteConfirm({ kind: "code", name: m.name, id: m.id });
  }, []);

  const scheduleCodePreview = useCallback((id: string, vars: ThemeVariable[]) => {
    if (codePreviewTimerRef.current) window.clearTimeout(codePreviewTimerRef.current);
    codePreviewTimerRef.current = window.setTimeout(() => {
      previewCodeThemeVariables(id, vars);
    }, 80);
  }, [previewCodeThemeVariables]);

  const openCodeEditor = useCallback((manifest: CustomCodeTheme, variables: ThemeVariable[]) => {
    const merged = mergeCodeThemeWithSchema(variables);
    setEditCodeVariables(merged);
    setEditingCodeTheme(manifest);
    setPreferredCodeTheme(resolvedMode, manifest.id);
    previewCodeThemeVariables(manifest.id, merged);
  }, [previewCodeThemeVariables, resolvedMode, setPreferredCodeTheme]);

  const handleStartEditCodeTheme = useCallback(async (manifest: CustomCodeTheme) => {
    try {
      const css = await getCodeThemeCss(manifest.id);
      openCodeEditor(manifest, parseCssVariables(css));
    } catch (err) {
      console.error(t("settings.theme.loadThemeFailed"), err);
    }
  }, [openCodeEditor, t]);

  const handleForkCodeTheme = useCallback(async (builtinId: string, label: string) => {
    try {
      setForkingCode(true);
      const name = t("settings.theme.forkedName", { name: label });
      const manifest = await createCodeThemeFromBuiltin(builtinId, name);
      await handleStartEditCodeTheme(manifest);
    } catch (err) {
      console.error(t("settings.theme.forkFailed"), err);
    } finally {
      setForkingCode(false);
    }
  }, [createCodeThemeFromBuiltin, handleStartEditCodeTheme, t]);

  const handleCodeVariableChange = useCallback((name: string, newValue: string) => {
    setEditCodeVariables((prev) => {
      const next = prev.map((v) => (v.name === name ? { ...v, value: newValue } : v));
      if (editingCodeTheme) {
        scheduleCodePreview(editingCodeTheme.id, next);
      }
      return next;
    });
  }, [editingCodeTheme, scheduleCodePreview]);

  const handleSaveCodeEdit = useCallback(async () => {
    if (!editingCodeTheme) return;
    await updateCodeThemeVariables(editingCodeTheme.id, editCodeVariables);
    setEditingCodeTheme(null);
  }, [editingCodeTheme, editCodeVariables, updateCodeThemeVariables]);

  const handleCancelCodeEdit = useCallback(async () => {
    if (editingCodeTheme) {
      try {
        const css = await getCodeThemeCss(editingCodeTheme.id);
        previewCodeThemeVariables(editingCodeTheme.id, parseCssVariables(css));
      } catch {
        /* ignore */
      }
    }
    setEditingCodeTheme(null);
  }, [editingCodeTheme, previewCodeThemeVariables]);

  const editorSections: ThemeEditorSectionView[] | null = editingTheme
    ? buildThemeEditorSections(editVariables)
    : null;

  const codePreviewStyle = editingCodeTheme
    ? (codeThemeVarsToPreviewStyle(editCodeVariables) as CSSProperties)
    : undefined;

  if (editingCodeTheme) {
    return (
      <div className="settings-section theme-editor code-theme-editor">
        <div className="theme-editor-sticky">
          <div className="theme-editor-header">
            <button className="theme-editor-back" onClick={handleCancelCodeEdit}>
              {t("settings.theme.back")}
            </button>
            <h3 className="settings-section-title">
              {t("settings.theme.editCodeTheme", { name: editingCodeTheme.name })}
            </h3>
            <div className="theme-editor-actions">
              <button className="settings-button" onClick={handleSaveCodeEdit}>{t("settings.theme.save")}</button>
              <button className="settings-button theme-editor-cancel" onClick={handleCancelCodeEdit}>{t("settings.theme.cancel")}</button>
            </div>
          </div>

          <div className="settings-code-theme-preview code-theme-editor-preview">
            <div className="settings-code-theme-preview-toolbar">
              <div className="settings-code-theme-preview-title">{t("settings.theme.preview")}</div>
              <div className="settings-code-sample-tabs">
                {CODE_THEME_SAMPLE_SNIPPETS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`settings-code-sample-tab${codeSampleLang === s.id ? " active" : ""}`}
                    onClick={() => setCodeSampleLang(s.id)}
                  >
                    {t(`settings.theme.${s.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
            <pre
              className="settings-code-theme-preview-code"
              style={codePreviewStyle}
            >
              <code dangerouslySetInnerHTML={{ __html: codeSampleHtml }} />
            </pre>
          </div>
        </div>

        <div className="theme-editor-variables">
          <div className="theme-editor-group">
            <h4 className="theme-editor-group-title">{t("settings.theme.groupCodeHighlight")}</h4>
            {CODE_THEME_COLOR_SCHEMA.map((token) => {
              const variable = editCodeVariables.find((v) => v.name === token.name);
              if (!variable) return null;
              return (
                <ThemeColorField
                  key={token.name}
                  label={t(`settings.theme.token.${token.labelKey}`)}
                  varName={token.name}
                  value={variable.value}
                  onChange={(val) => handleCodeVariableChange(token.name, val)}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (editingTheme && editorSections) {
    return (
      <div className="settings-section theme-editor">
        <div className="theme-editor-sticky">
          <div className="theme-editor-header">
            <button className="theme-editor-back" onClick={handleCancelEdit}>
              {t("settings.theme.back")}
            </button>
            <h3 className="settings-section-title">
              {t("settings.theme.editTheme", { name: editingTheme.name })}
            </h3>
            <div className="theme-editor-actions">
              <button className="settings-button" onClick={handleSaveEdit}>{t("settings.theme.save")}</button>
              <button className="settings-button theme-editor-cancel" onClick={handleCancelEdit}>{t("settings.theme.cancel")}</button>
            </div>
          </div>

          <div
            className="theme-editor-preview theme-editor-preview-rich"
            style={{ background: editPreview.bg, borderColor: editPreview.accent }}
          >
            <div className="theme-editor-preview-sidebar" style={{ background: editVariables.find((v) => v.name === "--bg-secondary")?.value }}>
              <div className="theme-editor-preview-line" style={{ background: editPreview.accent, width: "70%" }} />
              <div className="theme-editor-preview-line" style={{ background: editPreview.text, opacity: 0.35, width: "55%" }} />
            </div>
            <div className="theme-editor-preview-editor">
              <div className="theme-editor-preview-text" style={{ color: editPreview.text }}>
                {t("settings.theme.previewText")}
              </div>
              <div className="theme-editor-preview-text" style={{ color: editPreview.strong, fontWeight: 700 }}>
                {t("settings.theme.previewStrong")}
                {" "}
                <code
                  className="theme-editor-preview-inline-code"
                  style={{
                    background: editPreview.codeBg,
                    color: editPreview.codeText,
                    borderColor: editPreview.border,
                    borderRadius: editPreview.radiusInline,
                    padding: `${editPreview.paddingInlineY} ${editPreview.paddingInlineX}`,
                  }}
                >
                  {t("settings.theme.previewInlineCode")}
                </code>
              </div>
              <div className="theme-editor-preview-accent" style={{ background: editPreview.accent }}>
                {t("settings.theme.accent")}
              </div>
            </div>
          </div>
        </div>

        <div className="theme-editor-variables">
          {editorSections.map((section) => (
            <div key={section.id} className="theme-editor-group">
              <h4 className="theme-editor-group-title">
                {t(`settings.theme.${section.titleKey}`)}
              </h4>
              {section.fields.map((field) => {
                if (field.kind === "color") {
                  const label = t(`settings.theme.token.${field.meta.labelKey}`);
                  return (
                    <ThemeColorField
                      key={field.variable.name}
                      label={label}
                      varName={field.variable.name}
                      value={field.variable.value}
                      onChange={(val) => handleVariableChange(field.variable.name, val)}
                    />
                  );
                }
                return (
                  <ThemeSizeField
                    key={field.variable.name}
                    label={t(`settings.theme.token.${field.meta.labelKey}`)}
                    varName={field.variable.name}
                    value={field.variable.value}
                    meta={field.meta}
                    onChange={(val) => handleVariableChange(field.variable.name, val)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{t("settings.theme.appearanceMode")}</h3>
      <p className="settings-hint" style={{ marginTop: -8, marginBottom: 12 }}>
        {t("settings.theme.appearanceModeHint")}
      </p>
      <div className="appearance-mode-toggle" role="radiogroup" aria-label={t("settings.theme.appearanceMode")}>
        {([
          ["system", "appearanceSystem"],
          ["light", "appearanceLight"],
          ["dark", "appearanceDark"],
        ] as const).map(([mode, labelKey]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={appearanceMode === mode}
            className={`appearance-mode-btn${appearanceMode === mode ? " active" : ""}`}
            onClick={() => setAppearanceMode(mode)}
          >
            {t(`settings.theme.${labelKey}`)}
          </button>
        ))}
      </div>
      <p className="settings-hint appearance-mode-status">
        {t("settings.theme.appearanceStatus", {
          mode: t(`settings.theme.${resolvedMode === "dark" ? "appearanceDark" : "appearanceLight"}`),
          app: (() => {
            const builtin = builtinThemes.find((b) => b.value === theme);
            if (builtin) return builtin.label;
            if (theme.startsWith("custom-")) {
              const id = theme.replace("custom-", "");
              return customThemes.find((m) => m.id === id)?.name || theme;
            }
            return theme;
          })(),
          code: (() => {
            const builtin = CODE_THEMES.find((c) => c.id === codeTheme);
            if (builtin) return builtin.name;
            return customCodeThemes.find((m) => m.id === codeTheme)?.name || codeTheme;
          })(),
        })}
      </p>

      <div className="theme-kind-tabs" role="tablist" aria-label={t("settings.theme.appTheme")}>
        {([
          ["app", "appTheme"],
          ["code", "codeTheme"],
        ] as const).map(([tab, labelKey]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={themeKindTab === tab}
            className={`theme-kind-tab${themeKindTab === tab ? " active" : ""}`}
            onClick={() => setThemeKindTab(tab)}
          >
            {t(`settings.theme.${labelKey}`)}
          </button>
        ))}
      </div>
      <p className="settings-hint" style={{ marginTop: 8, marginBottom: 12 }}>
        {t("settings.theme.slotHint", {
          mode: t(`settings.theme.${resolvedMode === "dark" ? "appearanceDark" : "appearanceLight"}`),
        })}
      </p>

      {themeKindTab === "app" ? (
      <div className="settings-theme-grid">
        {builtinThemes.map((item) => {
            const preferred = theme === item.value;
            return (
              <div
                key={item.value}
                className={`settings-theme-card${preferred ? " active" : ""}`}
                onClick={() => setPreferredAppTheme(resolvedMode, item.value)}
              >
                <div className="settings-theme-preview" data-theme={item.value}>
                  <div className="theme-preview-mock">
                    <div className="mock-titlebar" style={{ background: item.colors[0] }}>
                      <div className="mock-dots">
                        <span style={{ background: item.colors[1] }} />
                        <span style={{ background: item.colors[3] }} />
                        <span style={{ background: item.colors[3] }} />
                      </div>
                    </div>
                    <div className="mock-body">
                      <div className="mock-sidebar" style={{ background: item.colors[3] }}>
                        <div className="mock-line" style={{ background: item.colors[1], width: "60%" }} />
                        <div className="mock-line" style={{ background: item.colors[2], opacity: 0.3, width: "80%" }} />
                        <div className="mock-line" style={{ background: item.colors[2], opacity: 0.3, width: "45%" }} />
                      </div>
                      <div className="mock-editor" style={{ background: item.colors[0] }}>
                        <div className="mock-line" style={{ background: item.colors[2], opacity: 0.2, width: "70%" }} />
                        <div className="mock-line" style={{ background: item.colors[2], opacity: 0.15, width: "55%" }} />
                        <div className="mock-accent-line" style={{ background: item.colors[1], width: "40%" }} />
                      </div>
                    </div>
                  </div>
                  {preferred && (
                    <div className="settings-theme-check">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                  <div className="custom-theme-actions">
                    <button
                      className="custom-theme-edit-btn"
                      title={t("settings.theme.forkAndEdit")}
                      disabled={forking}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleForkBuiltin(item.value, item.label);
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="settings-theme-meta">
                  <span className="settings-theme-name">{item.label}</span>
                  {renderThemeSlotLabel(item.value, preferredAppTheme)}
                </div>
              </div>
            );
          })}

        <div className="settings-theme-divider" role="separator">
          {t("settings.theme.customThemes")}
        </div>

        {customThemes.map((m) => {
            const themeId = `custom-${m.id}`;
            const preferred = theme === themeId;
            const [c0, c1, c2, c3] = resolveThemePreviewColors(m);
            return (
              <div
                key={m.id}
                className={`settings-theme-card custom-theme-card${preferred ? " active" : ""}`}
                onClick={() => setPreferredAppTheme(resolvedMode, themeId)}
              >
                <div className="settings-theme-preview">
                  <div className="theme-preview-mock">
                    <div className="mock-titlebar" style={{ background: c0 }}>
                      <div className="mock-dots">
                        <span style={{ background: c1 }} />
                        <span style={{ background: c3 }} />
                        <span style={{ background: c3 }} />
                      </div>
                    </div>
                    <div className="mock-body">
                      <div className="mock-sidebar" style={{ background: c3 }}>
                        <div className="mock-line" style={{ background: c1, width: "60%" }} />
                        <div className="mock-line" style={{ background: c2, opacity: 0.3, width: "80%" }} />
                        <div className="mock-line" style={{ background: c2, opacity: 0.3, width: "45%" }} />
                      </div>
                      <div className="mock-editor" style={{ background: c0 }}>
                        <div className="mock-line" style={{ background: c2, opacity: 0.2, width: "70%" }} />
                        <div className="mock-line" style={{ background: c2, opacity: 0.15, width: "55%" }} />
                        <div className="mock-accent-line" style={{ background: c1, width: "40%" }} />
                      </div>
                    </div>
                  </div>
                  {preferred && (
                    <div className="settings-theme-check">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                  <div className="custom-theme-actions">
                    <button
                      className="custom-theme-edit-btn"
                      title={t("settings.theme.edit")}
                      onClick={(e) => { e.stopPropagation(); handleStartEdit(m); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                    <button
                      className="custom-theme-delete-btn"
                      title={t("settings.theme.delete")}
                      onClick={(e) => { e.stopPropagation(); handleDelete(m); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="settings-theme-meta">
                  <div className="settings-theme-name-row">
                    <span className="settings-theme-name">{m.name}</span>
                    <button
                      type="button"
                      className="settings-theme-rename-btn"
                      title={t("settings.theme.rename")}
                      onClick={(e) => { e.stopPropagation(); handleRenameApp(m); }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  </div>
                  {renderThemeSlotLabel(themeId, preferredAppTheme)}
                </div>
              </div>
            );
          })}

        <div
          className="settings-theme-card settings-theme-import-card"
          onClick={() => handleCreateBlank(resolvedMode)}
        >
          <div className="settings-theme-preview settings-theme-import-preview">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <span className="settings-theme-name">{t("settings.theme.newTheme")}</span>
        </div>
      </div>
      ) : (
      <>
      <div className="settings-theme-grid">
        {CODE_THEMES.map((ct) => {
            const colors = [
              ct.variables["--hljs-keyword"],
              ct.variables["--hljs-string"],
              ct.variables["--hljs-comment"],
              ct.variables["--hljs-number"],
              ct.variables["--hljs-built_in"],
            ];
            const preferred = codeTheme === ct.id;
            return (
              <div
                key={ct.id}
                className={`settings-theme-card${preferred ? " active" : ""}`}
                onClick={() => setPreferredCodeTheme(resolvedMode, ct.id)}
              >
                <div
                  className="settings-theme-preview code-theme-card-preview"
                  style={{ background: ct.isDark ? "#0d1117" : "#f6f8fa" }}
                >
                  <div className="code-theme-card-mock" aria-hidden>
                    {colors.map((c, i) => (
                      <span
                        key={i}
                        className="code-theme-card-line"
                        style={{ background: c, width: `${72 - i * 8}%` }}
                      />
                    ))}
                  </div>
                  {preferred && (
                    <div className="settings-theme-check">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                  <div className="custom-theme-actions">
                    <button
                      className="custom-theme-edit-btn"
                      title={t("settings.theme.forkAndEdit")}
                      disabled={forkingCode}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleForkCodeTheme(ct.id, ct.name);
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="settings-theme-meta">
                  <span className="settings-theme-name">{ct.name}</span>
                  {renderThemeSlotLabel(ct.id, preferredCodeTheme)}
                </div>
              </div>
            );
          })}

        {customCodeThemes.length > 0 && (
          <div className="settings-theme-divider" role="separator">
            {t("settings.theme.customThemes")}
          </div>
        )}

        {customCodeThemes.map((m) => {
            const colors = m.previewColors ?? ["#d73a49", "#032f62", "#6a737d", "#005cc5", "#e36209"];
            const preferred = codeTheme === m.id;
            return (
              <div
                key={m.id}
                className={`settings-theme-card custom-theme-card${preferred ? " active" : ""}`}
                onClick={() => setPreferredCodeTheme(resolvedMode, m.id)}
              >
                <div
                  className="settings-theme-preview code-theme-card-preview"
                  style={{ background: m.isDark ? "#0d1117" : "#f6f8fa" }}
                >
                  <div className="code-theme-card-mock" aria-hidden>
                    {colors.slice(0, 5).map((c, i) => (
                      <span
                        key={i}
                        className="code-theme-card-line"
                        style={{ background: c, width: `${72 - i * 8}%` }}
                      />
                    ))}
                  </div>
                  {preferred && (
                    <div className="settings-theme-check">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                  <div className="custom-theme-actions">
                    <button
                      className="custom-theme-edit-btn"
                      title={t("settings.theme.edit")}
                      onClick={(e) => { e.stopPropagation(); handleStartEditCodeTheme(m); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                    <button
                      className="custom-theme-delete-btn"
                      title={t("settings.theme.deleteBtn")}
                      onClick={(e) => { e.stopPropagation(); handleDeleteCodeTheme(m); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="settings-theme-meta">
                  <div className="settings-theme-name-row">
                    <span className="settings-theme-name">{m.name}</span>
                    <button
                      type="button"
                      className="settings-theme-rename-btn"
                      title={t("settings.theme.rename")}
                      onClick={(e) => { e.stopPropagation(); handleRenameCode(m); }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  </div>
                  {renderThemeSlotLabel(m.id, preferredCodeTheme)}
                </div>
              </div>
            );
          })}
      </div>

      <div className="settings-code-theme-preview" style={{ marginTop: 8 }}>
        <div className="settings-code-theme-preview-toolbar">
          <div className="settings-code-theme-preview-title">{t("settings.theme.preview")}</div>
          <div className="settings-code-sample-tabs">
            {CODE_THEME_SAMPLE_SNIPPETS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`settings-code-sample-tab${codeSampleLang === s.id ? " active" : ""}`}
                onClick={() => setCodeSampleLang(s.id)}
              >
                {t(`settings.theme.${s.labelKey}`)}
              </button>
            ))}
          </div>
        </div>
        <pre className="settings-code-theme-preview-code">
          <code dangerouslySetInnerHTML={{ __html: codeSampleHtml }} />
        </pre>
      </div>
      </>
      )}

      <div className="theme-pack-bar theme-pack-bar-footer">
        <div className="theme-pack-actions">
          <button
            type="button"
            className="theme-pack-btn"
            onClick={handleExportPack}
            disabled={exporting}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{exporting ? t("settings.theme.exportingPack") : t("settings.theme.exportPack")}</span>
          </button>
          <button
            type="button"
            className="theme-pack-btn"
            onClick={handleImportPack}
            disabled={importing}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{importing ? t("settings.theme.importing") : t("settings.theme.importPack")}</span>
          </button>
        </div>
        <p className="settings-hint theme-pack-hint">{t("settings.theme.packHint")}</p>
      </div>

      {nameDialog.open && (
        <div
          className="theme-name-dialog-overlay"
          onClick={() => setNameDialog({ open: false, mode: "export-pack", id: "", defaultName: "" })}
        >
          <div className="theme-name-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="theme-name-dialog-title">
              {nameDialog.mode === "export-pack"
                ? t("settings.theme.namePack")
                : t("settings.theme.renameTheme")}
            </h3>
            <input
              type="text"
              className="theme-name-dialog-input"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmNameDialog(); }}
              placeholder={
                nameDialog.mode === "export-pack"
                  ? t("settings.theme.namePackPlaceholder")
                  : t("settings.theme.nameThemePlaceholder")
              }
              autoFocus
            />
            <div className="theme-name-dialog-actions">
              <button
                className="settings-button theme-name-dialog-cancel"
                onClick={() => setNameDialog({ open: false, mode: "export-pack", id: "", defaultName: "" })}
              >
                {t("settings.theme.cancel")}
              </button>
              <button
                className="settings-button"
                onClick={handleConfirmNameDialog}
                disabled={exporting}
              >
                {exporting
                  ? t("settings.theme.exportingPack")
                  : nameDialog.mode === "export-pack"
                    ? t("settings.theme.exportPack")
                    : t("settings.theme.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="theme-name-dialog-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="theme-name-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="theme-name-dialog-title">
              {deleteConfirm.kind === "code"
                ? t("settings.theme.deleteCodeThemeTitle")
                : t("settings.theme.deleteThemeTitle")}
            </h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              {deleteConfirm.kind === "code"
                ? t("settings.theme.deleteCodeThemeConfirm", { name: deleteConfirm.name })
                : t("settings.theme.deleteThemeConfirm", { name: deleteConfirm.name })}
            </p>
            <div className="theme-name-dialog-actions">
              <button className="settings-button theme-name-dialog-cancel" onClick={() => setDeleteConfirm(null)}>{t("settings.theme.cancel")}</button>
              <button className="settings-button warning" onClick={handleConfirmDelete}>{t("settings.theme.deleteBtn")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortcutsSettingsContent() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [recordingSearch, setRecordingSearch] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => {
    try {
      const saved = localStorage.getItem(SHORTCUTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = DEFAULT_SHORTCUTS.map((def) => {
          const savedItem = parsed.find((s: ShortcutItem) => s.id === def.id);
          return savedItem ? savedItem : def;
        });
        return merged;
      }
    } catch { }
    return DEFAULT_SHORTCUTS;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKeys, setEditingKeys] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
  }, [shortcuts]);

  // 按分组整理快捷键
  const shortcutGroupNames: Record<string, string> = {
    "格式": t("settings.shortcuts.format", "格式"),
    "列表": t("settings.shortcuts.list", "列表"),
    "标题": t("settings.shortcuts.heading", "标题"),
    "插入": t("settings.shortcuts.insert", "插入"),
    "表格": t("settings.shortcuts.table", "表格"),
    "编辑": t("settings.shortcuts.edit", "编辑"),
    "视图": t("settings.shortcuts.view", "视图"),
    "模式": t("settings.shortcuts.mode", "模式"),
    "系统": t("settings.shortcuts.system", "系统"),
    "介绍": t("settings.shortcuts.intro", "介绍"),
    "查找替换": t("settings.shortcuts.findReplace", "查找替换"),
    "窗口": t("settings.shortcuts.window", "窗口"),
    "其他": t("settings.shortcuts.other"),
  };

  // 快捷键标签映射（根据 ID 转换为当前语言）
  const shortcutLabelMap: Record<string, string> = {
    bold: t("settings.shortcuts.labels.bold"),
    italic: t("settings.shortcuts.labels.italic"),
    strike: t("settings.shortcuts.labels.strike"),
    "inline-code": t("settings.shortcuts.labels.inline-code"),
    "code-block": t("settings.shortcuts.labels.code-block"),
    link: t("settings.shortcuts.labels.link"),
    highlight: t("settings.shortcuts.labels.highlight"),
    quote: t("settings.shortcuts.labels.quote"),
    hr: t("settings.shortcuts.labels.hr"),
    "unordered-list": t("settings.shortcuts.labels.unordered-list"),
    "ordered-list": t("settings.shortcuts.labels.ordered-list"),
    "check-list": t("settings.shortcuts.labels.check-list"),
    indent: t("settings.shortcuts.labels.indent"),
    outdent: t("settings.shortcuts.labels.outdent"),
    "task-toggle": t("settings.shortcuts.labels.task-toggle"),
    "heading-1": t("settings.shortcuts.labels.heading-1"),
    "heading-2": t("settings.shortcuts.labels.heading-2"),
    "heading-3": t("settings.shortcuts.labels.heading-3"),
    "heading-4": t("settings.shortcuts.labels.heading-4"),
    "heading-5": t("settings.shortcuts.labels.heading-5"),
    "heading-6": t("settings.shortcuts.labels.heading-6"),
    paragraph: t("settings.shortcuts.labels.paragraph"),
    table: t("settings.shortcuts.labels.table"),
    "insert-before": t("settings.shortcuts.labels.insert-before"),
    "insert-after": t("settings.shortcuts.labels.insert-after"),
    "table-row-above": t("settings.shortcuts.labels.table-row-above"),
    "table-row-below": t("settings.shortcuts.labels.table-row-below"),
    "table-col-left": t("settings.shortcuts.labels.table-col-left"),
    "table-col-right": t("settings.shortcuts.labels.table-col-right"),
    "table-row-delete": t("settings.shortcuts.labels.table-row-delete"),
    "table-col-delete": t("settings.shortcuts.labels.table-col-delete"),
    "table-align-left": t("settings.shortcuts.labels.table-align-left"),
    "table-align-center": t("settings.shortcuts.labels.table-align-center"),
    "table-align-right": t("settings.shortcuts.labels.table-align-right"),
    undo: t("settings.shortcuts.labels.undo"),
    redo: t("settings.shortcuts.labels.redo"),
    "select-all": t("settings.shortcuts.labels.select-all"),
    "toggle-sidebar": t("settings.shortcuts.labels.toggle-sidebar"),
    typewriter: t("settings.shortcuts.labels.typewriter"),
    "open-mindmap": t("settings.shortcuts.labels.open-mindmap"),
    "split-lr": t("settings.shortcuts.labels.split-lr", "左右分屏"),
    "split-tb": t("settings.shortcuts.labels.split-tb", "上下分屏"),
    "toggle-mode": t("settings.shortcuts.labels.toggle-mode"),
    escape: t("settings.shortcuts.labels.escape"),
    "quick-open": t("settings.shortcuts.labels.quick-open"),
    "command-palette": t("settings.shortcuts.labels.command-palette"),
    "open-settings": t("settings.shortcuts.labels.open-settings"),
  };
  const filteredShortcuts = shortcuts.filter((s) => {
    const query = search.toLowerCase();
    if (!query) return true;
    const translatedLabel = shortcutLabelMap[s.id] || s.label;
    if (translatedLabel.toLowerCase().includes(query)) return true;
    const keysStr = s.keys.join("+").toLowerCase();
    return keysStr.includes(query);
  });
  const groupedShortcuts = filteredShortcuts.reduce<Record<string, ShortcutItem[]>>((acc, shortcut) => {
    const group = shortcut.group || "其他";
    if (!acc[group]) acc[group] = [];
    acc[group].push(shortcut);
    return acc;
  }, {});

  const handleKeyDown = (e: KeyboardEvent) => {
    if (editingId === null && !recordingSearch) return;
    e.preventDefault();

    const keyMap: Record<string, string> = {
      "Control": "Ctrl",
      "Meta": "Ctrl",
      "Shift": "Shift",
      "Alt": "Alt",
      "ArrowUp": "↑",
      "ArrowDown": "↓",
      "ArrowLeft": "←",
      "ArrowRight": "→",
      "Enter": "Enter",
      "Escape": "Esc",
      "Backspace": "Backspace",
      "Delete": "Delete",
      "Tab": "Tab",
      "Space": "Space",
    };

    const key = keyMap[e.key] || e.key;

    if (e.key === "Escape") {
      if (recordingSearch) {
        setRecordingSearch(false);
        setSearch("");
      } else {
        setEditingId(null);
        setEditingKeys([]);
      }
      return;
    }

    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

    const newKeys: string[] = [];
    if (e.ctrlKey || e.metaKey) newKeys.push("Ctrl");
    if (e.shiftKey) newKeys.push("Shift");
    if (e.altKey) newKeys.push("Alt");
    newKeys.push(key);

    if (recordingSearch) {
      setSearch(newKeys.join("+"));
      setRecordingSearch(false);
      return;
    }

    setEditingKeys(newKeys);
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingId, recordingSearch]);

  const startEditing = (id: string) => {
    const shortcut = shortcuts.find((s) => s.id === id);
    if (shortcut) {
      setEditingId(id);
      setEditingKeys([...shortcut.keys]);
    }
  };

  const saveShortcut = () => {
    if (editingId === null || editingKeys.length === 0) return;

    setShortcuts((prev) =>
      prev.map((s) => (s.id === editingId ? { ...s, keys: [...editingKeys] } : s))
    );
    setEditingId(null);
    setEditingKeys([]);
  };

  const resetShortcut = (id: string) => {
    const defaultShortcut = DEFAULT_SHORTCUTS.find((s) => s.id === id);
    if (defaultShortcut) {
      setShortcuts((prev) =>
        prev.map((s) => (s.id === id ? { ...s, keys: [...defaultShortcut.keys] } : s))
      );
    }
  };

  const resetAll = () => {
    if (confirm(t("settings.shortcuts.resetConfirm"))) {
      setShortcuts([...DEFAULT_SHORTCUTS]);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-search-wrapper">
        <div className={`settings-search-inner${recordingSearch ? " recording" : ""}`}>
          <input
            type="text"
            className="settings-search"
            placeholder={recordingSearch ? t("settings.shortcuts.keyRecordingPlaceholder") : t("settings.shortcuts.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            readOnly={recordingSearch}
          />
          <button
            className={`settings-record-btn${recordingSearch ? " active" : ""}`}
            onClick={() => {
              if (recordingSearch) {
                setRecordingSearch(false);
                setSearch("");
              } else {
                setRecordingSearch(true);
              }
            }}
            title={recordingSearch ? t("settings.shortcuts.cancelRecording") : t("settings.shortcuts.keyRecordingSearch")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
            </svg>
          </button>
        </div>
        <button className="settings-reset-all-btn" onClick={resetAll}>
          {t("settings.shortcuts.resetAll")}
        </button>
      </div>
      <div className="settings-shortcuts-list">
        {Object.entries(groupedShortcuts).map(([group, items]) => (
          <div key={group} className="settings-shortcut-group">
            <h4 className="settings-shortcut-group-title">{shortcutGroupNames[group] || group}</h4>
            {items.map((shortcut) => (
              <div key={shortcut.id} className="settings-shortcut-item">
                <span className="settings-shortcut-label">{shortcutLabelMap[shortcut.id] || shortcut.label}</span>
                <div className="settings-shortcut-actions">
                  <div
                    className={`settings-shortcut-keys${editingId === shortcut.id ? " editing" : ""}`}
                    onClick={() => startEditing(shortcut.id)}
                  >
                    {editingId === shortcut.id ? (
                      <>
                        {editingKeys.length > 0 ? (
                          editingKeys.map((key, j) => (
                            <span key={j}>
                              <kbd className="settings-kbd">{formatShortcutKey(key)}</kbd>
                              {j < editingKeys.length - 1 && <span className="settings-kbd-sep">+</span>}
                            </span>
                          ))
                        ) : (
                          <span className="settings-shortcut-hint">{t("settings.shortcuts.pressKeys")}</span>
                        )}
                        <button className="settings-shortcut-save" onClick={(e) => { e.stopPropagation(); saveShortcut(); }}>
                          ✓
                        </button>
                        <button className="settings-shortcut-cancel" onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditingKeys([]); }}>
                          ✕
                        </button>
                      </>
                    ) : shortcut.keys.length > 0 ? (
                      shortcut.keys.map((key, j) => (
                        <span key={j}>
                          <kbd className="settings-kbd">{formatShortcutKey(key)}</kbd>
                          {j < shortcut.keys.length - 1 && <span className="settings-kbd-sep">+</span>}
                        </span>
                      ))
                    ) : (
                      <span className="settings-shortcut-hint">{t("settings.shortcuts.notSet")}</span>
                    )}
                  </div>
                  {editingId !== shortcut.id && (
                    <button
                      className="settings-shortcut-reset"
                      onClick={() => resetShortcut(shortcut.id)}
                      title={t("settings.shortcuts.resetToDefault")}
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageSettingsContent({
  settings,
  onChange,
}: {
  settings: ImageSettings;
  onChange: (s: ImageSettings) => void;
}) {
  const { t } = useTranslation();
  const handleSelectDirectory = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      onChange({ ...settings, fixedDirectory: { ...settings.fixedDirectory, path: selected } });
    }
  };

  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.image.storageMode")}</span>
            <span className="canvas-settings-row-desc">{t("settings.image.storageModeDesc")}</span>
          </div>
          <SettingsSelect
            value={settings.storageMode}
            onChange={(v) => onChange({ ...settings, storageMode: v as StorageMode })}
            options={[
              { value: "vault-assets", label: t("settings.image.vaultAssets") },
              { value: "fixed-directory", label: t("settings.image.fixedLocal") },
              { value: "image-bed", label: t("settings.image.uploadLater") },
            ]}
          />
        </div>
      </div>

      {settings.storageMode === "vault-assets" && (
        <div className="canvas-settings-card">
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">{t("settings.image.filenameFormat")}</span>
              <span className="canvas-settings-row-desc">{t("settings.image.filenameFormatDesc")}</span>
            </div>
            <SettingsSelect
              value={settings.local.filenameFormat}
              onChange={(v) =>
                onChange({
                  ...settings,
                  local: { ...settings.local, filenameFormat: v as FilenameFormat },
                })
              }
              options={[
                { value: "original", label: t("settings.image.originalName") },
                { value: "timestamp", label: t("settings.image.timestamp") },
                { value: "both", label: t("settings.image.originalAndTimestamp") },
              ]}
            />
          </div>
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">{t("settings.image.autoCreateAssets")}</span>
              <span className="canvas-settings-row-desc">{t("settings.image.autoCreateAssetsDesc")}</span>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.local.autoCreateAssetsDir}
                onChange={(e) => onChange({
                  ...settings,
                  local: { ...settings.local, autoCreateAssetsDir: e.target.checked },
                })}
              />
              <span className="settings-switch-slider" />
            </label>
          </div>
        </div>
      )}

      {settings.storageMode === "fixed-directory" && (
        <div className="canvas-settings-card">
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">{t("settings.image.storagePath")}</span>
              <span className="canvas-settings-row-desc">{t("settings.image.storagePathDesc")}</span>
            </div>
            <div className="canvas-settings-row-control">
              <input
                type="text"
                className="settings-input"
                value={settings.fixedDirectory.path}
                placeholder={t("settings.image.selectDir")}
                readOnly
                style={{ maxWidth: 200 }}
              />
              <button className="settings-button" onClick={handleSelectDirectory}>
                {t("settings.image.select")}
              </button>
            </div>
          </div>
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">文件命名格式</span>
            </div>
            <SettingsSelect
              value={settings.local.filenameFormat}
              onChange={(v) =>
                onChange({
                  ...settings,
                  local: { ...settings.local, filenameFormat: v as FilenameFormat },
                })
              }
              options={[
                { value: "original", label: t("settings.image.originalName") },
                { value: "timestamp", label: t("settings.image.timestamp") },
                { value: "both", label: t("settings.image.originalAndTimestamp") },
              ]}
            />
          </div>
        </div>
      )}

      {settings.storageMode === "image-bed" && (
        <div className="canvas-settings-card">
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">{t("settings.image.uploadFeature")}</span>
              <span className="canvas-settings-row-desc">{t("settings.image.uploadFeatureDesc")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// @ts-expect-error - Reserved for future editor settings UI
function EditorSettingsContent({
  settings,
  onChange,
}: {
  settings: EditorSettings;
  onChange: (s: EditorSettings) => void;
}) {
  const { t } = useTranslation();
  const update = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.editor.defaultMode")}</span>
            <span className="canvas-settings-row-desc">{t("settings.editor.defaultModeDesc")}</span>
          </div>
          <SettingsSelect
            value={settings.defaultMode}
            onChange={(v) => update("defaultMode", v as EditorSettings["defaultMode"])}
            options={[
              { value: "ir", label: t("settings.editor.instantRender") },
              { value: "sv", label: t("settings.editor.source") },
            ]}
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.editor.wordCountType")}</span>
          </div>
          <SettingsSelect
            value={settings.counterType}
            onChange={(v) => update("counterType", v as EditorSettings["counterType"])}
            options={[
              { value: "markdown", label: t("settings.editor.markdown") },
              { value: "text", label: t("settings.editor.plainText") },
            ]}
          />
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.editor.callout")}</span>
            <span className="canvas-settings-row-desc">{'> [!NOTE]'}</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.callout} onChange={(e) => update("callout", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.editor.mermaid")}</span>
            <span className="canvas-settings-row-desc">flowchart / sequence / ...</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.mermaid} onChange={(e) => update("mermaid", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.editor.math")}</span>
            <span className="canvas-settings-row-desc">$LaTeX$</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.math} onChange={(e) => update("math", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.editor.wikilink")}</span>
            <span className="canvas-settings-row-desc">[[note]]</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.wikiLink} onChange={(e) => update("wikiLink", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.editor.yaml")}</span>
            <span className="canvas-settings-row-desc">--- 元数据 ---</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.frontmatter} onChange={(e) => update("frontmatter", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.editor.tableToolbar")}</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.tableToolbar} onChange={(e) => update("tableToolbar", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-desc">{t("settings.editor.restartNotice")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasSettingsContent({
  settings,
  onChange,
}: {
  settings: CanvasSettings;
  onChange: (s: CanvasSettings) => void;
}) {
  const { t } = useTranslation();
  const handleChange = (key: keyof CanvasSettings, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="canvas-settings-page">
      {/* Storage Location */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.defaultLocation")}</span>
          </div>
          <SettingsSelect
            value={settings.storageLocation}
            onChange={(v) => handleChange("storageLocation", v)}
            options={[
              { value: "vault-root", label: t("settings.canvas.vaultRoot") },
              { value: "current-folder", label: t("settings.canvas.currentFolder") },
              { value: "custom-folder", label: t("settings.canvas.attachmentFolder") },
            ]}
          />
        </div>
        {settings.storageLocation === 'custom-folder' && (
          <div className="canvas-settings-row canvas-settings-row-nested">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">{t("settings.canvas.attachmentPath")}</span>
              <span className="canvas-settings-row-desc">{t("settings.canvas.attachmentPathDesc")}</span>
            </div>
            <input
              type="text"
              className="settings-input"
              value={settings.customFolder}
              onChange={(e) => handleChange('customFolder', e.target.value)}
              placeholder="assets"
            />
          </div>
        )}
      </div>

      {/* Alignment Options */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.snapToGrid")}</span>
            <span className="canvas-settings-row-desc">{t("settings.canvas.snapToGridDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.snapToGrid}
              onChange={(e) => handleChange('snapToGrid', e.target.checked)}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
        {settings.snapToGrid && (
          <div className="canvas-settings-row canvas-settings-row-nested">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">{t("settings.canvas.gridSize")}</span>
            </div>
            <div className="canvas-settings-row-control">
              <input
                type="number"
                className="settings-input-small"
                value={settings.gridSize}
                onChange={(e) => handleChange('gridSize', parseInt(e.target.value) || 15)}
                min="5"
                max="50"
              />
              <span className="canvas-settings-unit">px</span>
            </div>
          </div>
        )}
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.snapToObjects")}</span>
            <span className="canvas-settings-row-desc">{t("settings.canvas.snapToObjectsDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.snapToObjects}
              onChange={(e) => handleChange('snapToObjects', e.target.checked)}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>

      {/* Display Options */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.hideContentThreshold")}</span>
            <span className="canvas-settings-row-desc">{t("settings.canvas.hideContentThresholdDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              value={settings.hideContentZoomThreshold}
              onChange={(e) => handleChange('hideContentZoomThreshold', parseFloat(e.target.value))}
              min="0.1"
              max="1"
              step="0.1"
            />
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.enableMinimap")}</span>
            <span className="canvas-settings-row-desc">{t("settings.canvas.enableMinimapDesc")}</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.minimapEnabled}
              onChange={(e) => handleChange('minimapEnabled', e.target.checked)}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
        {settings.minimapEnabled && (
          <div className="canvas-settings-row canvas-settings-row-nested">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">{t("settings.canvas.minimapPosition")}</span>
            </div>
            <SettingsSelect
              value={settings.minimapPosition}
              onChange={(v) => handleChange("minimapPosition", v)}
              options={[
                { value: "top-left", label: t("settings.canvas.topLeft") },
                { value: "bottom-left", label: t("settings.canvas.bottomLeft") },
                { value: "bottom-right", label: t("settings.canvas.bottomRight") },
              ]}
            />
          </div>
        )}
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.minZoom")}</span>
            <span className="canvas-settings-row-desc">{t("settings.canvas.minZoomDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="number"
              className="settings-input-small"
              value={settings.minZoom}
              onChange={(e) => handleChange('minZoom', parseFloat(e.target.value) || 0.05)}
              min="0.01"
              max="1"
              step="0.01"
            />
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.maxZoom")}</span>
            <span className="canvas-settings-row-desc">{t("settings.canvas.maxZoomDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="number"
              className="settings-input-small"
              value={settings.maxZoom}
              onChange={(e) => handleChange('maxZoom', parseFloat(e.target.value) || 2)}
              min="1"
              max="10"
              step="0.5"
            />
          </div>
        </div>
      </div>

      {/* Default Card Sizes */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.textCard")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="number"
              className="settings-input-small"
              value={settings.defaultTextCardSize.width}
              onChange={(e) => handleChange('defaultTextCardSize', {
                ...settings.defaultTextCardSize,
                width: parseInt(e.target.value) || 400
              })}
            />
            <span className="canvas-settings-x">x</span>
            <input
              type="number"
              className="settings-input-small"
              value={settings.defaultTextCardSize.height}
              onChange={(e) => handleChange('defaultTextCardSize', {
                ...settings.defaultTextCardSize,
                height: parseInt(e.target.value) || 200
              })}
            />
            <span className="canvas-settings-unit">px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.noteCard")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="number"
              className="settings-input-small"
              value={settings.defaultNoteCardSize.width}
              onChange={(e) => handleChange('defaultNoteCardSize', {
                ...settings.defaultNoteCardSize,
                width: parseInt(e.target.value) || 400
              })}
            />
            <span className="canvas-settings-x">x</span>
            <input
              type="number"
              className="settings-input-small"
              value={settings.defaultNoteCardSize.height}
              onChange={(e) => handleChange('defaultNoteCardSize', {
                ...settings.defaultNoteCardSize,
                height: parseInt(e.target.value) || 400
              })}
            />
            <span className="canvas-settings-unit">px</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.canvas.mediaCard")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="number"
              className="settings-input-small"
              value={settings.defaultMediaCardSize.width}
              onChange={(e) => handleChange('defaultMediaCardSize', {
                ...settings.defaultMediaCardSize,
                width: parseInt(e.target.value) || 400
              })}
            />
            <span className="canvas-settings-x">x</span>
            <input
              type="number"
              className="settings-input-small"
              value={settings.defaultMediaCardSize.height}
              onChange={(e) => handleChange('defaultMediaCardSize', {
                ...settings.defaultMediaCardSize,
                height: parseInt(e.target.value) || 300
              })}
            />
            <span className="canvas-settings-unit">px</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutSettingsContent() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string>("");
  const [storeVersion, setStoreVersion] = useState(false);
  const [portableVersion, setPortableVersion] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ available: boolean; info?: UpdateInfo } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });
  const [analyticsEnabled, setAnalyticsState] = useState<boolean>(() => isAnalyticsEnabled());

  useEffect(() => {
    invoke<string>("get_app_version").then(setVersion).catch(() => setVersion(""));
    // 是否为微软商店版本：商店版检测 GitHub 更高版本，切换通道更新
    isStoreVersion().then(setStoreVersion).catch(() => setStoreVersion(false));
    // 是否为便携版：便携版走 GitHub 便携 zip 通道更新
    isPortableVersion().then(setPortableVersion).catch(() => setPortableVersion(false));
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const info = await checkForUpdate();
      setUpdateResult(info ? { available: true, info } : { available: false });
    } catch {
      setUpdateResult({ available: false });
    }
    setCheckingUpdate(false);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!updateResult?.info) return;
    // 商店版切换到 GitHub 版会先卸载商店包（不可逆，之后改由 GitHub 更新），需确认
    if (storeVersion) {
      const ok = await ask(t("settings.about.switchConfirm"), { title: "Tydora", kind: "warning" });
      if (!ok) return;
    }
    setDownloading(true);
    setDownloadProgress({ downloaded: 0, total: null });
    try {
      await downloadAndInstall((downloaded, total) => {
        setDownloadProgress({ downloaded, total });
      });
      if (storeVersion) {
        // 切换完成：应用退出，后台脚本随后卸载商店版并安装 GitHub 版
        await exitApp();
      } else if (portableVersion) {
        // 便携版：退出，后台 cmd 脚本已替换 exe 并接管重启
        await exitApp();
      } else {
        await relaunchApp();
      }
    } catch (e) {
      console.error(`${t("settings.about.updateFailed")}`, e);
      setDownloading(false);
    }
  }, [updateResult, t, storeVersion, portableVersion]);

  return (
    <div className="settings-section">
      <div className="settings-about-header">
        <img src={appIcon} alt="Tydora" className="settings-about-icon" />
        <h2 className="settings-about-title">Tydora</h2>
        <p className="settings-about-subtitle">{t("settings.about.description")}<br />{t("settings.about.lightweight")}</p>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">{t("settings.about.versionInfo")}</label>
        <span className="settings-about-value">{version ? `v${version}` : t("settings.about.loading")}</span>
      </div>

      {storeVersion && (
        <div className="settings-item">
          <label className="settings-item-label">{t("settings.about.storeSource")}</label>
          <span className="settings-about-value">{t("settings.about.storeVersionHint")}</span>
        </div>
      )}

      <div className="settings-item-vertical">
        <label className="settings-label">{t("settings.appearance.analytics")}</label>
        <div className="settings-item-inline">
          <span className="canvas-settings-row-desc">{t("settings.appearance.analyticsDesc")}</span>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={analyticsEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setAnalyticsEnabled(enabled);
                setAnalyticsState(enabled);
              }}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">{t("settings.about.checkUpdate")}</label>
        {downloading ? (
          <span className="settings-about-value">
            {t("settings.about.downloading")}{downloadProgress.total ? ` ${Math.round(downloadProgress.downloaded / downloadProgress.total * 100)}%` : ""}
          </span>
        ) : updateResult?.available && updateResult.info ? (
          <button className="settings-button" onClick={handleDownload}>
            {t("settings.about.updateTo", { version: updateResult.info.version })}
          </button>
        ) : (
          <button
            className="settings-button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
          >
            {checkingUpdate ? t("settings.about.checking") : updateResult && !updateResult.available ? t("settings.about.alreadyLatest") : t("settings.about.checkUpdate")}
          </button>
        )}
      </div>

      <div className="settings-item">
        <label className="settings-item-label">{t("settings.about.github")}</label>
        <span
          className="settings-link"
          style={{ cursor: "pointer" }}
          onClick={() => invoke("open_url", { url: "https://github.com/zuorn/Tydora" })}
        >
          {t("settings.about.visitRepo")}
        </span>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">{t("settings.about.feedback")}</label>
        <span
          className="settings-link"
          style={{ cursor: "pointer" }}
          onClick={() => invoke("open_url", { url: "https://github.com/zuorn/Tydora/issues" })}
        >
          Report an Issue
        </span>
      </div>
    </div>
  );
}

// ── Main Settings Component ─────────────────────────────────────────

const SETTINGS_WINDOW_STATE_KEY = "zmd-settings-window-state";
const SETTINGS_NAV_WIDTH_KEY = "zmd-settings-nav-width";
const SETTINGS_NAV_WIDTH_DEFAULT = 260;
const SETTINGS_NAV_WIDTH_MIN = 180;
const SETTINGS_NAV_WIDTH_MAX = 420;

export default function Settings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    try {
      const saved = localStorage.getItem("zmd-settings-initial-tab") as SettingsTab | null;
      if (saved && ["general", "theme", "shortcuts", "mindmap", "graph", "image", "canvas", "publish", "vim", "about"].includes(saved)) {
        localStorage.removeItem("zmd-settings-initial-tab");
        return saved;
      }
    } catch { }
    return "general";
  });
  const [navWidth, setNavWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(SETTINGS_NAV_WIDTH_KEY));
      if (Number.isFinite(saved)) {
        return Math.max(SETTINGS_NAV_WIDTH_MIN, Math.min(SETTINGS_NAV_WIDTH_MAX, saved));
      }
    } catch { }
    return SETTINGS_NAV_WIDTH_DEFAULT;
  });
  const [isNavResizing, setIsNavResizing] = useState(false);
  const navResizeStartRef = useRef({ x: 0, width: SETTINGS_NAV_WIDTH_DEFAULT });

  useEffect(() => {
    localStorage.setItem(SETTINGS_NAV_WIDTH_KEY, String(navWidth));
  }, [navWidth]);

  const handleNavResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    navResizeStartRef.current = { x: e.clientX, width: navWidth };
    setIsNavResizing(true);
  }, [navWidth]);

  useEffect(() => {
    if (!isNavResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - navResizeStartRef.current.x;
      const next = navResizeStartRef.current.width + delta;
      setNavWidth(Math.max(SETTINGS_NAV_WIDTH_MIN, Math.min(SETTINGS_NAV_WIDTH_MAX, next)));
    };
    const handleMouseUp = () => setIsNavResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isNavResizing]);

  // 统计：设置窗口打开（所有入口最终都会挂载此窗口，窗口已打开时只聚焦不重复上报）
  useEffect(() => {
    track(ANALYTICS_EVENTS.SETTINGS_OPEN);
    trackPageview("/app/settings");
  }, []);

  // ── 窗口位置/大小记忆 ──
  const saveWindowStateRef = useRef<() => Promise<void>>(async () => { });
  useEffect(() => {
    const win = getCurrentWebviewWindow();

    const saveWindowState = async () => {
      try {
        const maximized = await win.isMaximized();
        const state: Record<string, unknown> = { maximized };
        if (!maximized) {
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          state.x = pos.x;
          state.y = pos.y;
          state.width = size.width;
          state.height = size.height;
        }
        localStorage.setItem(SETTINGS_WINDOW_STATE_KEY, JSON.stringify(state));
      } catch { }
    };
    saveWindowStateRef.current = saveWindowState;

    (async () => {
      try {
        const saved = localStorage.getItem(SETTINGS_WINDOW_STATE_KEY);
        if (saved) {
          const state = JSON.parse(saved) as {
            x: number; y: number; width: number; height: number; maximized: boolean;
          };

          const monitors = await availableMonitors();
          if (monitors && monitors.length > 0 && state.width && state.height) {
            const clamped = clampWindowToMonitor(
              { x: state.x ?? 0, y: state.y ?? 0, width: state.width, height: state.height },
              monitors
            );
            await win.setSize(new PhysicalSize(clamped.width, clamped.height));
            await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
          }
          if (state.maximized) {
            await win.maximize();
          }
        }
      } catch { }
      // 无论是否有保存的窗口状态，都必须显示窗口（Rust 端以 visible(false) 创建）
      await win.show();
      await win.setFocus().catch(() => { });
    })();

    let moveTimer: ReturnType<typeof setTimeout>;
    let resizeTimer: ReturnType<typeof setTimeout>;

    const unlistenMove = win.onMoved(() => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(saveWindowState, 300);
    });

    const unlistenResize = win.onResized(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(saveWindowState, 300);
    });

    return () => {
      clearTimeout(moveTimer);
      clearTimeout(resizeTimer);
      unlistenMove.then((fn) => fn()).catch(() => { });
      unlistenResize.then((fn) => fn()).catch(() => { });
    };
  }, []);

  // 通用设置状态
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(() => {
    try {
      const saved = localStorage.getItem(GENERAL_SETTINGS_KEY);
      if (!saved) return DEFAULT_GENERAL;
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_GENERAL,
        ...parsed,
        editorFont: normalizeEditorFontValue(parsed.editorFont),
        codeFont: normalizeCodeFontValue(parsed.codeFont),
        codeFontSize:
          typeof parsed.codeFontSize === "number"
            ? Math.min(24, Math.max(10, Math.round(parsed.codeFontSize)))
            : DEFAULT_GENERAL.codeFontSize,
        codeBlockToolbarStyle:
          parsed.codeBlockToolbarStyle === "classic" ? "classic" : "minimal",
        menuDensity: normalizeMenuDensity(parsed.menuDensity),
        paragraphSpacing:
          typeof parsed.paragraphSpacing === "number"
            ? Math.min(2, Math.max(0, Math.round(parsed.paragraphSpacing * 10) / 10))
            : DEFAULT_GENERAL.paragraphSpacing,
        codeLineHeight:
          typeof parsed.codeLineHeight === "number"
            ? Math.min(2.4, Math.max(1.2, Math.round(parsed.codeLineHeight * 10) / 10))
            : DEFAULT_GENERAL.codeLineHeight,
        sidebarTabPlacement: normalizeSidebarTabPlacement(parsed.sidebarTabPlacement),
      };
    } catch {
      return DEFAULT_GENERAL;
    }
  });

  // 保存通用设置到 localStorage，并立即应用菜单密度 / 间距相关 CSS 变量
  useEffect(() => {
    localStorage.setItem(GENERAL_SETTINGS_KEY, JSON.stringify(generalSettings));
    applyMenuDensity(generalSettings.menuDensity);
    applyEditorSpacingFromSettings(generalSettings);
  }, [generalSettings]);

  // 思维导图设置状态
  const [mindmapSettings, setMindmapSettings] = useState<MindmapSettings>(() => {
    try {
      const saved = localStorage.getItem(MINDMAP_SETTINGS_KEY);
      return saved ? { ...DEFAULT_MINDMAP, ...JSON.parse(saved) } : DEFAULT_MINDMAP;
    } catch {
      return DEFAULT_MINDMAP;
    }
  });

  // 保存思维导图设置到 localStorage
  useEffect(() => {
    localStorage.setItem(MINDMAP_SETTINGS_KEY, JSON.stringify(mindmapSettings));
  }, [mindmapSettings]);

  // 关系图谱设置状态
  const [graphSettings, setGraphSettings] = useState<GraphSettings>(() => {
    try {
      const saved = localStorage.getItem(GRAPH_SETTINGS_KEY);
      return saved ? { ...DEFAULT_GRAPH, ...JSON.parse(saved) } : DEFAULT_GRAPH;
    } catch {
      return DEFAULT_GRAPH;
    }
  });

  // 保存关系图谱设置到 localStorage
  useEffect(() => {
    localStorage.setItem(GRAPH_SETTINGS_KEY, JSON.stringify(graphSettings));
  }, [graphSettings]);

  // 图像设置状态
  const [imageSettings, setImageSettings] = useState<ImageSettings>(() => loadImageSettings());

  // 保存图像设置到 localStorage
  useEffect(() => {
    saveImageSettings(imageSettings);
  }, [imageSettings]);

  // 编辑器设置状态
  const [editorSettings] = useState<EditorSettings>(() => loadEditorSettings());

  // 保存编辑器设置到 localStorage
  useEffect(() => {
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(editorSettings));
  }, [editorSettings]);

  // 白板设置状态
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>(() => loadCanvasSettings());

  // 保存白板设置到 localStorage
  useEffect(() => {
    saveCanvasSettings(canvasSettings);
  }, [canvasSettings]);

  // 终端设置状态：TerminalSettingsContent 的 onChange 已调用 setTerminalSettings
  // 触发持久化 + 跨窗口广播，此处仅维护设置窗口内的本地 state 供 UI 渲染。
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(() => loadTerminalSettings());

  const handleClose = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.close();
  }, []);

  // Ctrl+W / Ctrl+,（macOS：⌘）关闭设置窗口
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        handleClose();
        return;
      }
      const keys = getShortcutKeys(loadShortcuts(), "open-settings");
      const fallback = shortcutsConfig.app["open-settings"] ?? ["Ctrl", ","];
      if (matchShortcut(e, keys.length ? keys : fallback)) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Navigation groups with search terms
  const navGroups: NavGroup[] = [
    {
      title: t("settings.tabs.groupGeneral"),
      items: [
        {
          id: "general", label: t("settings.tabs.general"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          ), searchTerms: ["通用", "general", "外观", "字体", "编辑设置"]
        },
        {
          id: "theme", label: t("settings.tabs.theme"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
              <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" stroke="none" />
              <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
              <circle cx="6.5" cy="12" r="0.5" fill="currentColor" stroke="none" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
            </svg>
          ), searchTerms: ["主题", "theme", "颜色", "自定义主题", "代码主题"]
        },
        {
          id: "shortcuts", label: t("settings.tabs.shortcuts"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
            </svg>
          ), searchTerms: ["快捷键", "shortcuts", "键盘", "热键"]
        },
        {
          id: "image", label: t("settings.tabs.image"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          ), searchTerms: ["图像", "image", "图片", "上传", "存储"]
        },
      ]
    },
    {
      title: t("settings.tabs.groupFeatures"),
      items: [
        {
          id: "mindmap", label: t("settings.tabs.mindmap"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4a1 1 0 0 1 0 2h-2.7a7.4 7.4 0 0 0-7.2 6H20a1 1 0 0 1 0 2h-9.9a7.4 7.4 0 0 0 7.2 6H20a1 1 0 0 1 0 2h-2.7a9.4 9.4 0 0 1-9.2-8H4a1 1 0 0 1 0-2h4.1a9.4 9.4 0 0 1 9.2-8H20z" />
            </svg>
          ), searchTerms: ["思维导图", "mindmap", "脑图", "布局", "节点"]
        },
        {
          id: "graph", label: t("settings.tabs.graph"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="3" />
              <circle cx="5" cy="19" r="3" />
              <circle cx="19" cy="19" r="3" />
              <line x1="9.5" y1="7" x2="6.5" y2="16.5" />
              <line x1="14.5" y1="7" x2="17.5" y2="16.5" />
              <line x1="7.5" y1="19" x2="16.5" y2="19" />
            </svg>
          ), searchTerms: ["关系图谱", "graph", "知识图谱", "链接图"]
        },
        {
          id: "canvas", label: t("settings.tabs.canvas"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          ), searchTerms: ["白板", "canvas", "画布", "卡片"]
        },
        {
          id: "terminal", label: t("settings.tabs.terminal"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 9l3 3-3 3" />
              <line x1="13" y1="15" x2="17" y2="15" />
            </svg>
          ), searchTerms: ["终端", "terminal", "命令行", "shell", "配色", "字体"]
        },
        {
          id: "publish", label: t("settings.tabs.publish"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          ), searchTerms: ["发布", "publish", "导出", "部署", "网站"]
        },
        {
          id: "vim", label: t("settings.tabs.vim", "Vim 模式"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 4h4.5L12 13l5.5-9H22L13.5 20H10.5L2 4z"/>
            </svg>
          ), searchTerms: ["Vim", "LazyVim", "键盘", "Leader", "快捷键", "vim", "keyboard"]
        },
      ]
    },
    {
      title: t("settings.tabs.groupAbout"),
      items: [
        {
          id: "about", label: t("settings.tabs.about"), icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          ), searchTerms: ["关于", "about", "版本", "更新", "GitHub"]
        },
      ]
    }
  ];

  // Filter navigation based on search query
  const filteredGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return item.label.toLowerCase().includes(query) ||
        item.searchTerms?.some(term => term.toLowerCase().includes(query));
    })
  })).filter(group => group.items.length > 0);

  // Flatten for checking if any results
  const hasResults = filteredGroups.some(group => group.items.length > 0);

  return (
    <div className="settings-window">
      {/* 主内容 */}
      <div className="settings-body">
        {/* 左侧菜单 */}
        <nav
          className={`settings-nav${isNavResizing ? " resizing" : ""}`}
          style={{ width: navWidth }}
        >
          {/* 顶部透明拖拽区域：deep 使整条顶栏（含子节点）可拖 */}
          <div className="settings-nav-topbar" data-tauri-drag-region="deep" />
          <div className="settings-nav-content">
            {/* 搜索框 */}
            <div className="settings-nav-search">
              <svg className="settings-nav-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="settings-nav-search-input"
                placeholder={t("settings.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="settings-nav-search-clear"
                  onClick={() => setSearchQuery('')}
                  title={t("settings.searchClear")}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* 导航分组 */}
            {hasResults ? (
              filteredGroups.map((group) => (
                <div key={group.title} className="settings-nav-group">
                  <div className="settings-nav-group-title">{group.title}</div>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className={`settings-nav-item${activeTab === item.id ? " active" : ""}`}
                      onClick={() => setActiveTab(item.id)}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <div className="settings-nav-empty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                  <path d="M8 11h6" />
                </svg>
                <span>{t("settings.noResults")}</span>
              </div>
            )}
          </div>
          <div
            className="settings-nav-resize-handle"
            onMouseDown={handleNavResizeMouseDown}
          />
        </nav>

        {/* 右侧内容 */}
        <div className="settings-main-wrapper">
          {/* 内容区域顶部栏 */}
          <div className="settings-main-topbar" data-tauri-drag-region="deep">
            <div className="settings-main-topbar-drag" data-tauri-drag-region="deep" />
            <div className="settings-titlebar-controls" data-tauri-drag-region="false">
              <button
                className="settings-titlebar-btn settings-titlebar-close"
                onClick={handleClose}
                title={t("settings.close")}
              >
                <svg width="14" height="14" viewBox="0 0 10 10">
                  <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.4" />
                  <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
            </div>
          </div>
          <main className="settings-main">
            {activeTab === "general" && (
              <GeneralSettingsContent settings={generalSettings} onChange={setGeneralSettings} />
            )}
            {activeTab === "theme" && <ThemeSettingsContent />}
            {activeTab === "shortcuts" && <ShortcutsSettingsContent />}
            {activeTab === "mindmap" && (
              <MindmapSettingsContent settings={mindmapSettings} onChange={setMindmapSettings} />
            )}
            {activeTab === "graph" && (
              <GraphSettingsContent settings={graphSettings} onChange={setGraphSettings} />
            )}
            {activeTab === "image" && (
              <ImageSettingsContent settings={imageSettings} onChange={setImageSettings} />
            )}
            {activeTab === "canvas" && (
              <CanvasSettingsContent settings={canvasSettings} onChange={setCanvasSettings} />
            )}
            {activeTab === "terminal" && (
              <TerminalSettingsContent settings={terminalSettings} onChange={setTerminalSettings} />
            )}
            {activeTab === "publish" && (
              <PublishSettings />
            )}
            {activeTab === "vim" && <VimSettingsPanel />}
            {activeTab === "about" && <AboutSettingsContent />}
          </main>
        </div>
      </div>
    </div>
  );
}
