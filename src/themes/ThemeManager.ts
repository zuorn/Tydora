export const BUILTIN_THEMES = [
  "white",
  "mint",
  "mint-dark",
  "liquid-glass",
  "claude-code",
  "purple",
  "hermes",
  "next",
] as const;

export type BuiltinThemeName = (typeof BUILTIN_THEMES)[number];

export function isBuiltinTheme(theme: string): theme is BuiltinThemeName {
  return (BUILTIN_THEMES as readonly string[]).includes(theme);
}

export function isCustomTheme(theme: string): boolean {
  return theme.startsWith("custom-");
}

export function getThemeIdFromCustom(customTheme: string): string | null {
  if (!customTheme.startsWith("custom-")) return null;
  return customTheme.replace("custom-", "");
}
