import { writeFile, mkdir, exists, readDir, rename, remove, readTextFile } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import i18n from "../i18n";

export type StorageMode = "vault-assets" | "doc-assets" | "fixed-directory" | "image-bed";
export type FilenameFormat = "original" | "timestamp" | "both";
/** 写入 Markdown 的图片引用形式 */
export type ImagePathStyle = "relative" | "absolute";

export interface LocalSettings {
  filenameFormat: FilenameFormat;
  autoCreateAssetsDir: boolean;
  pathStyle: ImagePathStyle;
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

/** 图片按文档隔离存放的目录名 */
export const ASSETS_DIR_NAME = "assets";
/** 文档尚未保存时使用的隔离子目录名，保存后由 migrateDocImageFolder 改名 */
export const UNTITLED_IMAGE_FOLDER = "untitled";

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  storageMode: "vault-assets",
  local: {
    filenameFormat: "both",
    autoCreateAssetsDir: true,
    pathStyle: "relative",
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
  // 绝对路径（Windows 盘符正/反斜杠、类 Unix 根）直接归一化返回，不做相对拼接
  if (/^[a-zA-Z]:[\\/]/.test(relPath)) {
    return relPath.replace(/\//g, sep);
  }
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

  // baseParts.join(sep) 已自动在每段之间插入平台分隔符
  // 例如 ["C:", "Users", "zuorn"] + join("\") → "C:\Users\zuorn"
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
      const parsed = JSON.parse(saved) as Partial<ImageSettings>;
      // 逐层合并，避免旧版本存档缺少新增字段（如 pathStyle）时留下 undefined
      return {
        ...DEFAULT_IMAGE_SETTINGS,
        ...parsed,
        local: { ...DEFAULT_IMAGE_SETTINGS.local, ...(parsed.local || {}) },
        fixedDirectory: { ...DEFAULT_IMAGE_SETTINGS.fixedDirectory, ...(parsed.fixedDirectory || {}) },
      };
    }
  } catch {}
  return { ...DEFAULT_IMAGE_SETTINGS };
}

export function saveImageSettings(settings: ImageSettings): void {
  try {
    localStorage.setItem(IMAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 配额溢出 / 隐私模式：设置写入失败不应打断界面
    console.warn("[imageManager] 保存图像设置失败");
  }
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

/** 用户取消目录选择时抛出的错误（调用方应静默忽略） */
export class ImageSaveCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "ImageSaveCancelledError";
  }
}

/** 文档在 assets 下用于隔离图片的子目录名（未保存的文档用 untitled） */
export function docImageFolderName(currentFilePath: string | null): string {
  if (!currentFilePath) return UNTITLED_IMAGE_FOLDER;
  const safe = sanitizeFilename(stripExt(baseName(currentFilePath)));
  return safe || UNTITLED_IMAGE_FOLDER;
}

/** 各存储模式下 assets 的根目录，图片再按文档名在其下隔离子目录 */
function assetsRootFor(
  mode: StorageMode,
  vaultPath: string | null,
  docDir: string | null,
  fixedPath: string | null,
): string | null {
  if (mode === "fixed-directory") return fixedPath || null;
  if (mode === "doc-assets" && docDir) return joinPath(docDir, ASSETS_DIR_NAME);
  // image-bed 目前与 vault-assets 走同一套本地逻辑
  return vaultPath ? joinPath(vaultPath, ASSETS_DIR_NAME) : null;
}

function isExternalRef(ref: string): boolean {
  return /^(https?:|data:|asset:|blob:|file:|\/\/)/i.test(ref);
}

function sameDrive(a: string, b: string): boolean {
  return (a.split(/[\\/]/)[0] || "").toLowerCase() === (b.split(/[\\/]/)[0] || "").toLowerCase();
}

/**
 * 生成写入 Markdown 的图片引用
 * - 相对：以文档所在目录为基准，正斜杠，同目录时带 ./ 前缀
 * - 绝对：正斜杠文件系统路径（跨盘符无法相对表达时也用绝对路径）
 */
export function buildMarkdownRef(
  imagePath: string,
  docDir: string | null,
  style: ImagePathStyle,
): string {
  const forward = imagePath.replace(/\\/g, "/");
  if (style === "absolute" || !docDir || !sameDrive(docDir, imagePath)) return forward;
  const rel = relativePath(docDir, imagePath).replace(/\\/g, "/");
  if (!rel || rel === ".") return forward;
  return rel.startsWith("../") ? rel : `./${rel}`;
}

