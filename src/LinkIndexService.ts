// src/LinkIndexService.ts

import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { parseWikiLinks } from "./LinkParser";

export interface LinkIndex {
  // 出链：文件路径 → 该文件包含的所有链接目标笔记名
  outlinks: Map<string, string[]>;
  // 反向链接：笔记名 → 引用它的所有文件路径列表
  backlinks: Map<string, string[]>;
  // 文件名索引：笔记名 → 文件路径（用于查找文件）
  fileByName: Map<string, string>;
}

class LinkIndexServiceImpl {
  private index: LinkIndex = {
    outlinks: new Map(),
    backlinks: new Map(),
    fileByName: new Map(),
  };
  
  /**
   * 全量构建索引（批量读取优化）
   */
  async buildIndex(vaultPath: string): Promise<void> {
    this.index = {
      outlinks: new Map(),
      backlinks: new Map(),
      fileByName: new Map(),
    };

    const files = await this.getAllMarkdownFiles(vaultPath);

    // 第一遍：建立文件名索引
    for (const filePath of files) {
      const noteName = this.pathToNoteName(filePath, vaultPath);
      this.index.fileByName.set(noteName, filePath);
    }

    // 第二遍：批量读取并解析链接（每批 50 个）
    const CHUNK_SIZE = 50;
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const contents = await Promise.all(chunk.map(f => readTextFile(f).catch(() => '')));

      for (let j = 0; j < chunk.length; j++) {
        if (contents[j]) {
          const links = parseWikiLinks(contents[j]);
          const targets = links.map(l => l.noteName);
          this.index.outlinks.set(chunk[j], targets);

          for (const target of targets) {
            const existing = this.index.backlinks.get(target) || [];
            if (!existing.includes(chunk[j])) {
              existing.push(chunk[j]);
              this.index.backlinks.set(target, existing);
            }
          }
        }
      }
    }
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
   * 获取所有 markdown 文件
   */
  private async getAllMarkdownFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readDir(dirPath);
    
    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory) {
        files.push(...await this.getAllMarkdownFiles(fullPath));
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * 将索引序列化为 JSON（用于跨窗口传递）
   */
  serialize(): string {
    return JSON.stringify({
      outlinks: Array.from(this.index.outlinks.entries()),
      backlinks: Array.from(this.index.backlinks.entries()),
      fileByName: Array.from(this.index.fileByName.entries()),
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
