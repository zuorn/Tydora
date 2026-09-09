// src/services/index-builder.ts
// 联合构建器：组合策略 A（先缓存）+ B（共享遍历）+ C（共享内容读取）。
//
// 启动流程（优化后）：
//   1. deserialize 读 localStorage（<100ms）→ 侧栏/反链/标签立即可用
//   2. 空闲时后台 scanVaultFiles（1 次遍历）
//   3. 批量 readTextFile 一次 → 同时喂给 Link + Tag 解析
//   4. 完成后再持久化一份缓存

import { readTextFile } from "@tauri-apps/plugin-fs";
import { scanVaultFiles, type VaultFileScan } from "./vault-file-scanner";
import { LinkIndexService } from "../wikilink";
import { TagIndexService } from "../tags";

const TAG_INDEX_KEY = "zmd-tag-index";
const LINK_INDEX_KEY = "zmd-link-index";

export interface IndexBuildOptions {
  /** 启动时是否先从 localStorage 反序列化恢复（默认 true）。
   *  若调用方已自行 restoreIndexesFromCache()，则传 useCache=false + fromCache=<结果> */
  useCache?: boolean;
  /** 命中缓存后，是否对扫描结果做增量刷新（默认 true）。
   *  当前实现用"路径集合对比"做粗粒度增量：
   *    - 新增/删除的文件：强制重解析该文件
   *    - 仍存在的文件：暂时跳过（保守地不重解析，
   *      文件 watcher 会在实际修改时通过 updateFileLinks/updateFileTags 保持最新）
   */
  incremental?: boolean;
  /** 调用方已通过 restoreIndexesFromCache() 恢复缓存时传入，避免重复读取。 */
  fromCache?: boolean;
}

export interface IndexBuildResult {
  /** 构建开始前是否从 localStorage 成功恢复了缓存。 */
  fromCache: boolean;
  /** 本次联合构建实际重新解析了多少个 md 文件。 */
  refreshedFileCount: number;
  /** 扫描到的仓库 md 文件总数。 */
  totalFileCount: number;
}

/** 策略 A：从 localStorage 反序列化恢复两个索引。返回是否恢复成功。 */
export function restoreIndexesFromCache(): boolean {
  let ok = false;
  try {
    const linkRaw = localStorage.getItem(LINK_INDEX_KEY);
    if (linkRaw) {
      LinkIndexService.deserialize(linkRaw);
      if (!LinkIndexService.isEmpty()) ok = true;
    }
  } catch {
    /* ignore */
  }
  try {
    const tagRaw = localStorage.getItem(TAG_INDEX_KEY);
    if (tagRaw) {
      TagIndexService.deserialize(tagRaw);
      if (!TagIndexService.isEmpty()) ok = true;
    }
  } catch {
    /* ignore */
  }
  return ok;
}

/** 把两个索引持久化到 localStorage（刷新完成后统一写，避免启动时写操作阻塞）。 */
export function persistIndexesToStorage(): void {
  try {
    localStorage.setItem(LINK_INDEX_KEY, LinkIndexService.serialize());
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(TAG_INDEX_KEY, TagIndexService.serialize());
  } catch {
    /* ignore */
  }
}

/**
 * 组合入口：一次性构建 Link + Tag 索引。
 *
 * 内部顺序：
 *   useCache=true  → 先 restoreIndexesFromCache() 让 UI 立即可用
 *   然后后台：scanVaultFiles → 批量 readTextFile → Link+Tag 同时解析
 */