/** 把图片写入「assets 根 / 文档隔离子目录」，并生成 Markdown 引用 */
async function writeToIsolatedDir(
  uint8: Uint8Array,
  originalName: string,
  settings: ImageSettings,
  assetsRoot: string,
  currentFilePath: string | null,
): Promise<SaveImageResult> {
  const imageDir = joinPath(assetsRoot, docImageFolderName(currentFilePath));
  if (settings.local.autoCreateAssetsDir) {
    await ensureDir(imageDir);
  }

  const filename = generateImageFilename(originalName, settings.local.filenameFormat);
  const availableName = await findAvailableFilename(imageDir, filename);
  const fullPath = joinPath(imageDir, availableName);

  await writeFile(fullPath, uint8);

  const refBasis = currentFilePath ? dirName(currentFilePath) : null;
  return {
    savedPath: fullPath,
    markdownRef: buildMarkdownRef(fullPath, refBasis, settings.local.pathStyle),
  };
}

export async function saveImageToLocal(
  file: File,
  settings: ImageSettings,
  currentFilePath: string | null,
  activeVaultPath: string | null,
): Promise<SaveImageResult> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const docDir = currentFilePath ? dirName(currentFilePath) : null;

  let assetsRoot = assetsRootFor(
    settings.storageMode,
    activeVaultPath,
    docDir,
    settings.fixedDirectory.path,
  );
  // 未打开仓库、也没有文档目录时，退回用户先前记住的固定目录
  if (!assetsRoot && settings.fixedDirectory.path) {
    assetsRoot = settings.fixedDirectory.path;
  }
  if (!assetsRoot) {
    // 弹出目录选择器让用户指定图片保存位置，并记住该目录
    const selected = await open({
      directory: true,
      multiple: false,
      title: i18n.t("imageManager.selectSaveDir"),
    });
    if (!selected || typeof selected !== "string") {
      throw new ImageSaveCancelledError();
    }
    assetsRoot = selected;
    saveImageSettings({ ...settings, fixedDirectory: { path: selected } });
  }

  return writeToIsolatedDir(uint8, file.name, settings, assetsRoot, currentFilePath);
}

// ── 文档改名 / 首次保存后的图片目录迁移 ──

const MD_IMAGE_REF_RE = /(!\[[^\]]*\]\(\s*<?)([^)>\s]+)(>?[^)]*\))/g;
const HTML_IMG_REF_RE = /(<img\s+[^>]*src=["'])([^"']+)(["'])/gi;

interface ImageDirMove {
  fromDir: string;
  toDir: string;
  /** 目标目录已存在、同名文件被改名时的映射（原文件名 → 新文件名） */
  fileMap: Map<string, string>;
}

export interface DocImageMigrationResult {
  /** 改写后的文档内容；无需改写或文档不可读时为 null */
  newContent: string | null;
  refsUpdated: number;
}

function pathKey(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
}

/** 整体搬迁文档隔离目录；目标已存在时逐文件合并 */
async function moveImageDir(fromDir: string, toDir: string): Promise<Map<string, string>> {
  if (!(await exists(toDir))) {
    await ensureDir(dirName(toDir));
    await rename(fromDir, toDir);
    return new Map();
  }
  const fileMap = new Map<string, string>();
  const entries = await readDir(fromDir);
  for (const entry of entries) {
    if (!entry.name || entry.isDirectory) continue;
    const targetName = await findAvailableFilename(toDir, entry.name);
    await rename(joinPath(fromDir, entry.name), joinPath(toDir, targetName));
    fileMap.set(entry.name, targetName);
  }
  try {
    await remove(fromDir);
  } catch {
    // 目录未清空（含子目录）时保留，不影响已搬移的图片
  }
  return fileMap;
}

/** 按应用现有的引用解析规则，把 ref 还原为绝对路径 */
function resolveRefAbs(ref: string, docDir: string, vaultPath: string | null): string {
  if (/^[a-zA-Z]:[\\/]/.test(ref)) return ref;
  if (ref.startsWith("/")) {
    return vaultPath ? resolveRelativePath(vaultPath, ref.slice(1)) : ref;
  }
  return resolveRelativePath(docDir, ref);
}

