import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { bootStart, bootEnd, bootStamp } from "../boot-timing";
import { emit, listen } from "@tauri-apps/api/event";
import { isBuiltinTheme } from "./ThemeManager";
import { getCodeThemeVariables } from "./codeThemes";
import {
  loadManifest,
  importTheme as importThemeManager,
  deleteTheme as deleteThemeManager,
  getCustomThemeCss,
  buildThemeCss,
  createThemeFromVariables as createThemeFromVariablesFs,
  persistThemeVariables,
  loadCodeThemeManifest,
  importCodeThemeFile,
  deleteCodeThemeFile,
  getCodeThemeCss,
  buildCodeThemeCss,
  createCodeThemeFromVariables as createCodeThemeFromVariablesFs,
  persistCodeThemeVariables,
  extractCodeThemePreviewColors,
  parseCssVariables,
  inferAppThemeIsDark,
  extractPreviewColors,
  renameTheme as renameThemeFs,
  renameCodeTheme as renameCodeThemeFs,
  type ThemeManifest,
  type ThemeVariable,
} from "./CustomThemeManager";
import { type CustomCodeTheme } from "./codeThemes";
import { getBuiltinThemeVariables, getTemplateVariables } from "./themeTokens";
import {
  getBuiltinCodeThemeVariables,
  getBuiltinCodeThemeIsDark,
} from "./codeThemeTokens";
import {
  type AppearanceMode,
  type AppearanceState,
  type ResolvedAppearance,
  type ThemePair,
  APPEARANCE_SYNC_EVENT,
  DEFAULT_APP_THEME_PAIR,
  DEFAULT_CODE_THEME_PAIR,
  getSystemIsDark,
  inferThemeIdIsDark,
  inferCodeThemeIdIsDark,
  loadAppearanceState,
  persistAppearanceState,
  resolveActiveFromPair,
  resolveAppearanceMode,
  withPreferredApp,
  withPreferredCode,
} from "./appearance";
import {
  buildThemePack,
  exportThemePackToFile,
  importThemePackData,
  pickAndReadThemePackFile,
  type ThemePackImportResult,
} from "./themePack";
import { CODE_THEMES } from "./codeThemes";

export type ThemeName = string;

interface ThemeContextValue {
  /** Resolved active app theme id */
  theme: ThemeName;
  /**
   * Apply a theme to the currently resolved appearance slot
   * (themes themselves are not classified as light/dark).
   */
  setTheme: (t: ThemeName) => void;
  appearanceMode: AppearanceMode;
  setAppearanceMode: (mode: AppearanceMode) => void;
  resolvedMode: ResolvedAppearance;
  preferredAppTheme: ThemePair;
  preferredCodeTheme: ThemePair;
  setPreferredAppTheme: (mode: ResolvedAppearance, id: string) => void;
  setPreferredCodeTheme: (mode: ResolvedAppearance, id: string) => void;
  customThemes: ThemeManifest[];
  importTheme: (filePath: string, name: string) => Promise<ThemeManifest>;
  deleteTheme: (id: string) => Promise<void>;
  updateThemeVariables: (id: string, variables: ThemeVariable[]) => Promise<void>;
  previewThemeVariables: (id: string, variables: ThemeVariable[]) => void;
  createThemeFromBuiltin: (builtinId: string, name: string) => Promise<ThemeManifest>;
  createThemeFromTemplate: (kind: "light" | "dark", name: string) => Promise<ThemeManifest>;
  refreshCustomThemes: () => Promise<void>;
  /** Resolved active code theme id */
  codeTheme: string;
  /** Apply a code theme to the currently resolved appearance slot */
  setCodeTheme: (id: string) => void;
  customCodeThemes: CustomCodeTheme[];
  importCodeTheme: (filePath: string, name: string) => Promise<CustomCodeTheme>;
  deleteCodeTheme: (id: string) => Promise<void>;
  createCodeThemeFromBuiltin: (builtinId: string, name: string) => Promise<CustomCodeTheme>;
  updateCodeThemeVariables: (id: string, variables: ThemeVariable[], isDark?: boolean) => Promise<void>;
  previewCodeThemeVariables: (id: string, variables: ThemeVariable[]) => void;
  getAppThemeIsDark: (id: string) => boolean;
  getCodeThemeIsDark: (id: string) => boolean;
  renameAppTheme: (id: string, name: string) => Promise<void>;
  renameCodeTheme: (id: string, name: string) => Promise<void>;
  exportCurrentThemePack: (packName: string) => Promise<string | null>;
  importThemePack: () => Promise<ThemePackImportResult | null>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "white",
  setTheme: () => {},
  appearanceMode: "system",
  setAppearanceMode: () => {},
  resolvedMode: "light",
  preferredAppTheme: DEFAULT_APP_THEME_PAIR,
  preferredCodeTheme: DEFAULT_CODE_THEME_PAIR,
  setPreferredAppTheme: () => {},
  setPreferredCodeTheme: () => {},
  customThemes: [],
  importTheme: async () => ({ id: "", name: "", fileName: "", importedAt: "" }),
  deleteTheme: async () => {},
  updateThemeVariables: async () => {},
  previewThemeVariables: () => {},
  createThemeFromBuiltin: async () => ({ id: "", name: "", fileName: "", importedAt: "" }),
  createThemeFromTemplate: async () => ({ id: "", name: "", fileName: "", importedAt: "" }),
  refreshCustomThemes: async () => {},
  codeTheme: "github-light",
  setCodeTheme: () => {},
  customCodeThemes: [],
  importCodeTheme: async () => ({ id: "", name: "", fileName: "", importedAt: "", isDark: false }),
  deleteCodeTheme: async () => {},
  createCodeThemeFromBuiltin: async () => ({ id: "", name: "", fileName: "", importedAt: "", isDark: false }),
  updateCodeThemeVariables: async () => {},
  previewCodeThemeVariables: () => {},
  getAppThemeIsDark: () => false,
  getCodeThemeIsDark: () => false,
  renameAppTheme: async () => {},
  renameCodeTheme: async () => {},
  exportCurrentThemePack: async () => null,
  importThemePack: async () => null,
});

