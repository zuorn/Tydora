import { useEffect, useMemo } from "react";
import { LinkIndexService } from "../wikilink";
import { GraphCanvas, type GraphData } from "./GraphCanvas";
import "./GraphView.css";

interface GraphViewProps {
  vaultPath: string | null;
  onSelectNote: (path: string) => void;
  onClose?: () => void;
  standalone?: boolean;
  refreshKey?: number;
}

export function GraphView({ vaultPath, onSelectNote, onClose, standalone = false, refreshKey = 0 }: GraphViewProps) {
  // ESC 关闭图谱覆盖层
  useEffect(() => {
    if (standalone || !onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [standalone, onClose]);

  const graphData = useMemo<GraphData>(() => {
    if (!vaultPath) return { nodes: [], links: [] };

    const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    const vaultNorm = norm(vaultPath);

    // 只保留当前仓库内的笔记（索引可能在增量构建时混入其他仓库的数据）
    const allNotes = LinkIndexService.searchNotes("").filter((note) =>
      norm(note.path).startsWith(vaultNorm),
    );

    // 建立路径 → basename 查找表
    const pathByBasename = new Map<string, string>();
    for (const note of allNotes) {
      const basename = note.name.split('/').pop()?.toLowerCase() || note.name.toLowerCase();
      if (!pathByBasename.has(basename)) {
        pathByBasename.set(basename, note.path);
      }
    }

    const resolvePath = (name: string): string | undefined => {
      const exact = allNotes.find(n => n.name === name);
      if (exact) return exact.path;
      const basename = name.split('/').pop()?.toLowerCase() || name.toLowerCase();
      return pathByBasename.get(basename);
    };

    const nodes = allNotes.map((note) => ({
      slug: note.path,
      title: note.name.split('/').pop() || note.name,
      degree: 0, // degree is computed by the canvas from adjacency
    }));

    const nodeMap = new Map(nodes.map(n => [n.slug, n]));

    const links: { source: string; target: string }[] = [];
    for (const note of allNotes) {
      const outlinks = LinkIndexService.getOutlinksForFile(note.path);
      for (const target of outlinks) {
        const resolved = resolvePath(target);
        if (resolved && nodeMap.has(resolved) && nodeMap.has(note.path)) {
          links.push({ source: note.path, target: resolved });
        }
      }
    }

    return { nodes, links };
  }, [vaultPath, refreshKey]);

  return (
    <div
      className={standalone ? "graph-view-standalone" : "graph-view-overlay"}
      style={{ width: '100%', height: '100%' }}
    >
      {!standalone && onClose && (
        <button className="graph-view-close-btn" onClick={onClose} title="返回">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      )}
      <div className="graph-view-container" style={{ position: 'relative' }}>
        <GraphCanvas
          data={graphData}
          maxZoom={1}
          onNodeClick={(slug) => {
            onSelectNote(slug);
            onClose?.();
          }}
        />
      </div>
    </div>
  );
}
