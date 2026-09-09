/** Color helpers for the theme editor. */

export interface RgbaColor {
  r: number; // 0–255
  g: number;
  b: number;
  a: number; // 0–1
}

export interface HsvaColor {
  h: number; // 0–360
  s: number; // 0–100
  v: number; // 0–100
  a: number; // 0–1
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function toHex(n: number): string {
  return Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
}

/** Strip alpha for legacy `<input type="color">` consumers. */
export function normalizeColorToHex(value: string): string {
  const c = parseColor(value);
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

export function parseColor(value: string): RgbaColor {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    let hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a: clamp(a, 0, 1) };
  }

  const rgbaMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+%?))?\s*\)$/i,
  );
  if (rgbaMatch) {
    const r = clamp(Number(rgbaMatch[1]), 0, 255);
    const g = clamp(Number(rgbaMatch[2]), 0, 255);
    const b = clamp(Number(rgbaMatch[3]), 0, 255);
    let a = 1;
    if (rgbaMatch[4] != null) {
      a = rgbaMatch[4].endsWith("%")
        ? clamp(Number.parseFloat(rgbaMatch[4]) / 100, 0, 1)
        : clamp(Number(rgbaMatch[4]), 0, 1);
    }
    return { r, g, b, a };
  }

  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = trimmed;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        // If fillStyle was invalid, canvas often stays transparent black
        if (r + g + b + a > 0 || trimmed === "black" || trimmed === "#000" || trimmed === "#000000") {
          return { r, g, b, a: a / 255 };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { r: 255, g: 255, b: 255, a: 1 };
}

/** Opaque → `#rrggbb`；半透明 → `rgba(r, g, b, a)` */
export function formatColor({ r, g, b, a }: RgbaColor): string {
  const rr = Math.round(clamp(r, 0, 255));
  const gg = Math.round(clamp(g, 0, 255));
  const bb = Math.round(clamp(b, 0, 255));
  const aa = Math.round(clamp(a, 0, 1) * 1000) / 1000;
  if (aa >= 0.999) return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
  if (aa <= 0.001) return "transparent";
  return `rgba(${rr}, ${gg}, ${bb}, ${aa})`;
}

export function rgbaToHsva({ r, g, b, a }: RgbaColor): HsvaColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v, a };
}

export function hsvaToRgba({ h, s, v, a }: HsvaColor): RgbaColor {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const vv = clamp(v, 0, 100) / 100;

  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
    a: clamp(a, 0, 1),
  };
}

/** Parse a CSS color into `R, G, B` for --accent-rgb. Returns null if unparsable. */
export function colorToRgbChannels(value: string): string | null {
  const c = parseColor(value);
  return `${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}`;
}

export function syncAccentRgb(
  variables: { name: string; value: string; type: string }[],
): typeof variables {
  const accent = variables.find((v) => v.name === "--accent");
  if (!accent) return variables;
  const rgb = colorToRgbChannels(accent.value);
  if (!rgb) return variables;
  return variables.map((v) =>
    v.name === "--accent-rgb" ? { ...v, value: rgb } : v,
  );
}

export function supportsEyeDropper(): boolean {
  return typeof window !== "undefined" && "EyeDropper" in window;
}

export async function pickColorWithEyeDropper(): Promise<string | null> {
  if (!supportsEyeDropper()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dropper = new (window as any).EyeDropper();
    const result = await dropper.open();
    return typeof result?.sRGBHex === "string" ? result.sRGBHex : null;
  } catch {
    return null;
  }
}

export function checkerboardCss(): string {
  return `linear-gradient(45deg, #c0c0c0 25%, transparent 25%),
    linear-gradient(-45deg, #c0c0c0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #c0c0c0 75%),
    linear-gradient(-45deg, transparent 75%, #c0c0c0 75%)`.replace(/\s+/g, " ");
}
