# Code Theme Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add code theme settings to the Theme section in Settings, with built-in themes, auto mode, and custom theme import support.

**Architecture:** Define code themes as CSS variable sets in a TypeScript module. Inject variables via a `<style>` element managed by ThemeProvider. Add UI controls to ThemeSettingsContent.

**Tech Stack:** TypeScript, React, CSS custom properties, Tauri FS API

## Global Constraints

- All code theme variables must use `--hljs-*` prefix to match existing CSS
- Auto mode: use light code theme when app theme is light, dark code theme when app theme is dark
- Custom themes stored in `{appDataDir}/code-themes/` directory
- Settings stored in localStorage key `zmd-code-theme`

---

### Task 1: Create Code Theme Definitions

**Covers:** Core code theme data structure

**Files:**
- Create: `src/codeThemes.ts`

**Interfaces:**
- Produces: `CodeTheme` type, `CODE_THEMES` array, `getCodeThemeVariables()` function

- [ ] **Step 1: Create codeThemes.ts with theme definitions**

```typescript
// src/codeThemes.ts

export interface CodeTheme {
  id: string;
  name: string;
  isDark: boolean;
  variables: Record<string, string>;
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1`
Expected: No errors

---

### Task 2: Add Code Theme State to ThemeProvider

**Covers:** Code theme state management and CSS injection

**Files:**
- Modify: `src/themes.tsx`

**Interfaces:**
- Consumes: `CODE_THEMES`, `getCodeThemeVariables`, `getDefaultCodeTheme` from codeThemes.ts
- Produces: `codeTheme` and `setCodeTheme` in ThemeContextValue

- [ ] **Step 1: Update ThemeContextValue interface**

Add to `src/themes.tsx`:

```typescript
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
}
```

- [ ] **Step 2: Add codeTheme state and localStorage persistence**

Add after the existing state declarations:

```typescript
const CODE_THEME_KEY = "zmd-code-theme";

const [codeTheme, setCodeThemeState] = useState<string>(() => {
  try {
    return localStorage.getItem(CODE_THEME_KEY) || "github-light";
  } catch {
    return "github-light";
  }
});
```

- [ ] **Step 3: Add useEffect to inject code theme CSS variables**

```typescript
useEffect(() => {
  localStorage.setItem(CODE_THEME_KEY, codeTheme);

  // Remove existing code theme style element
  const existing = document.getElementById("code-theme-vars");
  if (existing) existing.remove();

  // Determine which theme to use
  let actualThemeId = codeTheme;
  if (codeTheme === "auto") {
    const isDark = document.documentElement.dataset.theme?.includes("dark") ||
                   document.documentElement.dataset.theme === "mint-dark";
    actualThemeId = getDefaultCodeTheme(isDark);
  }

  // Get variables and inject as CSS
  const vars = getCodeThemeVariables(actualThemeId);
  if (Object.keys(vars).length > 0) {
    const css = `:root { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(" ")} }`;
    const style = document.createElement("style");
    style.id = "code-theme-vars";
    style.textContent = css;
    document.head.appendChild(style);
  }
}, [codeTheme, theme]); // Re-run when app theme changes for auto mode
```

- [ ] **Step 4: Update setCodeTheme function**

```typescript
const setCodeTheme = useCallback((id: string) => {
  setCodeThemeState(id);
}, []);
```

- [ ] **Step 5: Update ThemeContext.Provider value**

```typescript
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
  }}
>
```

- [ ] **Step 6: Update default context value**

```typescript
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
});
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1`
Expected: No errors

---

### Task 3: Add Code Theme UI to Settings

**Covers:** Code theme selector in Theme settings

**Files:**
- Modify: `src/Settings.tsx`
- Modify: `src/Settings.css`

**Interfaces:**
- Consumes: `codeTheme`, `setCodeTheme` from useTheme()

- [ ] **Step 1: Add CODE_THEMES import to Settings.tsx**

Add at top of file:

```typescript
import { CODE_THEMES } from "./codeThemes";
```

- [ ] **Step 2: Add codeTheme destructuring in ThemeSettingsContent**

Update the destructuring:

```typescript
const { customThemes, importTheme, deleteTheme, updateThemeVariables, codeTheme, setCodeTheme } = useTheme();
```

- [ ] **Step 3: Add code theme section to ThemeSettingsContent JSX**

Add after the custom themes section (before the name dialog):

```tsx
<h3 className="settings-section-title">代码主题</h3>
<div className="settings-code-theme-row">
  <label className="settings-item-label">代码高亮主题</label>
  <select
    className="settings-select"
    value={codeTheme}
    onChange={(e) => setCodeTheme(e.target.value)}
  >
    <option value="auto">跟随应用主题</option>
    <optgroup label="浅色主题">
      {CODE_THEMES.filter((t) => !t.isDark).map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </optgroup>
    <optgroup label="深色主题">
      {CODE_THEMES.filter((t) => t.isDark).map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </optgroup>
  </select>
</div>
<div className="settings-code-theme-preview">
  <div className="settings-code-theme-preview-title">预览</div>
  <pre className="settings-code-theme-preview-code">
    <code>{`function greet(name) {
  console.log("Hello, " + name);
  return 42;
}`}</code>
  </pre>
</div>
```

