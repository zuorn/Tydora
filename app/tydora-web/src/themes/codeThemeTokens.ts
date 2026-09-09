import type { ThemeVariable } from "./CustomThemeManager";
import { CODE_THEMES } from "./codeThemes";

export interface CodeThemeColorToken {
  name: string;
  /** i18n key under settings.theme.token.* */
  labelKey: string;
  fallback: string;
}

/** Editable highlight tokens for the code theme editor. */
export const CODE_THEME_COLOR_SCHEMA: CodeThemeColorToken[] = [
  { name: "--hljs-keyword", labelKey: "hljsKeyword", fallback: "#d73a49" },
  { name: "--hljs-string", labelKey: "hljsString", fallback: "#032f62" },
  { name: "--hljs-comment", labelKey: "hljsComment", fallback: "#6a737d" },
  { name: "--hljs-number", labelKey: "hljsNumber", fallback: "#005cc5" },
  { name: "--hljs-built_in", labelKey: "hljsBuiltIn", fallback: "#e36209" },
];

export const CODE_THEME_SAMPLE_SNIPPETS: { id: string; language: string; labelKey: string; code: string }[] = [
  {
    id: "javascript",
    language: "javascript",
    labelKey: "codeSampleJs",
    code: `function greet(name) {\n  // say hello\n  return \`Hi, \${name}!\`;\n}\n\nconst answer = 42;\nconsole.log(greet("Tydora"));`,
  },
  {
    id: "python",
    language: "python",
    labelKey: "codeSamplePython",
    code: `def greet(name: str) -> str:\n    # say hello\n    return f"Hi, {name}!"\n\nanswer = 42\nprint(greet("Tydora"))`,
  },
  {
    id: "css",
    language: "css",
    labelKey: "codeSampleCss",
    code: `.card {\n  /* surface */\n  color: #1e293b;\n  background: rgba(78, 178, 137, 0.08);\n  border-radius: 8px;\n}`,
  },
  {
    id: "cpp",
    language: "cpp",
    labelKey: "codeSampleCpp",
    code: `#include <cstdio>\n\n// greet helper\nint main() {\n  const char* name = "Tydora";\n  int answer = 42;\n  printf("%s %d\\n", name, answer);\n  return sizeof(int);\n}`,
  },
  {
    id: "rust",
    language: "rust",
    labelKey: "codeSampleRust",
    code: `fn greet(name: &str) -> String {\n    // say hello\n    format!("Hi, {}!", name)\n}\n\nfn main() {\n    let answer: i32 = 42;\n    println!("{} {}", greet("Tydora"), answer);\n}`,
  },
];

/** Convert a builtin code theme id into ThemeVariable[]. */
export function getBuiltinCodeThemeVariables(builtinId: string): ThemeVariable[] | null {
  const theme = CODE_THEMES.find((t) => t.id === builtinId);
  if (!theme) return null;
  return CODE_THEME_COLOR_SCHEMA.map((token) => ({
    name: token.name,
    value: theme.variables[token.name] ?? token.fallback,
    type: "color" as const,
  }));
}

/** Ensure all schema tokens exist; fill gaps from fallback / optional map. */
export function mergeCodeThemeWithSchema(
  variables: ThemeVariable[],
  fallbackMap?: Record<string, string>,
): ThemeVariable[] {
  const byName = new Map(variables.map((v) => [v.name, v]));
  return CODE_THEME_COLOR_SCHEMA.map((token) => {
    const existing = byName.get(token.name);
    if (existing) {
      return { name: token.name, value: existing.value, type: "color" as const };
    }
    return {
      name: token.name,
      value: fallbackMap?.[token.name] ?? token.fallback,
      type: "color" as const,
    };
  });
}

export function codeThemeVariablesToRecord(variables: ThemeVariable[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of variables) {
    if (v.name.startsWith("--hljs-")) out[v.name] = v.value;
  }
  return out;
}

export function codeThemeVarsToPreviewStyle(
  variables: ThemeVariable[],
): Record<string, string> {
  return codeThemeVariablesToRecord(variables);
}

export function getBuiltinCodeThemeIsDark(builtinId: string): boolean {
  return CODE_THEMES.find((t) => t.id === builtinId)?.isDark ?? false;
}
