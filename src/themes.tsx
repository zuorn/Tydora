import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { emit, listen } from "@tauri-apps/api/event";

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
const EVENT_NAME = "theme-changed";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "catppuccin-mocha" || saved === "white" || saved === "mint" || saved === "mint-dark") return saved;
    } catch {}
    return "mint";
  });

  // 应用主题到 DOM 和 localStorage
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

  // 监听其他窗口的主题更改事件
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

  // 设置主题并广播到其他窗口
  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    emit(EVENT_NAME, t).catch(() => {
      // 忽略广播错误（可能在非 Tauri 环境）
    });
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