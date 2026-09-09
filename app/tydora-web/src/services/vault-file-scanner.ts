// src/services/vault-file-scanner.ts
// 一次性递归扫描仓库，产出分类文件列表（策略 B：消除 2× 重复遍历）。
//
// 原流程：LinkIndexService 与 TagIndexService 各自独立 readDir 整棵目录树。
// 新流程：scanVaultFiles() 先跑一次，产出 md/canvas/image 三类文件数组，
//        两个 Service 直接复用，避免重复的 Tauri IPC 往返。

import { readDir } from "@tauri-apps/plugin-fs";

/** 常见图片扩展名（用于识别 ![[xxx.png]] 之类的嵌入图片）。
 *  与 LinkIndexService 保持一致，避免两处列表漂移。 */
const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico",
  "heic", "heif", "tif", "tiff", "apng", "jfif", "pjpeg", "jxl",
]);

/** 扫描结果：一次遍历输出所有分类，供 Link + Tag 索引共享。 */
export interface VaultFileScan {
  /** .md 文件完整路径列表（Link/Tag 均需要） */
  mdFiles: string[];
  /** .canvas 文件完整路径列表（仅 Link 需要） */
  canvasFiles: string[];
  /** 图片文件：完整文件名 + 完整路径（仅 Link 需要的 imageByName 索引） */
  imageFiles: Array<{ path: string; name: string }>;
  /** 非隐藏目录下的所有文件路径（未来做增量对比签名时使用，暂未采集 mtime） */
  allFiles: string[];
}

/** 取文件扩展名（小写，不含点）。空字符串代表无扩展名。 */
function lowerExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * 递归扫描仓库目录，一次性产出 md/canvas/image 三类文件列表。
 *
 * 行为说明：
 * - 跳过以 "." 开头的隐藏目录/文件（与 TagIndexService 原有行为一致，
 *   Link 此前不过滤隐藏文件，这里统一用更保守的隐藏过滤，避免把
 *   .git / .obsidian / .DS_Store 之类误扫进索引）。
 */
export async function scanVaultFiles(vaultPath: string): Promise<VaultFileScan> {
  const mdFiles: string[] = [];
  const canvasFiles: string[] = [];
  const imageFiles: Array<{ path: string; name: string }> = [];
  const allFiles: string[] = [];

  const walk = async (dir: string) => {
    let entries: Awaited<ReturnType<typeof readDir>>;
    try {
      entries = await readDir(dir);
    } catch {
      // 单个子目录读失败不影响整体扫描（例如权限不足的子文件夹）
      return;
    }
    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith(".")) continue;
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(fullPath);
      } else {
        allFiles.push(fullPath);
        const ext = lowerExt(entry.name);
        if (ext === "md") {
          mdFiles.push(fullPath);
        } else if (ext === "canvas") {
          canvasFiles.push(fullPath);
        } else if (IMAGE_EXTENSIONS.has(ext)) {
          imageFiles.push({ path: fullPath, name: entry.name });
        }
      }
    }
  };

  await walk(vaultPath);

  return { mdFiles, canvasFiles, imageFiles, allFiles };
}
