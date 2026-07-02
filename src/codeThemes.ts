// src/codeThemes.ts

export interface CodeTheme {
  id: string;
  name: string;
  isDark: boolean;
  variables: Record<string, string>;
}

export interface CustomCodeTheme {
  id: string;
  name: string;
  fileName: string;
  importedAt: string;
  isDark: boolean;
}

export const CODE_THEMES: CodeTheme[] = [
  // Light themes
  {
    id: "github-light",
    name: "GitHub Light",
    isDark: false,
    variables: {
      "--hljs-keyword": "#d73a49",
      "--hljs-string": "#032f62",
      "--hljs-comment": "#6a737d",
      "--hljs-number": "#005cc5",
      "--hljs-built_in": "#e36209",
    },
  },
  {
    id: "atom-one-light",
    name: "Atom One Light",
    isDark: false,
    variables: {
      "--hljs-keyword": "#a626a4",
      "--hljs-string": "#50a14f",
      "--hljs-comment": "#a0a1a7",
      "--hljs-number": "#986801",
      "--hljs-built_in": "#c18401",
    },
  },
  {
    id: "vscode-light",
    name: "VS Code Light",
    isDark: false,
    variables: {
      "--hljs-keyword": "#0000ff",
      "--hljs-string": "#a31515",
      "--hljs-comment": "#008000",
      "--hljs-number": "#098658",
      "--hljs-built_in": "#267f99",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    isDark: false,
    variables: {
      "--hljs-keyword": "#859900",
      "--hljs-string": "#2aa198",
      "--hljs-comment": "#93a1a1",
      "--hljs-number": "#d33682",
      "--hljs-built_in": "#cb4b16",
    },
  },
  // Dark themes
  {
    id: "github-dark",
    name: "GitHub Dark",
    isDark: true,
    variables: {
      "--hljs-keyword": "#ff7b72",
      "--hljs-string": "#a5d6ff",
      "--hljs-comment": "#8b949e",
      "--hljs-number": "#79c0ff",
      "--hljs-built_in": "#ffa657",
    },
  },
  {
    id: "atom-one-dark",
    name: "Atom One Dark",
    isDark: true,
    variables: {
      "--hljs-keyword": "#c678dd",
      "--hljs-string": "#98c379",
      "--hljs-comment": "#5c6370",
      "--hljs-number": "#d19a66",
      "--hljs-built_in": "#e6c07b",
    },
  },
  {
    id: "vscode-dark",
    name: "VS Code Dark",
    isDark: true,
    variables: {
      "--hljs-keyword": "#569cd6",
      "--hljs-string": "#ce9178",
      "--hljs-comment": "#6a9955",
      "--hljs-number": "#b5cea8",
      "--hljs-built_in": "#4ec9b0",
    },
  },
  {
    id: "nord",
    name: "Nord",
    isDark: true,
    variables: {
      "--hljs-keyword": "#81a1c1",
      "--hljs-string": "#a3be8c",
      "--hljs-comment": "#616e88",
      "--hljs-number": "#b48ead",
      "--hljs-built_in": "#8fbcbb",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    isDark: true,
    variables: {
      "--hljs-keyword": "#f92672",
      "--hljs-string": "#e6db74",
      "--hljs-comment": "#75715e",
      "--hljs-number": "#ae81ff",
      "--hljs-built_in": "#66d9ef",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    isDark: true,
    variables: {
      "--hljs-keyword": "#ff79c6",
      "--hljs-string": "#f1fa8c",
      "--hljs-comment": "#6272a4",
      "--hljs-number": "#bd93f9",
      "--hljs-built_in": "#8be9fd",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    isDark: true,
    variables: {
      "--hljs-keyword": "#859900",
      "--hljs-string": "#2aa198",
      "--hljs-comment": "#586e75",
      "--hljs-number": "#d33682",
      "--hljs-built_in": "#cb4b16",
    },
  },
];

export function getCodeThemeVariables(themeId: string): Record<string, string> {
  const theme = CODE_THEMES.find((t) => t.id === themeId);
  return theme?.variables || {};
}

export function getDefaultCodeTheme(isDark: boolean): string {
  return isDark ? "github-dark" : "github-light";
}