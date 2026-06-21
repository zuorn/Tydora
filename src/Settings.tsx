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
}

// ── Default values ──────────────────────────────────────────────────

const DEFAULT_GENERAL: GeneralSettings = {
  appearance: "system",
  fontSize: 14,
  autoSave: true,
};

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: "save", label: "保存文件", keys: ["Ctrl", "S"] },
  { id: "new", label: "新建文件", keys: ["Ctrl", "N"] },
  { id: "open", label: "打开文件", keys: ["Ctrl", "O"] },
  { id: "close", label: "关闭标签", keys: ["Ctrl", "W"] },
  { id: "sidebar", label: "切换侧栏", keys: ["Ctrl", "B"] },
  { id: "fullscreen", label: "全屏编辑", keys: ["F11"] },
  { id: "find", label: "查找", keys: ["Ctrl", "F"] },
  { id: "replace", label: "替换", keys: ["Ctrl", "H"] },
  { id: "undo", label: "撤销", keys: ["Ctrl", "Z"] },
  { id: "redo", label: "重做", keys: ["Ctrl", "Y"] },
  { id: "cut", label: "剪切", keys: ["Ctrl", "X"] },
  { id: "copy", label: "复制", keys: ["Ctrl", "C"] },
  { id: "paste", label: "粘贴", keys: ["Ctrl", "V"] },
  { id: "delete", label: "删除", keys: ["Delete"] },
  { id: "bold", label: "加粗", keys: ["Ctrl", "B"] },
  { id: "italic", label: "斜体", keys: ["Ctrl", "I"] },
  { id: "inline-code", label: "行内代码", keys: ["Ctrl", "E"] },
  { id: "link", label: "插入链接", keys: ["Ctrl", "K"] },
  { id: "quote", label: "引用", keys: ["Ctrl", "Q"] },
  { id: "ordered-list", label: "有序列表", keys: ["Ctrl", "Shift", "O"] },
  { id: "unordered-list", label: "无序列表", keys: ["Ctrl", "Shift", "U"] },
  { id: "check-list", label: "任务列表", keys: ["Ctrl", "Shift", "C"] },
  { id: "heading-1", label: "一级标题", keys: ["Ctrl", "1"] },
  { id: "heading-2", label: "二级标题", keys: ["Ctrl", "2"] },
  { id: "heading-3", label: "三级标题", keys: ["Ctrl", "3"] },
  { id: "heading-4", label: "四级标题", keys: ["Ctrl", "4"] },
  { id: "heading-5", label: "五级标题", keys: ["Ctrl", "5"] },
  { id: "heading-6", label: "六级标题", keys: ["Ctrl", "6"] },
  { id: "paragraph", label: "段落", keys: ["Ctrl", "0"] },
  { id: "image", label: "插入图像", keys: ["Ctrl", "Shift", "I"] },
  { id: "footnote", label: "插入脚注", keys: ["Ctrl", "Shift", "F"] },
  { id: "link-ref", label: "插入链接引用", keys: ["Ctrl", "Shift", "R"] },
  { id: "hr", label: "插入水平分割线", keys: ["Ctrl", "-"] },
  { id: "table", label: "插入表格", keys: ["Ctrl", "Shift", "T"] },
  { id: "code-block", label: "插入代码块", keys: ["Ctrl", "`"] },
  { id: "math", label: "插入公式块", keys: ["Ctrl", "Shift", "M"] },
  { id: "toc", label: "插入内容目录", keys: ["Ctrl", "Shift", "L"] },
];

// ── Storage keys ────────────────────────────────────────────────────

const GENERAL_SETTINGS_KEY = "zmd-general-settings";
const SHORTCUTS_KEY = "zmd-shortcuts";

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
        {filteredShortcuts.map((shortcut) => (
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
