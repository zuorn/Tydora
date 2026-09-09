// tagSearch.ts —— 「#标签名 [关键字]」查询语法解析与标签文件集合解析。
// 供左侧栏全局搜索（SearchResults）与快速打开弹框（QuickOpen）共用。

import { TagIndexService } from "./TagIndexService";

export interface TagSearchQuery {
  /** 标签名（不含 #，保留原始大小写） */
  tag: string;
  /** 空格后的关键字（可能为空串，表示仅按标签筛选） */
  keyword: string;
}

/**
 * 解析「#标签名 [关键字]」查询。
 * 匹配返回 { tag, keyword }（keyword 已 trim，可为空）；
 * 非 # 开头或格式不符时返回 null（走原有搜索逻辑）。
 */
export function parseTagSearchQuery(query: string): TagSearchQuery | null {
  const trimmed = query.trim();
  if (!trimmed.startsWith("#")) return null;
  const m = /^#([^\s#]+)(?:\s+([\s\S]+))?$/.exec(trimmed);
  if (!m) return null;
  return { tag: m[1], keyword: (m[2] ?? "").trim() };
}

/**
 * 解析标签对应的文件集合（含层级前缀匹配：#状态 命中 #状态/待整理）。
 * 传入 vaultPath 时仅保留该仓库内的文件。
 */
export function resolveTagFileSet(tag: string, vaultPath?: string | null): Set<string> {
  const lower = tag.toLowerCase();
  const set = new Set<string>();
  for (const t of TagIndexService.getAllTags()) {
    const tl = t.toLowerCase();
    if (tl === lower || tl.startsWith(lower)) {
      for (const p of TagIndexService.getTagFiles(t)) set.add(p);
    }
  }
  if (vaultPath) {
    const vaultNorm = vaultPath.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
    for (const p of Array.from(set)) {
      const norm = p.replace(/\\/g, "/").toLowerCase();
      if (!norm.startsWith(vaultNorm + "/")) set.delete(p);
    }
  }
  return set;
}
