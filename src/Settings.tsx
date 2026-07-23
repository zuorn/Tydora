import { useState, useCallback, useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors } from "@tauri-apps/api/window";
import { clampWindowToMonitor } from "./services/windowState";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTheme, type ThemeName } from "./themes";
import { loadImageSettings, saveImageSettings, type ImageSettings, type StorageMode, type FilenameFormat } from "./services";
import { checkForUpdate, downloadAndInstall, relaunchApp, type UpdateInfo } from "./services";
import { PublishSettings } from "./publish";
import { loadCanvasSettings, saveCanvasSettings, type CanvasSettings } from "./Canvas/canvas-settings";
import { parseCssVariables, extractPreviewColors, type ThemeVariable, type ThemeManifest } from "./themes/CustomThemeManager";
import { getCustomThemeCss } from "./themes/CustomThemeManager";
import { CODE_THEMES, type CustomCodeTheme } from "./themes";
import hljs from "highlight.js";
import appIcon from "./assets/icon.png";
import "./Settings.css";

// ── Types ────────────────────────────────────────────────────────────

type SettingsTab = "general" | "theme" | "shortcuts" | "editor" | "mindmap" | "graph" | "image" | "canvas" | "publish" | "about";

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
  typewriterMode: boolean;
  // 编辑行为
  counterType: "markdown" | "text";
  // 代码高亮
  codeLineNumber: boolean;
  // 预览
  previewMaxWidth: number;
  // 数学公式
  mathEngine: "KaTeX" | "MathJax";
  // 链接行为
  linkOpenNewTab: boolean;
  // 扩展功能
  callout: boolean;
  mermaid: boolean;
  wikiLink: boolean;
  frontmatter: boolean;
  tableToolbar: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  defaultMode: "ir",
  typewriterMode: false,
  counterType: "text",
  codeLineNumber: false,
  previewMaxWidth: 800,
  mathEngine: "KaTeX",
  linkOpenNewTab: true,
  callout: true,
  mermaid: true,
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

interface GeneralSettings {
  appearance: "system" | "light" | "dark";
  fontSize: number;
  editorFont: string;
  autoSave: boolean;
}

interface ShortcutItem {
  id: string;
  label: string;
  keys: string[];
  group?: string;
}

// ── Default values ──────────────────────────────────────────────────

