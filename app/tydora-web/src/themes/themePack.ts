import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";
import { CODE_THEMES } from "./codeThemes";
import {
  buildThemeCss,
  createCodeThemeFromVariables,
  createThemeFromVariables,
  getCodeThemeCss,
  getCustomThemeCss,
  parseCssVariables,
  type ThemeVariable,
} from "./CustomThemeManager";
import { getBuiltinThemeVariables } from "./themeTokens";
import { getBuiltinCodeThemeVariables } from "./codeThemeTokens";
import type { ThemePair } from "./appearance";

export const THEME_PACK_FORMAT = "tydora-theme-pack" as const;
export const THEME_PACK_VERSION = 1 as const;

export interface ThemePackSlot {
  name: string;
  /** CSS custom properties without selector wrapper */
  variables: Record<string, string>;
}

export interface ThemePack {
  format: typeof THEME_PACK_FORMAT;
  version: typeof THEME_PACK_VERSION;
  name: string;
  exportedAt: string;
  app: {
    light: ThemePackSlot;
    dark: ThemePackSlot;
  };
  code: {
    light: ThemePackSlot;
    dark: ThemePackSlot;
  };
}

export interface ThemePackImportResult {
  preferredAppTheme: ThemePair;
  preferredCodeTheme: ThemePair;
  packName: string;
}

function variablesToRecord(vars: ThemeVariable[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of vars) out[v.name] = v.value;
  return out;
}

function recordToVariables(record: Record<string, string>): ThemeVariable[] {
  return Object.entries(record).map(([name, value]) => ({
    name,
    value,
    type: name.startsWith("--hljs-") || name.startsWith("--bg-") || name.startsWith("--text-") || name.startsWith("--accent") || name === "--border" || name === "--danger"
      ? ("color" as const)
      : /^\d+(\.\d+)?(px|rem|em|%)$/.test(value)
        ? ("size" as const)
        : ("text" as const),
  }));
}

export async function resolveAppThemeSlot(
  themeId: string,
  fallbackName: string,
): Promise<ThemePackSlot> {
  if (themeId.startsWith("custom-")) {
    const id = themeId.replace("custom-", "");
    const css = await getCustomThemeCss(id);
    const vars = parseCssVariables(css);
    return {
      name: fallbackName,
      variables: variablesToRecord(vars),
    };
  }
  const vars = getBuiltinThemeVariables(themeId);
  if (!vars) {
    throw new Error(`Unknown app theme: ${themeId}`);
  }
  return {
    name: fallbackName,
    variables: variablesToRecord(vars),
  };
}

export async function resolveCodeThemeSlot(
  themeId: string,
  fallbackName: string,
): Promise<ThemePackSlot> {
  const builtin = CODE_THEMES.find((t) => t.id === themeId);
  if (builtin) {
    return { name: fallbackName || builtin.name, variables: { ...builtin.variables } };
  }
  // Custom code themes use raw ids (no `custom-` prefix), unlike app themes.
  try {
    const css = await getCodeThemeCss(themeId);
    const vars = parseCssVariables(css).filter((v) => v.name.startsWith("--hljs-"));
    if (vars.length > 0) {
      return {
        name: fallbackName,
        variables: variablesToRecord(vars),
      };
    }
  } catch {
    /* fall through */
  }
  const vars = getBuiltinCodeThemeVariables(themeId);
  if (!vars) throw new Error(`Unknown code theme: ${themeId}`);
  return { name: fallbackName, variables: variablesToRecord(vars) };
}

