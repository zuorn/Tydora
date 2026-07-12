import { appDataDir } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, remove, readDir } from "@tauri-apps/plugin-fs";

// ── Types ────────────────────────────────────────────────────────────

export interface ThemeManifest {
  id: string;
  name: string;
  fileName: string;
  importedAt: string;
  previewBg?: string;
  previewAccent?: string;
}

export interface ThemeVariable {
  name: string;
  value: string;
  type: "color" | "font" | "size" | "text";
}

// ── Constants ────────────────────────────────────────────────────────

const MANIFEST_FILE = "manifest.json";

// Variables that should be detected as color pickers
const COLOR_PATTERNS = [
  /^--bg-/, /^--text-/, /^--accent/, /^--border$/, /^--danger$/,
  /^--ring$/, /^--card/, /^--popover/, /^--primary/, /^--secondary/,
  /^--muted/, /^--destructive$/, /^--input$/, /^--sidebar/,
  /^--breathe/, /^--highlight/,
];

// Variables that are font families
const FONT_PATTERNS = [/^--font-/, /^--editor-font$/];

// Variables that are sizes
const SIZE_PATTERNS = [/^--editor-font-size$/, /^--radius$/];

// ── Path Helpers ─────────────────────────────────────────────────────

let cachedThemesDir: string | null = null;

async function getThemesDir(): Promise<string> {
  if (cachedThemesDir) return cachedThemesDir;
  const baseDir = await appDataDir();
  const sep = navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
  const dir = `${baseDir}${sep}themes`;
  cachedThemesDir = dir;
  return dir;
}