const DEFAULT_GENERAL: GeneralSettings = {
  appearance: "system",
  fontSize: 14,
  editorFont: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
  autoSave: true,
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

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  // 编辑器快捷键
  { id: "bold", label: "加粗", keys: ["Ctrl", "B"], group: "格式" },
  { id: "italic", label: "斜体", keys: ["Ctrl", "I"], group: "格式" },
  { id: "strike", label: "删除线", keys: ["Ctrl", "D"], group: "格式" },
  { id: "inline-code", label: "行内代码", keys: ["Ctrl", "E"], group: "格式" },
  { id: "code-block", label: "代码块", keys: ["Ctrl", "U"], group: "格式" },
  { id: "link", label: "超链接", keys: ["Ctrl", "K"], group: "格式" },
  { id: "highlight", label: "高亮", keys: ["Ctrl", "="], group: "格式" },
  { id: "quote", label: "引用", keys: ["Ctrl", ";"], group: "格式" },
  { id: "hr", label: "水平分割线", keys: ["Ctrl", "Shift", "H"], group: "格式" },

  // 列表
  { id: "unordered-list", label: "无序列表", keys: ["Ctrl", "L"], group: "列表" },
  { id: "ordered-list", label: "有序列表", keys: ["Ctrl", "O"], group: "列表" },
  { id: "check-list", label: "任务列表", keys: ["Ctrl", "J"], group: "列表" },
  { id: "indent", label: "增加缩进", keys: ["Ctrl", "Shift", "O"], group: "列表" },
  { id: "outdent", label: "减少缩进", keys: ["Ctrl", "Shift", "I"], group: "列表" },
  { id: "task-toggle", label: "切换任务状态", keys: ["Ctrl", "Shift", "J"], group: "列表" },

  // 标题
  { id: "heading-1", label: "一级标题", keys: ["Ctrl", "Alt", "1"], group: "标题" },
  { id: "heading-2", label: "二级标题", keys: ["Ctrl", "Alt", "2"], group: "标题" },
  { id: "heading-3", label: "三级标题", keys: ["Ctrl", "Alt", "3"], group: "标题" },
  { id: "heading-4", label: "四级标题", keys: ["Ctrl", "Alt", "4"], group: "标题" },
  { id: "heading-5", label: "五级标题", keys: ["Ctrl", "Alt", "5"], group: "标题" },
  { id: "heading-6", label: "六级标题", keys: ["Ctrl", "Alt", "6"], group: "标题" },
  { id: "paragraph", label: "段落", keys: ["Ctrl", "Alt", "0"], group: "标题" },

  // 插入
  { id: "table", label: "表格", keys: ["Ctrl", "T"], group: "插入" },
  { id: "insert-before", label: "在上方插入", keys: ["Ctrl", "Shift", "B"], group: "插入" },
  { id: "insert-after", label: "在下方插入", keys: ["Ctrl", "Shift", "E"], group: "插入" },

  // 表格操作
  { id: "table-row-above", label: "表格：上方插入行", keys: ["Ctrl", "Shift", "F"], group: "表格" },
  { id: "table-row-below", label: "表格：下方插入行", keys: ["Ctrl", "Shift", "."], group: "表格" },
  { id: "table-col-left", label: "表格：左侧插入列", keys: ["Ctrl", "Shift", "G"], group: "表格" },
  { id: "table-col-right", label: "表格：右侧插入列", keys: ["Ctrl", "Shift", "="], group: "表格" },
  { id: "table-row-delete", label: "表格：删除行", keys: ["Ctrl", "-"], group: "表格" },
  { id: "table-col-delete", label: "表格：删除列", keys: ["Ctrl", "Shift", "-"], group: "表格" },
  { id: "table-align-left", label: "表格：左对齐", keys: ["Ctrl", "Shift", "L"], group: "表格" },
  { id: "table-align-center", label: "表格：居中对齐", keys: ["Ctrl", "Shift", "C"], group: "表格" },
  { id: "table-align-right", label: "表格：右对齐", keys: ["Ctrl", "Shift", "R"], group: "表格" },

  // 编辑
  { id: "undo", label: "撤销", keys: ["Ctrl", "Z"], group: "编辑" },
  { id: "redo", label: "重做", keys: ["Ctrl", "Y"], group: "编辑" },
  { id: "select-all", label: "全选（代码块内）", keys: ["Ctrl", "A"], group: "编辑" },

  // 视图
  { id: "toggle-sidebar", label: "切换侧栏", keys: ["Ctrl", "\\"], group: "视图" },
  { id: "fullscreen", label: "全屏", keys: ["Ctrl", "'"], group: "视图" },
  { id: "split-view", label: "分屏预览", keys: ["Ctrl", "P"], group: "视图" },
  { id: "typewriter", label: "打字机模式", keys: ["Ctrl", "Alt", "T"], group: "视图" },
  { id: "open-mindmap", label: "打开思维导图", keys: ["Ctrl", "M"], group: "视图" },

  // 编辑模式
  { id: "mode-ir", label: "切换到即时渲染模式", keys: ["Ctrl", "Alt", "7"], group: "模式" },
  { id: "mode-sv", label: "切换到源码模式", keys: ["Ctrl", "Alt", "8"], group: "模式" },

  // 系统
  { id: "escape", label: "关闭提示", keys: ["Escape"], group: "系统" },
  { id: "quick-open", label: "快速打开文件", keys: ["Ctrl", "O"], group: "系统" },
  { id: "command-palette", label: "命令面板", keys: ["Ctrl", "P"], group: "系统" },
];

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
  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">主题模式</span>
          </div>
          <select
            className="settings-select"
            value={settings.appearance}
            onChange={(e) =>
              onChange({ ...settings, appearance: e.target.value as GeneralSettings["appearance"] })
            }
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色模式</option>
            <option value="dark">深色模式</option>
          </select>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">编辑器字体</span>
          </div>
          <select
            className="settings-select"
            value={settings.editorFont}
            onChange={(e) => onChange({ ...settings, editorFont: e.target.value })}
          >
            <option value="system-ui, -apple-system, sans-serif">系统默认</option>
            <option value="'LXGW WenKai', system-ui, sans-serif">霞鹜文楷</option>
            <option value="'Inter', system-ui, sans-serif">Inter</option>
            <option value="'Noto Sans SC', system-ui, sans-serif">Noto Sans SC</option>
            <option value="ui-sans-serif, 'Segoe UI', system-ui, sans-serif">Segoe UI</option>
            <option value="'Roboto', system-ui, sans-serif">Roboto</option>
            <option value="'Source Sans 3', system-ui, sans-serif">Source Sans</option>
          </select>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">字体大小</span>
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
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">自动保存</span>
            <span className="canvas-settings-row-desc">编辑时自动保存文件。</span>
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
  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">最大节点宽度</span>
            <span className="canvas-settings-row-desc">节点文字超过此宽度时自动换行。</span>
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
            <span className="canvas-settings-row-title">水平间距</span>
            <span className="canvas-settings-row-desc">同级节点之间的水平距离。</span>
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
            <span className="canvas-settings-row-title">垂直间距</span>
            <span className="canvas-settings-row-desc">父子节点之间的垂直距离。</span>
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
            <span className="canvas-settings-row-title">连线宽度</span>
            <span className="canvas-settings-row-desc">节点之间连线的粗细。</span>
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
            <span className="canvas-settings-row-title">初始展开层级</span>
            <span className="canvas-settings-row-desc">打开思维导图时默认展开到第几级。</span>
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
            <span className="canvas-settings-unit">{settings.initialExpandLevel === -1 ? "全部" : `第${settings.initialExpandLevel}级`}</span>
          </div>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">动画时长</span>
            <span className="canvas-settings-row-desc">展开/折叠节点的动画时间。</span>
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
            <span className="canvas-settings-row-title">颜色冻结层级</span>
            <span className="canvas-settings-row-desc">从第几级开始使用固定颜色。</span>
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
  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">在新窗口中打开</span>
            <span className="canvas-settings-row-desc">开启后，Ctrl+G 和工具栏按钮将在独立窗口中打开关系图谱。</span>
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
            <span className="canvas-settings-row-title">最大节点大小</span>
            <span className="canvas-settings-row-desc">图谱中节点的最大尺寸。</span>
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
            <span className="canvas-settings-row-title">标签字号</span>
            <span className="canvas-settings-row-desc">节点标签的文字大小。</span>
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
            <span className="canvas-settings-row-title">连线距离</span>
            <span className="canvas-settings-row-desc">节点之间的理想距离。</span>
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
            <span className="canvas-settings-row-title">斥力强度</span>
            <span className="canvas-settings-row-desc">节点之间的排斥力，负值越大间距越大。</span>
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
            <span className="canvas-settings-row-title">边线透明度</span>
            <span className="canvas-settings-row-desc">连线的可见程度。</span>
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

