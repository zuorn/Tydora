import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { isBuiltinTheme } from "./ThemeManager";
import { getCodeThemeVariables, getDefaultCodeTheme } from "./codeThemes";
import {
  loadManifest,
  importTheme as importThemeManager,
  deleteTheme as deleteThemeManager,
  getCustomThemeCss,
  saveThemeCss,
  buildThemeCss,
  loadCodeThemeManifest,
  importCodeThemeFile,
  deleteCodeThemeFile,
  getCodeThemeCss,
  type ThemeManifest,
  type ThemeVariable,
} from "./CustomThemeManager";
import { type CustomCodeTheme } from "./codeThemes";

export type ThemeName = string;

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  customThemes: ThemeManifest[];
  importTheme: (filePath: string, name: string) => Promise<ThemeManifest>;
  deleteTheme: (id: string) => Promise<void>;
  updateThemeVariables: (id: string, variables: ThemeVariable[]) => Promise<void>;
  refreshCustomThemes: () => Promise<void>;
  codeTheme: string;
  setCodeTheme: (id: string) => void;
  customCodeThemes: CustomCodeTheme[];
  importCodeTheme: (filePath: string, name: string) => Promise<CustomCodeTheme>;
  deleteCodeTheme: (id: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "mint",
  setTheme: () => {},
  customThemes: [],
  importTheme: async () => ({ id: "", name: "", fileName: "", importedAt: "" }),
  deleteTheme: async () => {},
  updateThemeVariables: async () => {},
  refreshCustomThemes: async () => {},
  codeTheme: "github-light",
  setCodeTheme: () => {},
  customCodeThemes: [],
  importCodeTheme: async () => ({ id: "", name: "", fileName: "", importedAt: "", isDark: false }),
  deleteCodeTheme: async () => {},
});

