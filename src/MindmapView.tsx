import { useRef, useEffect, useState, useCallback } from "react";
import { Transformer } from "markmap-lib";
import { Markmap, loadCSS, loadJS } from "markmap-view";
import { MINDMAP_SETTINGS_KEY, DEFAULT_MINDMAP, type MindmapSettings } from "./Settings";
import "./MindmapView.css";

declare global {
  interface Window {
    markmap?: any;
  }
}

interface MindmapViewProps {
  content: string;
}

const transformer = new Transformer();

function getMindmapSettings(): MindmapSettings {
  try {
    const saved = localStorage.getItem(MINDMAP_SETTINGS_KEY);
    return saved ? { ...DEFAULT_MINDMAP, ...JSON.parse(saved) } : DEFAULT_MINDMAP;
  } catch {
    return DEFAULT_MINDMAP;
  }
}

export default function MindmapView({ content }: MindmapViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  const [expandLevel, setExpandLevel] = useState(() => getMindmapSettings().initialExpandLevel);
  const effectiveExpandLevelRef = useRef<number>(getMindmapSettings().initialExpandLevel);

  const renderMindmap = useCallback(async (markdown: string) => {
    if (!svgRef.current) return;

    const { root, features } = transformer.transform(markdown);
    const assets = transformer.getUsedAssets(features);

    // Load CSS first (must be ready before rendering)
    if (assets.styles?.length) {
      await loadCSS(assets.styles).catch((err) =>
        console.warn("Failed to load markmap CSS:", err)
      );
    }

    // Load scripts (webfontloader + font config for KaTeX)
    if (assets.scripts?.length) {
      await loadJS(assets.scripts, {
        getMarkmap: () => window.markmap,
      }).catch((err) =>
        console.warn("Failed to load markmap JS:", err)
      );
    }

    const settings = getMindmapSettings();

    // Save fold state of ALL existing nodes before destroying
    const foldStateMap = new Map<string, number>();
    if (mmRef.current?.state?.data) {
      const collectFoldState = (node: any, path: string = "") => {
        const nodePath = path + "/" + (node.content || "");
        foldStateMap.set(nodePath, node.payload?.fold ?? 0);
        node.children?.forEach((child: any) => collectFoldState(child, nodePath));
      };
      collectFoldState(mmRef.current.state.data);
    }

    // Destroy and recreate
    if (mmRef.current) {
      mmRef.current.destroy();
      mmRef.current = null;
    }
    svgRef.current.innerHTML = "";

    mmRef.current = Markmap.create(svgRef.current, {
      autoFit: true,
      duration: settings.duration,
      maxWidth: settings.maxWidth,
      initialExpandLevel: effectiveExpandLevelRef.current,
      spacingHorizontal: settings.spacingHorizontal,
      spacingVertical: settings.spacingVertical,
      lineWidth: () => settings.lineWidth,
      embedGlobalCSS: true,
    }, root);

    // Restore fold state for existing nodes; new nodes stay expanded
    if (foldStateMap.size > 0 && mmRef.current?.state?.data) {
      const restoreFoldState = (node: any, path: string = "") => {
        const nodePath = path + "/" + (node.content || "");
        const savedFold = foldStateMap.get(nodePath);
        if (savedFold !== undefined && node.payload) {
          node.payload.fold = savedFold;
        }
        node.children?.forEach((child: any) => restoreFoldState(child, nodePath));
      };
      restoreFoldState(mmRef.current.state.data);
      mmRef.current.renderData(mmRef.current.state.data);

      // Recalculate effective expand level from restored tree
      const calcEffectiveLevel = (node: any, depth: number = 1): number => {
        if (!node.children || node.children.length === 0) return depth;
        if (node.payload?.fold) return depth - 1;
        let maxChild = depth;
        for (const child of node.children) {
          maxChild = Math.max(maxChild, calcEffectiveLevel(child, depth + 1));
        }
        return maxChild;
      };
      const newLevel = calcEffectiveLevel(mmRef.current.state.data);
      effectiveExpandLevelRef.current = newLevel;
      setExpandLevel(newLevel);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      renderMindmap(content);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, renderMindmap]);

  useEffect(() => {
    const handleResize = () => {
      if (mmRef.current) mmRef.current.fit();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (mmRef.current) {
        mmRef.current.destroy();
        mmRef.current = null;
      }
    };
  }, []);

  // Right-click drag to pan
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return; // Only right-click
      e.preventDefault();

      // Get current transform from the g element
      const g = mmRef.current?.g;
      if (!g) return;

      const currentTransform = g.attr("transform");
      let tx = 0, ty = 0;
      if (currentTransform) {
        const txMatch = currentTransform.match(/translate\(([^,)]+)/);
        const tyMatch = currentTransform.match(/,\s*([^)]+)\)/);
        if (txMatch) tx = parseFloat(txMatch[1]);
        if (tyMatch) ty = parseFloat(tyMatch[1]);
      }

      dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();

      const g = mmRef.current?.g;
      if (!g) return;

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newTx = dragRef.current.startTx + dx;
      const newTy = dragRef.current.startTy + dy;

      // Get current scale from transform
      const currentTransform = g.attr("transform") || "";
      const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
      const scale = scaleMatch ? scaleMatch[1] : "1";

      g.attr("transform", `translate(${newTx},${newTy}) scale(${scale})`);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      dragRef.current = null;
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    svg.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    svg.addEventListener("contextmenu", handleContextMenu);

    return () => {
      svg.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      svg.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  const handleFit = useCallback(() => {
    if (mmRef.current) mmRef.current.fit();
  }, []);

  const handleZoomIn = useCallback(() => {
    if (mmRef.current) {
      const svg = mmRef.current.svg;
      const currentTransform = svg.attr("transform");
      const match = currentTransform?.match(/scale\(([^)]+)\)/);
      const currentScale = match ? parseFloat(match[1]) : 1;
      mmRef.current.rescale(currentScale * 1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mmRef.current) {
      const svg = mmRef.current.svg;
      const currentTransform = svg.attr("transform");
      const match = currentTransform?.match(/scale\(([^)]+)\)/);
      const currentScale = match ? parseFloat(match[1]) : 1;
      mmRef.current.rescale(currentScale / 1.2);
    }
  }, []);

  const handleExpandLevelChange = useCallback((level: number) => {
    setExpandLevel(level);
    effectiveExpandLevelRef.current = level;
    if (!mmRef.current) return;

    // level matches markmap directly: 1=root only, 2=root+children, -1=all
    const toggleNodes = (node: any, currentLevel: number) => {
      if (!node.children) return;
      const shouldFold = level >= 0 && currentLevel >= level;
      if (node.payload) {
        node.payload.fold = shouldFold ? 1 : 0;
      }
      node.children?.forEach((child: any) => toggleNodes(child, currentLevel + 1));
    };

    const data = mmRef.current.state.data;
    if (data) {
      toggleNodes(data, 1);
      mmRef.current.renderData(data);
    }
  }, []);

  return (
    <div className="mindmap-container" ref={containerRef}>
      <div className="mindmap-toolbar">
        <button className="mindmap-toolbar-btn" onClick={handleFit} title="适配视图">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
        <button className="mindmap-toolbar-btn" onClick={handleZoomIn} title="放大">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </button>
        <button className="mindmap-toolbar-btn" onClick={handleZoomOut} title="缩小">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M8 11h6" />
          </svg>
        </button>
        <div className="mindmap-toolbar-divider" />
        <select
          className="mindmap-toolbar-select"
          value={expandLevel}
          onChange={(e) => handleExpandLevelChange(Number(e.target.value))}
          title="展开层级"
        >
          <option value={-1}>全部</option>
          <option value={1}>1 级</option>
          <option value={2}>2 级</option>
          <option value={3}>3 级</option>
          <option value={4}>4 级</option>
          <option value={5}>5 级</option>
          <option value={6}>6 级</option>
        </select>
      </div>

      <svg
        ref={svgRef}
        className="mindmap-svg"
      />
    </div>
  );
}
