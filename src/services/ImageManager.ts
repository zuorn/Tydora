import { writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";

export type StorageMode = "vault-assets" | "fixed-directory" | "image-bed";
export type FilenameFormat = "original" | "timestamp" | "both";

export interface LocalSettings {
  filenameFormat: FilenameFormat;
  autoCreateAssetsDir: boolean;
}

export interface FixedDirectorySettings {
  path: string;
}

export interface ImageSettings {
  storageMode: StorageMode;
  local: LocalSettings;
  fixedDirectory: FixedDirectorySettings;
}

export const IMAGE_SETTINGS_KEY = "zmd-image-settings";

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  storageMode: "vault-assets",
  local: {
    filenameFormat: "both",
    autoCreateAssetsDir: true,
  },
  fixedDirectory: {
    path: "",
  },
};

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "ico",
]);

function pathSep(): string {
  return navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
}

export function joinPath(parent: string, child: string): string {
  const sep = pathSep();
  const clean = parent.endsWith("/") || parent.endsWith("\\") ? parent.slice(0, -1) : parent;
  return `${clean}${sep}${child}`;
}

export function dirName(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return lastSep >= 0 ? filePath.substring(0, lastSep) : ".";
}

function baseName(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return lastSep >= 0 ? filePath.substring(lastSep + 1) : filePath;
}

function extName(filePath: string): string {
  const name = baseName(filePath);
  const dotIdx = name.lastIndexOf(".");
  return dotIdx >= 0 ? name.substring(dotIdx) : "";
}

