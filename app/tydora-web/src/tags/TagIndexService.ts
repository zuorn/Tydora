// src/tags/TagIndexService.ts

import { readDir, readTextFile } from "@tauri-apps/plugin-fs";

/** 解析 Markdown 文本中的所有 #标签 */
export function parseTags(content: string): string[] {
  const tags = new Set<string>();
  // 匹配 #标签：以 # 开头，后面跟着非空白、非 #、非标点的字符
  // 支持中文、英文、数字、下划线、连字符、斜杠（如 #状态/待整理）
  const regex = /(?<=^|\s|[\(\[\{，,。！？；;：:"'`])#([^\s#\]\)\}，,。！？；;：:"'`、/\\]+(?:\/[^\s#\]\)\}，,。！？；;：:"'`、/\\]+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const tag = match[1].trim();
    if (tag && !/^\d+$/.test(tag)) { // 排除纯数字（避免时间戳等误匹配）
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

/** 解析单个文件内容，抽取标签 */
export function extractTagsFromContent(content: string): string[] {
  const tags = new Set<string>();

  // 1. 从 frontmatter 的 tags 字段解析
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const tagsLineMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m) || fm.match(/^tags:\s*([^\n]*)/m);
    if (tagsLineMatch) {
      const raw = tagsLineMatch[1] || "";
      raw.split(/[,，\s]+/).forEach((t) => {
        const clean = t.trim().replace(/^['"](.*)['"]$/, "$1");
        if (clean) tags.add(clean.replace(/^#/, ""));
      });
    }
    // YAML 列表风格
    const listMatches = [...fm.matchAll(/^\s*-\s*#?([^\n#]+)/gm)];
    listMatches.forEach((m) => {
      const clean = m[1].trim().replace(/^['"](.*)['"]$/, "$1");
      if (clean) tags.add(clean);
    });
  }

  // 2. 从正文解析 #标签
  const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
  parseTags(body).forEach((t) => tags.add(t));

  return Array.from(tags);
}

export interface TagIndex {
  /** 文件路径 → 该文件的标签列表 */
  fileTags: Map<string, string[]>;
  /** 标签名 → 使用该标签的文件路径列表 */
  tagFiles: Map<string, string[]>;
  /** 标签使用次数（用于排序） */
  tagCount: Map<string, number>;
}

class TagIndexServiceImpl {
  private index: TagIndex = {
    fileTags: new Map(),
    tagFiles: new Map(),
    tagCount: new Map(),
  };

  private async getAllMarkdownFiles(vaultPath: string): Promise<string[]> {
    const files: string[] = [];
    const walk = async (dir: string) => {
      try {
        const entries = await readDir(dir);
        for (const entry of entries) {
          if (entry.name?.startsWith(".")) continue;
          const fullPath = dir + "/" + entry.name;
          if (entry.isDirectory) {
            await walk(fullPath);
          } else if (entry.name?.toLowerCase().endsWith(".md")) {
            files.push(fullPath);
          }
        }
      } catch {}
    };
    await walk(vaultPath);
    return files;
  }

  /** 全量构建标签索引（保留原始签名以向后兼容；新调用点优先使用 buildIndexWithFiles）。 */
  async buildIndex(vaultPath: string): Promise<void> {
    this.index = {
      fileTags: new Map(),
      tagFiles: new Map(),
      tagCount: new Map(),
    };
    if (!vaultPath) return;

    const files = await this.getAllMarkdownFiles(vaultPath);
    await this.buildIndexWithFiles(files);
  }

  /**
   * 基于外部提供的 md 文件列表构建索引（策略 B：消除重复的目录遍历 IPC）。
   * 可选 contents 参数：若 index-builder 已批量 readTextFile 则直接复用（策略 C）。
   *
   * 注意：本方法不清空现有索引；切仓库或全量重建时，调用方先 clear() 或配合 deserialize 使用。
   */
  async buildIndexWithFiles(
    mdFiles: string[],
    contents?: Map<string, string>,
  ): Promise<void> {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < mdFiles.length; i += CHUNK_SIZE) {
      const chunk = mdFiles.slice(i, i + CHUNK_SIZE);
      const chunkContents = await Promise.all(
        chunk.map((p) => {
          const cached = contents?.get(p);
          if (cached !== undefined) return cached;
          return readTextFile(p).catch(() => "");
        }),
      );
      for (let j = 0; j < chunk.length; j++) {
        if (chunkContents[j]) {
          this.addFileTagsInternalSync(chunk[j], chunkContents[j]);
        }
      }
    }
  }

  /**
   * 已有内容字符串时，同步写入标签索引。
   * 供 index-builder（策略 C 共享 readTextFile 结果）与增量刷新复用。
   * 原 private addFileTagsInternal 改名并升级为 public，语义一致。
   */
  addFileTagsInternalSync(filePath: string, content: string): void {
    // 移除旧的
    this.removeFileTagsInternal(filePath);

    const tags = extractTagsFromContent(content);
    if (tags.length === 0) return;

    this.index.fileTags.set(filePath, tags);
    for (const tag of tags) {
      const files = this.index.tagFiles.get(tag) || [];
      if (!files.includes(filePath)) {
        files.push(filePath);
        this.index.tagFiles.set(tag, files);
      }
      this.index.tagCount.set(tag, (this.index.tagCount.get(tag) || 0) + 1);
    }
  }

  /** 与 addFileTagsInternalSync 语义相同；保留旧名作为内部别名，降低外部引用风险。 */
  private addFileTagsInternal(filePath: string, content: string): void {
    this.addFileTagsInternalSync(filePath, content);
  }

  private removeFileTagsInternal(filePath: string) {
    const oldTags = this.index.fileTags.get(filePath);
    if (oldTags) {
      for (const tag of oldTags) {
        const files = this.index.tagFiles.get(tag);
        if (files) {
          const filtered = files.filter((f) => f !== filePath);
          if (filtered.length === 0) {
            this.index.tagFiles.delete(tag);
            this.index.tagCount.delete(tag);
          } else {
            this.index.tagFiles.set(tag, filtered);
            this.index.tagCount.set(tag, filtered.length);
          }
        }
      }
      this.index.fileTags.delete(filePath);
    }
  }

  /** 将索引序列化为 JSON（持久化到 localStorage，跨启动复用 → 策略 A）。 */
  serialize(): string {
    return JSON.stringify({
      fileTags: Array.from(this.index.fileTags.entries()),
      tagFiles: Array.from(this.index.tagFiles.entries()),
      tagCount: Array.from(this.index.tagCount.entries()),
    });
  }

  /** 从 JSON 反序列化恢复索引（毫秒级恢复，策略 A 的关键）。 */
  deserialize(json: string): void {
    try {
      const data = JSON.parse(json) as {
        fileTags?: Array<[string, string[]]>;
        tagFiles?: Array<[string, string[]]>;
        tagCount?: Array<[string, number]>;
      };
      this.index.fileTags = new Map(data.fileTags || []);
      this.index.tagFiles = new Map(data.tagFiles || []);
      this.index.tagCount = new Map(data.tagCount || []);
    } catch {
      // 数据损坏或版本不兼容时忽略，调用方随后会走全量重建兜底。
    }
  }

  /** 索引是否为空（用于判断 deserialize 是否生效、决定是否需要全量构建）。 */
  isEmpty(): boolean {
    return this.index.fileTags.size === 0;
  }

  /** 增量更新单个文件的标签 */
  async updateFileTags(filePath: string, content?: string): Promise<void> {
    if (!filePath) return;
    if (content === undefined) {
      try {
        content = await readTextFile(filePath);
      } catch {
        return;
      }
    }
    this.addFileTagsInternal(filePath, content);
  }

  /** 从索引中移除文件 */
  removeFile(filePath: string) {
    this.removeFileTagsInternal(filePath);
  }

  /** 获取所有标签，按使用次数排序 */
  getAllTags(): string[] {
    return Array.from(this.index.tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }

  /** 搜索标签（前缀匹配 + 包含匹配） */
  searchTags(query: string, limit = 20): string[] {
    const all = this.getAllTags();
    if (!query) return all.slice(0, limit);
    const lower = query.toLowerCase();
    const prefixMatches: string[] = [];
    const containsMatches: string[] = [];
    for (const tag of all) {
      const tl = tag.toLowerCase();
      if (tl.startsWith(lower)) {
        prefixMatches.push(tag);
      } else if (tl.includes(lower)) {
        containsMatches.push(tag);
      }
      if (prefixMatches.length + containsMatches.length >= limit) break;
    }
    return [...prefixMatches, ...containsMatches].slice(0, limit);
  }

  /** 获取单个文件的标签 */
  getFileTags(filePath: string): string[] {
    return this.index.fileTags.get(filePath) || [];
  }

  /** 获取使用某标签的所有文件 */
  getTagFiles(tag: string): string[] {
    return this.index.tagFiles.get(tag) || [];
  }

  /** 获取标签使用次数 */
  getTagCount(tag: string): number {
    return this.index.tagCount.get(tag) || 0;
  }

  /** 清空索引 */
  clear() {
    this.index = {
      fileTags: new Map(),
      tagFiles: new Map(),
      tagCount: new Map(),
    };
  }
}

export const TagIndexService = new TagIndexServiceImpl();