function ThemeSettingsContent({
  theme,
  setTheme,
}: {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}) {
  const { customThemes, importTheme, deleteTheme, updateThemeVariables, codeTheme, setCodeTheme, customCodeThemes, importCodeTheme, deleteCodeTheme } = useTheme();
  const [importing, setImporting] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemeManifest | null>(null);
  const [editVariables, setEditVariables] = useState<ThemeVariable[]>([]);
  const [editPreview, setEditPreview] = useState<{ bg: string; accent: string }>({ bg: "#ffffff", accent: "#4eb289" });
  const [deleteConfirm, setDeleteConfirm] = useState<ThemeManifest | null>(null);
  const [nameDialog, setNameDialog] = useState<{ open: boolean; filePath: string; defaultName: string }>({ open: false, filePath: "", defaultName: "" });
  const [themeName, setThemeName] = useState("");

  const [codeThemeName, setCodeThemeName] = useState("");
  const [codeThemeDialog, setCodeThemeDialog] = useState<{ open: boolean; filePath: string }>({ open: false, filePath: "" });

  const builtinThemes: { value: ThemeName; label: string }[] = [
    { value: "white", label: "白色" },
    { value: "mint", label: "Mint" },
    { value: "mint-dark", label: "Mint Dark" },
    { value: "liquid-glass", label: "Liquid Glass" },
    { value: "claude-code", label: "Claude Code" },
    { value: "purple", label: "Purple" },
    { value: "hermes", label: "Hermes" },
    { value: "next", label: "NexT" },
  ];

  const handleImport = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "CSS", extensions: ["css"] }],
        multiple: false,
        title: "选择主题文件",
      });
      if (!selected || typeof selected !== "string") return;

      // Extract filename without extension as default name
      const fileName = selected.split(/[/\\]/).pop() || "自定义主题";
      const defaultName = fileName.replace(/\.css$/i, "");

      setNameDialog({ open: true, filePath: selected, defaultName });
      setThemeName(defaultName);
    } catch (err) {
      console.error("导入主题失败:", err);
    }
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (!nameDialog.filePath) return;
    const name = themeName.trim() || nameDialog.defaultName;
    try {
      setImporting(true);
      await importTheme(nameDialog.filePath, name);
      setNameDialog({ open: false, filePath: "", defaultName: "" });
    } catch (err) {
      console.error("导入主题失败:", err);
      alert(`导入失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setImporting(false);
    }
  }, [nameDialog, themeName, importTheme]);

  const handleDelete = useCallback(async (manifest: ThemeManifest) => {
    setDeleteConfirm(manifest);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    await deleteTheme(deleteConfirm.id);
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteTheme]);

  const handleStartEdit = useCallback(async (manifest: ThemeManifest) => {
    try {
      const css = await getCustomThemeCss(manifest.id);
      const variables = parseCssVariables(css);
      const colors = extractPreviewColors(css);
      setEditVariables(variables);
      setEditPreview(colors);
      setEditingTheme(manifest);
    } catch (err) {
      console.error("加载主题失败:", err);
    }
  }, []);

  const handleVariableChange = useCallback((index: number, newValue: string) => {
    setEditVariables((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], value: newValue };
      // Update preview colors
      const bgVar = next.find((v) => v.name === "--bg-primary");
      const accentVar = next.find((v) => v.name === "--accent");
      setEditPreview({
        bg: bgVar?.value || "#ffffff",
        accent: accentVar?.value || "#4eb289",
      });
      return next;
    });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingTheme) return;
    await updateThemeVariables(editingTheme.id, editVariables);
    setEditingTheme(null);
  }, [editingTheme, editVariables, updateThemeVariables]);

  const handleCancelEdit = useCallback(() => {
    setEditingTheme(null);
  }, []);

  const handleImportCodeTheme = useCallback(async () => {
    const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
    const selected = await openDialog({
      filters: [{ name: "CSS", extensions: ["css"] }],
      multiple: false,
      title: "选择代码主题文件",
    });
    if (!selected || typeof selected !== "string") return;
    const fileName = selected.split(/[\\/]/).pop() || "自定义代码主题";
    const defaultName = fileName.replace(/\.css$/i, "");
    setCodeThemeName(defaultName);
    setCodeThemeDialog({ open: true, filePath: selected });
  }, []);

  const handleConfirmImportCodeTheme = useCallback(async () => {
    if (!codeThemeDialog.filePath) return;
    const name = codeThemeName.trim() || "自定义代码主题";
    try {
      await importCodeTheme(codeThemeDialog.filePath, name);
      setCodeThemeDialog({ open: false, filePath: "" });
    } catch (err) {
      console.error("导入代码主题失败:", err);
    }
  }, [codeThemeDialog, codeThemeName, importCodeTheme]);

  const handleDeleteCodeTheme = useCallback(async (m: CustomCodeTheme) => {
    if (confirm(`确定要删除代码主题 "${m.name}" 吗？`)) {
      await deleteCodeTheme(m.id);
    }
  }, [deleteCodeTheme]);

  // Editor view
  if (editingTheme) {
    return (
      <div className="settings-section">
        <div className="theme-editor-header">
          <button className="theme-editor-back" onClick={handleCancelEdit}>
            ← 返回
          </button>
          <h3 className="settings-section-title" style={{ marginTop: 0 }}>编辑主题: {editingTheme.name}</h3>
          <div className="theme-editor-actions">
            <button className="settings-button" onClick={handleSaveEdit}>保存</button>
            <button className="settings-button theme-editor-cancel" onClick={handleCancelEdit}>取消</button>
          </div>
        </div>
        <div className="theme-editor-preview" style={{ background: editPreview.bg, borderColor: editPreview.accent }}>
          <div className="theme-editor-preview-text" style={{ color: editPreview.bg === "#ffffff" || editPreview.bg.startsWith("oklch(1") ? "#1e293b" : "#ffffff" }}>
            预览文字
          </div>
          <div className="theme-editor-preview-accent" style={{ background: editPreview.accent }}>强调色</div>
        </div>
        <div className="theme-editor-variables">
          {editVariables.map((v, i) => (
            <div key={v.name} className="theme-editor-row">
              <label className="theme-editor-label">{v.name}</label>
              <div className="theme-editor-control">
                {v.type === "color" ? (
                  <div className="theme-editor-color-group">
                    <input
                      type="color"
                      className="theme-editor-color-picker"
                      value={normalizeColorToHex(v.value)}
                      onChange={(e) => handleVariableChange(i, e.target.value)}
                    />
                    <input
                      type="text"
                      className="theme-editor-input"
                      value={v.value}
                      onChange={(e) => handleVariableChange(i, e.target.value)}
                    />
                  </div>
                ) : v.type === "size" ? (
                  <div className="theme-editor-size-group">
                    <input
                      type="range"
                      className="settings-range"
                      min="10"
                      max="24"
                      value={parseInt(v.value) || 15}
                      onChange={(e) => handleVariableChange(i, `${e.target.value}px`)}
                    />
                    <span className="settings-range-value">{v.value}</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    className="theme-editor-input"
                    value={v.value}
                    onChange={(e) => handleVariableChange(i, e.target.value)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">内置主题</h3>
      <div className="settings-theme-grid">
        {builtinThemes.map((t) => (
          <div
            key={t.value}
            className={`settings-theme-card${theme === t.value ? " active" : ""}`}
            onClick={() => setTheme(t.value)}
          >
            <div className="settings-theme-preview" data-theme={t.value}>
              {theme === t.value && (
                <div className="settings-theme-check">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
              )}
            </div>
            <span className="settings-theme-name">{t.label}</span>
          </div>
        ))}
      </div>

      <h3 className="settings-section-title">自定义主题</h3>
      <div className="settings-theme-grid">
        {customThemes.map((m) => {
          const themeId = `custom-${m.id}`;
          const isActive = theme === themeId;
          return (
            <div
              key={m.id}
              className={`settings-theme-card custom-theme-card${isActive ? " active" : ""}`}
              onClick={() => setTheme(themeId)}
            >
              <div className="settings-theme-preview custom-theme-preview" data-custom-theme={m.id}>
                <div
                  className="custom-theme-gradient"
                  style={{
                    background: `linear-gradient(135deg, ${m.previewBg || "#ffffff"} 0%, ${m.previewAccent || "#4eb289"} 100%)`,
                  }}
                />
                {isActive && (
                  <div className="settings-theme-check">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                )}
                <div className="custom-theme-actions">
                  <button
                    className="custom-theme-edit-btn"
                    title="编辑主题"
                    onClick={(e) => { e.stopPropagation(); handleStartEdit(m); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                  <button
                    className="custom-theme-delete-btn"
                    title="删除主题"
                    onClick={(e) => { e.stopPropagation(); handleDelete(m); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              <span className="settings-theme-name">{m.name}</span>
            </div>
          );
        })}
        <div
          className="settings-theme-card settings-theme-import-card"
          onClick={handleImport}
        >
          <div className="settings-theme-preview settings-theme-import-preview">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <span className="settings-theme-name">{importing ? "导入中..." : "导入主题"}</span>
        </div>
      </div>

      {customThemes.length === 0 && (
        <p className="settings-hint" style={{ marginTop: 8 }}>
          点击上方卡片导入 .css 格式的主题文件
        </p>
      )}

      <h3 className="settings-section-title">代码主题</h3>
      <div className="settings-code-theme-row">
        <label className="settings-item-label">代码高亮主题</label>
        <select
          className="settings-select"
          value={codeTheme}
          onChange={(e) => setCodeTheme(e.target.value)}
        >
          <option value="auto">跟随应用主题</option>
          <optgroup label="浅色主题">
            {CODE_THEMES.filter((t) => !t.isDark).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
          <optgroup label="深色主题">
            {CODE_THEMES.filter((t) => t.isDark).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="settings-code-theme-preview">
        <div className="settings-code-theme-preview-title">预览</div>
        <pre className="settings-code-theme-preview-code">
          <code
            dangerouslySetInnerHTML={{
              __html: hljs.highlight(`function greet(name) {
  console.log("Hello, " + name);
  return 42;
}`, { language: "javascript" }).value,
            }}
          />
        </pre>
      </div>

      <h3 className="settings-section-title">自定义代码主题</h3>
      <div className="settings-custom-code-themes">
        {customCodeThemes.map((m) => (
          <div
            key={m.id}
            className={`settings-custom-code-theme-card${codeTheme === m.id ? " active" : ""}`}
            onClick={() => setCodeTheme(m.id)}
          >
            <span className="settings-custom-code-theme-name">{m.name}</span>
            <button
              className="settings-custom-code-theme-delete"
              title="删除"
              onClick={(e) => { e.stopPropagation(); handleDeleteCodeTheme(m); }}
            >
              ×
            </button>
          </div>
        ))}
        <div
          className="settings-custom-code-theme-card settings-custom-code-theme-add"
          onClick={handleImportCodeTheme}
        >
          + 导入代码主题
        </div>
      </div>

      {/* Name dialog */}
      {nameDialog.open && (
        <div className="theme-name-dialog-overlay" onClick={() => setNameDialog({ open: false, filePath: "", defaultName: "" })}>
          <div className="theme-name-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="theme-name-dialog-title">命名主题</h3>
            <input
              type="text"
              className="theme-name-dialog-input"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmImport(); }}
              placeholder="输入主题名称..."
              autoFocus
            />
            <div className="theme-name-dialog-actions">
              <button
                className="settings-button theme-name-dialog-cancel"
                onClick={() => setNameDialog({ open: false, filePath: "", defaultName: "" })}
              >
                取消
              </button>
              <button
                className="settings-button"
                onClick={handleConfirmImport}
                disabled={importing}
              >
                {importing ? "导入中..." : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="theme-name-dialog-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="theme-name-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="theme-name-dialog-title">删除主题</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              确定要删除主题 "{deleteConfirm.name}" 吗？此操作不可撤销。
            </p>
            <div className="theme-name-dialog-actions">
              <button className="settings-button theme-name-dialog-cancel" onClick={() => setDeleteConfirm(null)}>取消</button>
              <button className="settings-button warning" onClick={handleConfirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}

      {/* Code theme name dialog */}
      {codeThemeDialog.open && (
        <div className="theme-name-dialog-overlay" onClick={() => setCodeThemeDialog({ open: false, filePath: "" })}>
          <div className="theme-name-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="theme-name-dialog-title">命名代码主题</h3>
            <input
              type="text"
              className="theme-name-dialog-input"
              value={codeThemeName}
              onChange={(e) => setCodeThemeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmImportCodeTheme(); }}
              placeholder="输入代码主题名称..."
              autoFocus
            />
            <div className="theme-name-dialog-actions">
              <button className="settings-button theme-name-dialog-cancel" onClick={() => setCodeThemeDialog({ open: false, filePath: "" })}>取消</button>
              <button className="settings-button" onClick={handleConfirmImportCodeTheme}>确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeColorToHex(value: string): string {
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    // Ensure 6-digit hex for color input
    let hex = value.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length === 8) hex = hex.slice(0, 6); // Remove alpha
    return `#${hex}`;
  }
  // For non-hex values, return white as fallback for color picker
  return "#ffffff";
}