function rewriteContentRefs(
  content: string,
  docDir: string,
  vaultPath: string | null,
  moves: ImageDirMove[],
  pathStyle: ImagePathStyle,
): { content: string; updated: number } {
  let updated = 0;
  const mapRef = (ref: string): string => {
    if (isExternalRef(ref)) return ref;
    const resolved = resolveRefAbs(ref, docDir, vaultPath);
    const resolvedKey = pathKey(resolved);
    for (const move of moves) {
      const fromKey = pathKey(move.fromDir);
      if (resolvedKey !== fromKey && !resolvedKey.startsWith(fromKey + "/")) continue;
      let rest = resolved.slice(move.fromDir.length).replace(/^[\\/]+/, "");
      const slashIdx = rest.search(/[\\/]/);
      const head = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
      const renamed = move.fileMap.get(head);
      if (renamed) rest = renamed + rest.slice(head.length);
      const newAbs = rest ? joinPath(move.toDir, rest) : move.toDir;
      updated++;
      return buildMarkdownRef(newAbs, docDir, pathStyle);
    }
    return ref;
  };

  let out = content.replace(MD_IMAGE_REF_RE, (_full, pre: string, ref: string, post: string) => pre + mapRef(ref) + post);
  out = out.replace(HTML_IMG_REF_RE, (_full, pre: string, ref: string, post: string) => pre + mapRef(ref) + post);
  return { content: out, updated };
}

/**
 * 文档改名（或新文档首次保存）后，同步 assets 下按文档隔离的子目录名，
 * 并改写文档内的图片引用。调用方负责把 newContent 写回文档。
 *
 * @param oldDocPath 迁移前文档路径；尚未保存的新文档传 null（目录名为 untitled）
 */
export async function migrateDocImageFolder(params: {
  oldDocPath: string | null;
  newDocPath: string;
  vaultPath?: string | null;
  docContent?: string;
}): Promise<DocImageMigrationResult> {
  const { oldDocPath, newDocPath, vaultPath = null } = params;
  const settings = loadImageSettings();
  const oldDocDir = oldDocPath ? dirName(oldDocPath) : null;
  const newDocDir = dirName(newDocPath);
  const oldFolder = docImageFolderName(oldDocPath);
  const newFolder = docImageFolderName(newDocPath);

  // 模式可能改过，逐个候选根目录找出实际存在的旧目录
  const rootPairs: Array<{ fromRoot: string; toRoot: string }> = [];
  for (const mode of ["vault-assets", "doc-assets", "fixed-directory"] as StorageMode[]) {
    const fromRoot = assetsRootFor(mode, vaultPath, oldDocDir, settings.fixedDirectory.path);
    const toRoot = assetsRootFor(mode, vaultPath, newDocDir, settings.fixedDirectory.path);
    if (fromRoot && toRoot) rootPairs.push({ fromRoot, toRoot });
  }

  const moves: ImageDirMove[] = [];
  const seen = new Set<string>();
  for (const { fromRoot, toRoot } of rootPairs) {
    const fromDir = joinPath(fromRoot, oldFolder);
    const key = pathKey(fromDir);
    if (seen.has(key)) continue;
    seen.add(key);
    const toDir = joinPath(toRoot, newFolder);
    if (pathKey(toDir) === key) continue;
    if (!(await exists(fromDir))) continue;
    const fileMap = await moveImageDir(fromDir, toDir);
    moves.push({ fromDir, toDir, fileMap });
  }

  if (moves.length === 0) return { newContent: null, refsUpdated: 0 };

  let content = params.docContent ?? null;
  if (content === null) {
    for (const p of [newDocPath, oldDocPath]) {
      if (!p) continue;
      try {
        content = await readTextFile(p);
        break;
      } catch {
        // 文件可能已被移走，继续尝试下一个
      }
    }
  }
  if (content === null) return { newContent: null, refsUpdated: 0 };

  const rewritten = rewriteContentRefs(
    content,
    newDocDir,
    vaultPath,
    moves,
    settings.local.pathStyle,
  );
  return { newContent: rewritten.content, refsUpdated: rewritten.updated };
}