export async function buildThemePack(options: {
  name: string;
  preferredAppTheme: ThemePair;
  preferredCodeTheme: ThemePair;
  resolveAppName: (id: string) => string;
  resolveCodeName: (id: string) => string;
}): Promise<ThemePack> {
  const { name, preferredAppTheme, preferredCodeTheme, resolveAppName, resolveCodeName } = options;
  const [appLight, appDark, codeLight, codeDark] = await Promise.all([
    resolveAppThemeSlot(preferredAppTheme.light, resolveAppName(preferredAppTheme.light)),
    resolveAppThemeSlot(preferredAppTheme.dark, resolveAppName(preferredAppTheme.dark)),
    resolveCodeThemeSlot(preferredCodeTheme.light, resolveCodeName(preferredCodeTheme.light)),
    resolveCodeThemeSlot(preferredCodeTheme.dark, resolveCodeName(preferredCodeTheme.dark)),
  ]);

  return {
    format: THEME_PACK_FORMAT,
    version: THEME_PACK_VERSION,
    name: name.trim() || "Tydora Theme",
    exportedAt: new Date().toISOString(),
    app: { light: appLight, dark: appDark },
    code: { light: codeLight, dark: codeDark },
  };
}

export function parseThemePack(raw: string): ThemePack {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid theme pack JSON");
  }
  if (!data || typeof data !== "object") throw new Error("Invalid theme pack");
  const pack = data as Partial<ThemePack>;
  if (pack.format !== THEME_PACK_FORMAT) {
    throw new Error("Not a Tydora theme pack");
  }
  if (pack.version !== THEME_PACK_VERSION) {
    throw new Error(`Unsupported theme pack version: ${String(pack.version)}`);
  }
  if (!pack.name || !pack.app?.light?.variables || !pack.app?.dark?.variables) {
    throw new Error("Theme pack missing app themes");
  }
  if (!pack.code?.light?.variables || !pack.code?.dark?.variables) {
    throw new Error("Theme pack missing code themes");
  }
  return pack as ThemePack;
}

export async function importThemePackData(pack: ThemePack): Promise<ThemePackImportResult> {
  const base = pack.name.trim() || "Imported Theme";
  const lightAppVars = recordToVariables(pack.app.light.variables);
  const darkAppVars = recordToVariables(pack.app.dark.variables);
  const lightCodeVars = recordToVariables(pack.code.light.variables);
  const darkCodeVars = recordToVariables(pack.code.dark.variables);

  const [lightApp, darkApp, lightCode, darkCode] = await Promise.all([
    createThemeFromVariables(pack.app.light.name || `${base} · Light`, lightAppVars, false),
    createThemeFromVariables(pack.app.dark.name || `${base} · Dark`, darkAppVars, true),
    createCodeThemeFromVariables(
      pack.code.light.name || `${base} Code · Light`,
      lightCodeVars,
      false,
    ),
    createCodeThemeFromVariables(
      pack.code.dark.name || `${base} Code · Dark`,
      darkCodeVars,
      true,
    ),
  ]);

  return {
    packName: base,
    preferredAppTheme: {
      light: `custom-${lightApp.id}`,
      dark: `custom-${darkApp.id}`,
    },
    preferredCodeTheme: {
      light: lightCode.id,
      dark: darkCode.id,
    },
  };
}

export async function exportThemePackToFile(pack: ThemePack): Promise<string | null> {
  const safeName = pack.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "tydora-theme";
  const filePath = await save({
    defaultPath: `${safeName}.tydora-theme.json`,
    filters: [{ name: "Tydora Theme Pack", extensions: ["json", "tydora-theme.json"] }],
  });
  if (!filePath) return null;
  await writeTextFile(filePath, JSON.stringify(pack, null, 2));
  return filePath;
}

export async function pickAndReadThemePackFile(): Promise<{ filePath: string; pack: ThemePack } | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Tydora Theme Pack", extensions: ["json"] }],
    title: "Import Theme Pack",
  });
  if (!selected || typeof selected !== "string") return null;
  const raw = await readTextFile(selected);
  const pack = parseThemePack(raw);
  return { filePath: selected, pack };
}

/** Build :root CSS string for preview/debug from a slot. */
export function slotToRootCss(slot: ThemePackSlot): string {
  const vars = recordToVariables(slot.variables);
  return buildThemeCss("preview", vars).replace(
    /\[data-theme="custom-preview"\]/,
    ":root",
  );
}
