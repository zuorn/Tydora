import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { applyTyporaTheme, removeTyporaTheme, isBuiltinTheme } from "./ThemeManager";

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

const LIGHT_THEMES = new Set(["white", "mint", "liquid-glass", "claude-code", "purple", "hermes"]);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved || "mint";
    } catch {
      return "mint";
    }
  });

  // 应用主题到 DOM 和 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);

    if (isBuiltinTheme(theme)) {
      document.documentElement.dataset.theme = theme;
      removeTyporaTheme();
    } else {
      delete document.documentElement.dataset.theme;
      applyTyporaTheme(theme);
    }

    // 切换 highlight.js 代码高亮主题
    const link = document.querySelector('link[data-highlight-theme]') as HTMLLinkElement | null;
    if (link) {
      const style = LIGHT_THEMES.has(theme) || !isBuiltinTheme(theme) ? "atom-one-light" : "atom-one-dark";
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