- [ ] **Step 4: Add CSS styles for code theme UI**

Add to `src/Settings.css`:

```css
/* ── Code Theme Settings ──────────────────────────────────────── */

.settings-code-theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border-radius: 6px;
  margin-bottom: 12px;
}

.settings-code-theme-preview {
  background: var(--bg-secondary);
  border-radius: 6px;
  overflow: hidden;
}

.settings-code-theme-preview-title {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
}

.settings-code-theme-preview-code {
  margin: 0;
  padding: 16px;
  font-family: "Cascadia Code", "JetBrains Mono", "Fira Code", monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 6: Verify Vite build**

Run: `npx vite build 2>&1 | grep "✓ built"`
Expected: Build succeeds

---

### Task 4: Remove Duplicate Code Theme from Editor Settings

**Covers:** Clean up duplicate setting

**Files:**
- Modify: `src/Settings.tsx`

**Interfaces:**
- Consumes: None
- Produces: None (removal only)

- [ ] **Step 1: Remove codeTheme from EditorSettings interface**

Remove from `EditorSettings`:

```typescript
// REMOVE THIS LINE:
codeTheme: "auto" | "github" | "atom-one-light" | "atom-one-dark" | "vs" | "nord" | "monokai" | "dracula" | "solarized-light" | "solarized-dark";
```

- [ ] **Step 2: Remove codeTheme from DEFAULT_EDITOR_SETTINGS**

Remove from `DEFAULT_EDITOR_SETTINGS`:

```typescript
// REMOVE THIS LINE:
codeTheme: "auto",
```

- [ ] **Step 3: Remove code theme UI from EditorSettingsContent**

Find and remove the code theme section in `EditorSettingsContent` (around line 1364):

```tsx
// REMOVE THIS SECTION:
<h3 className="settings-section-title">代码高亮</h3>
<div className="settings-item">
  <label className="settings-item-label">代码行号</label>
  ...
</div>
<div className="settings-item">
  <label className="settings-item-label">代码主题</label>
  <select ...>
    ...
  </select>
</div>
```

Keep only the 代码行号 setting, remove the 代码主题 select.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1`
Expected: No errors

---

### Task 5: Add Custom Code Theme Import Support

**Covers:** Custom code theme import functionality

**Files:**
- Modify: `src/codeThemes.ts`
- Modify: `src/CustomThemeManager.ts`
- Modify: `src/themes.tsx`
- Modify: `src/Settings.tsx`
- Modify: `src/Settings.css`

**Interfaces:**
- Consumes: CustomThemeManager functions
- Produces: `importCodeTheme`, `deleteCodeTheme`, `customCodeThemes` in ThemeContext

- [ ] **Step 1: Add CustomCodeTheme interface to codeThemes.ts**

```typescript
export interface CustomCodeTheme {
  id: string;
  name: string;
  fileName: string;
  importedAt: string;
  isDark: boolean;
}
```

- [ ] **Step 2: Add code theme functions to CustomThemeManager.ts**

Add these functions:

```typescript
// ── Code Theme Operations ──────────────────────────────────────

const CODE_THEMES_DIR = "code-themes";

async function getCodeThemesDir(): Promise<string> {
  const baseDir = await appDataDir();
  const sep = navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
  return `${baseDir}${sep}${CODE_THEMES_DIR}`;
}

async function ensureCodeThemesDir(): Promise<string> {
  const dir = await getCodeThemesDir();
  try {
    await readDir(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function loadCodeThemeManifest(): Promise<CustomCodeTheme[]> {
  try {
    const dir = await ensureCodeThemesDir();
    const content = await readTextFile(joinPath(dir, "manifest.json"));
    return JSON.parse(content) as CustomCodeTheme[];
  } catch {
    return [];
  }
}

export async function saveCodeThemeManifest(manifests: CustomCodeTheme[]): Promise<void> {
  const dir = await ensureCodeThemesDir();
  await writeTextFile(joinPath(dir, "manifest.json"), JSON.stringify(manifests, null, 2));
}

export async function importCodeThemeFile(
  filePath: string,
  displayName: string,
): Promise<CustomCodeTheme> {
  const dir = await ensureCodeThemesDir();
  const css = await readTextFile(filePath);
  const id = generateThemeId();

  // Extract variables
  const variables = parseCssVariables(css);
  const isDark = css.includes("--bg-primary") &&
    (css.includes("#1") || css.includes("#2") || css.includes("oklch(0"));

  // Build processed CSS with :root selector
  const processedCss = `:root {\n${variables.map((v) => `  ${v.name}: ${v.value};`).join("\n")}\n}`;

  const fileName = `${id}.css`;
  await writeTextFile(joinPath(dir, fileName), processedCss);

  const manifests = await loadCodeThemeManifest();
  const manifest: CustomCodeTheme = {
    id: `custom-${id}`,
    name: displayName,
    fileName,
    importedAt: new Date().toISOString(),
    isDark,
  };
  manifests.push(manifest);
  await saveCodeThemeManifest(manifests);

  return manifest;
}

export async function deleteCodeThemeFile(id: string): Promise<void> {
  const dir = await ensureCodeThemesDir();
  const manifests = await loadCodeThemeManifest();
  const manifest = manifests.find((m) => m.id === id);

  if (manifest) {
    try {
      await remove(joinPath(dir, manifest.fileName));
    } catch {}
  }

  const updated = manifests.filter((m) => m.id !== id);
  await saveCodeThemeManifest(updated);
}

export async function getCodeThemeCss(id: string): Promise<string> {
  const dir = await ensureCodeThemesDir();
  const manifests = await loadCodeThemeManifest();
  const manifest = manifests.find((m) => m.id === id);
  if (!manifest) return "";
  return await readTextFile(joinPath(dir, manifest.fileName));
}
```

