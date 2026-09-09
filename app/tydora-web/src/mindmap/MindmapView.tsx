import { useRef, useEffect, useCallback, useImperativeHandle } from "react";
import { Transformer } from "markmap-lib";
import { Markmap, loadCSS, loadJS } from "markmap-view";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { invoke } from "@tauri-apps/api/core";
import { MINDMAP_SETTINGS_KEY, DEFAULT_MINDMAP, type MindmapSettings } from "../Settings";
import "./MindmapView.css";

declare global {
  interface Window {
    markmap?: any;
  }
}

interface MindmapViewProps {
  content: string;
  expandLevel: number;
  onExpandLevelChange: (level: number) => void;
  ref?: React.Ref<MindmapViewHandle>;
}

export interface MindmapViewHandle {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
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

export default function MindmapView({ content, expandLevel, onExpandLevelChange, ref }: MindmapViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  const effectiveExpandLevelRef = useRef<number>(getMindmapSettings().initialExpandLevel);
  const selectedNodeRef = useRef<any>(null);

  // Expose toolbar handlers to parent (MindmapWindow)
  useImperativeHandle(ref, () => ({
    fit: () => { mmRef.current?.fit(); },
    zoomIn: () => {
      if (!mmRef.current) return;
      const svg = mmRef.current.svg;
      const tx = svg.attr("transform");
      const m = tx?.match(/scale\(([^)]+)\)/);
      mmRef.current.rescale((m ? parseFloat(m[1]) : 1) * 1.2);
    },
    zoomOut: () => {
      if (!mmRef.current) return;
      const svg = mmRef.current.svg;
      const tx = svg.attr("transform");
      const m = tx?.match(/scale\(([^)]+)\)/);
      mmRef.current.rescale((m ? parseFloat(m[1]) : 1) / 1.2);
    },
  }), []);

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
      onExpandLevelChange(newLevel);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      renderMindmap(content).then(() => {
        svgRef.current?.focus();
      });
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

  // Keyboard navigation
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const highlightNode = (node: any) => {
      selectedNodeRef.current = node;
      // Remove old highlight
      svg.querySelectorAll(".markmap-node-selected").forEach(el => el.classList.remove("markmap-node-selected"));
      if (!node) return;
      // Find the <g> element for this node and highlight it
      const circles = svg.querySelectorAll("circle");
      circles.forEach(circle => {
        const d = (circle as any).__data__;
        if (d && d === node) {
          circle.classList.add("markmap-node-selected");
          circle.closest("g")?.classList.add("markmap-node-selected");
        }
      });
    };

    const getSiblings = (node: any): any[] => {
      if (!node?.parent) return [];
      return node.parent.children || [];
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mm = mmRef.current;
      if (!mm) return;

      const data = mm.state?.data;
      if (!data) return;

      // If no node selected, select root
      if (!selectedNodeRef.current) {
        highlightNode(data);
        return;
      }

      const node = selectedNodeRef.current;
      let newNode: any = null;

      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          // Previous sibling
          const siblings = getSiblings(node);
          const idx = siblings.indexOf(node);
          if (idx > 0) newNode = siblings[idx - 1];
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          // Next sibling
          const siblings = getSiblings(node);
          const idx = siblings.indexOf(node);
          if (idx < siblings.length - 1) newNode = siblings[idx + 1];
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          // Parent
          if (node.parent) newNode = node.parent;
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          // First child
          if (node.children?.length) {
            newNode = node.children[0];
          }
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          // Toggle fold
          if (node.payload) {
            node.payload.fold = node.payload.fold ? 0 : 1;
          } else {
            node.payload = { fold: 1 };
          }
          mm.renderData(data);
          break;
        }
        default:
          return;
      }

      if (newNode) {
        highlightNode(newNode);
      }
    };

    // Handle click to select node
    const handleClick = (e: MouseEvent) => {
      const target = e.target as SVGElement;
      const circle = target.closest("circle");
      if (circle) {
        const d = (circle as any).__data__;
        if (d) highlightNode(d);
      } else {
        highlightNode(null);
      }
    };

    svg.addEventListener("keydown", handleKeyDown);
    svg.addEventListener("click", handleClick);

    return () => {
      svg.removeEventListener("keydown", handleKeyDown);
      svg.removeEventListener("click", handleClick);
    };
  }, []);

  // React to expandLevel changes from parent (MindmapWindow toolbar select)
  useEffect(() => {
    effectiveExpandLevelRef.current = expandLevel;
    if (!mmRef.current) return;

    const toggleNodes = (node: any, currentLevel: number) => {
      if (!node.children) return;
      const shouldFold = expandLevel >= 0 && currentLevel >= expandLevel;
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
  }, [expandLevel]);

  // ── Generate SVG string from current mindmap (reusable for export & copy) ──
  const generateSvgString = useCallback((): string | null => {
    const svgEl = svgRef.current;
    if (!svgEl) return null;

    const gEl = svgEl.querySelector("g") as SVGGElement | null;
    if (!gEl) return null;

    const bbox = gEl.getBBox();
    if (!bbox || bbox.width === 0 || bbox.height === 0) return null;

    const padding = 20;
    const vbX = bbox.x - padding;
    const vbY = bbox.y - padding;
    const vbW = Math.ceil(bbox.width + padding * 2);
    const vbH = Math.ceil(bbox.height + padding * 2);

    // Deep-clone the SVG, resetting g transform
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    const gClone = clone.querySelector("g");
    if (gClone) {
      gClone.setAttribute("transform", "translate(0,0) scale(1)");
    }

    clone.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
    clone.setAttribute("width", String(vbW));
    clone.setAttribute("height", String(vbH));
    clone.removeAttribute("tabindex");
    clone.removeAttribute("class");
    clone.removeAttribute("style");

    // Inline computed styles so the exported SVG looks exactly like the rendered one
    const originalElements = svgEl.querySelectorAll("*");
    const cloneElements = clone.querySelectorAll("*");
    for (let i = 0; i < originalElements.length; i++) {
      const orig = originalElements[i] as SVGElement;
      const cl = cloneElements[i] as SVGElement;
      const computed = getComputedStyle(orig);
      const svgVisualProps: string[] = [
        "fill",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-opacity",
        "fill-opacity",
        "opacity",
        "color",
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "text-anchor",
        "dominant-baseline",
      ];
      for (const prop of svgVisualProps) {
        let value = computed.getPropertyValue(prop);
        if (!value) continue;
        if (value === "normal" || value === "auto") continue;
        if (value === "transparent" || value === "rgba(0, 0, 0, 0)" || value === "rgba(0,0,0,0)") {
          value = "none";
        }
        cl.setAttribute(prop, value);
      }
    }

    // Also capture relevant CSS rules from document stylesheets as fallback
    try {
      let extraCss = "";
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (
              rule instanceof CSSStyleRule &&
              /\.(markmap|mindmap)/.test(rule.selectorText)
            ) {
              extraCss += rule.cssText + "\n";
            }
          }
        } catch {
          // Cross-origin stylesheet – skip
        }
      }
      if (extraCss) {
        const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
        styleEl.textContent = extraCss;
        clone.insertBefore(styleEl, clone.firstChild);
      }
    } catch {
      // CSS capture failed – continue without extra styles
    }

    // Serialize SVG
    const serializer = new XMLSerializer();
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clone);
  }, []);

  // ── Export as SVG via custom event ──
  useEffect(() => {
    const handleExport = () => {
      const mm = mmRef.current;
      if (!mm) return;

      // Step 1: Fit so all content is visible
      mm.fit();

      // Step 2: Wait for fit animation to settle, then export
      setTimeout(async () => {
        try {
          const svgString = generateSvgString();
          if (!svgString) return;

          // Let user choose save path
          const filePath = await save({
            defaultPath: "mindmap.svg",
            filters: [{ name: "SVG 图片", extensions: ["svg"] }],
          });
          if (!filePath) return; // User cancelled

          // Write file and open it
          await writeTextFile(filePath, svgString);
          await invoke("open_file", { filePath });
        } catch (err) {
          console.error("[MindmapExport] Failed:", err);
        }
      }, 200);
    };

    window.addEventListener("mindmap-export", handleExport);
    return () => window.removeEventListener("mindmap-export", handleExport);
  }, [generateSvgString]);

  // ── Build a self-contained SVG string optimized for Image loading (no XML decl) ──
  const buildStandaloneSvg = useCallback((): string | null => {
    const svgEl = svgRef.current;
    if (!svgEl) {
      console.error("[MindmapCopy] svgRef is null");
      return null;
    }

    const gEl = svgEl.querySelector("g") as SVGGElement | null;
    if (!gEl) {
      console.error("[MindmapCopy] No inner <g> element found");
      return null;
    }

    const bbox = gEl.getBBox();
    if (!bbox || bbox.width === 0 || bbox.height === 0) {
      console.error("[MindmapCopy] Invalid bbox:", bbox);
      return null;
    }

    const padding = 20;
    const vbX = bbox.x - padding;
    const vbY = bbox.y - padding;
    const vbW = Math.ceil(bbox.width + padding * 2);
    const vbH = Math.ceil(bbox.height + padding * 2);

    // Clone SVG
    const clone = svgEl.cloneNode(true) as SVGSVGElement;

    // Reset transform on the inner <g> so content starts at origin
    const gClone = clone.querySelector("g");
    if (gClone) {
      gClone.setAttribute("transform", "translate(0,0) scale(1)");
    }

    // Set viewBox to crop to content area
    clone.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
    clone.setAttribute("width", String(vbW));
    clone.setAttribute("height", String(vbH));
    clone.removeAttribute("tabindex");
    clone.removeAttribute("class");
    clone.removeAttribute("style");

    // Inline computed styles so the standalone SVG renders correctly
    const originalElements = svgEl.querySelectorAll("*");
    const cloneElements = clone.querySelectorAll("*");
    for (let i = 0; i < originalElements.length; i++) {
      const orig = originalElements[i] as SVGElement;
      const cl = cloneElements[i] as SVGElement;
      const computed = getComputedStyle(orig);
      const svgVisualProps: string[] = [
        "fill", "stroke", "stroke-width", "stroke-dasharray",
        "stroke-linecap", "stroke-linejoin", "stroke-opacity",
        "fill-opacity", "opacity", "color", "font-family",
        "font-size", "font-weight", "font-style",
        "text-anchor", "dominant-baseline",
      ];
      for (const prop of svgVisualProps) {
        let value = computed.getPropertyValue(prop);
        if (!value) continue;
        if (value === "normal" || value === "auto") continue;
        if (value === "transparent" || value === "rgba(0, 0, 0, 0)" || value === "rgba(0,0,0,0)") {
          value = "none";
        }
        cl.setAttribute(prop, value);
      }
    }

    // Capture CSS rules for markmap classes as inline <style>
    try {
      let extraCss = "";
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule instanceof CSSStyleRule && /\.(markmap|mindmap)/.test(rule.selectorText)) {
              extraCss += rule.cssText + "\n";
            }
          }
        } catch { /* cross-origin */ }
      }
      if (extraCss) {
        const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
        styleEl.textContent = extraCss;
        clone.insertBefore(styleEl, clone.firstChild);
      }
    } catch { /* CSS capture failed */ }

    // Serialize WITHOUT XML declaration (cleaner for Image loading)
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);

    // Ensure xmlns is present (required when loaded as standalone image)
    const hasXmlns = /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svgStr);
    const fixedSvg = hasXmlns
      ? svgStr
      : svgStr.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');

    console.log("[MindmapCopy] Built standalone SVG, size:", fixedSvg.length, "dims:", vbW, "x", vbH);
    return fixedSvg;
  }, []);

  // ── Copy mindmap image to clipboard via custom event ──
  useEffect(() => {
    let copying = false;

    const handleCopyImage = () => {
      if (copying) return;
      copying = true;

      const mm = mmRef.current;
      if (!mm) {
        console.error("[MindmapCopy] markmap instance not available");
        copying = false;
        return;
      }

      mm.fit();

      // Let fit animation settle before capturing
      setTimeout(async () => {
        try {
          // Step 1: Build a self-contained SVG string
          const svgString = buildStandaloneSvg();
          if (!svgString) {
            copying = false;
            return;
          }

          // Step 2: Load SVG as Image via data URL (base64 for maximum compatibility)
          let pngBytes: Uint8Array;
          {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = (e) => {
                console.error("[MindmapCopy] Image load error:", e);
                reject(new Error("SVG failed to render as Image"));
              };
              // Base64 encoding avoids all special-character issues in data URLs
              const base64 = btoa(unescape(encodeURIComponent(svgString)));
              image.src = "data:image/svg+xml;base64," + base64;
            });

            console.log("[MindmapCopy] Image loaded:", img.naturalWidth, "x", img.naturalHeight);

            if (img.naturalWidth === 0 || img.naturalHeight === 0) {
              console.error("[MindmapCopy] Image has zero dimensions");
              copying = false;
              return;
            }

            // Step 3: Draw image on canvas and export as PNG blob
            const canvas = document.createElement("canvas");
            const scale = 2; // 2x for sharper output
            canvas.width = img.naturalWidth * scale;
            canvas.height = img.naturalHeight * scale;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
              console.error("[MindmapCopy] Failed to get canvas 2d context");
              copying = false;
              return;
            }

            // Fill white background
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);

            console.log("[MindmapCopy] Canvas drawn:", canvas.width, "x", canvas.height);

            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/png")
            );
            if (!blob) {
              console.error("[MindmapCopy] Canvas toBlob returned null");
              copying = false;
              return;
            }

            const arrayBuf = await blob.arrayBuffer();
            pngBytes = new Uint8Array(arrayBuf);
            console.log("[MindmapCopy] PNG blob size:", pngBytes.length, "bytes");
          }

          // Step 4: Write to system clipboard via Tauri native API
          try {
            await writeImage(pngBytes);
            console.log("[MindmapCopy] Image written to clipboard successfully");
            window.dispatchEvent(new CustomEvent("mindmap-copy-success"));
          } catch (clipErr) {
            console.error("[MindmapCopy] Clipboard writeImage failed:", clipErr);
          }
        } catch (err) {
          console.error("[MindmapCopy] Failed:", err);
        } finally {
          copying = false;
        }
      }, 300);
    };

    window.addEventListener("mindmap-copy-image", handleCopyImage);
    return () => window.removeEventListener("mindmap-copy-image", handleCopyImage);
  }, [buildStandaloneSvg]);

  return (
    <div className="mindmap-container" ref={containerRef}>
      <svg
        ref={svgRef}
        className="mindmap-svg"
        tabIndex={0}
      />
    </div>
  );
}
