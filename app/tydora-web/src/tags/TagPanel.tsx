// TagPanel.tsx —— 右侧栏「标签」面板。
// 以列表形式展示当前知识库所有标签（按使用次数排序），支持文本过滤；
// 头部提供「标签图谱」切换：以图谱形式展示所有标签，
// 同一篇文档中同时出现的标签彼此相连（复用 WebGL GraphCanvas + d3 force）。
// 点击标签 / 图谱节点 → 通知侧栏把左侧搜索框填入 #标签名 进行全局筛选。

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TagIndexService } from "./TagIndexService";
import { GraphCanvas, type GraphData } from "../graph/GraphCanvas";
import "./TagPanel.css";

interface TagPanelProps {
  vaultPath: string | null;
  /** 索引刷新计数：文件 watcher / 索引重建完成后自增以刷新列表与图谱 */
  refreshTick?: number;
  /** 点击标签（列表项或图谱节点）时触发 */
  onSelectTag: (tag: string) => void;
}

interface TagEntry {
  tag: string;
  count: number;
}

/** 由标签索引构建共现图谱：同一文档中同时出现的标签彼此相连 */
function buildTagGraph(): GraphData {
  const entries = TagIndexService.getAllFileTagEntries();
  const tags: string[] = [];
  for (const [, fileTags] of entries) {
    for (const tag of fileTags) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  if (tags.length === 0) return { nodes: [], links: [] };

  const nodeSet = new Set(tags);
  const nodes = tags.map((tag) => ({ slug: tag, title: tag, degree: 0 }));

  const links: { source: string; target: string }[] = [];
  const seen = new Set<string>();
  for (const [, fileTags] of entries) {
    for (let i = 0; i < fileTags.length; i++) {
      for (let j = i + 1; j < fileTags.length; j++) {
        const [a, b] =
          fileTags[i] < fileTags[j]
            ? [fileTags[i], fileTags[j]]
            : [fileTags[j], fileTags[i]];
        const key = a + "\u0000" + b;
        if (seen.has(key)) continue;
        seen.add(key);
        if (nodeSet.has(a) && nodeSet.has(b)) {
          links.push({ source: a, target: b });
        }
      }
    }
  }

  return { nodes, links };
}

export function TagPanel({ vaultPath, refreshTick = 0, onSelectTag }: TagPanelProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [showGraph, setShowGraph] = useState(false);
  // refreshTick 变化时强制重渲染（面板复用挂载时保证列表/图谱取到最新索引）
  const [, setTick] = useState(0);
  useEffect(() => {
    setTick((n) => n + 1);
  }, [refreshTick]);

  const tags = useMemo<TagEntry[]>(() => {
    void refreshTick;
    void vaultPath;
    return TagIndexService.getAllTags().map((tag) => ({
      tag,
      count: TagIndexService.getTagCount(tag),
    }));
  }, [vaultPath, refreshTick]);

  const filtered = useMemo<TagEntry[]>(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, filter]);

  const graph = useMemo<GraphData>(() => {
    void refreshTick;
    if (!showGraph) return { nodes: [], links: [] };
    return buildTagGraph();
  }, [showGraph, refreshTick]);

  const isEmpty = tags.length === 0;

  return (
    <div className="tag-panel">
      {!isEmpty && (
        <div className="tag-panel-header">
          <input
            className="tag-filter-input"
            type="text"
            placeholder={t("sidebar.tags.filterPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            className={`tag-panel-graph-btn${showGraph ? " active" : ""}`}
            title={showGraph ? t("sidebar.tags.listView") : t("sidebar.tags.graphView")}
            onClick={() => setShowGraph((prev) => !prev)}
          >
            {showGraph ? (
              // 列表视图图标
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            ) : (
              // 图谱视图图标
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="3" />
                <circle cx="4" cy="19" r="3" />
                <circle cx="20" cy="19" r="3" />
                <line x1="9.5" y1="6.5" x2="5.5" y2="16.5" />
                <line x1="14.5" y1="6.5" x2="18.5" y2="16.5" />
                <line x1="7" y1="19" x2="17" y2="19" />
              </svg>
            )}
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className="tag-panel-empty">
          <div className="tag-panel-empty-text">{t("sidebar.tags.empty")}</div>
        </div>
      ) : showGraph ? (
        <div className="tag-graph-host">
          <GraphCanvas
            data={graph}
            alwaysLabels
            maxZoom={1.6}
            onNodeClick={(slug) => onSelectTag(slug)}
          />
          <div className="tag-graph-hint">{t("sidebar.tags.graphHint")}</div>
        </div>
      ) : (
        <div className="tag-list">
          {filtered.length === 0 ? (
            <div className="tag-panel-empty">
              <div className="tag-panel-empty-text">{t("sidebar.tags.noMatch")}</div>
            </div>
          ) : (
            filtered.map(({ tag, count }) => (
              <div
                key={tag}
                className="tag-item"
                onClick={() => onSelectTag(tag)}
                title={t("sidebar.tags.searchTag", { tag: `#${tag}` })}
              >
                <span className="tag-item-hash">#</span>
                <span className="tag-item-name">{tag}</span>
                <span className="tag-item-count">{count}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