const STORAGE_KEY = "zmd-theme";
const EVENT_NAME = "theme-changed";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved || "mint";
    } catch {
      return "mint";
    }
  });

  const [customThemes, setCustomThemes] = useState<ThemeManifest[]>([]);
  const styleElementsRef = useRef<Map<string, HTMLStyleElement>>(new Map());

  const CODE_THEME_KEY = "zmd-code-theme";

  const [codeTheme, setCodeThemeState] = useState<string>(() => {
    try {
      return localStorage.getItem(CODE_THEME_KEY) || "github-light";
    } catch {
      return "github-light";
    }
  });

  const [customCodeThemes, setCustomCodeThemes] = useState<CustomCodeTheme[]>([]);

  // ── Load custom themes on mount ──
  const refreshCustomThemes = useCallback(async () => {
    try {
      const manifests = await loadManifest();
      setCustomThemes(manifests);

      // Inject <style> elements for each custom theme
      for (const m of manifests) {
        if (!styleElementsRef.current.has(m.id)) {
          try {
            const css = await getCustomThemeCss(m.id);
            const style = document.createElement("style");
            style.id = `custom-theme-${m.id}`;
            style.textContent = css;
            style.disabled = true;
            document.head.appendChild(style);
            styleElementsRef.current.set(m.id, style);
          } catch {}
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshCustomThemes();
  }, [refreshCustomThemes]);

  // ── Load custom code themes on mount ──
  const refreshCustomCodeThemes = useCallback(async () => {
    try {
      const manifests = await loadCodeThemeManifest();
      setCustomCodeThemes(manifests);

      for (const m of manifests) {
        const existing = document.getElementById(`code-theme-${m.id}`);
        if (!existing) {
          const css = await getCodeThemeCss(m.id);
          if (css) {
            const style = document.createElement("style");
            style.id = `code-theme-${m.id}`;
            style.textContent = css;
            (style as HTMLStyleElement).disabled = true;
            document.head.appendChild(style);
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshCustomCodeThemes();
  }, [refreshCustomCodeThemes]);

  // ── Apply theme ──
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);

    if (isBuiltinTheme(theme)) {
      document.documentElement.dataset.theme = theme;
      // Disable all custom theme style elements
      styleElementsRef.current.forEach((style) => {
        style.disabled = true;
      });
    } else if (theme.startsWith("custom-")) {
      // Custom theme: extract id from "custom-{id}"
      const id = theme.replace("custom-", "");
      const style = styleElementsRef.current.get(id);
      if (style) {
        // Disable all custom theme style elements first
        styleElementsRef.current.forEach((s) => {
          s.disabled = true;
        });
        // Enable the active one
        style.disabled = false;
      }
      document.documentElement.dataset.theme = theme;
    } else {
      // Unknown theme, fallback to mint
      document.documentElement.dataset.theme = "mint";
    }
  }, [theme]);

  // ── Apply code theme CSS variables ──
  useEffect(() => {
    localStorage.setItem(CODE_THEME_KEY, codeTheme);

    // Disable all custom code theme styles
    customCodeThemes.forEach((m) => {
      const style = document.getElementById(`code-theme-${m.id}`) as HTMLStyleElement | null;
      if (style) style.disabled = true;
    });

    // Remove built-in code theme style
    const existing = document.getElementById("code-theme-vars");
    if (existing) existing.remove();

    // Determine which theme to use
    let actualThemeId = codeTheme;
    if (codeTheme === "auto") {
      const isDark = document.documentElement.dataset.theme?.includes("dark") ||
                     document.documentElement.dataset.theme === "mint-dark";
      actualThemeId = getDefaultCodeTheme(isDark);
    }

    if (actualThemeId.startsWith("custom-")) {
      const style = document.getElementById(`code-theme-${actualThemeId}`) as HTMLStyleElement | null;
      if (style) style.disabled = false;
    } else {
      // Get variables and inject as CSS
      const vars = getCodeThemeVariables(actualThemeId);
      if (Object.keys(vars).length > 0) {
        const css = `:root { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(" ")} }`;
        const style = document.createElement("style");
        style.id = "code-theme-vars";
        style.textContent = css;
        document.head.appendChild(style);
      }
    }
  }, [codeTheme, theme, customCodeThemes]);

  // ── Listen for theme changes from other windows ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<ThemeName>(EVENT_NAME, (event) => {
      const newTheme = event.payload;
      setThemeState(newTheme);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // ── Theme actions ──
  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    emit(EVENT_NAME, t).catch(() => {});
  }, []);

  const setCodeTheme = useCallback((id: string) => {
    setCodeThemeState(id);
  }, []);

  const importCodeTheme = useCallback(async (filePath: string, name: string): Promise<CustomCodeTheme> => {
    const manifest = await importCodeThemeFile(filePath, name);
    const css = await getCodeThemeCss(manifest.id);
    if (css) {
      const style = document.createElement("style");
      style.id = `code-theme-${manifest.id}`;
      style.textContent = css;
      style.disabled = true;
      document.head.appendChild(style);
    }
    setCustomCodeThemes((prev) => [...prev, manifest]);
    return manifest;
  }, []);

  const deleteCodeTheme = useCallback(async (id: string) => {
    await deleteCodeThemeFile(id);
    const style = document.getElementById(`code-theme-${id}`);
    if (style) style.remove();
    setCustomCodeThemes((prev) => prev.filter((m) => m.id !== id));
    if (codeTheme === id) {
      setCodeThemeState("auto");
    }
  }, [codeTheme]);

  const importTheme = useCallback(async (filePath: string, name: string): Promise<ThemeManifest> => {
    const manifest = await importThemeManager(filePath, name);
    // Inject the new style element
    const css = await getCustomThemeCss(manifest.id);
    const style = document.createElement("style");
    style.id = `custom-theme-${manifest.id}`;
    style.textContent = css;
    style.disabled = true;
    document.head.appendChild(style);
    styleElementsRef.current.set(manifest.id, style);
    // Update state
    setCustomThemes((prev) => [...prev, manifest]);
    return manifest;
  }, []);

  const deleteTheme = useCallback(async (id: string) => {
    await deleteThemeManager(id);
    // Remove style element
    const style = styleElementsRef.current.get(id);
    if (style) {
      style.remove();
      styleElementsRef.current.delete(id);
    }
    // Update state
    setCustomThemes((prev) => prev.filter((m) => m.id !== id));
    // If the deleted theme was active, switch to mint
    if (theme === `custom-${id}`) {
      setTheme("mint");
    }
  }, [theme, setTheme]);

  const updateThemeVariables = useCallback(async (id: string, variables: ThemeVariable[]) => {
    const css = buildThemeCss(id, variables);
    await saveThemeCss(id, css);
    // Update the style element
    const style = styleElementsRef.current.get(id);
    if (style) {
      style.textContent = css;
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        customThemes,
        importTheme,
        deleteTheme,
        updateThemeVariables,
        refreshCustomThemes,
        codeTheme,
        setCodeTheme,
        customCodeThemes,
        importCodeTheme,
        deleteCodeTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