const THEME_CSS_EVENT = "theme-css-updated";
const CODE_THEME_CSS_EVENT = "code-theme-css-updated";

type ThemeCssPayload = { id: string; css: string; enable: boolean };
type CodeThemeCssPayload = { id: string; css: string; enable: boolean };

export function ThemeProvider({ children }: { children: ReactNode }) {
  bootStart("theme_provider_init");
  bootStamp("theme_before_init");

  const initial = useMemo(() => loadAppearanceState(), []);
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>(initial.appearanceMode);
  const [preferredAppTheme, setPreferredAppThemeState] = useState<ThemePair>(initial.preferredAppTheme);
  const [preferredCodeTheme, setPreferredCodeThemeState] = useState<ThemePair>(initial.preferredCodeTheme);
  const [systemIsDark, setSystemIsDark] = useState(() => getSystemIsDark());

  const [customThemes, setCustomThemes] = useState<ThemeManifest[]>([]);
  const [customCodeThemes, setCustomCodeThemes] = useState<CustomCodeTheme[]>([]);
  const styleElementsRef = useRef<Map<string, HTMLStyleElement>>(new Map());

  const resolvedMode = resolveAppearanceMode(appearanceMode, systemIsDark);
  const theme = resolveActiveFromPair(preferredAppTheme, resolvedMode);
  const codeTheme = resolveActiveFromPair(preferredCodeTheme, resolvedMode);

  const themeRef = useRef(theme);
  themeRef.current = theme;
  const codeThemeRef = useRef(codeTheme);
  codeThemeRef.current = codeTheme;
  const resolvedModeRef = useRef(resolvedMode);
  resolvedModeRef.current = resolvedMode;

  const getAppThemeIsDark = useCallback((id: string): boolean => {
    if (id.startsWith("custom-")) {
      const mid = id.replace("custom-", "");
      const m = customThemes.find((c) => c.id === mid);
      return inferThemeIdIsDark(id, m?.isDark);
    }
    return inferThemeIdIsDark(id);
  }, [customThemes]);

  const getCodeThemeIsDark = useCallback((id: string): boolean => {
    if (id.startsWith("custom-")) {
      const m = customCodeThemes.find((c) => c.id === id);
      return inferCodeThemeIdIsDark(id, m?.isDark);
    }
    return inferCodeThemeIdIsDark(id);
  }, [customCodeThemes]);

  const applyAppearancePatch = useCallback((patch: Partial<AppearanceState>) => {
    setAppearanceModeState((prevMode) => {
      const appearanceModeNext = patch.appearanceMode ?? prevMode;
      setPreferredAppThemeState((prevApp) => {
        const preferredAppThemeNext = patch.preferredAppTheme ?? prevApp;
        setPreferredCodeThemeState((prevCode) => {
          const preferredCodeThemeNext = patch.preferredCodeTheme ?? prevCode;
          const state: AppearanceState = {
            appearanceMode: appearanceModeNext,
            preferredAppTheme: preferredAppThemeNext,
            preferredCodeTheme: preferredCodeThemeNext,
          };
          persistAppearanceState(state);
          emit(APPEARANCE_SYNC_EVENT, state).catch(() => {});
          return preferredCodeThemeNext;
        });
        return preferredAppThemeNext;
      });
      return appearanceModeNext;
    });
  }, []);

  // ── System color scheme listener ──
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemIsDark(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ── Load custom themes ──
  const refreshCustomThemes = useCallback(async () => {
    try {
      const manifests = await loadManifest();
      const enriched: ThemeManifest[] = [];
      for (const m of manifests) {
        let next = m;
        const needsPreview =
          !m.previewBg || !m.previewAccent || !m.previewText || !m.previewSecondary;
        const needsDark = typeof m.isDark !== "boolean";
        if (needsPreview || needsDark) {
          try {
            const css = await getCustomThemeCss(m.id);
            next = {
              ...m,
              ...(needsPreview ? extractPreviewColors(css) : {}),
              ...(needsDark
                ? { isDark: inferAppThemeIsDark(parseCssVariables(css)) }
                : {}),
            };
          } catch {
            if (needsDark) next = { ...m, isDark: false };
          }
        }
        enriched.push(next);
        if (!styleElementsRef.current.has(next.id)) {
          try {
            const css = await getCustomThemeCss(next.id);
            const style = document.createElement("style");
            style.id = `custom-theme-${next.id}`;
            style.textContent = css;
            style.disabled = true;
            document.head.appendChild(style);
            styleElementsRef.current.set(next.id, style);
          } catch {}
        }
      }
      setCustomThemes(enriched);
    } catch {}
  }, []);

  const refreshCustomCodeThemes = useCallback(async () => {
    try {
      const manifests = await loadCodeThemeManifest();
      const enriched: CustomCodeTheme[] = [];
      for (const m of manifests) {
        let next = m;
        if (!m.previewColors || m.previewColors.length === 0) {
          try {
            const css = await getCodeThemeCss(m.id);
            next = {
              ...m,
              previewColors: extractCodeThemePreviewColors(parseCssVariables(css)),
            };
          } catch {
            /* ignore */
          }
        }
        enriched.push(next);
        const existing = document.getElementById(`code-theme-${next.id}`);
        if (!existing) {
          const css = await getCodeThemeCss(next.id);
          if (css) {
            const style = document.createElement("style");
            style.id = `code-theme-${next.id}`;
            style.textContent = css;
            (style as HTMLStyleElement).disabled = true;
            document.head.appendChild(style);
          }
        }
      }
      setCustomCodeThemes(enriched);
    } catch {}
  }, []);

  useEffect(() => {
    bootStamp("theme_custom_load_scheduled");
    const timer = setTimeout(() => {
      bootStart("theme_custom_themes_load");
      refreshCustomThemes()
        .catch(() => {})
        .finally(() => bootEnd("theme_custom_themes_load"));
      bootStart("theme_custom_code_themes_load");
      refreshCustomCodeThemes()
        .catch(() => {})
        .finally(() => bootEnd("theme_custom_code_themes_load"));
    }, 500);
    return () => clearTimeout(timer);
  }, [refreshCustomThemes, refreshCustomCodeThemes]);

  // ── Apply resolved app theme ──
  useEffect(() => {
    bootStamp("theme_apply_effect_run");
    persistAppearanceState({
      appearanceMode,
      preferredAppTheme,
      preferredCodeTheme,
    });

    if (isBuiltinTheme(theme)) {
      document.documentElement.dataset.theme = theme;
      styleElementsRef.current.forEach((style) => {
        style.disabled = true;
      });
    } else if (theme.startsWith("custom-")) {
      const id = theme.replace("custom-", "");
      const style = styleElementsRef.current.get(id);
      if (style) {
        styleElementsRef.current.forEach((s) => {
          s.disabled = true;
        });
        style.disabled = false;
      }
      document.documentElement.dataset.theme = theme;
    } else {
      document.documentElement.dataset.theme = "white";
    }
    document.documentElement.dataset.appearance = resolvedMode;
  }, [theme, resolvedMode, appearanceMode, preferredAppTheme, preferredCodeTheme]);

  // ── Apply resolved code theme ──
  useEffect(() => {
    customCodeThemes.forEach((m) => {
      const style = document.getElementById(`code-theme-${m.id}`) as HTMLStyleElement | null;
      if (style) style.disabled = true;
    });

    const existing = document.getElementById("code-theme-vars");
    if (existing) existing.remove();

    const actualThemeId = codeTheme;
    const isDark = getCodeThemeIsDark(actualThemeId);

    if (actualThemeId.startsWith("custom-")) {
      const style = document.getElementById(`code-theme-${actualThemeId}`) as HTMLStyleElement | null;
      if (style) style.disabled = false;
    } else {
      const vars = getCodeThemeVariables(actualThemeId);
      if (Object.keys(vars).length > 0) {
        const css = `:root { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(" ")} }`;
        const style = document.createElement("style");
        style.id = "code-theme-vars";
        style.textContent = css;
        document.head.appendChild(style);
      }
    }

    // 暴露当前代码主题给非 React 组件（如代码块工具栏 NodeView）读取
    document.documentElement.dataset.codeTheme = actualThemeId;
    document.documentElement.dataset.codeThemeDark = isDark ? "true" : "false";

    // 暗色代码主题时，把整个代码块背景也调成暗色
    // （--bg-code 由应用主题设置，这里在代码主题为暗色时覆盖它）
    const bgStyle = document.getElementById("code-theme-bg") as HTMLStyleElement | null;
    if (isDark) {
      const css = `:root { --bg-code: #1e1e2e; --code-block-text: #cdd6f4; }`;
      if (bgStyle) {
        bgStyle.textContent = css;
      } else {
        const s = document.createElement("style");
        s.id = "code-theme-bg";
        s.textContent = css;
        document.head.appendChild(s);
      }
    } else if (bgStyle) {
      bgStyle.remove();
    }

    // 把自定义代码主题暴露给非 React 组件（代码块工具栏下拉）
    (window as unknown as { __tydoraCustomCodeThemes?: CustomCodeTheme[] }).__tydoraCustomCodeThemes = customCodeThemes;

    window.dispatchEvent(new CustomEvent("code-theme-changed"));
  }, [codeTheme, customCodeThemes, getCodeThemeIsDark]);

  const injectOrUpdateStyle = useCallback((id: string, css: string, enable: boolean) => {
    let style = styleElementsRef.current.get(id);
    if (!style) {
      style = document.createElement("style");
      style.id = `custom-theme-${id}`;
      document.head.appendChild(style);
      styleElementsRef.current.set(id, style);
    }
    style.textContent = css;
    if (enable) {
      styleElementsRef.current.forEach((s, key) => {
        s.disabled = key !== id;
      });
      style.disabled = false;
    }
  }, []);

  const injectOrUpdateCodeThemeStyle = useCallback((id: string, css: string, enable: boolean) => {
    let style = document.getElementById(`code-theme-${id}`) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = `code-theme-${id}`;
      document.head.appendChild(style);
    }
    style.textContent = css;
    if (enable) {
      document.querySelectorAll<HTMLStyleElement>("[id^='code-theme-custom-']").forEach((s) => {
        s.disabled = s.id !== `code-theme-${id}`;
      });
      const builtin = document.getElementById("code-theme-vars");
      if (builtin) builtin.remove();
      style.disabled = false;
      window.dispatchEvent(new CustomEvent("code-theme-changed"));
    }
    emit(CODE_THEME_CSS_EVENT, { id, css, enable } satisfies CodeThemeCssPayload).catch(() => {});
  }, []);

  // ── Cross-window sync ──
  useEffect(() => {
    let unlistenAppearance: (() => void) | undefined;
    let unlistenCss: (() => void) | undefined;
    let unlistenCodeCss: (() => void) | undefined;

    listen<AppearanceState>(APPEARANCE_SYNC_EVENT, async (event) => {
      const state = event.payload;
      if (!state) return;
      setAppearanceModeState(state.appearanceMode);
      setPreferredAppThemeState(state.preferredAppTheme);
      setPreferredCodeThemeState(state.preferredCodeTheme);
      persistAppearanceState(state);

      const resolved = resolveAppearanceMode(state.appearanceMode, getSystemIsDark());
      const activeApp = resolveActiveFromPair(state.preferredAppTheme, resolved);
      if (activeApp.startsWith("custom-")) {
        const id = activeApp.replace("custom-", "");
        if (!styleElementsRef.current.has(id)) {
          try {
            const css = await getCustomThemeCss(id);
            injectOrUpdateStyle(id, css, true);
          } catch {
            /* ignore */
          }
        }
      }
      const activeCode = resolveActiveFromPair(state.preferredCodeTheme, resolved);
      if (activeCode.startsWith("custom-")) {
        const existing = document.getElementById(`code-theme-${activeCode}`);
        if (!existing) {
          try {
            const css = await getCodeThemeCss(activeCode);
            if (css) {
              const style = document.createElement("style");
              style.id = `code-theme-${activeCode}`;
              style.textContent = css;
              style.disabled = true;
              document.head.appendChild(style);
            }
          } catch {
            /* ignore */
          }
        }
      }
    }).then((fn) => {
      unlistenAppearance = fn;
    });

    listen<ThemeCssPayload>(THEME_CSS_EVENT, (event) => {
      const { id, css, enable } = event.payload;
      injectOrUpdateStyle(id, css, enable);
    }).then((fn) => {
      unlistenCss = fn;
    });

    listen<CodeThemeCssPayload>(CODE_THEME_CSS_EVENT, (event) => {
      const { id, css, enable } = event.payload;
      let style = document.getElementById(`code-theme-${id}`) as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement("style");
        style.id = `code-theme-${id}`;
        document.head.appendChild(style);
      }
      style.textContent = css;
      if (enable) {
        document.querySelectorAll<HTMLStyleElement>("[id^='code-theme-custom-']").forEach((s) => {
          s.disabled = s.id !== `code-theme-${id}`;
        });
        const builtin = document.getElementById("code-theme-vars");
        if (builtin) builtin.remove();
        style.disabled = false;
        window.dispatchEvent(new CustomEvent("code-theme-changed"));
      } else {
        style.disabled = true;
      }
    }).then((fn) => {
      unlistenCodeCss = fn;
    });

    return () => {
      unlistenAppearance?.();
      unlistenCss?.();
      unlistenCodeCss?.();
    };
  }, [injectOrUpdateStyle]);

  // ── Public actions ──
  const setAppearanceMode = useCallback((mode: AppearanceMode) => {
    applyAppearancePatch({ appearanceMode: mode });
  }, [applyAppearancePatch]);

  const setPreferredAppTheme = useCallback((mode: ResolvedAppearance, id: string) => {
    setPreferredAppThemeState((prev) => {
      const next = withPreferredApp(prev, mode, id);
      setAppearanceModeState((am) => {
        setPreferredCodeThemeState((code) => {
          persistAppearanceState({
            appearanceMode: am,
            preferredAppTheme: next,
            preferredCodeTheme: code,
          });
          emit(APPEARANCE_SYNC_EVENT, {
            appearanceMode: am,
            preferredAppTheme: next,
            preferredCodeTheme: code,
          } satisfies AppearanceState).catch(() => {});
          return code;
        });
        return am;
      });
      return next;
    });
  }, []);

  const setPreferredCodeTheme = useCallback((mode: ResolvedAppearance, id: string) => {
    setPreferredCodeThemeState((prev) => {
      const next = withPreferredCode(prev, mode, id);
      setAppearanceModeState((am) => {
        setPreferredAppThemeState((app) => {
          persistAppearanceState({
            appearanceMode: am,
            preferredAppTheme: app,
            preferredCodeTheme: next,
          });
          emit(APPEARANCE_SYNC_EVENT, {
            appearanceMode: am,
            preferredAppTheme: app,
            preferredCodeTheme: next,
          } satisfies AppearanceState).catch(() => {});
          return app;
        });
        return am;
      });
      return next;
    });
  }, []);

  /**
   * Apply a theme to the currently resolved appearance slot.
   * Themes themselves are not light/dark — the slot decides when they apply.
   */
  const setTheme = useCallback((t: ThemeName) => {
    const mode = resolvedModeRef.current;
    setPreferredAppThemeState((prev) => {
      const preferredAppThemeNext = withPreferredApp(prev, mode, t);
      setAppearanceModeState((am) => {
        setPreferredCodeThemeState((code) => {
          const state: AppearanceState = {
            appearanceMode: am,
            preferredAppTheme: preferredAppThemeNext,
            preferredCodeTheme: code,
          };
          persistAppearanceState(state);
          emit(APPEARANCE_SYNC_EVENT, state).catch(() => {});
          return code;
        });
        return am;
      });
      return preferredAppThemeNext;
    });
  }, []);

  const setCodeTheme = useCallback((id: string) => {
    const mode = resolvedModeRef.current;
    setPreferredCodeThemeState((prev) => {
      const preferredCodeThemeNext = withPreferredCode(prev, mode, id);
      setAppearanceModeState((am) => {
        setPreferredAppThemeState((app) => {
          const state: AppearanceState = {
            appearanceMode: am,
            preferredAppTheme: app,
            preferredCodeTheme: preferredCodeThemeNext,
          };
          persistAppearanceState(state);
          emit(APPEARANCE_SYNC_EVENT, state).catch(() => {});
          return app;
        });
        return am;
      });
      return preferredCodeThemeNext;
    });
  }, []);

  // ── 监听代码块工具栏发起的主题切换请求 ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ themeId: string }>).detail;
      if (detail?.themeId) {
        setCodeTheme(detail.themeId);
      }
    };
    window.addEventListener("request-code-theme-change", handler as EventListener);
    return () => window.removeEventListener("request-code-theme-change", handler as EventListener);
  }, [setCodeTheme]);

  const importCodeTheme = useCallback(async (filePath: string, name: string): Promise<CustomCodeTheme> => {
    const manifest = await importCodeThemeFile(filePath, name);
    const css = await getCodeThemeCss(manifest.id);
    if (css) {
      const style = document.createElement("style");
      style.id = `code-theme-${manifest.id}`;
      style.textContent = css;
      style.disabled = true;
      document.head.appendChild(style);
      emit(CODE_THEME_CSS_EVENT, { id: manifest.id, css, enable: false } satisfies CodeThemeCssPayload).catch(() => {});
    }
    setCustomCodeThemes((prev) => [...prev, manifest]);
    return manifest;
  }, []);

  const deleteCodeTheme = useCallback(async (id: string) => {
    await deleteCodeThemeFile(id);
    const style = document.getElementById(`code-theme-${id}`);
    if (style) style.remove();
    setCustomCodeThemes((prev) => prev.filter((m) => m.id !== id));
    setPreferredCodeThemeState((prev) => {
      const next = { ...prev };
      if (next.light === id) next.light = DEFAULT_CODE_THEME_PAIR.light;
      if (next.dark === id) next.dark = DEFAULT_CODE_THEME_PAIR.dark;
      setAppearanceModeState((am) => {
        setPreferredAppThemeState((app) => {
          const state: AppearanceState = {
            appearanceMode: am,
            preferredAppTheme: app,
            preferredCodeTheme: next,
          };
          persistAppearanceState(state);
          emit(APPEARANCE_SYNC_EVENT, state).catch(() => {});
          return app;
        });
        return am;
      });
      return next;
    });
  }, []);

  const previewCodeThemeVariables = useCallback((id: string, variables: ThemeVariable[]) => {
    const css = buildCodeThemeCss(variables);
    injectOrUpdateCodeThemeStyle(id, css, true);
  }, [injectOrUpdateCodeThemeStyle]);

  const updateCodeThemeVariables = useCallback(async (
    id: string,
    variables: ThemeVariable[],
    isDark?: boolean,
  ) => {
    const manifest = await persistCodeThemeVariables(id, variables, isDark);
    const css = buildCodeThemeCss(variables);
    injectOrUpdateCodeThemeStyle(id, css, codeThemeRef.current === id);
    if (manifest) {
      setCustomCodeThemes((prev) => prev.map((m) => (m.id === id ? manifest : m)));
    }
  }, [injectOrUpdateCodeThemeStyle]);

  const createCodeThemeFromBuiltin = useCallback(async (builtinId: string, name: string) => {
    const vars = getBuiltinCodeThemeVariables(builtinId);
    if (!vars) throw new Error(`Unknown builtin code theme: ${builtinId}`);
    const isDark = getBuiltinCodeThemeIsDark(builtinId);
    const manifest = await createCodeThemeFromVariablesFs(name, vars, isDark);
    const css = await getCodeThemeCss(manifest.id);
    if (css) {
      injectOrUpdateCodeThemeStyle(manifest.id, css, false);
    }
    setCustomCodeThemes((prev) => [...prev, manifest]);
    return manifest;
  }, [injectOrUpdateCodeThemeStyle]);

  const importTheme = useCallback(async (filePath: string, name: string): Promise<ThemeManifest> => {
    const manifest = await importThemeManager(filePath, name);
    const css = await getCustomThemeCss(manifest.id);
    injectOrUpdateStyle(manifest.id, css, false);
    emit(THEME_CSS_EVENT, { id: manifest.id, css, enable: false } satisfies ThemeCssPayload).catch(() => {});
    setCustomThemes((prev) => [...prev, manifest]);
    return manifest;
  }, [injectOrUpdateStyle]);

  const deleteTheme = useCallback(async (id: string) => {
    await deleteThemeManager(id);
    const style = styleElementsRef.current.get(id);
    if (style) {
      style.remove();
      styleElementsRef.current.delete(id);
    }
    setCustomThemes((prev) => prev.filter((m) => m.id !== id));
    const fullId = `custom-${id}`;
    setPreferredAppThemeState((prev) => {
      const next = { ...prev };
      if (next.light === fullId) next.light = DEFAULT_APP_THEME_PAIR.light;
      if (next.dark === fullId) next.dark = DEFAULT_APP_THEME_PAIR.dark;
      setAppearanceModeState((am) => {
        setPreferredCodeThemeState((code) => {
          const state: AppearanceState = {
            appearanceMode: am,
            preferredAppTheme: next,
            preferredCodeTheme: code,
          };
          persistAppearanceState(state);
          emit(APPEARANCE_SYNC_EVENT, state).catch(() => {});
          return code;
        });
        return am;
      });
      return next;
    });
  }, []);

  const previewThemeVariables = useCallback((id: string, variables: ThemeVariable[]) => {
    const css = buildThemeCss(id, variables);
    injectOrUpdateStyle(id, css, true);
    emit(THEME_CSS_EVENT, { id, css, enable: true } satisfies ThemeCssPayload).catch(() => {});
  }, [injectOrUpdateStyle]);

  const updateThemeVariables = useCallback(async (id: string, variables: ThemeVariable[]) => {
    const manifest = await persistThemeVariables(id, variables);
    const css = buildThemeCss(id, variables);
    const enable = themeRef.current === `custom-${id}`;
    injectOrUpdateStyle(id, css, enable);
    emit(THEME_CSS_EVENT, { id, css, enable } satisfies ThemeCssPayload).catch(() => {});
    if (manifest) {
      setCustomThemes((prev) => prev.map((m) => (m.id === id ? manifest : m)));
    }
  }, [injectOrUpdateStyle]);

  const registerNewTheme = useCallback(async (manifest: ThemeManifest) => {
    const css = await getCustomThemeCss(manifest.id);
    injectOrUpdateStyle(manifest.id, css, false);
    emit(THEME_CSS_EVENT, { id: manifest.id, css, enable: false } satisfies ThemeCssPayload).catch(() => {});
    setCustomThemes((prev) => [...prev, manifest]);
    return manifest;
  }, [injectOrUpdateStyle]);

  const createThemeFromBuiltin = useCallback(async (builtinId: string, name: string) => {
    const vars = getBuiltinThemeVariables(builtinId);
    if (!vars) throw new Error(`Unknown builtin theme: ${builtinId}`);
    const isDark = inferThemeIdIsDark(builtinId);
    const manifest = await createThemeFromVariablesFs(name, vars, isDark);
    await registerNewTheme(manifest);
    return manifest;
  }, [registerNewTheme]);

  const createThemeFromTemplate = useCallback(async (kind: "light" | "dark", name: string) => {
    const vars = getTemplateVariables(kind);
    const manifest = await createThemeFromVariablesFs(name, vars, kind === "dark");
    await registerNewTheme(manifest);
    return manifest;
  }, [registerNewTheme]);

  const renameAppTheme = useCallback(async (id: string, name: string) => {
    const manifest = await renameThemeFs(id, name);
    if (manifest) {
      setCustomThemes((prev) => prev.map((m) => (m.id === id ? manifest : m)));
    }
  }, []);

  const renameCodeTheme = useCallback(async (id: string, name: string) => {
    const manifest = await renameCodeThemeFs(id, name);
    if (manifest) {
      setCustomCodeThemes((prev) => prev.map((m) => (m.id === id ? manifest : m)));
    }
  }, []);

  const resolveAppDisplayName = useCallback((id: string) => {
    if (id.startsWith("custom-")) {
      const mid = id.replace("custom-", "");
      return customThemes.find((m) => m.id === mid)?.name || id;
    }
    return id;
  }, [customThemes]);

  const resolveCodeDisplayName = useCallback((id: string) => {
    const builtin = CODE_THEMES.find((c) => c.id === id);
    if (builtin) return builtin.name;
    return customCodeThemes.find((m) => m.id === id)?.name || id;
  }, [customCodeThemes]);

  const exportCurrentThemePack = useCallback(async (packName: string) => {
    const pack = await buildThemePack({
      name: packName,
      preferredAppTheme,
      preferredCodeTheme,
      resolveAppName: resolveAppDisplayName,
      resolveCodeName: resolveCodeDisplayName,
    });
    return exportThemePackToFile(pack);
  }, [preferredAppTheme, preferredCodeTheme, resolveAppDisplayName, resolveCodeDisplayName]);

  const importThemePack = useCallback(async () => {
    const picked = await pickAndReadThemePackFile();
    if (!picked) return null;
    const result = await importThemePackData(picked.pack);

    // Inject app theme styles
    for (const fullId of [result.preferredAppTheme.light, result.preferredAppTheme.dark]) {
      const id = fullId.replace("custom-", "");
      try {
        const css = await getCustomThemeCss(id);
        injectOrUpdateStyle(id, css, false);
        emit(THEME_CSS_EVENT, { id, css, enable: false } satisfies ThemeCssPayload).catch(() => {});
      } catch {
        /* ignore */
      }
    }
    // Inject code theme styles
    for (const id of [result.preferredCodeTheme.light, result.preferredCodeTheme.dark]) {
      try {
        const css = await getCodeThemeCss(id);
        if (css) {
          injectOrUpdateCodeThemeStyle(id, css, false);
          emit(CODE_THEME_CSS_EVENT, { id, css, enable: false } satisfies CodeThemeCssPayload).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }

    await refreshCustomThemes();
    await refreshCustomCodeThemes();

    applyAppearancePatch({
      preferredAppTheme: result.preferredAppTheme,
      preferredCodeTheme: result.preferredCodeTheme,
    });

    return result;
  }, [
    applyAppearancePatch,
    injectOrUpdateCodeThemeStyle,
    injectOrUpdateStyle,
    refreshCustomCodeThemes,
    refreshCustomThemes,
  ]);

  bootStamp("theme_provider_render_children");
  bootEnd("theme_provider_init");
  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        appearanceMode,
        setAppearanceMode,
        resolvedMode,
        preferredAppTheme,
        preferredCodeTheme,
        setPreferredAppTheme,
        setPreferredCodeTheme,
        customThemes,
        importTheme,
        deleteTheme,
        updateThemeVariables,
        previewThemeVariables,
        createThemeFromBuiltin,
        createThemeFromTemplate,
        refreshCustomThemes,
        codeTheme,
        setCodeTheme,
        customCodeThemes,
        importCodeTheme,
        deleteCodeTheme,
        createCodeThemeFromBuiltin,
        updateCodeThemeVariables,
        previewCodeThemeVariables,
        getAppThemeIsDark,
        getCodeThemeIsDark,
        renameAppTheme,
        renameCodeTheme,
        exportCurrentThemePack,
        importThemePack,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