function ShortcutsSettingsContent() {
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
    } catch {}
    return DEFAULT_SHORTCUTS;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKeys, setEditingKeys] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
  }, [shortcuts]);

  const filteredShortcuts = shortcuts.filter((s) => {
    const query = search.toLowerCase();
    if (!query) return true;
    if (s.label.toLowerCase().includes(query)) return true;
    const keysStr = s.keys.join("+").toLowerCase();
    return keysStr.includes(query);
  });

  // 按分组整理快捷键
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
    if (confirm("确定要重置所有快捷键为默认值吗？")) {
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
            placeholder={recordingSearch ? "请按下快捷键..." : "搜索快捷键..."}
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
            title={recordingSearch ? "取消录制" : "按键录制搜索"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
            </svg>
          </button>
        </div>
        <button className="settings-reset-all-btn" onClick={resetAll}>
          重置所有
        </button>
      </div>
      <div className="settings-shortcuts-list">
        {Object.entries(groupedShortcuts).map(([group, items]) => (
          <div key={group} className="settings-shortcut-group">
            <h4 className="settings-shortcut-group-title">{group}</h4>
            {items.map((shortcut) => (
              <div key={shortcut.id} className="settings-shortcut-item">
                <span className="settings-shortcut-label">{shortcut.label}</span>
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
                              <kbd className="settings-kbd">{key}</kbd>
                              {j < editingKeys.length - 1 && <span className="settings-kbd-sep">+</span>}
                            </span>
                          ))
                        ) : (
                          <span className="settings-shortcut-hint">按下快捷键...</span>
                        )}
                        <button className="settings-shortcut-save" onClick={(e) => { e.stopPropagation(); saveShortcut(); }}>
                          ✓
                        </button>
                        <button className="settings-shortcut-cancel" onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditingKeys([]); }}>
                          ✕
                        </button>
                      </>
                    ) : (
                      shortcut.keys.map((key, j) => (
                        <span key={j}>
                          <kbd className="settings-kbd">{key}</kbd>
                          {j < shortcut.keys.length - 1 && <span className="settings-kbd-sep">+</span>}
                        </span>
                      ))
                    )}
                  </div>
                  {editingId !== shortcut.id && (
                    <button
                      className="settings-shortcut-reset"
                      onClick={() => resetShortcut(shortcut.id)}
                      title="重置为默认"
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
            <span className="canvas-settings-row-title">图片存储位置</span>
            <span className="canvas-settings-row-desc">选择图片的存储方式。</span>
          </div>
          <select
            className="settings-select"
            value={settings.storageMode}
            onChange={(e) => onChange({ ...settings, storageMode: e.target.value as StorageMode })}
          >
            <option value="vault-assets">仓库 assets 目录</option>
            <option value="fixed-directory">固定本地目录</option>
            <option value="image-bed">图床上传（后续支持）</option>
          </select>
        </div>
      </div>

      {settings.storageMode === "vault-assets" && (
        <div className="canvas-settings-card">
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">文件命名格式</span>
              <span className="canvas-settings-row-desc">粘贴图片时的文件命名方式。</span>
            </div>
            <select
              className="settings-select"
              value={settings.local.filenameFormat}
              onChange={(e) => onChange({
                ...settings,
                local: { ...settings.local, filenameFormat: e.target.value as FilenameFormat },
              })}
            >
              <option value="original">原始名称</option>
              <option value="timestamp">时间戳</option>
              <option value="both">原始名称 + 时间戳</option>
            </select>
          </div>
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">自动创建 assets 目录</span>
              <span className="canvas-settings-row-desc">如果 assets 目录不存在则自动创建。</span>
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
              <span className="canvas-settings-row-title">存储路径</span>
              <span className="canvas-settings-row-desc">选择本地目录存储图片。</span>
            </div>
            <div className="canvas-settings-row-control">
              <input
                type="text"
                className="settings-input"
                value={settings.fixedDirectory.path}
                placeholder="选择目录..."
                readOnly
                style={{ maxWidth: 200 }}
              />
              <button className="settings-button" onClick={handleSelectDirectory}>
                选择
              </button>
            </div>
          </div>
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">文件命名格式</span>
            </div>
            <select
              className="settings-select"
              value={settings.local.filenameFormat}
              onChange={(e) => onChange({
                ...settings,
                local: { ...settings.local, filenameFormat: e.target.value as FilenameFormat },
              })}
            >
              <option value="original">原始名称</option>
              <option value="timestamp">时间戳</option>
              <option value="both">原始名称 + 时间戳</option>
            </select>
          </div>
        </div>
      )}

      {settings.storageMode === "image-bed" && (
        <div className="canvas-settings-card">
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">图床功能</span>
              <span className="canvas-settings-row-desc">图床上传功能将在后续版本中支持，敬请期待。</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditorSettingsContent({
  settings,
  onChange,
}: {
  settings: EditorSettings;
  onChange: (s: EditorSettings) => void;
}) {
  const update = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="canvas-settings-page">
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">默认编辑模式</span>
            <span className="canvas-settings-row-desc">新建文件时使用的编辑模式。</span>
          </div>
          <select
            className="settings-select"
            value={settings.defaultMode}
            onChange={(e) => update("defaultMode", e.target.value as EditorSettings["defaultMode"])}
          >
            <option value="ir">即时渲染</option>
            <option value="sv">源码</option>
          </select>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">打字机模式</span>
            <span className="canvas-settings-row-desc">始终将光标所在行保持在视口中央。</span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.typewriterMode}
              onChange={(e) => update("typewriterMode", e.target.checked)}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">字数统计类型</span>
          </div>
          <select
            className="settings-select"
            value={settings.counterType}
            onChange={(e) => update("counterType", e.target.value as EditorSettings["counterType"])}
          >
            <option value="markdown">Markdown（含语法符号）</option>
            <option value="text">纯文本（仅文字）</option>
          </select>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">代码行号</span>
            <span className="canvas-settings-row-desc">在代码块左侧显示行号。</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.codeLineNumber} onChange={(e) => update("codeLineNumber", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">预览区域最大宽度</span>
            <span className="canvas-settings-row-desc">编辑器内容区域的最大宽度。</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min={600}
              max={1200}
              step={20}
              value={settings.previewMaxWidth}
              onChange={(e) => update("previewMaxWidth", Number(e.target.value))}
            />
            <span className="canvas-settings-unit">{settings.previewMaxWidth}px</span>
          </div>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">渲染引擎</span>
            <span className="canvas-settings-row-desc">数学公式的渲染引擎选择。</span>
          </div>
          <select
            className="settings-select"
            value={settings.mathEngine}
            onChange={(e) => update("mathEngine", e.target.value as EditorSettings["mathEngine"])}
          >
            <option value="KaTeX">KaTeX（更快）</option>
            <option value="MathJax">MathJax（更全）</option>
          </select>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">新窗口打开链接</span>
            <span className="canvas-settings-row-desc">点击链接时在新窗口中打开。</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.linkOpenNewTab} onChange={(e) => update("linkOpenNewTab", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>

      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">Callout 提示块</span>
            <span className="canvas-settings-row-desc">{'> [!NOTE]'}</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.callout} onChange={(e) => update("callout", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">Mermaid 图表</span>
            <span className="canvas-settings-row-desc">flowchart / sequence / ...</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.mermaid} onChange={(e) => update("mermaid", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">WikiLink 双向链接</span>
            <span className="canvas-settings-row-desc">[[note]]</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.wikiLink} onChange={(e) => update("wikiLink", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">YAML Frontmatter</span>
            <span className="canvas-settings-row-desc">--- 元数据 ---</span>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.frontmatter} onChange={(e) => update("frontmatter", e.target.checked)} />
            <span className="settings-switch-slider" />
          </label>
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">表格浮动工具栏</span>
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
            <span className="canvas-settings-row-desc">扩展功能设置修改后需重新打开文件才会完全生效。</span>
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
  const handleChange = (key: keyof CanvasSettings, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="canvas-settings-page">
      {/* Storage Location */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">新建白板文件的默认位置</span>
          </div>
          <select
            className="settings-select"
            value={settings.storageLocation}
            onChange={(e) => handleChange('storageLocation', e.target.value)}
          >
            <option value="vault-root">仓库的根目录</option>
            <option value="current-folder">当前文件所在的文件夹</option>
            <option value="custom-folder">指定附件文件夹</option>
          </select>
        </div>
        {settings.storageLocation === 'custom-folder' && (
          <div className="canvas-settings-row canvas-settings-row-nested">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-title">附件文件夹路径</span>
              <span className="canvas-settings-row-desc">相对于仓库根目录</span>
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
            <span className="canvas-settings-row-title">对齐网格</span>
            <span className="canvas-settings-row-desc">移动和缩放卡片时对齐背景网格。</span>
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
              <span className="canvas-settings-row-title">网格大小</span>
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
            <span className="canvas-settings-row-title">对齐物体</span>
            <span className="canvas-settings-row-desc">移动和缩放卡片时对齐邻近物体。</span>
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
            <span className="canvas-settings-row-title">隐藏卡片内容的缩放阈值</span>
            <span className="canvas-settings-row-desc">较小的数值会提升性能但在缩放时会更快隐藏卡片内容。</span>
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
            <span className="canvas-settings-row-title">启用小地图</span>
            <span className="canvas-settings-row-desc">在白板角落显示小地图导航。</span>
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
              <span className="canvas-settings-row-title">小地图位置</span>
            </div>
            <select
              className="settings-select"
              value={settings.minimapPosition}
              onChange={(e) => handleChange('minimapPosition', e.target.value)}
            >
              <option value="top-left">左上角</option>
              <option value="bottom-left">左下角</option>
              <option value="bottom-right">右下角</option>
            </select>
          </div>
        )}
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">最小缩放</span>
            <span className="canvas-settings-row-desc">允许的最小缩放比例。</span>
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
            <span className="canvas-settings-row-title">最大缩放</span>
            <span className="canvas-settings-row-desc">允许的最大缩放比例。</span>
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
            <span className="canvas-settings-row-title">文本卡片</span>
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
            <span className="canvas-settings-row-title">笔记卡片</span>
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
            <span className="canvas-settings-row-title">多媒体卡片</span>
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
  const [version, setVersion] = useState<string>("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ available: boolean; info?: UpdateInfo } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });

  useEffect(() => {
    invoke<string>("get_app_version").then(setVersion).catch(() => setVersion(""));
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
    setDownloading(true);
    setDownloadProgress({ downloaded: 0, total: null });
    try {
      await downloadAndInstall((downloaded, total) => {
        setDownloadProgress({ downloaded, total });
      });
      await relaunchApp();
    } catch (e) {
      console.error("更新失败:", e);
      setDownloading(false);
    }
  }, [updateResult]);

  return (
    <div className="settings-section">
      <div className="settings-about-header">
        <img src={appIcon} alt="Tydora" className="settings-about-icon" />
        <h2 className="settings-about-title">Tydora</h2>
        <p className="settings-about-subtitle">一个现代化的 Markdown 编辑器</p>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">版本信息</label>
        <span className="settings-about-value">{version || "加载中..."}</span>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">检查更新</label>
        {downloading ? (
          <span className="settings-about-value">
            下载中...{downloadProgress.total ? ` ${Math.round(downloadProgress.downloaded / downloadProgress.total * 100)}%` : ""}
          </span>
        ) : updateResult?.available && updateResult.info ? (
          <button className="settings-button" onClick={handleDownload}>
            更新到 v{updateResult.info.version}
          </button>
        ) : (
          <button
            className="settings-button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
          >
            {checkingUpdate ? "检查中..." : updateResult && !updateResult.available ? "已是最新版本" : "检查更新"}
          </button>
        )}
      </div>

      <div className="settings-item">
        <label className="settings-item-label">GitHub</label>
        <a
          href="https://github.com/zuorn/Tydora"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-link"
        >
          访问 GitHub 仓库
        </a>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">问题反馈</label>
        <a
          href="https://github.com/zuorn/Tydora/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-link"
        >
          Report an Issue
        </a>
      </div>
    </div>
  );
}

// ── Main Settings Component ─────────────────────────────────────────

const SETTINGS_WINDOW_STATE_KEY = "zmd-settings-window-state";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    try {
      const saved = localStorage.getItem("zmd-settings-initial-tab") as SettingsTab | null;
      if (saved && ["general", "theme", "shortcuts", "editor", "mindmap", "graph", "image", "canvas", "publish", "about"].includes(saved)) {
        localStorage.removeItem("zmd-settings-initial-tab");
        return saved;
      }
    } catch {}
    return "general";
  });
  const { theme, setTheme } = useTheme();

  // ── 窗口位置/大小记忆 ──
  const saveWindowStateRef = useRef<() => Promise<void>>(async () => {});
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
      } catch {}
    };
    saveWindowStateRef.current = saveWindowState;

    (async () => {
      try {
        const saved = localStorage.getItem(SETTINGS_WINDOW_STATE_KEY);
        if (!saved) return;
        const state = JSON.parse(saved) as {
          x: number; y: number; width: number; height: number; maximized: boolean;
        };

        const monitors = await availableMonitors();
        if (monitors && monitors.length > 0 && state.width && state.height) {
          const clamped = clampWindowToMonitor(
            { x: state.x ?? 0, y: state.y ?? 0, width: state.width, height: state.height },
            monitors
          );
          await win.setSize(new LogicalSize(clamped.width, clamped.height));
          await win.setPosition(new LogicalPosition(clamped.x, clamped.y));
        }
        if (state.maximized) {
          await win.maximize();
        }
      } catch {}
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
      unlistenMove.then((fn) => fn()).catch(() => {});
      unlistenResize.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // 通用设置状态
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(() => {
    try {
      const saved = localStorage.getItem(GENERAL_SETTINGS_KEY);
      return saved ? { ...DEFAULT_GENERAL, ...JSON.parse(saved) } : DEFAULT_GENERAL;
    } catch {
      return DEFAULT_GENERAL;
    }
  });

  // 保存通用设置到 localStorage
  useEffect(() => {
    localStorage.setItem(GENERAL_SETTINGS_KEY, JSON.stringify(generalSettings));
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
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => loadEditorSettings());

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

  const handleClose = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.close();
  }, []);

  // Ctrl+W 关闭设置窗口
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const handleMinimize = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.minimize();
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    const isMax = await win.isMaximized();
    if (isMax) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }, []);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Navigation groups with search terms
  const navGroups: NavGroup[] = [
    {
      title: "通用",
      items: [
        { id: "general", label: "通用", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ), searchTerms: ["通用", "general", "外观", "字体", "编辑设置"] },
        { id: "theme", label: "主题", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
            <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" stroke="none" />
            <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
            <circle cx="6.5" cy="12" r="0.5" fill="currentColor" stroke="none" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          </svg>
        ), searchTerms: ["主题", "theme", "颜色", "自定义主题", "代码主题"] },
        { id: "shortcuts", label: "快捷键", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
          </svg>
        ), searchTerms: ["快捷键", "shortcuts", "键盘", "热键"] },
        { id: "image", label: "图像", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        ), searchTerms: ["图像", "image", "图片", "上传", "存储"] },
      ]
    },
    {
      title: "功能",
      items: [
        { id: "editor", label: "编辑器", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        ), searchTerms: ["编辑器", "editor", "编辑模式", "Markdown", "渲染", "代码高亮", "预览", "数学公式", "链接"] },
        { id: "mindmap", label: "思维导图", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 4a1 1 0 0 1 0 2h-2.7a7.4 7.4 0 0 0-7.2 6H20a1 1 0 0 1 0 2h-9.9a7.4 7.4 0 0 0 7.2 6H20a1 1 0 0 1 0 2h-2.7a9.4 9.4 0 0 1-9.2-8H4a1 1 0 0 1 0-2h4.1a9.4 9.4 0 0 1 9.2-8H20z" />
          </svg>
        ), searchTerms: ["思维导图", "mindmap", "脑图", "布局", "节点"] },
        { id: "graph", label: "关系图谱", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="3" />
            <circle cx="5" cy="19" r="3" />
            <circle cx="19" cy="19" r="3" />
            <line x1="9.5" y1="7" x2="6.5" y2="16.5" />
            <line x1="14.5" y1="7" x2="17.5" y2="16.5" />
            <line x1="7.5" y1="19" x2="16.5" y2="19" />
          </svg>
        ), searchTerms: ["关系图谱", "graph", "知识图谱", "链接图"] },
        { id: "canvas", label: "白板", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
        ), searchTerms: ["白板", "canvas", "画布", "卡片"] },
        { id: "publish", label: "发布", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        ), searchTerms: ["发布", "publish", "导出", "部署", "网站"] },
      ]
    },
    {
      title: "关于",
      items: [
        { id: "about", label: "关于", icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        ), searchTerms: ["关于", "about", "版本", "更新", "GitHub"] },
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
        <nav className="settings-nav">
          {/* 顶部透明拖拽区域 */}
          <div className="settings-nav-topbar" data-tauri-drag-region />
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
                placeholder="搜索设置..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="settings-nav-search-clear"
                  onClick={() => setSearchQuery('')}
                  title="清除搜索"
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
                <span>未找到匹配的设置</span>
              </div>
            )}
          </div>
        </nav>

        {/* 右侧内容 */}
        <div className="settings-main-wrapper">
          {/* 内容区域顶部栏 */}
          <div className="settings-main-topbar" data-tauri-drag-region>
            <div className="settings-titlebar-controls">
              <button
                className="settings-titlebar-btn"
                onClick={handleMinimize}
                title="最小化"
              >
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button
                className="settings-titlebar-btn"
                onClick={handleToggleMaximize}
                title="最大化"
              >
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <rect x="1" y="1" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button
                className="settings-titlebar-btn settings-titlebar-close"
                onClick={handleClose}
                title="关闭"
              >
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            </div>
          </div>
          <main className="settings-main">
          {activeTab === "general" && (
            <GeneralSettingsContent settings={generalSettings} onChange={setGeneralSettings} />
          )}
          {activeTab === "theme" && (
            <ThemeSettingsContent theme={theme} setTheme={setTheme} />
          )}
          {activeTab === "shortcuts" && <ShortcutsSettingsContent />}
          {activeTab === "editor" && (
            <EditorSettingsContent settings={editorSettings} onChange={setEditorSettings} />
          )}
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
          {activeTab === "publish" && (
            <PublishSettings />
          )}
          {activeTab === "about" && <AboutSettingsContent />}
        </main>
        </div>
      </div>
    </div>
  );
}
