import { invoke } from "@tauri-apps/api/core";

export interface ThemeInfo {
  name: string;
  file_path: string;
}

export const BUILTIN_THEMES = [
  "catppuccin-mocha",
  "white",
  "mint",
  "mint-dark",
  "liquid-glass",
  "claude-code",
  "purple",
  "hermes",
] as const;

export type BuiltinThemeName = (typeof BUILTIN_THEMES)[number];

export function isBuiltinTheme(theme: string): theme is BuiltinThemeName {
  return (BUILTIN_THEMES as readonly string[]).includes(theme);
}

export async function getThemeDir(): Promise<string> {
  return invoke<string>("get_default_theme_dir");
}

export async function getUserThemes(themeDir: string): Promise<ThemeInfo[]> {
  return invoke<ThemeInfo[]>("list_themes", { themeDir });
}

export function applyTyporaTheme(cssPath: string): void {
  removeTyporaTheme();

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `asset://localhost/${encodeURIComponent(cssPath)}`;
  link.dataset.typoraTheme = cssPath;
  document.head.appendChild(link);
}

export function removeTyporaTheme(): void {
  const existing = document.querySelector<HTMLLinkElement>(
    'link[data-typora-theme]',
  );
  if (existing) existing.remove();
}
