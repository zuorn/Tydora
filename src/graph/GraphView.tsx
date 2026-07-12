import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { LinkIndexService } from "../wikilink";
import { GRAPH_SETTINGS_KEY, DEFAULT_GRAPH, type GraphSettings } from "../Settings";
import "./GraphView.css";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  group: string;
  linkCount: number;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphViewProps {
  vaultPath: string | null;
  onSelectNote: (path: string) => void;
  onClose?: () => void;
  standalone?: boolean;
  refreshKey?: number;
}

interface Tooltip {
  x: number;
  y: number;
  node: GraphNode;
}

export function GraphView({ vaultPath, onSelectNote, onClose, standalone = false, refreshKey = 0 }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const { nodes, edges } = useMemo(() => {
    if (!vaultPath) return { nodes: [], edges: [] };

    const allNotes = LinkIndexService.searchNotes('');

    // 建立路径 → basename 查找表（避免 O(N²) findFileByNoteName 调用）
    const pathByBasename = new Map<string, string>();
    for (const note of allNotes) {
      const basename = note.name.split('/').pop()?.toLowerCase() || note.name.toLowerCase();
      if (!pathByBasename.has(basename)) {
        pathByBasename.set(basename, note.path);
      }
    }

    const resolvePath = (name: string): string | undefined => {
      // 先精确匹配
      const exact = allNotes.find(n => n.name === name);
      if (exact) return exact.path;
      // basename 匹配
      const basename = name.split('/').pop()?.toLowerCase() || name.toLowerCase();
      return pathByBasename.get(basename);
    };

    // 计算入链数
    const inboundCount: Record<string, number> = {};
    for (const note of allNotes) {
      const outlinks = LinkIndexService.getOutlinks(note.path);
      for (const target of outlinks) {
        const resolved = resolvePath(target);
        if (resolved) {
          inboundCount[resolved] = (inboundCount[resolved] ?? 0) + 1;
        }
      }
    }

    // 创建节点
    const nodeArr: GraphNode[] = allNotes.map((note) => ({
      id: note.path,
      label: note.name.split('/').pop() || note.name,
      group: note.name.includes('/') ? note.name.substring(0, note.name.lastIndexOf('/')) : 'root',
      linkCount: inboundCount[note.path] ?? 0,
    }));

    const nodeMap = new Map(nodeArr.map(n => [n.id, n]));

    // 创建边
    const graphEdges: GraphEdge[] = [];
    for (const note of allNotes) {
      const outlinks = LinkIndexService.getOutlinks(note.path);
      for (const target of outlinks) {
        const resolved = resolvePath(target);
        if (resolved && nodeMap.has(resolved) && nodeMap.has(note.path)) {
          graphEdges.push({ source: note.path, target: resolved });
        }
      }
    }

    return { nodes: nodeArr, edges: graphEdges };
  }, [vaultPath, refreshKey]);

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;

    const groups = [...new Set(nodes.map((n) => n.group))];
    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(groups);

    let simulation: d3.Simulation<GraphNode, GraphEdge> | null = null;

    const init = (width: number, height: number) => {
      // 读取图谱设置
      let gs: GraphSettings = DEFAULT_GRAPH;
      try {
        const saved = localStorage.getItem(GRAPH_SETTINGS_KEY);
        if (saved) gs = { ...DEFAULT_GRAPH, ...JSON.parse(saved) };
      } catch {}

      const css = getComputedStyle(document.documentElement);
      const colorText = css.getPropertyValue("--text-primary").trim() || '#cdd6f4';
      const colorBorder = css.getPropertyValue("--border").trim() || '#45475a';
      const colorBase = css.getPropertyValue("--bg-primary").trim() || '#1e1e2e';

      const svg = d3.select(svgRef.current!);
      svg.selectAll("*").remove();

      const g = svg.append("g");
      const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => g.attr("transform", event.transform));
      svg.call(zoomBehavior);

      const simNodes: GraphNode[] = nodes.map((n) => ({ ...n }));
      const simEdges: GraphEdge[] = edges.map((e) => ({ ...e }));

      // 预计算圆周位置，以视口中心为圆心
      const initRadius = Math.max(80, Math.min(250, simNodes.length * 4));
      simNodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / simNodes.length;
        n.x = width / 2 + initRadius * Math.cos(angle);
        n.y = height / 2 + initRadius * Math.sin(angle);
      });

      simulation = d3
        .forceSimulation<GraphNode>(simNodes)
        .alpha(0.3)
        .alphaDecay(0.05)
        .force("link", d3.forceLink<GraphNode, GraphEdge>(simEdges).id((d) => d.id).distance(gs.linkDistance))
        .force("charge", d3.forceManyBody().strength(gs.chargeStrength).distanceMax(250))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1))
        .force("collision", d3.forceCollide(30))
        .force("x", d3.forceX(width / 2).strength(0.08))
        .force("y", d3.forceY(height / 2).strength(0.08));

      const link = g
        .append("g")
        .selectAll("line")
        .data(simEdges)
        .join("line")
        .attr("stroke", colorBorder)
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", gs.edgeOpacity);

      const maxLinks = Math.max(1, ...nodes.map((n) => n.linkCount));
      const radius = (d: GraphNode) => 3 + (d.linkCount / maxLinks) * (gs.nodeSize - 3);

      const node = g
        .append("g")
        .selectAll<SVGGElement, GraphNode>("g")
        .data(simNodes)
        .join("g")
        .style("cursor", "pointer")
        .call(
          d3.drag<SVGGElement, GraphNode>()
            .on("start", (event, d) => {
              if (!event.active) simulation!.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on("drag", (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on("end", (event, d) => {
              if (!event.active) simulation!.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            })
        );

      node
        .append("circle")
        .attr("r", radius)
        .attr("fill", (d) => color(d.group))
        .attr("stroke", colorBase)
        .attr("stroke-width", 1.5);

      node
        .append("text")
        .text((d) => d.label)
        .attr("x", (d) => radius(d) + 4)
        .attr("y", 4)
        .attr("font-size", gs.labelFontSize)
        .attr("fill", colorText)
        .style("pointer-events", "none");

      node.on("click", (_event, d) => {
        onSelectNote(d.id);
        onClose?.();
      });

      node
        .on("mouseover", (event, d) => {
          const connected = new Set<string>([d.id]);
          simEdges.forEach((e) => {
            const src = typeof e.source === "object" ? (e.source as GraphNode).id : e.source;
            const tgt = typeof e.target === "object" ? (e.target as GraphNode).id : e.target;
            if (src === d.id) connected.add(tgt);
            if (tgt === d.id) connected.add(src);
          });
          node.style("opacity", (n) => (connected.has(n.id) ? 1 : 0.2));
          link.style("opacity", (e) => {
            const src = typeof e.source === "object" ? (e.source as GraphNode).id : e.source;
            const tgt = typeof e.target === "object" ? (e.target as GraphNode).id : e.target;
            return src === d.id || tgt === d.id ? 1 : 0.05;
          });
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d });
        })
        .on("mousemove", (event) => {
          const rect = containerRef.current!.getBoundingClientRect();
          setTooltip((t) => t ? { ...t, x: event.clientX - rect.left, y: event.clientY - rect.top } : t);
        })
        .on("mouseout", () => {
          node.style("opacity", 1);
          link.style("opacity", 0.6);
          setTooltip(null);
        });

      let tickCount = 0;

      simulation.on("tick", () => {
        link
          .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
          .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
          .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
          .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

        node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

        // 前几帧后自适应铺满
        tickCount++;
        if (tickCount === 3) {
          fitToViewport();
        }
      });

      function fitToViewport() {
        if (simNodes.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of simNodes) {
          if (n.x != null && n.y != null) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x > maxX) maxX = n.x;
            if (n.y > maxY) maxY = n.y;
          }
        }

        const padding = 60;
        const graphW = maxX - minX + padding * 2;
        const graphH = maxY - minY + padding * 2;
        const scale = Math.min(width / graphW, height / graphH);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const tx = width / 2 - cx * scale;
        const ty = height / 2 - cy * scale;

        svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      }
    };

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        simulation?.stop();
        init(width, height);
      }
    });
    ro.observe(containerRef.current);

    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width > 0 && height > 0) {
      init(width, height);
    }

    return () => {
      ro.disconnect();
      simulation?.stop();
      setTooltip(null);
    };
  }, [nodes, edges, onSelectNote]);

  return (
    <div
      ref={containerRef}
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
        <svg
          ref={svgRef}
          className="graph-view-svg"
          style={{ background: 'var(--bg-primary)' }}
        />
        {tooltip && (
          <div
            className="graph-tooltip"
            style={{
              left: tooltip.x + 14,
              top: tooltip.y - 10,
            }}
          >
            <div className="graph-tooltip-name">{tooltip.node.label}</div>
            <div className="graph-tooltip-meta">
              {tooltip.node.linkCount} link{tooltip.node.linkCount !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
