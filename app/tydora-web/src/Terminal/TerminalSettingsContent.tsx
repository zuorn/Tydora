/**
 * 终端设置页 UI（设置窗口内）。
 *
 * 视觉风格与主题设置保持一致：
 * - 配色方案：卡片式选择（复用 .settings-theme-* 卡片样式），卡片内是迷你终端配色预览，点击即选中。
 * - 字体：参考 Windows Terminal 的"字体"输入框 —— 可直接键入字体族名称，datalist 提供预设联想。
 * - 字号：滑块（终端内也可 Ctrl+滚轮 快速缩放）。
 *
 * 所有配置项通过 terminal-settings 的全局 store 读写：调用 setTerminalSettings
 * 会持久化 + 广播给本窗口及主窗口已挂载的终端（跨窗口热更新）。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  setTerminalSettings,
  TERMINAL_COLOR_SCHEMES,
  TERMINAL_FONT_PRESETS,
  TERMINAL_MIN_FONT_SIZE,
  TERMINAL_MAX_FONT_SIZE,
  type TerminalSettings,
} from "./terminal-settings";

interface Props {
  settings: TerminalSettings;
  onChange: (s: TerminalSettings) => void;
}

export function TerminalSettingsContent({ settings, onChange }: Props) {
  const { t } = useTranslation();
  // 字体输入框的本地草稿：避免每次按键都触发全局广播/终端重排；失焦或回车才提交。
  const [fontInput, setFontInput] = useState<string>(settings.fontFamily);

  // 外部（跨窗口同步 / 其他途径）修改字体时，回填到输入框。
  useEffect(() => {
    setFontInput(settings.fontFamily);
  }, [settings.fontFamily]);

  /** 统一更新：合并新值 → 调用方 state + 全局 store（触发持久化与跨窗口广播）。 */
  const update = (patch: Partial<TerminalSettings>) => {
    const next = { ...settings, ...patch };
    onChange(next);
    setTerminalSettings(next);
  };

  /** 提交字体输入：非空且与当前值不同才更新。 */
  const commitFont = () => {
    const trimmed = fontInput.trim();
    if (!trimmed || trimmed === settings.fontFamily) return;
    update({ fontFamily: trimmed });
  };

  return (
    <div className="canvas-settings-page">
      {/* 配色方案：卡片式选择（仿主题设置） */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.terminal.colorScheme")}</span>
            <span className="canvas-settings-row-desc">{t("settings.terminal.colorSchemeDesc")}</span>
          </div>
        </div>
        <div className="settings-theme-grid">
          {TERMINAL_COLOR_SCHEMES.map((scheme) => {
            const active = settings.colorScheme === scheme.id;
            const { preview } = scheme;
            return (
              <div
                key={scheme.id}
                className={`settings-theme-card${active ? " active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => update({ colorScheme: scheme.id })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    update({ colorScheme: scheme.id });
                  }
                }}
              >
                <div
                  className="settings-theme-preview terminal-scheme-preview"
                  style={{ background: preview.bg }}
                >
                  <div className="terminal-scheme-mock" aria-hidden>
                    <span className="terminal-scheme-line" style={{ background: preview.fg, width: "74%" }} />
                    <span className="terminal-scheme-line" style={{ background: preview.green, width: "52%" }} />
                    <span className="terminal-scheme-line" style={{ background: preview.red, width: "62%" }} />
                    <span className="terminal-scheme-line" style={{ background: preview.blue, width: "40%" }} />
                  </div>
                  {active && (
                    <div className="settings-theme-check">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className="settings-theme-name">{t(scheme.nameKey, scheme.id)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 字体：参考 Windows Terminal，可直接输入字体族名称（datalist 提供预设联想） */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.terminal.fontFamily")}</span>
            <span className="canvas-settings-row-desc">{t("settings.terminal.fontFamilyDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="text"
              className="settings-input terminal-font-input"
              list="terminal-font-preset-list"
              placeholder={t("settings.terminal.fontCustomPlaceholder")}
              value={fontInput}
              onChange={(e) => setFontInput(e.target.value)}
              onBlur={commitFont}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitFont();
              }}
            />
            <datalist id="terminal-font-preset-list">
              {TERMINAL_FONT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {t(preset.nameKey, preset.value)}
                </option>
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {/* 字号 */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">{t("settings.terminal.fontSize")}</span>
            <span className="canvas-settings-row-desc">{t("settings.terminal.fontSizeDesc")}</span>
          </div>
          <div className="canvas-settings-row-control">
            <input
              type="range"
              className="canvas-settings-slider"
              min={TERMINAL_MIN_FONT_SIZE}
              max={TERMINAL_MAX_FONT_SIZE}
              step={1}
              value={settings.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
            />
            <span className="canvas-settings-unit">{settings.fontSize}px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
