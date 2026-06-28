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
