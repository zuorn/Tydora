import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { isBuiltinTheme } from "./ThemeManager";

export type ThemeName = string;

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "mint",
  setTheme: () => {},
});

const STORAGE_KEY = "zmd-theme";
const EVENT_NAME = "theme-changed";

const LIGHT_THEMES = new Set(["white", "mint", "liquid-glass", "claude-code", "purple", "hermes", "next"]);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved || "mint";
    } catch {
      return "mint";
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.dataset.theme = isBuiltinTheme(theme) ? theme : "mint";

    const link = document.querySelector('link[data-highlight-theme]') as HTMLLinkElement | null;
    if (link) {
      const style = LIGHT_THEMES.has(theme) ? "atom-one-light" : "atom-one-dark";
      link.href = `/vditor/dist/js/highlight.js/styles/${style}.min.css`;
    }
  }, [theme]);

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

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    emit(EVENT_NAME, t).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