function stripExt(filename: string): string {
  const ext = extName(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

export function relativePath(from: string, to: string): string {
  const sep = pathSep();
  const fromParts = from.split(/[\\/]/).filter(Boolean);
  const toParts = to.split(/[\\/]/).filter(Boolean);

  let commonLen = 0;
  while (
    commonLen < fromParts.length &&
    commonLen < toParts.length &&
    fromParts[commonLen].toLowerCase() === toParts[commonLen].toLowerCase()
  ) {
    commonLen++;
  }

  const ups = fromParts.length - commonLen;
  const downs = toParts.slice(commonLen);

  const parts = [...Array(ups).fill(".."), ...downs];
  return parts.length > 0 ? parts.join(sep) : ".";
}

/**
 * 将相对路径解析为绝对路径
 * @param baseDir 基准目录（绝对路径）
 * @param relPath 相对路径，如 "../assets/image.png" 或 "./assets/image.png"
 * @returns 解析后的绝对路径
 */
export function resolveRelativePath(baseDir: string, relPath: string): string {
  const sep = pathSep();
  // 拆分为路径段，过滤掉空段
  const baseParts = baseDir.split(/[\\/]/).filter(Boolean);
  // 统一用 / 分割，处理 ./ 和 ../
  const relParts = relPath.replace(/\\/g, "/").split("/").filter(p => p !== "" && p !== ".");

  for (const part of relParts) {
    if (part === "..") {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  // Windows: 保留盘符+分隔符格式
  if (baseParts.length > 0 && /^[a-zA-Z]:$/.test(baseParts[0])) {
    baseParts[0] = baseParts[0] + sep;
  }

  return baseParts.join(sep);
}

export function isImageFile(filename: string): boolean {
  const ext = extName(filename).toLowerCase().replace(".", "");
  return IMAGE_EXTENSIONS.has(ext);
}

export function isImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return Array.from(IMAGE_EXTENSIONS).some((ext) => path.endsWith(`.${ext}`));
  } catch {
    return false;
  }
}

export function loadImageSettings(): ImageSettings {
  try {
    const saved = localStorage.getItem(IMAGE_SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_IMAGE_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {}
  return { ...DEFAULT_IMAGE_SETTINGS };
}

export function saveImageSettings(settings: ImageSettings): void {
  localStorage.setItem(IMAGE_SETTINGS_KEY, JSON.stringify(settings));
}

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function generateTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${padZero(now.getMonth() + 1)}${padZero(now.getDate())}-${padZero(now.getHours())}${padZero(now.getMinutes())}${padZero(now.getSeconds())}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_");
}

export function generateImageFilename(
  originalName: string,
  format: FilenameFormat,
): string {
  const ext = extName(originalName) || ".png";
  const base = stripExt(originalName);
  const safeName = sanitizeFilename(base);

  switch (format) {
    case "original":
      return `${safeName}${ext}`;
    case "timestamp":
      return `image-${generateTimestamp()}${ext}`;
    case "both":
    default:
      return `${safeName}-${generateTimestamp()}${ext}`;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  if (!(await exists(dirPath))) {
    await mkdir(dirPath, { recursive: true });
  }
}

async function findAvailableFilename(dirPath: string, filename: string): Promise<string> {
  const ext = extName(filename);
  const base = stripExt(filename);
  let candidate = filename;
  let counter = 2;

  while (await exists(joinPath(dirPath, candidate))) {
    candidate = `${base}-${counter}${ext}`;
    counter++;
  }

  return candidate;
}

export interface SaveImageResult {
  savedPath: string;
  markdownRef: string;
}

export async function saveImageToLocal(
  file: File,
  settings: ImageSettings,
  currentFilePath: string | null,
  activeVaultPath: string | null,
): Promise<SaveImageResult> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  if (settings.storageMode === "vault-assets" || settings.storageMode === "image-bed") {
    const vaultPath = activeVaultPath;
    if (!vaultPath) {
      if (settings.fixedDirectory.path) {
        return saveToFixedDirectory(uint8, file.name, settings, null);
      }
      throw new Error("未打开任何仓库，请在设置中配置固定存储目录");
    }

    const assetsDir = joinPath(vaultPath, "assets");
    if (settings.local.autoCreateAssetsDir) {
      await ensureDir(assetsDir);
    }

    const filename = generateImageFilename(file.name, settings.local.filenameFormat);
    const availableName = await findAvailableFilename(assetsDir, filename);
    const fullPath = joinPath(assetsDir, availableName);

    await writeFile(fullPath, uint8);

    let markdownRef: string;
    if (currentFilePath) {
      const currentDir = dirName(currentFilePath);
      const rel = relativePath(currentDir, fullPath);
      markdownRef = rel.replace(/\\/g, "/");
      if (!markdownRef.startsWith("./") && !markdownRef.startsWith("../")) {
        markdownRef = "./" + markdownRef;
      }
    } else {
      markdownRef = `./assets/${availableName}`;
    }

    return { savedPath: fullPath, markdownRef };
  }

  return saveToFixedDirectory(uint8, file.name, settings, currentFilePath);
}

async function saveToFixedDirectory(
  uint8: Uint8Array,
  originalName: string,
  settings: ImageSettings,
  currentFilePath: string | null,
): Promise<SaveImageResult> {
  const dirPath = settings.fixedDirectory.path;
  if (!dirPath) {
    throw new Error("未配置固定存储目录，请在设置中配置");
  }

  await ensureDir(dirPath);

  const filename = generateImageFilename(originalName, settings.local.filenameFormat);
  const availableName = await findAvailableFilename(dirPath, filename);
  const fullPath = joinPath(dirPath, availableName);

  await writeFile(fullPath, uint8);

  let markdownRef: string;
  if (currentFilePath) {
    const currentDir = dirName(currentFilePath);
    const rel = relativePath(currentDir, fullPath);
    markdownRef = rel.replace(/\\/g, "/");
    if (!markdownRef.startsWith("./") && !markdownRef.startsWith("../")) {
      markdownRef = "./" + markdownRef;
    }
  } else {
    markdownRef = fullPath.replace(/\\/g, "/");
  }

  return { savedPath: fullPath, markdownRef };
}
