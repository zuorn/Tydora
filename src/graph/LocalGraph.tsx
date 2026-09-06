// LocalGraph.tsx —— 侧栏「大纲」面板顶部的本地图谱。
// 展示当前笔记的「深度 1 邻域」：当前笔记 + 所有直接邻居（入链 + 出链），
// 以及它们之间的所有边。与发布站点（markdown-publish）右上角的本地图谱行为一致：
// 节点标题取自 frontmatter title → 首个 H1 → 文件名；复用 WebGL 渲染 + d3 force 模拟。

import { useEffect, useMemo, useState } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { LinkIndexService } from "../wikilink";
import { extractFrontmatter, parseFrontmatter } from "../Editor/frontmatter";
import { GraphCanvas, type GraphData, type GraphNode } from "./GraphCanvas";
import "./LocalGraph.css";

interface LocalGraphProps {
  vaultPath: string | null;
  /** 当前打开的笔记文件（绝对路径） */
  filePath: string | null;
  onSelectFile: (path: string) => void;
  /** 链接索引刷新计数：文件 watcher/保存/索引构建完成后自增以触发重绘 */
  refreshTick?: number;
}

/** 从 markdown 内容提取笔记标题：frontmatter title → 首个 H1 → 给定 fallback */
function extractNoteTitle(content: string, fallback: string): string {
  const { frontmatter, body } = extractFrontmatter(content);
  if (frontmatter) {
    const data = parseFrontmatter(frontmatter);
    if (typeof data.title === "string" && data.title.trim()) {
      return data.title.trim();
    }
  }
  const h1 = /^#\s+(.+)$/m.exec(body);
  if (h1) return h1[1].trim();
  return fallback;
}

function buildLocalGraph(filePath: string, vaultPath: string): GraphData {
  // 与静态站点（vendor/markdown-publish 的 local-graph.ts）的本地图谱保持一致：
  // 先构建当前仓库的完整图谱（笔记为节点、已解析的出链为边），再以当前笔记为中心
  // 提取「深度 1 邻域」——当前笔记 + 所有直接邻居（入链 + 出链），以及它们之间的
  // 所有边。不包含死链（missing）节点，与发布站点行为对齐。
  //
  // 注意：节点 slug 与边的 source/target 必须使用完全相同的路径字符串，
  // 否则 GraphCanvas 会把边过滤掉（导致看不到连线）。这里与全局图谱 GraphView
  // 保持一致，直接使用索引中的原始路径，不做分隔符转换。
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  const vaultNorm = norm(vaultPath);

  // 只取当前仓库内的 .md 笔记（与发布站点 graph.json 的节点集合一致，不含 canvas）
  const allNotes = LinkIndexService.searchNotes("").filter(
    (note) =>
      norm(note.path).startsWith(vaultNorm) &&
      note.path.toLowerCase().endsWith(".md"),
  );

  // 按 basename（大小写不敏感）建立路径索引，用于解析 wiki 链接目标
  const pathByBasename = new Map<string, string>();
  for (const note of allNotes) {
    const basename = note.name.split("/").pop()?.toLowerCase() || note.name.toLowerCase();
    if (!pathByBasename.has(basename)) {
      pathByBasename.set(basename, note.path);
    }
  }

  const resolvePath = (name: string): string | undefined => {
    const exact = allNotes.find((n) => n.name === name);
    if (exact) return exact.path;
    const basename = name.split("/").pop()?.toLowerCase() || name.toLowerCase();
    return pathByBasename.get(basename);
  };

  // 节点：slug 直接用索引中的原始路径（与 GraphView 一致）
  const nodes = allNotes.map((note) => ({
    slug: note.path,
    title: note.name.split("/").pop() || note.name,
    degree: 0,
  }));
  const nodeMap = new Map(nodes.map((n) => [n.slug, n]));

  // 完整边列表：source/target 直接用原始路径，确保与节点 slug 完全一致
  const fullLinks: { source: string; target: string }[] = [];
  for (const note of allNotes) {
    const outlinks = LinkIndexService.getOutlinksForFile(note.path);
    for (const target of outlinks) {
      const resolved = resolvePath(target);
      if (!resolved) continue;
      if (resolved === note.path) continue; // 自环
      if (!nodeMap.has(resolved)) continue; // 仅保留仓库内笔记
      fullLinks.push({ source: note.path, target: resolved });
    }
  }

  // 深度 1 邻域：自身 + 所有直接邻居（出链目标 & 入链来源）
  // 用归一化路径做集合比较，避免分隔符差异导致当前笔记匹配不上
  const me = norm(filePath);
  const keep = new Set<string>([me]);
  for (const l of fullLinks) {
    if (norm(l.source) === me) keep.add(norm(l.target));
    else if (norm(l.target) === me) keep.add(norm(l.source));
  }

  // 过滤节点与边：仅保留邻域内的，且边的两端都在邻域内
  const keptNodes = nodes.filter((n) => keep.has(norm(n.slug)));
  const keptLinks = fullLinks.filter(
    (l) => keep.has(norm(l.source)) && keep.has(norm(l.target)),
  );

  return { nodes: keptNodes, links: keptLinks };
}

export function LocalGraph({ vaultPath, filePath, onSelectFile, refreshTick = 0 }: LocalGraphProps) {
  const baseGraph = useMemo<GraphData>(() => {
    if (!vaultPath || !filePath) return { nodes: [], links: [] };
    return buildLocalGraph(filePath, vaultPath);
  }, [vaultPath, filePath, refreshTick]);

  // 异步读取邻域内每个笔记的内容，把节点标题从文件名升级为真正的笔记标题
  // （frontmatter title → 首个 H1 → 文件名），与发布站点 graph.json 的 title 一致。
  const [graph, setGraph] = useState<GraphData>(baseGraph);

  useEffect(() => {
    setGraph(baseGraph);
    if (baseGraph.nodes.length === 0) return;

    let cancelled = false;
    (async () => {
      const titleBySlug = new Map<string, string>();
      await Promise.all(
        baseGraph.nodes.map(async (node) => {
          try {
            const content = await readTextFile(node.slug);
            const title = extractNoteTitle(content, node.title);
            titleBySlug.set(node.slug, title);
          } catch {
            // 读取失败则保留文件名占位
          }
        }),
      );
      if (cancelled) return;
      setGraph((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n: GraphNode) => ({
          ...n,
          title: titleBySlug.get(n.slug) ?? n.title,
        })),
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [baseGraph]);

  const isEmpty = graph.nodes.length === 0;

  return (
    <div className="local-graph">
      <GraphCanvas
        data={graph}
        activeSlug={filePath}
        alwaysLabels
        maxZoom={1.6}
        onNodeClick={(slug) => {
          onSelectFile(slug);
        }}
      />
      {isEmpty && <div className="local-graph-hint">No linked notes</div>}
    </div>
  );
}