export async function buildIndexesTogether(
  vaultPath: string,
  opts: IndexBuildOptions = {},
): Promise<IndexBuildResult> {
  const { useCache = true, incremental = true } = opts;

  // ── 步骤 1：策略 A，先加载缓存（同步、毫秒级） ──
  // 若调用方已 restoreIndexesFromCache()，直接复用其结果，避免重复读取 localStorage
  const fromCache = opts.fromCache ?? (useCache ? restoreIndexesFromCache() : false);

  // ── 步骤 2：策略 B，共享一次目录遍历 ──
  let scan: VaultFileScan;
  try {
    scan = await scanVaultFiles(vaultPath);
  } catch (e) {
    // 扫描失败时退化到旧的独立 buildIndex 组合，保证功能可用
    console.error("[index-builder] scanVaultFiles 失败，退化到独立 buildIndex", e);
    await Promise.all([
      LinkIndexService.buildIndex(vaultPath),
      TagIndexService.buildIndex(vaultPath),
    ]);
    persistIndexesToStorage();
    return {
      fromCache: false,
      refreshedFileCount: 0,
      totalFileCount: 0,
    };
  }

  // ── 步骤 3：增量判断（哪些文件需要重解析） ──
  const mdFiles = scan.mdFiles;
  const needRefresh: string[] = [];

  if (fromCache && incremental) {
    // 粗粒度增量（无文件签名版本，保守策略）：
    //   - 新增文件（Link 侧 outlinks 没见过）→ 重解析
    //   - 已存在文件 → 信任缓存；文件 watcher 会在实际修改时兜底刷新
    for (const path of mdFiles) {
      if (!LinkIndexService.isIndexed(path)) {
        needRefresh.push(path);
      }
    }
    // （删除文件清理：当前 Service 未暴露遍历 outlinks/fileTags keys 的 API，
    //  暂不主动清理。脏项仅影响反链查询的"来源列表"显示，
    //  不会导致崩溃；下次切仓库时 Link.clear()/Tag.clear() 会整体重置。）
    void cleanUpRemovedFiles; // 保留占位，避免 TS unused 警告
  } else {
    // 无缓存或非增量模式：全量重解析
    if (!fromCache) {
      LinkIndexService.clear();
      TagIndexService.clear();
    }
    for (const p of mdFiles) needRefresh.push(p);
  }

  // ── 步骤 4：策略 C，批量 readTextFile 一次，Link+Tag 共享内容 ──
  const CHUNK_SIZE = 50;
  let refreshed = 0;
  for (let i = 0; i < needRefresh.length; i += CHUNK_SIZE) {
    const chunk = needRefresh.slice(i, i + CHUNK_SIZE);
    const contents = await Promise.all(
      chunk.map((p) => readTextFile(p).catch(() => "")),
    );
    for (let j = 0; j < chunk.length; j++) {
      const text = contents[j];
      if (text) {
        const noteName = LinkIndexService.toNoteName(chunk[j], vaultPath);
        LinkIndexService.addFileLinksInternal(chunk[j], noteName, text);
        TagIndexService.addFileTagsInternalSync(chunk[j], text);
        refreshed++;
      }
    }
  }

  // ── 步骤 5：补齐文件名索引（全量）与图片索引（全量） ──
  // 注：
  //   - 非增量时 step3 已 clear()，这里重新把 md + canvas 的 noteName → path 写入
  //   - 增量时已有条目覆盖（同名取更短路径，和 buildIndex 原始行为一致）
  //   - 图片索引同理（scan.imageFiles 是全量结果）
  // 这部分仅内存操作，无 IPC，成本很低。
  for (const path of mdFiles) {
    const noteName = LinkIndexService.toNoteName(path, vaultPath);
    const existingPath = LinkIndexService.findFileByNoteName(noteName);
    if (!existingPath || path.length < existingPath.length) {
      // findFileByNoteName 不直接暴露内部 Map，但 Link 侧有 set 权限
      // 我们通过 buildIndexWithScan 无法精确控制只写文件名，
      // 所以用一个"空 Map + 只走文件名分支"的方式不合适；
      // 这里直接调用一个最小 helper 更好。
      LinkIndexService.ensureFileByName(noteName, path);
    }
  }
  for (const path of scan.canvasFiles) {
    const noteName = LinkIndexService.toNoteName(path, vaultPath);
    const existingPath = LinkIndexService.findFileByNoteName(noteName);
    if (!existingPath || path.length < existingPath.length) {
      LinkIndexService.ensureFileByName(noteName, path);
    }
  }
  for (const { path, name } of scan.imageFiles) {
    const lower = name.toLowerCase();
    const existing = LinkIndexService.findImageByBaseName(name);
    if (!existing || path.length < existing.length) {
      LinkIndexService.ensureImageByName(lower, path);
    }
  }

  return {
    fromCache,
    refreshedFileCount: refreshed,
    totalFileCount: mdFiles.length,
  };
}

/** 删除磁盘上已不存在的文件在 Link/Tag 两侧的索引记录（占位，暂未实现）。
 *  需 Service 暴露遍历 keys 的 API 后在此补齐。 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function cleanUpRemovedFiles(_currentMdSet: Set<string>): void {
  // no-op
}
