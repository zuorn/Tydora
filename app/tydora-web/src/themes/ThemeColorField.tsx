import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  checkerboardCss,
  formatColor,
  hsvaToRgba,
  parseColor,
  pickColorWithEyeDropper,
  rgbaToHsva,
  supportsEyeDropper,
  type HsvaColor,
  type RgbaColor,
} from "./colorUtils";

interface ThemeColorFieldProps {
  label: string;
  varName: string;
  value: string;
  onChange: (value: string) => void;
}

function hueGradient(): string {
  return "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)";
}

function svBackground(h: number): string {
  const pure = formatColor(hsvaToRgba({ h, s: 100, v: 100, a: 1 }));
  return `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})`;
}

export function ThemeColorField({ label, varName, value, onChange }: ThemeColorFieldProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [hsva, setHsva] = useState<HsvaColor>(() => rgbaToHsva(parseColor(value)));
  const [textDraft, setTextDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const showDropper = supportsEyeDropper();

  // Sync from outside when closed / value changes externally
  useEffect(() => {
    if (open) return;
    setHsva(rgbaToHsva(parseColor(value)));
    setTextDraft(value);
  }, [value, open]);

  const commit = useCallback(
    (next: HsvaColor) => {
      setHsva(next);
      const formatted = formatColor(hsvaToRgba(next));
      setTextDraft(formatted);
      onChange(formatted);
    },
    [onChange],
  );

  const placePopover = useCallback(() => {
    const anchor = rootRef.current?.querySelector(".theme-color-swatch") as HTMLElement | null;
    const pop = popoverRef.current;
    if (!anchor || !pop) return;
    const rect = anchor.getBoundingClientRect();
    const popW = pop.offsetWidth || 260;
    const popH = pop.offsetHeight || 320;
    let left = rect.right - popW;
    let top = rect.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    if (top + popH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popH - 8);
    }
    setPopoverPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    placePopover();
    const onResize = () => placePopover();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, placePopover]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }, [value]);

  const handleEyeDropper = useCallback(async () => {
    const hex = await pickColorWithEyeDropper();
    if (!hex) return;
    const next = rgbaToHsva(parseColor(hex));
    next.a = hsva.a; // keep current alpha when sampling opaque screen colors
    commit(next);
  }, [commit, hsva.a]);

  const handleTextCommit = useCallback(() => {
    const parsed = parseColor(textDraft);
    const next = rgbaToHsva(parsed);
    commit(next);
  }, [commit, textDraft]);

  const rgba = hsvaToRgba(hsva);
  const solid = formatColor({ ...rgba, a: 1 });
  const preview = formatColor(rgba);

  return (
    <div className="theme-editor-row" ref={rootRef}>
      <div className="theme-editor-label-block">
        <label className="theme-editor-label">{label}</label>
        <span className="theme-editor-var-name">{varName}</span>
      </div>
      <div className="theme-editor-control">
        <div className="theme-editor-color-group">
          <button
            type="button"
            className="theme-color-swatch"
            title={t("settings.theme.pickColor")}
            aria-label={t("settings.theme.pickColor")}
            aria-expanded={open}
            onClick={() => {
              if (!open) {
                setHsva(rgbaToHsva(parseColor(value)));
                setTextDraft(value);
              }
              setOpen((v) => !v);
            }}
          >
            <span className="theme-color-swatch-checker" style={{ backgroundImage: checkerboardCss() }} />
            <span className="theme-color-swatch-fill" style={{ background: preview === "transparent" ? "transparent" : preview }} />
          </button>

          <input
            type="text"
            className="theme-editor-input"
            value={open ? textDraft : value}
            onChange={(e) => {
              setTextDraft(e.target.value);
              if (!open) onChange(e.target.value);
            }}
            onBlur={() => {
              if (open) handleTextCommit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleTextCommit();
              }
            }}
            spellCheck={false}
          />

          <button
            type="button"
            className="theme-editor-icon-btn"
            onClick={handleCopy}
            title={copied ? t("settings.theme.copied") : t("settings.theme.copyColor")}
            aria-label={t("settings.theme.copyColor")}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>

          {showDropper && (
            <button
              type="button"
              className="theme-editor-icon-btn"
              onClick={handleEyeDropper}
              title={t("settings.theme.eyedropper")}
              aria-label={t("settings.theme.eyedropper")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2 22 1-1h3l9-9" />
                <path d="M3 21v-3l9-9" />
                <path d="m15 5 3 3" />
                <path d="M18 2c.5.5 2 2.5 2 4 0 1-.5 2-2 2s-2-.5-2-2 1.5-3.5 2-4Z" />
                <path d="m15 8 4-4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          ref={popoverRef}
          className="theme-color-popover"
          style={
            popoverPos
              ? { top: popoverPos.top, left: popoverPos.left, visibility: "visible" }
              : { top: 0, left: 0, visibility: "hidden" }
          }
          role="dialog"
          aria-label={t("settings.theme.pickColor")}
        >
          <SvPanel hsva={hsva} onChange={commit} />
          <div className="theme-color-sliders">
            <div className="theme-color-slider-row">
              <span className="theme-color-slider-label">{t("settings.theme.hue")}</span>
              <div
                className="theme-color-slider-track"
                style={{ background: hueGradient() }}
              >
                <Slider
                  min={0}
                  max={360}
                  value={hsva.h}
                  onChange={(h) => commit({ ...hsva, h })}
                />
              </div>
            </div>
            <div className="theme-color-slider-row">
              <span className="theme-color-slider-label">{t("settings.theme.alpha")}</span>
              <div
                className="theme-color-slider-track theme-color-alpha-track"
                style={{
                  backgroundImage: `${checkerboardCss()}, linear-gradient(to right, transparent, ${solid})`,
                  backgroundSize: "10px 10px, 100% 100%",
                  backgroundPosition: "0 0, 0 0",
                  backgroundRepeat: "repeat, no-repeat",
                }}
              >
                <Slider
                  min={0}
                  max={100}
                  value={Math.round(hsva.a * 100)}
                  onChange={(pct) => commit({ ...hsva, a: pct / 100 })}
                />
              </div>
              <span className="theme-color-alpha-value">{Math.round(hsva.a * 100)}%</span>
            </div>
          </div>

          <div className="theme-color-popover-footer">
            <div className="theme-color-preview">
              <span className="theme-color-preview-checker" style={{ backgroundImage: checkerboardCss() }} />
              <span className="theme-color-preview-fill" style={{ background: preview === "transparent" ? "transparent" : preview }} />
            </div>
            <RgbaInputs rgba={rgba} onChange={(c) => commit(rgbaToHsva(c))} />
            {showDropper && (
              <button
                type="button"
                className="theme-editor-icon-btn"
                onClick={handleEyeDropper}
                title={t("settings.theme.eyedropper")}
                aria-label={t("settings.theme.eyedropper")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2 22 1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="m15 5 3 3" />
                  <path d="M18 2c.5.5 2 2.5 2 4 0 1-.5 2-2 2s-2-.5-2-2 1.5-3.5 2-4Z" />
                  <path d="m15 8 4-4" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SvPanel({
  hsva,
  onChange,
}: {
  hsva: HsvaColor;
  onChange: (c: HsvaColor) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      onChange({ ...hsva, s: x * 100, v: (1 - y) * 100 });
    },
    [hsva, onChange],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      ref={ref}
      className="theme-color-sv"
      style={{ background: svBackground(hsva.h) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span
        className="theme-color-sv-thumb"
        style={{
          left: `${hsva.s}%`,
          top: `${100 - hsva.v}%`,
          background: formatColor(hsvaToRgba({ ...hsva, a: 1 })),
        }}
      />
    </div>
  );
}

function Slider({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onChange(min + t * (max - min));
    },
    [min, max, onChange],
  );

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      ref={ref}
      className="theme-color-slider"
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        update(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <span className="theme-color-slider-thumb" style={{ left: `${pct}%` }} />
    </div>
  );
}

function RgbaInputs({
  rgba,
  onChange,
}: {
  rgba: RgbaColor;
  onChange: (c: RgbaColor) => void;
}) {
  const { t } = useTranslation();
  const set = (key: keyof RgbaColor, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (key === "a") onChange({ ...rgba, a: Math.min(100, Math.max(0, n)) / 100 });
    else onChange({ ...rgba, [key]: Math.min(255, Math.max(0, n)) });
  };

  return (
    <div className="theme-color-rgba">
      {(["r", "g", "b"] as const).map((key) => (
        <label key={key} className="theme-color-rgba-field">
          <span>{key.toUpperCase()}</span>
          <input
            type="number"
            min={0}
            max={255}
            value={Math.round(rgba[key])}
            onChange={(e) => set(key, e.target.value)}
            aria-label={key.toUpperCase()}
          />
        </label>
      ))}
      <label className="theme-color-rgba-field">
        <span>{t("settings.theme.alphaShort")}</span>
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(rgba.a * 100)}
          onChange={(e) => set("a", e.target.value)}
          aria-label={t("settings.theme.alpha")}
        />
      </label>
    </div>
  );
}