- [ ] **Step 3: Add code theme state to ThemeProvider**

Add to themes.tsx:

```typescript
import {
  // ... existing imports
  loadCodeThemeManifest,
  importCodeThemeFile,
  deleteCodeThemeFile,
  getCodeThemeCss,
  type CustomCodeTheme,
} from "./CustomThemeManager";
```

Add state and functions:

```typescript
const [customCodeThemes, setCustomCodeThemes] = useState<CustomCodeTheme[]>([]);

const refreshCustomCodeThemes = useCallback(async () => {
  try {
    const manifests = await loadCodeThemeManifest();
    setCustomCodeThemes(manifests);

    // Inject CSS for each custom code theme
    for (const m of manifests) {
      const existing = document.getElementById(`code-theme-${m.id}`);
      if (!existing) {
        const css = await getCodeThemeCss(m.id);
        if (css) {
          const style = document.createElement("style");
          style.id = `code-theme-${m.id}`;
          style.textContent = css;
          style.disabled = true;
          document.head.appendChild(style);
        }
      }
    }
  } catch {}
}, []);

useEffect(() => {
  refreshCustomCodeThemes();
}, [refreshCustomCodeThemes]);
```

Update code theme useEffect to handle custom themes:

```typescript
useEffect(() => {
  localStorage.setItem(CODE_THEME_KEY, codeTheme);

  // Disable all custom code theme styles
  customCodeThemes.forEach((m) => {
    const style = document.getElementById(`code-theme-${m.id}`);
    if (style) style.disabled = true;
  });

  // Remove built-in code theme style
  const existing = document.getElementById("code-theme-vars");
  if (existing) existing.remove();

  let actualThemeId = codeTheme;
  if (codeTheme === "auto") {
    const isDark = document.documentElement.dataset.theme?.includes("dark") ||
                   document.documentElement.dataset.theme === "mint-dark";
    actualThemeId = getDefaultCodeTheme(isDark);
  }

  // Handle custom code themes
  if (actualThemeId.startsWith("custom-")) {
    const style = document.getElementById(`code-theme-${actualThemeId}`);
    if (style) style.disabled = false;
  } else {
    // Built-in theme
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
```

Add import/delete functions:

```typescript
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
```

- [ ] **Step 4: Update ThemeContextValue and Provider**

```typescript
interface ThemeContextValue {
  // ... existing
  customCodeThemes: CustomCodeTheme[];
  importCodeTheme: (filePath: string, name: string) => Promise<CustomCodeTheme>;
  deleteCodeTheme: (id: string) => Promise<void>;
}
```

- [ ] **Step 5: Add custom code theme UI to Settings.tsx**

Add custom code themes section after the built-in code theme selector:

```tsx
<h3 className="settings-section-title">自定义代码主题</h3>
<div className="settings-custom-code-themes">
  {customCodeThemes.map((m) => (
    <div
      key={m.id}
      className={`settings-custom-code-theme-card${codeTheme === m.id ? " active" : ""}`}
      onClick={() => setCodeTheme(m.id)}
    >
      <span className="settings-custom-code-theme-name">{m.name}</span>
      <button
        className="settings-custom-code-theme-delete"
        title="删除"
        onClick={(e) => { e.stopPropagation(); handleDeleteCodeTheme(m); }}
      >
        ×
      </button>
    </div>
  ))}
  <div
    className="settings-custom-code-theme-card settings-custom-code-theme-add"
    onClick={handleImportCodeTheme}
  >
    + 导入代码主题
  </div>
</div>
```

- [ ] **Step 6: Add CSS for custom code theme cards**

```css
.settings-custom-code-themes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.settings-custom-code-theme-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-custom-code-theme-card:hover {
  background: var(--bg-surface);
}

.settings-custom-code-theme-card.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-secondary));
}

.settings-custom-code-theme-name {
  font-size: 13px;
  color: var(--text-primary);
}

.settings-custom-code-theme-delete {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.settings-custom-code-theme-delete:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.settings-custom-code-theme-add {
  color: var(--text-secondary);
  border-style: dashed;
}

.settings-custom-code-theme-add:hover {
  color: var(--accent);
  border-color: var(--accent);
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 8: Verify Vite build**

Run: `npx vite build 2>&1 | grep "✓ built"`
Expected: Build succeeds