async function ensureThemesDir(): Promise<string> {
  const dir = await getThemesDir();
  try {
    await readDir(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

function joinPath(parent: string, child: string): string {
  const sep = navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
  const clean = parent.endsWith("/") || parent.endsWith("\\") ? parent.slice(0, -1) : parent;
  return `${clean}${sep}${child}`;
}

// ── Manifest ─────────────────────────────────────────────────────────

export async function loadManifest(): Promise<ThemeManifest[]> {
  try {
    const dir = await ensureThemesDir();
    const content = await readTextFile(joinPath(dir, MANIFEST_FILE));
    return JSON.parse(content) as ThemeManifest[];
  } catch {
    return [];
  }
}

export async function saveManifest(manifests: ThemeManifest[]): Promise<void> {
  const dir = await ensureThemesDir();
  await writeTextFile(joinPath(dir, MANIFEST_FILE), JSON.stringify(manifests, null, 2));
}

// ── Theme ID ─────────────────────────────────────────────────────────

function generateThemeId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ── CSS Parsing ──────────────────────────────────────────────────────

export function parseCssVariables(css: string): ThemeVariable[] {
  const variables: ThemeVariable[] = [];
  const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;

  while ((match = varRegex.exec(css)) !== null) {
    const name = match[1];
    const value = match[2].trim();
    const type = detectVariableType(name, value);
    variables.push({ name, value, type });
  }

  return variables;
}

function detectVariableType(name: string, value: string): ThemeVariable["type"] {
  // Check if it's explicitly a size
  if (SIZE_PATTERNS.some((p) => p.test(name))) return "size";

  // Check if it's explicitly a font
  if (FONT_PATTERNS.some((p) => p.test(name))) return "font";

  // Check if it's explicitly a color
  if (COLOR_PATTERNS.some((p) => p.test(name))) return "color";

  // Heuristic: if it looks like a color value
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return "color";
  if (/^rgba?\(/.test(value)) return "color";
  if (/^oklch\(/.test(value)) return "color";
  if (/^hsla?\(/.test(value)) return "color";
  if (/^color-mix\(/.test(value)) return "text";

  // Heuristic: if it looks like a font stack
  if (/^["']?[A-Z]/.test(value) && /[,\s]/.test(value)) return "font";
  if (/system-ui|sans-serif|serif|monospace/.test(value)) return "font";

  // Heuristic: size values
  if (/^\d+(\.\d+)?(px|rem|em|%)$/.test(value)) return "size";

  return "text";
}

// ── CSS Selector Conversion ──────────────────────────────────────────

export function convertSelectorsToDataTheme(css: string, themeId: string): string {
  const dataThemeSelector = `[data-theme="custom-${themeId}"]`;

  // Case 1: :root { ... } → [data-theme="custom-{id}"] { ... }
  let result = css.replace(/:root\s*\{/g, `${dataThemeSelector} {`);

  // Case 2: .dark { ... } → [data-theme="custom-{id}-dark"] { ... }
  result = result.replace(/\.dark\s*\{/g, `[data-theme="custom-${themeId}-dark"] {`);

  // Case 3: [data-theme="xxx"] { ... } → [data-theme="custom-{id}"] { ... }
  result = result.replace(/\[data-theme="[^"]*"\]\s*\{/g, `${dataThemeSelector} {`);

  // Case 4: .dark [data-theme="xxx"] { ... } compound selectors
  result = result.replace(/\.dark\s+\[data-theme="[^"]*"\]\s*\{/g, `[data-theme="custom-${themeId}-dark"] {`);

  return result;
}

// ── Build CSS from Variables ─────────────────────────────────────────

export function buildThemeCss(id: string, variables: ThemeVariable[]): string {
  const lines = variables.map((v) => `  ${v.name}: ${v.value};`);
  return `[data-theme="custom-${id}"] {\n${lines.join("\n")}\n}`;
}

// ── Theme Operations ─────────────────────────────────────────────────

export async function importTheme(
  filePath: string,
  displayName: string,
): Promise<ThemeManifest> {
  const dir = await ensureThemesDir();

  // Read source file
  const css = await readTextFile(filePath);

  // Generate ID and convert selectors
  const id = generateThemeId();
  const processedCss = convertSelectorsToDataTheme(css, id);

  // Validate: must have at least --bg-primary
  if (!processedCss.includes("--bg-primary")) {
    throw new Error("主题文件缺少必要的 --bg-primary 变量");
  }

  // Save CSS file
  const fileName = `${id}.css`;
  await writeTextFile(joinPath(dir, fileName), processedCss);

  // Extract preview colors
  const { bg, accent } = extractPreviewColors(processedCss);

  // Update manifest
  const manifests = await loadManifest();
  const manifest: ThemeManifest = {
    id,
    name: displayName,
    fileName,
    importedAt: new Date().toISOString(),
    previewBg: bg,
    previewAccent: accent,
  };
  manifests.push(manifest);
  await saveManifest(manifests);

  return manifest;
}

export async function deleteTheme(id: string): Promise<void> {
  const dir = await ensureThemesDir();
  const manifests = await loadManifest();
  const manifest = manifests.find((m) => m.id === id);

  if (manifest) {
    try {
      await remove(joinPath(dir, manifest.fileName));
    } catch {}
  }

  const updated = manifests.filter((m) => m.id !== id);
  await saveManifest(updated);
}

export async function getCustomThemeCss(id: string): Promise<string> {
  const dir = await ensureThemesDir();
  return await readTextFile(joinPath(dir, `${id}.css`));
}

export async function saveThemeCss(id: string, css: string): Promise<void> {
  const dir = await ensureThemesDir();
  await writeTextFile(joinPath(dir, `${id}.css`), css);
}

// ── Preview Color Extraction ─────────────────────────────────────────

export function extractPreviewColors(css: string): { bg: string; accent: string } {
  const vars = parseCssVariables(css);
  const bg = vars.find((v) => v.name === "--bg-primary")?.value || "#ffffff";
  const accent = vars.find((v) => v.name === "--accent")?.value || "#4eb289";
  return { bg, accent };
}

// ── Code Theme Operations ──────────────────────────────────────

import { type CustomCodeTheme } from "./codeThemes";

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
