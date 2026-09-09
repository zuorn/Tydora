import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  BUILTIN_EDITOR_FONTS,
  listSystemFonts,
  resolveCodeFont,
  resolveEditorFont,
  SYSTEM_FONT_SENTINEL,
  type SystemFontInfo,
} from "../utils/systemFonts";

type FontPickerMode = "editor" | "code";

interface FontPickerProps {
  mode: FontPickerMode;
  value: string;
  onChange: (value: string) => void;
}

interface FontOption {
  value: string;
  label: string;
  previewFamily: string;
  group: "default" | "builtin" | "mono" | "system";
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
}

export function FontPicker({ mode, value, onChange }: FontPickerProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fonts, setFonts] = useState<SystemFontInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listSystemFonts()
      .then((list) => {
        if (!cancelled) setFonts(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePosition = () => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const preferredMax = 320;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow));
    setPos({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: Math.max(rect.width, 200),
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
    const onReposition = () => updatePosition();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReposition);
    document.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      document.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const options = useMemo<FontOption[]>(() => {
    const result: FontOption[] = [
      {
        value: SYSTEM_FONT_SENTINEL,
        label: t("settings.appearance.systemDefault"),
        previewFamily:
          mode === "code"
            ? resolveCodeFont(SYSTEM_FONT_SENTINEL)
            : resolveEditorFont(SYSTEM_FONT_SENTINEL),
        group: "default",
      },
    ];

    if (mode === "editor") {
      for (const builtin of BUILTIN_EDITOR_FONTS) {
        result.push({
          value: builtin.id,
          label: builtin.label,
          previewFamily: builtin.stack,
          group: "builtin",
        });
      }
    }

    const mono = fonts.filter((f) => f.monospaced);
    const rest = fonts.filter((f) => !f.monospaced);

    const pushFamily = (f: SystemFontInfo, group: "mono" | "system") => {
      result.push({
        value: f.family,
        label: f.family,
        previewFamily: `"${f.family.replace(/"/g, '\\"')}"`,
        group,
      });
    };

    if (mode === "code") {
      mono.forEach((f) => pushFamily(f, "mono"));
      rest.forEach((f) => pushFamily(f, "system"));
    } else {
      fonts.forEach((f) => pushFamily(f, "system"));
    }

    return result;
  }, [fonts, mode, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const selected =
    options.find((o) => o.value === value) ??
    (value && value !== SYSTEM_FONT_SENTINEL
      ? {
          value,
          label: value,
          previewFamily:
            mode === "code" ? resolveCodeFont(value) : resolveEditorFont(value),
          group: "system" as const,
        }
      : options[0]);

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const dropdown =
    open &&
    pos &&
    createPortal(
      <div
        ref={dropdownRef}
        className="font-picker-dropdown font-picker-dropdown--portal"
        style={{
          top: pos.openUp ? undefined : pos.top,
          bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
          left: pos.left,
          width: pos.width,
          maxHeight: pos.maxHeight,
        }}
      >
        <input
          type="text"
          className="font-picker-search"
          autoFocus
          placeholder={t("settings.appearance.fontSearchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && filtered[0]) select(filtered[0].value);
          }}
        />
        <div className="font-picker-list">
          {loading && (
            <div className="font-picker-empty">{t("settings.appearance.fontLoading")}</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="font-picker-empty">{t("settings.appearance.fontEmpty")}</div>
          )}
          {!loading &&
            filtered.map((opt, index) => {
              const prev = filtered[index - 1];
              const showGroup =
                !prev || prev.group !== opt.group
                  ? opt.group === "builtin"
                    ? t("settings.appearance.fontGroupBuiltin")
                    : opt.group === "mono"
                      ? t("settings.appearance.fontGroupMono")
                      : opt.group === "system"
                        ? t("settings.appearance.fontGroupSystem")
                        : null
                  : null;

              return (
                <div key={`${opt.group}-${opt.value}`}>
                  {showGroup && <div className="font-picker-group">{showGroup}</div>}
                  <button
                    type="button"
                    className={`font-picker-option${opt.value === value ? " active" : ""}`}
                    style={{ fontFamily: opt.previewFamily }}
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
    <div className="font-picker" ref={rootRef}>
      <button
        type="button"
        className={`font-picker-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={selected?.label}
      >
        <span
          className="font-picker-trigger-label"
          style={{ fontFamily: selected?.previewFamily }}
        >
          {selected?.label ?? t("settings.appearance.systemDefault")}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
