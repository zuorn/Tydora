import { useCallback, useState } from "react";
import type { ThemeSizeToken } from "./themeTokens";

interface ThemeSizeFieldProps {
  label: string;
  varName: string;
  value: string;
  meta: ThemeSizeToken;
  onChange: (value: string) => void;
}

function parseNumeric(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : NaN;
}

/** 编辑器显示值：asPercent 时为 0–100，否则为解析后的数值 */
function toDisplay(value: string, meta: ThemeSizeToken): number {
  const n = parseNumeric(value);
  if (!Number.isFinite(n)) return meta.min;
  if (meta.asPercent) {
    // 兼容已存 0–1 或误存成 0–100
    const pct = n > 1 ? n : n * 100;
    return Math.min(meta.max, Math.max(meta.min, Math.round(pct)));
  }
  return Math.min(meta.max, Math.max(meta.min, n));
}

function formatDisplay(value: string, meta: ThemeSizeToken): string {
  const display = toDisplay(value, meta);
  if (meta.asPercent) return `${display}%`;
  const unit = meta.unit === "" ? "" : (meta.unit ?? "px");
  return unit ? `${Math.round(display)}${unit}` : String(display);
}

function commitFromDisplay(raw: string, meta: ThemeSizeToken): string {
  const n = parseNumeric(raw);
  const fallback = meta.min;
  const num = Number.isFinite(n) ? n : fallback;

  if (meta.asPercent) {
    // 输入可能是 85、85%、0.85
    let pct = num;
    if (!raw.includes("%") && num > 0 && num <= 1) pct = num * 100;
    const clamped = Math.min(meta.max, Math.max(meta.min, Math.round(pct)));
    // 存 0–1，尽量保留一位小数避免浮点噪音
    const unitless = Math.round((clamped / 100) * 1000) / 1000;
    return String(unitless);
  }

  const unit = meta.unit === "" ? "" : (meta.unit ?? "px");
  const step = meta.step ?? 1;
  const rounded = step < 1 ? Math.round(num / step) * step : Math.round(num);
  const clamped = Math.min(meta.max, Math.max(meta.min, rounded));
  return unit ? `${clamped}${unit}` : String(clamped);
}

export function ThemeSizeField({ label, varName, value, meta, onChange }: ThemeSizeFieldProps) {
  const display = toDisplay(value, meta);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatDisplay(value, meta));

  const commit = useCallback(
    (nextDisplay: number) => {
      onChange(commitFromDisplay(String(nextDisplay), meta));
    },
    [meta, onChange],
  );

  return (
    <div className="theme-editor-row">
      <div className="theme-editor-label-block">
        <label className="theme-editor-label">{label}</label>
        <span className="theme-editor-var-name">{varName}</span>
      </div>
      <div className="theme-editor-control">
        <div className="theme-editor-size-group">
          <input
            type="range"
            className="settings-range"
            min={meta.min}
            max={meta.max}
            step={meta.step ?? 1}
            value={display}
            onChange={(e) => commit(Number(e.target.value))}
          />
          <input
            type="text"
            className="theme-editor-input theme-editor-size-input"
            value={editing ? draft : formatDisplay(value, meta)}
            onFocus={() => {
              setDraft(formatDisplay(value, meta));
              setEditing(true);
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              onChange(commitFromDisplay(draft, meta));
            }}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
