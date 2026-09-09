// src/LinkIndexService.ts

import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { parseWikiLinks } from "./LinkParser";
import type { VaultFileScan } from "../services/vault-file-scanner";

export interface LinkIndex {
  // 出链：文件路径 → 该文件包含的所有链接目标笔记名
  outlinks: Map<string, string[]>;
  // 反向链接：笔记名 → 引用它的所有文件路径列表
  backlinks: Map<string, string[]>;
  // 文件名索引：笔记名 → 文件路径（用于查找文件）
  fileByName: Map<string, string>;
  // 图片文件名索引（含扩展名，大小写不敏感）：完整文件名 → 文件路径（用于解析 ![[图片]] 嵌入）
  imageByName: Map<string, string>;
}

/** 常见图片扩展名（用于识别 ![[xxx.png]] 之类的嵌入图片） */
const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico",
  "heic", "heif", "tif", "tiff", "apng", "jfif", "pjpeg", "jxl",
]);

class LinkIndexServiceImpl {
  private index: LinkIndex = {
    outlinks: new Map(),
    backlinks: new Map(),
    fileByName: new Map(),
    imageByName: new Map(),
  };
  
  /**
   * 全量构建索引（批量读取优化）。
   * 保留原始签名以向后兼容；新调用点优先使用 buildIndexWithScan。
   */
  async buildIndex(vaultPath: string): Promise<void> {
    this.index = {
      outlinks: new Map(),
      backlinks: new Map(),
      fileByName: new Map(),
      imageByName: new Map(),
    };

    const allFiles = await this.getAllFiles(vaultPath);

    // 第一遍：建立文件名索引（图片单独索引，不参与 wiki 链接补全）
    const files: string[] = [];
    for (const filePath of allFiles) {
      const name = filePath.split(/[/\\]/).pop() || "";
      const ext = name.lastIndexOf(".") >= 0 ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
      if (IMAGE_EXTENSIONS.has(ext)) {
        const lower = name.toLowerCase();
        const existing = this.index.imageByName.get(lower);
        // 同名图片保留路径最短者
        if (!existing || filePath.length < existing.length) {
          this.index.imageByName.set(lower, filePath);
        }
      } else if (name.toLowerCase().endsWith(".md") || name.toLowerCase().endsWith(".canvas")) {
        files.push(filePath);
        const noteName = this.pathToNoteName(filePath, vaultPath);
        this.index.fileByName.set(noteName, filePath);
      }
    }

    // 第二遍：批量读取并解析链接（每批 50 个）
    const CHUNK_SIZE = 50;
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const contents = await Promise.all(chunk.map(f => readTextFile(f).catch(() => '')));

      for (let j = 0; j < chunk.length; j++) {
        if (contents[j]) {
          const noteName = this.pathToNoteName(chunk[j], vaultPath);
          this.addFileLinksInternal(chunk[j], noteName, contents[j]);
        }
      }
    }
  }

  /**
   * 使用外部共享扫描结果构建索引（策略 B：消除重复遍历）。
   *
   * 可选传 contents：若 index-builder 已批量 readTextFile 则直接复用（策略 C）；
   * 否则本方法内部自行批量读取。
   *
   * 注意：本方法不清空现有索引。若需要"干净重建"，调用方先自行 clear()
   * 或在调用时配合 deserialize 做增量刷新。
   */
  async buildIndexWithScan(
    vaultPath: string,
    scan: VaultFileScan,
    contents?: Map<string, string>,
  ): Promise<void> {
    // 1. 图片索引（同名取路径最短）
    for (const { path, name } of scan.imageFiles) {
      const lower = name.toLowerCase();
      const existing = this.index.imageByName.get(lower);
      if (!existing || path.length < existing.length) {
        this.index.imageByName.set(lower, path);
      }
    }

    // 2. 文件名索引（md + canvas）
    const noteFiles: string[] = [];
    for (const path of scan.mdFiles) {
      noteFiles.push(path);
      const noteName = this.pathToNoteName(path, vaultPath);
      // 同名笔记：优先保留路径更短（层级更浅）的那条（与原 buildIndex 行为一致）
      const existingPath = this.index.fileByName.get(noteName);
      if (!existingPath || path.length < existingPath.length) {
        this.index.fileByName.set(noteName, path);
      }
    }
    for (const path of scan.canvasFiles) {
      noteFiles.push(path);
      const noteName = this.pathToNoteName(path, vaultPath);
      const existingPath = this.index.fileByName.get(noteName);
      if (!existingPath || path.length < existingPath.length) {
        this.index.fileByName.set(noteName, path);
      }
    }

    // 3. 批量解析链接（策略 C：外部已提供 contents 时直接用；否则自己读）
    const CHUNK_SIZE = 50;
    for (let i = 0; i < noteFiles.length; i += CHUNK_SIZE) {
      const chunk = noteFiles.slice(i, i + CHUNK_SIZE);
      const chunkContents = await Promise.all(
        chunk.map((p) => {
          const cached = contents?.get(p);
          if (cached !== undefined) return cached;
          return readTextFile(p).catch(() => "");
        }),
      );
      for (let j = 0; j < chunk.length; j++) {
        const text = chunkContents[j];
        if (text) {
          const noteName = this.pathToNoteName(chunk[j], vaultPath);
          this.addFileLinksInternal(chunk[j], noteName, text);
        }
      }
    }
  }

  /**
   * 已有内容字符串时，同步把 wiki 链接解析结果写入索引。
   * 供 index-builder（策略 C 共享 readTextFile 结果）或增量刷新复用。
   */
  addFileLinksInternal(filePath: string, noteName: string, content: string): void {
    // 先清旧反链，避免同一文件重复入索引导致反链重复
    const oldTargets = this.index.outlinks.get(filePath) || [];
    for (const oldTarget of oldTargets) {
      const sources = this.index.backlinks.get(oldTarget);
      if (sources) {
        const filtered = sources.filter((s) => s !== filePath);
        if (filtered.length === 0) {
          this.index.backlinks.delete(oldTarget);
        } else {
          this.index.backlinks.set(oldTarget, filtered);
        }
      }
    }

    const links = parseWikiLinks(content);
    const targets = links.map((l) => l.noteName);
    this.index.outlinks.set(filePath, targets);

    for (const target of targets) {
      const existing = this.index.backlinks.get(target) || [];
      if (!existing.includes(filePath)) {
        existing.push(filePath);
        this.index.backlinks.set(target, existing);
      }
    }

    // 同步刷新 fileByName：确保该文件能被 WikiLink 自动补全/反链查询定位
    const existingPath = this.index.fileByName.get(noteName);
    if (!existingPath || filePath.length < existingPath.length) {
      this.index.fileByName.set(noteName, filePath);
    }
  }

  /** 判断某个文件路径是否已有出链记录（用于增量刷新对比）。 */
  isIndexed(filePath: string): boolean {
    return this.index.outlinks.has(filePath);
  }

  /**
   * 幂等地把 noteName → filePath 写入 fileByName（同名取路径更短者）。
   * 供 index-builder 在"只补齐文件名索引、不想重读文件内容"场景下直接调用，
   * 避免走 buildIndexWithScan 触发对 md/canvas 的不必要 readTextFile。
   */
  ensureFileByName(noteName: string, filePath: string): void {
    const existing = this.index.fileByName.get(noteName);
    if (!existing || filePath.length < existing.length) {
      this.index.fileByName.set(noteName, filePath);
    }
  }

  /**
   * 幂等地把图片名（小写，含扩展名）→ 图片路径写入 imageByName。
   * 同名图片保留路径更短者。
   */
  ensureImageByName(lowerName: string, filePath: string): void {
    const existing = this.index.imageByName.get(lowerName);
    if (!existing || filePath.length < existing.length) {
      this.index.imageByName.set(lowerName, filePath);
    }
  }

  /** 清空内存中的所有索引数据（切仓库或需要干净重建时使用）。 */
  clear(): void {
    this.index = {
      outlinks: new Map(),
      backlinks: new Map(),
      fileByName: new Map(),
      imageByName: new Map(),
    };
  }

  /** 路径转笔记名；原 private，公开后供 index-builder 与外部增量刷新复用。 */
  toNoteName(filePath: string, vaultPath: string): string {
    return this.pathToNoteName(filePath, vaultPath);
  }
  
  /**
   * 增量更新单个文件的链接（先清旧反链再加新反链）
   */
  async updateFileLinks(filePath: string, vaultPath: string): Promise<void> {
    try {
      // 1. 清理旧的反向链接
      const oldTargets = this.index.outlinks.get(filePath) || [];
      for (const oldTarget of oldTargets) {
        const sources = this.index.backlinks.get(oldTarget);
        if (sources) {
          const filtered = sources.filter(s => s !== filePath);
          if (filtered.length === 0) {
            this.index.backlinks.delete(oldTarget);
          } else {
            this.index.backlinks.set(oldTarget, filtered);
          }
        }
      }

      // 2. 读取新内容并解析链接
      const content = await readTextFile(filePath);
      const links = parseWikiLinks(content);
      const noteName = this.pathToNoteName(filePath, vaultPath);
      const targets = links.map(l => l.noteName);

      // 3. 设置新的出链
      this.index.outlinks.set(filePath, targets);

      // 4. 添加新的反向链接
      for (const target of targets) {
        const existing = this.index.backlinks.get(target) || [];
        if (!existing.includes(filePath)) {
          existing.push(filePath);
          this.index.backlinks.set(target, existing);
        }
      }

      // 5. 更新文件名索引（最短路径优先）
      const existingPath = this.index.fileByName.get(noteName);
      if (existingPath && existingPath !== filePath) {
        const currentDepth = noteName.split('/').length;
        const existingName = this.pathToNoteName(existingPath, vaultPath);
        const existingDepth = existingName.split('/').length;
        if (currentDepth < existingDepth) {
          this.index.fileByName.set(noteName, filePath);
        }
      } else {
        this.index.fileByName.set(noteName, filePath);
      }
    } catch (e) {
      console.error(`更新链接索引失败: ${filePath}`, e);
    }
  }

  /**
   * 移除文件的索引记录
   */
  removeFile(filePath: string): void {
    // 清理出链的反向链接
    const targets = this.index.outlinks.get(filePath) || [];
    for (const target of targets) {
      const sources = this.index.backlinks.get(target);
      if (sources) {
        const filtered = sources.filter(s => s !== filePath);
        if (filtered.length === 0) {
          this.index.backlinks.delete(target);
        } else {
          this.index.backlinks.set(target, filtered);
        }
      }
    }
    this.index.outlinks.delete(filePath);

    // 清理文件名索引
    for (const [name, path] of this.index.fileByName) {
      if (path === filePath) {
        this.index.fileByName.delete(name);
        break;
      }
    }

    // 清理图片索引
    for (const [name, path] of this.index.imageByName) {
      if (path === filePath) {
        this.index.imageByName.delete(name);
      }
    }
  }
  
  /**
   * 获取笔记的反向链接
   */
  getBacklinks(noteName: string): string[] {
    return this.index.backlinks.get(noteName) || [];
  }
  
  /**
   * 获取文件的出链
   */
  getOutlinks(filePath: string): string[] {
    return this.index.outlinks.get(filePath) || [];
  }

  /**
   * 获取文件的出链（对路径书写风格健壮）：
   * 先按 key 精确命中；未命中时做一次大小写/分隔符无关的线性兜底。
   * 用于解决 Windows 下“文件树用 \、索引构建用 /”导致 key 对不上的问题。
   */
  getOutlinksForFile(filePath: string): string[] {
    const direct = this.index.outlinks.get(filePath);
    if (direct) return direct;
    const key = this.normalizePathKey(filePath);
    for (const [p, targets] of this.index.outlinks) {
      if (this.normalizePathKey(p) === key) return targets;
    }
    return [];
  }

  /**
   * 找出“反向链接来源”：任何文件的出链目标命中候选笔记名之一
   * （大小写无关、分隔符无关）即视为引用。返回去重后的源文件路径列表。
   */
  findFilesReferencing(candidateNames: string[]): string[] {
    if (candidateNames.length === 0) return [];
    const wanted = new Set(candidateNames.map((n) => this.normalizePathKey(n)));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const [source, targets] of this.index.outlinks) {
      const hit = targets.some((t) => wanted.has(this.normalizePathKey(t)));
      if (hit) {
        const canonical = this.normalizePathKey(source);
        if (!seen.has(canonical)) {
          seen.add(canonical);
          result.push(source);
        }
      }
    }
    return result;
  }

  /** 把任意路径归一为「/」分隔的小写形式，用于跨书写风格的 key 比较 */
  private normalizePathKey(path: string): string {
    return path.replace(/\\/g, "/").toLowerCase();
  }
  
  /**
   * 根据笔记名查找文件路径
   */
  findFileByNoteName(noteName: string): string | undefined {
    // 1. 精确匹配（支持完整路径输入如 folder/note）
    const exact = this.index.fileByName.get(noteName);
    if (exact) return exact;

    // 2. basename 匹配（大小写不敏感，多个同名取路径最短）
    const lower = noteName.toLowerCase();
    let bestPath: string | undefined;
    let bestDepth = Infinity;
    for (const [key, path] of this.index.fileByName) {
      const basename = key.split('/').pop()?.toLowerCase();
      if (basename === lower) {
        const depth = key.split('/').length;
        if (depth < bestDepth) {
          bestDepth = depth;
          bestPath = path;
        }
      }
    }
    return bestPath;
  }

  /**
   * 把 wiki 链接目标（原样文本）解析为实际文件路径。
   * 兼容多种书写：带/不带路径、带/不带扩展名、图片嵌入、不同分隔符。
   * 解析不到返回 undefined。
   */
  resolveTargetPath(raw: string): string | undefined {
    if (!raw) return undefined;
    let t = raw.replace(/\\/g, "/").replace(/#.*$/, "").trim();
    if (!t) return undefined;
    const dotIdx = t.lastIndexOf(".");
    const ext = dotIdx >= 0 ? t.slice(dotIdx + 1).toLowerCase() : "";
    const stripExt = (s: string) => (dotIdx > 0 ? s.slice(0, dotIdx) : s);

    if (ext && IMAGE_EXTENSIONS.has(ext)) {
      const img = this.findImageByBaseName(t);
      if (img) return img;
    }

    const note = this.findFileByNoteName(t);
    if (note) return note;

    // 带扩展名的写法（如 [[note.md]] / [[note.canvas]]）：剥掉扩展名再试
    const base = stripExt(t);
    if (base !== t) {
      const note2 = this.findFileByNoteName(base);
      if (note2) return note2;
      const img2 = this.findImageByBaseName(base);
      if (img2) return img2;
    }

    // 兜底：目标本身就是一个已索引的笔记名
    return this.index.fileByName.get(t);
  }
  
  /**
   * 获取受影响的链接数量（用于移动/重命名前的提示）
   */
  getAffectedLinkCount(oldPath: string, _newPath: string, vaultPath: string): { filesCount: number; linksCount: number } {
    const oldNoteName = this.pathToNoteName(oldPath, vaultPath);
    const backlinkFiles = this.index.backlinks.get(oldNoteName) || [];
    let linksCount = 0;
    for (const filePath of backlinkFiles) {
      const targets = this.index.outlinks.get(filePath) || [];
      linksCount += targets.filter(t => t === oldNoteName).length;
    }
    return { filesCount: backlinkFiles.length, linksCount };
  }

  /**
   * 重写所有引用旧笔记名的 wiki links 为新笔记名
   */
  async rewriteWikiLinks(
    oldPath: string,
    newPath: string,
    vaultPath: string
  ): Promise<{ filesUpdated: number; linksUpdated: number }> {
    const oldNoteName = this.pathToNoteName(oldPath, vaultPath);
    const newNoteName = this.pathToNoteName(newPath, vaultPath);

    if (oldNoteName === newNoteName) {
      return { filesUpdated: 0, linksUpdated: 0 };
    }

    const backlinkFiles = this.index.backlinks.get(oldNoteName) || [];
    if (backlinkFiles.length === 0) {
      return { filesUpdated: 0, linksUpdated: 0 };
    }

    // 转义正则特殊字符
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedOld = escapeRegex(oldNoteName);
    // 匹配 [[noteName]] 或 ![[noteName]]，后面跟 ]、# 或 |
    const linkPattern = "(!?\\[\\[" + escapedOld + ")(?=\\]\\]|[#\\|])";
    const linkRegex = new RegExp(linkPattern, "g");

    let filesUpdated = 0;
    let linksUpdated = 0;

    for (const filePath of backlinkFiles) {
      try {
        const content = await readTextFile(filePath);
        const newContent = content.replace(linkRegex, (_match, prefix) => {
          linksUpdated++;
          return prefix.replace(oldNoteName, newNoteName);
        });

        if (newContent !== content) {
          await writeTextFile(filePath, newContent);
          filesUpdated++;
          // 更新该文件的链接索引
          await this.updateFileLinks(filePath, vaultPath);
        }
      } catch (e) {
        console.error(`重写 wiki links 失败: ${filePath}`, e);
      }
    }

    // 更新 fileByName 中的条目
    this.index.fileByName.delete(oldNoteName);
    this.index.fileByName.set(newNoteName, newPath);

    return { filesUpdated, linksUpdated };
  }

  /**
   * 搜索笔记（用于自动补全）
   */
  searchNotes(query: string): { name: string; path: string }[] {
    const results: { name: string; path: string }[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [name, path] of this.index.fileByName) {
      const basename = name.split('/').pop() || name;
      if (name.toLowerCase().includes(lowerQuery) || basename.toLowerCase().includes(lowerQuery)) {
        results.push({ name, path });
      }
    }

    return results;
  }
  
  /**
   * 路径转笔记名
   */
  private pathToNoteName(filePath: string, vaultPath: string): string {
    const relative = filePath.slice(vaultPath.length).replace(/^[/\\]/, '');
    return relative.replace(/\.[^.]+$/, '').replace(/[/\\]/g, '/');
  }
  
  /**
   * 递归获取目录下所有文件（含图片等非笔记文件）
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readDir(dirPath);

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory) {
        files.push(...await this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * 根据图片完整文件名（含扩展名）查找图片路径，大小写不敏感，同名取路径最短
   * 用于解析 Obsidian 风格的 ![[图片.png]] 嵌入
   */
  findImageByBaseName(name: string): string | undefined {
    const lower = name.toLowerCase();
    return this.index.imageByName.get(lower);
  }

  /**
   * 将索引序列化为 JSON（用于跨窗口传递）
   */
  serialize(): string {
    return JSON.stringify({
      outlinks: Array.from(this.index.outlinks.entries()),
      backlinks: Array.from(this.index.backlinks.entries()),
      fileByName: Array.from(this.index.fileByName.entries()),
      imageByName: Array.from(this.index.imageByName.entries()),
    });
  }

  /**
   * 从 JSON 反序列化索引
   */
  deserialize(json: string): void {
    try {
      const data = JSON.parse(json);
      this.index.outlinks = new Map(data.outlinks);
      this.index.backlinks = new Map(data.backlinks);
      this.index.fileByName = new Map(data.fileByName);
      this.index.imageByName = new Map(data.imageByName || []);
    } catch {
      // 数据损坏，忽略
    }
  }

  /**
   * 检查索引是否已有数据
   */
  isEmpty(): boolean {
    return this.index.fileByName.size === 0;
  }
}

export const LinkIndexService = new LinkIndexServiceImpl();
