import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./SettingsSelect.css";

export interface SettingsSelectOption {
  value: string;
  label: string;
  /** 分组标题；相邻同组只显示一次 */
  group?: string;
}

interface SettingsSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SettingsSelectOption[];
  className?: string;
  /** 触发器最小宽度，默认跟随内容 */
  minWidth?: number | string;
  disabled?: boolean;
  title?: string;
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
}

/** 与 FontPicker 同风格的自定义下拉，替代系统原生 select */
export function SettingsSelect({
  value,
  onChange,
  options,
  className,
  minWidth,
  disabled,
  title,
}: SettingsSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);

  const updatePosition = () => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const preferredMax = 280;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow));
    setPos({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: Math.max(rect.width, 140),
      maxHeight,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => updatePosition();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    // 设置主区域滚动时同步位置
    document.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      document.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? options[0],
    [options, value],
  );

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const dropdown =
    open &&
    pos &&
    createPortal(
      <div
        ref={dropdownRef}
        className={`settings-select-dropdown settings-select-dropdown--portal${pos.openUp ? " open-up" : ""}`}
        style={{
          top: pos.openUp ? undefined : pos.top,
          bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
          left: pos.left,
          width: pos.width,
          maxHeight: pos.maxHeight,
        }}
      >
        <div className="settings-select-list">
          {options.map((opt, index) => {
            const prev = options[index - 1];
            const showGroup = opt.group && (!prev || prev.group !== opt.group);
            return (
              <div key={`${opt.group ?? ""}:${opt.value}`}>
                {showGroup && <div className="settings-select-group">{opt.group}</div>}
                <button
                  type="button"
                  className={`settings-select-option${opt.value === value ? " active" : ""}`}
                  onClick={() => select(opt.value)}
                >
                  {opt.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>,
      document.body,
    );

  return (
    <div
      className={`settings-select-picker${className ? ` ${className}` : ""}`}
      ref={rootRef}
      style={minWidth != null ? { minWidth } : undefined}
    >
      <button
        type="button"
        className={`settings-select-trigger${open ? " open" : ""}`}
        disabled={disabled}
        title={title ?? selected?.label}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="settings-select-trigger-label">{selected?.label ?? value}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
