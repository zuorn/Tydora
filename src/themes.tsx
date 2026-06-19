import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type ThemeName = "catppuccin-mocha" | "white" | "mint" | "mint-dark";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "mint",
  setTheme: () => {},
});

const STORAGE_KEY = "zmd-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "catppuccin-mocha" || saved === "white" || saved === "mint" || saved === "mint-dark") return saved;
    } catch {}
    return "mint";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);

    // 切换 highlight.js 代码高亮主题
    const link = document.querySelector('link[data-highlight-theme]') as HTMLLinkElement | null;
    if (link) {
      const style = theme === "white" || theme === "mint" ? "atom-one-light" : "atom-one-dark";
      link.href = `/vditor/dist/js/highlight.js/styles/${style}.min.css`;
    }
  }, [theme]);

  const setTheme = (t: ThemeName) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
