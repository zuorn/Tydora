import { useState, useCallback, useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { useTheme, type ThemeName } from "./themes";
import "./Settings.css";

// ── Types ────────────────────────────────────────────────────────────

type SettingsTab = "general" | "theme" | "shortcuts" | "about";

interface GeneralSettings {
  appearance: "system" | "light" | "dark";
  fontSize: number;
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
  autoSave: true,
};

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  // Vditor 编辑器快捷键
  { id: "bold", label: "加粗", keys: ["Ctrl", "B"], group: "格式" },
  { id: "italic", label: "斜体", keys: ["Ctrl", "I"], group: "格式" },
  { id: "strike", label: "删除线", keys: ["Ctrl", "D"], group: "格式" },
  { id: "inline-code", label: "行内代码", keys: ["Ctrl", "G"], group: "格式" },
  { id: "code-block", label: "代码块", keys: ["Ctrl", "U"], group: "格式" },
  { id: "link", label: "超链接", keys: ["Ctrl", "K"], group: "格式" },
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
  { id: "table", label: "表格", keys: ["Ctrl", "M"], group: "插入" },
  { id: "insert-before", label: "在上方插入", keys: ["Ctrl", "Shift", "B"], group: "插入" },
  { id: "insert-after", label: "在下方插入", keys: ["Ctrl", "Shift", "E"], group: "插入" },

  // 表格操作
  { id: "table-row-above", label: "表格：上方插入行", keys: ["Ctrl", "Shift", "F"], group: "表格" },
  { id: "table-row-below", label: "表格：下方插入行", keys: ["Ctrl", "="], group: "表格" },
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
  { id: "fullscreen", label: "全屏", keys: ["Ctrl", "'"], group: "视图" },
  { id: "split-view", label: "分屏预览", keys: ["Ctrl", "P"], group: "视图" },

  // 编辑模式
  { id: "mode-wysiwyg", label: "切换到所见即所得模式", keys: ["Ctrl", "Alt", "7"], group: "模式" },
  { id: "mode-ir", label: "切换到即时渲染模式", keys: ["Ctrl", "Alt", "8"], group: "模式" },
  { id: "mode-sv", label: "切换到分屏预览模式", keys: ["Ctrl", "Alt", "9"], group: "模式" },

  // 系统
  { id: "escape", label: "关闭提示", keys: ["Escape"], group: "系统" },
  { id: "quick-open", label: "快速打开文件", keys: ["Ctrl", "O"], group: "系统" },
  { id: "command-palette", label: "命令面板", keys: ["Ctrl", "P"], group: "系统" },
];

// ── Storage keys ────────────────────────────────────────────────────

const GENERAL_SETTINGS_KEY = "zmd-general-settings";
export const SHORTCUTS_KEY = "zmd-shortcuts";

export { DEFAULT_SHORTCUTS };

// ── Components ──────────────────────────────────────────────────────

function GeneralSettingsContent({
  settings,
  onChange,
}: {
  settings: GeneralSettings;
  onChange: (s: GeneralSettings) => void;
}) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">外观</h3>
      <div className="settings-item">
        <label className="settings-item-label">主题模式</label>
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

      <h3 className="settings-section-title">字体</h3>
      <div className="settings-item">
        <label className="settings-item-label">字体大小</label>
        <div className="settings-range-wrapper">
          <input
            type="range"
            className="settings-range"
            min="10"
            max="24"
            value={settings.fontSize}
            onChange={(e) => onChange({ ...settings, fontSize: Number(e.target.value) })}
          />
          <span className="settings-range-value">{settings.fontSize}px</span>
        </div>
      </div>

      <h3 className="settings-section-title">编辑设置</h3>
      <div className="settings-item">
        <label className="settings-item-label">自动保存</label>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.autoSave}
            onChange={(e) => onChange({ ...settings, autoSave: e.target.checked })}
          />
          <span className="settings-toggle-slider" />
        </label>
      </div>
    </div>
  );
}

function ThemeSettingsContent({ theme, setTheme }: { theme: ThemeName; setTheme: (t: ThemeName) => void }) {
  const themes: { value: ThemeName; label: string }[] = [
    { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
    { value: "white", label: "白色" },
    { value: "mint", label: "Mint" },
    { value: "mint-dark", label: "Mint Dark" },
  ];

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">主题列表</h3>
      <div className="settings-theme-grid">
        {themes.map((t) => (
          <div
            key={t.value}
            className={`settings-theme-card${theme === t.value ? " active" : ""}`}
            onClick={() => setTheme(t.value)}
          >
            <div className="settings-theme-preview" data-theme={t.value} />
            <span className="settings-theme-name">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShortcutsSettingsContent() {
  const [search, setSearch] = useState("");
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

  const filteredShortcuts = shortcuts.filter((s) =>
    s.label.toLowerCase().includes(search.toLowerCase())
  );

  // 按分组整理快捷键
  const groupedShortcuts = filteredShortcuts.reduce<Record<string, ShortcutItem[]>>((acc, shortcut) => {
    const group = shortcut.group || "其他";
    if (!acc[group]) acc[group] = [];
    acc[group].push(shortcut);
    return acc;
  }, {});

  const handleKeyDown = (e: KeyboardEvent) => {
    if (editingId === null) return;
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
      setEditingId(null);
      setEditingKeys([]);
      return;
    }

    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

    const newKeys: string[] = [];
    if (e.ctrlKey || e.metaKey) newKeys.push("Ctrl");
    if (e.shiftKey) newKeys.push("Shift");
    if (e.altKey) newKeys.push("Alt");
    newKeys.push(key);

    setEditingKeys(newKeys);
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingId]);

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
        <input
          type="text"
          className="settings-search"
          placeholder="搜索快捷键..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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

function AboutSettingsContent() {
  const [version, setVersion] = useState<string>("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // 获取版本号
  useEffect(() => {
    invoke<string>("get_app_version").then(setVersion).catch(() => setVersion("0.1.0"));
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    // 模拟检查更新
    await new Promise((r) => setTimeout(r, 1000));
    alert("当前已是最新版本");
    setCheckingUpdate(false);
  }, []);

  return (
    <div className="settings-section">
      <div className="settings-about-header">
        <h2 className="settings-about-title">Tydora</h2>
        <p className="settings-about-subtitle">一个现代化的 Markdown 编辑器</p>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">版本信息</label>
        <span className="settings-about-value">{version || "加载中..."}</span>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">检查更新</label>
        <button
          className="settings-button"
          onClick={handleCheckUpdate}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? "检查中..." : "检查更新"}
        </button>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">GitHub</label>
        <a
          href="https://github.com/your-repo/tydora"
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
          href="https://github.com/your-repo/tydora/issues"
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

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { theme, setTheme } = useTheme();

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

  const handleClose = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.close();
  }, []);

  const handleMinimize = useCallback(async () => {
    const win = getCurrentWebviewWindow();
    await win.minimize();
  }, []);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "通用" },
    { id: "theme", label: "主题" },
    { id: "shortcuts", label: "快捷键" },
    { id: "about", label: "关于" },
  ];

  return (
    <div className="settings-window">
      {/* 标题栏 */}
      <div className="settings-titlebar" data-tauri-drag-region>
        <span className="settings-title">设置</span>
        <div className="settings-titlebar-controls">
          <button
            className="settings-titlebar-btn"
            onClick={handleMinimize}
            title="最小化"
          >
            ─
          </button>
          <button
            className="settings-titlebar-btn settings-titlebar-close"
            onClick={handleClose}
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 主内容 */}
      <div className="settings-body">
        {/* 左侧菜单 */}
        <nav className="settings-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`settings-nav-item${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* 右侧内容 */}
        <main className="settings-main">
          {activeTab === "general" && (
            <GeneralSettingsContent settings={generalSettings} onChange={setGeneralSettings} />
          )}
          {activeTab === "theme" && (
            <ThemeSettingsContent theme={theme} setTheme={setTheme} />
          )}
          {activeTab === "shortcuts" && <ShortcutsSettingsContent />}
          {activeTab === "about" && <AboutSettingsContent />}
        </main>
      </div>
    </div>
  );
}
