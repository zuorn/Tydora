import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useXhsSettings } from "./useXhsSettings";
import { useXhsPreview } from "./useXhsPreview";
import { saveXhsCards, saveCardImage, openDirectory } from "./save";
import { buildXhsCards } from "./render";
import { XHS_THEMES } from "./themes";
import { XHS_FONT_OPTIONS } from "./fonts";
import {
  XHS_FONT_SIZES,
  type XhsCardDom,
  type XhsFontFamily,
  type XhsFontSize,
  type XhsImagePositions,
  type XhsRatio,
} from "./types";
import type { EditorMode } from "../../Editor";
import "./XhsPreviewPanel.css";

/** 图片位置持久化键：用户拖拽调整后的图片偏移（key = cyrb53(图片 data URL)） */
const IMAGE_POSITIONS_KEY = "zmd-xhs-image-positions";

/** 卡片比例 → 逻辑尺寸（与导出 render.ts 的 RATIO_SIZES 保持一致） */
const RATIO_SIZES: Record<XhsRatio, { width: number; height: number }> = {
  "3:4": { width: 450, height: 600 },
  "3:5": { width: 450, height: 750 },
  "1:1": { width: 600, height: 600 },
};

function loadImagePositions(): XhsImagePositions {
  try {
    const raw = localStorage.getItem(IMAGE_POSITIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as XhsImagePositions;
    return {};
  } catch {
    return {};
  }
}

function persistImagePositions(positions: XhsImagePositions): void {
  try {
    localStorage.setItem(IMAGE_POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    // localStorage 不可用（隐私模式等）时静默忽略
  }
}

/** 按缩放比例更新卡片 DOM 宿主：宿主宽度贴合缩放后的视觉宽度，卡片内容整体 scale */
function applyHostScale(host: HTMLElement, k: number): void {
  const w = Number(host.dataset.logicalW) || 450;
  const h = Number(host.dataset.logicalH) || 600;
  host.style.width = `${w * k}px`;
  host.style.height = `${h * k}px`;
  const inner = host.firstElementChild as HTMLElement | null;
  if (inner) {
    inner.style.transform = `scale(${k})`;
    inner.style.transformOrigin = "top left";
  }
}

interface XhsPreviewPanelProps {
  title: string;
  content: string;
  viewMode: EditorMode;
  getContentElement: () => HTMLElement | null;
  editorTheme: string;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}

export function XhsPreviewPanel({
  title,
  content,
  viewMode,
  getContentElement,
  editorTheme,
  width,
  onWidthChange,
  onClose,
}: XhsPreviewPanelProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useXhsSettings();
  const enabled = viewMode === "ir";

  // 用户拖拽调整后的图片位置（持久化到 localStorage）
  const [imagePositions, setImagePositions] = useState<XhsImagePositions>(() => loadImagePositions());
  const positionsRef = useRef(imagePositions);
  positionsRef.current = imagePositions;

  const { cards, building, error } = useXhsPreview({
    enabled,
    content,
    settings,
    imagePositions,
    getContentElement,
    editorTheme,
    title,
  });

  const [exporting, setExporting] = useState(false);
  const [savedDir, setSavedDir] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // 放大预览当前展示的卡片下标（null = 未放大）
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  // 使用说明弹窗
  const [helpOpen, setHelpOpen] = useState(false);
  // 拖拽调整侧栏宽度
  const [resizing, setResizing] = useState(false);
  // 全屏显示（点击“导出图文卡片”时进入整个窗口）
  const [fullscreen, setFullscreen] = useState(false);
  // 当前选中的卡片内图片（点击选中后可拖拽调整位置）
  const selectedImgRef = useRef<HTMLImageElement | null>(null);
  const selectedHashRef = useRef<string | null>(null);
  // 预览区卡片缩放比例（按侧栏宽度自适应）
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;

  // ── 与编辑器滚动同步 ──
  const cardsRef = useRef<HTMLDivElement>(null);

  const syncCardsFromEditor = useCallback((editorEl: HTMLElement) => {
    const cardsEl = cardsRef.current;
    if (!cardsEl) return;
    if (fullscreen) return; // 全屏横排时无纵向滚动同步
    const maxEditor = editorEl.scrollHeight - editorEl.clientHeight;
    const maxCards = cardsEl.scrollHeight - cardsEl.clientHeight;
    if (maxEditor <= 0 || maxCards <= 0) return;
    cardsEl.scrollTop = (editorEl.scrollTop / maxEditor) * maxCards;
  }, [fullscreen]);

  // 捕获阶段监听编辑器 .tiptap-editor 的滚动，映射到卡片预览
  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.classList && target.classList.contains("tiptap-editor")) {
        syncCardsFromEditor(target);
      }
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [syncCardsFromEditor]);

  // 首次构建完成后，把卡片预览对齐编辑器当前滚动位置
  const prevCardCountRef = useRef(0);
  useEffect(() => {
    if (cards.length > 0 && prevCardCountRef.current === 0) {
      const editorEl = document.querySelector(".tiptap-editor") as HTMLElement | null;
      if (editorEl) syncCardsFromEditor(editorEl);
    }
    prevCardCountRef.current = cards.length;
  }, [cards, syncCardsFromEditor]);

  const isBusy = exporting || building;

  // 栅格化 PNG 卡片（带用户拖拽调整后的图片位置），供导出/单卡下载使用。
  // 传 onlyIndex 时只栅格化目标卡片（单张下载），大幅减少耗时。
  const buildPngCards = useCallback(
    (onlyIndex?: number) =>
      buildXhsCards(
        {
          getContentElement,
          editorTheme,
          settings,
          title,
          imagePositions: positionsRef.current,
        },
        onlyIndex,
      ),
    [getContentElement, editorTheme, settings, title],
  );

  const handleExport = useCallback(async () => {
    if (exporting || cards.length === 0) return;
    // 点击“导出图文卡片”时在整个窗口显示
    setFullscreen(true);
    setExporting(true);
    setActionError(null);
    setSavedDir(null);
    try {
      const result = await buildPngCards();
      const dir = await saveXhsCards(result.cards, title);
      if (dir) setSavedDir(dir);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [exporting, cards.length, buildPngCards, title]);

  const handleDownloadCard = useCallback(
    async (card: XhsCardDom) => {
      setActionError(null);
      try {
        // 只栅格化目标卡片：不再全量重建所有卡片 PNG
        const result = await buildPngCards(card.index);
        const png = result.cards.find((c) => c.index === card.index);
        if (png) await saveCardImage(png, title);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e));
      }
    },
    [buildPngCards, title],
  );

  const handleOpenDir = useCallback(() => {
    if (savedDir) void openDirectory(savedDir).catch(() => {});
  }, [savedDir]);

  // ── 卡片 DOM 预览：挂载 / 缩放 / 图片拖拽 ──

  // 预览缩放：侧栏纵排按宽度等比缩小；全屏网格按可用宽高取较小值，
  // 保证单张卡片完整可见，放不下的卡片由 CSS flex-wrap 换到下一行
  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    const size = RATIO_SIZES[settings.ratio];
    const compute = () => {
      if (fullscreen) {
        const availH = Math.max(120, el.clientHeight - 8);
        const availW = Math.max(120, el.clientWidth - 8);
        setScale(Math.min(1, availH / size.height, availW / size.width));
      } else {
        const availW = Math.max(120, el.clientWidth - 16);
        setScale(Math.min(1, availW / size.width));
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.ratio, fullscreen]);

  // 把卡片 DOM 挂载到各卡片容器（随 cards / viewMode 重建）
  useEffect(() => {
    const container = cardsRef.current;
    if (!container) return;
    container.querySelectorAll(".xhs-card-dom-host").forEach((n) => n.remove());
    if (viewMode !== "ir") return;
    cards.forEach((card) => {
      const item = container.querySelector<HTMLElement>(`.xhs-card-item[data-index="${card.index}"]`);
      if (!item) return;
      const host = document.createElement("div");
      host.className = "xhs-card-dom-host";
      host.appendChild(card.el);
      item.appendChild(host);
      // 禁用图片原生拖拽，保证 pointer 拖拽接管
      card.el.querySelectorAll("img").forEach((img) => {
        img.draggable = false;
      });
      host.dataset.logicalW = String(card.el.offsetWidth);
      host.dataset.logicalH = String(card.el.offsetHeight);
      applyHostScale(host, scaleRef.current);
    });
  }, [cards, viewMode]);

  // 侧栏宽度变化 → 更新所有卡片的缩放比例
  useEffect(() => {
    const container = cardsRef.current;
    if (!container) return;
    container.querySelectorAll<HTMLElement>(".xhs-card-dom-host").forEach((host) => applyHostScale(host, scale));
  }, [scale]);

  // 选中图片：点击卡片内图片后高亮，可拖拽调整位置
  const selectImage = useCallback((img: HTMLImageElement) => {
    const hash = img.dataset.xhsImgHash;
    if (!hash) return;
    selectedImgRef.current?.classList.remove("xhs-img-selected");
    selectedImgRef.current = img;
    selectedHashRef.current = hash;
    img.classList.add("xhs-img-selected");
  }, []);

  const clearSelection = useCallback(() => {
    selectedImgRef.current?.classList.remove("xhs-img-selected");
    selectedImgRef.current = null;
    selectedHashRef.current = null;
  }, []);

  // 开始拖拽图片：先把图片提升到卡片根节点绝对定位（脱离内容视口的裁剪，
  // 并位于所有图层之上），再实时更新 transform；松手后持久化并重建
  const startDragImage = useCallback((e: PointerEvent, img: HTMLImageElement) => {
    const hash = img.dataset.xhsImgHash;
    if (!hash) return;
    e.preventDefault();
    e.stopPropagation();
    const k = scaleRef.current || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const current = positionsRef.current[hash] ?? { dx: 0, dy: 0 };
    let moved = false;
    let lifted = false;
    const lift = () => {
      if (lifted) return;
      lifted = true;
      const card = img.closest<HTMLElement>(".xhs-card");
      if (!card) return;
      const cardRect = card.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const left = (imgRect.left - cardRect.left) / k;
      const top = (imgRect.top - cardRect.top) / k;
      const w = imgRect.width / k;
      const h = imgRect.height / k;
      // 图片移出流后，用等高占位符保留原垂直空间，避免下方内容上移
      if (img.parentElement !== card) {
        const placeholder = document.createElement("div");
        placeholder.style.height = `${h}px`;
        img.parentElement?.insertBefore(placeholder, img);
      }
      card.appendChild(img);
      img.style.position = "absolute";
      img.style.left = `${left}px`;
      img.style.top = `${top}px`;
      img.style.width = `${w}px`;
      img.style.height = `${h}px`;
      img.style.margin = "0";
      img.style.zIndex = "20";
      img.style.transform = "";
    };
    const onMove = (ev: PointerEvent) => {
      const dx = current.dx + (ev.clientX - startX) / k;
      const dy = current.dy + (ev.clientY - startY) / k;
      if (!moved && Math.abs(ev.clientX - startX) < 3 && Math.abs(ev.clientY - startY) < 3) return;
      moved = true;
      lift();
      // 图片此时已按“原始位置+旧偏移”绝对定位，这里只做增量位移
      img.style.transform = `translate(${dx - current.dx}px, ${dy - current.dy}px)`;
      img.classList.add("xhs-img-dragging");
      positionsRef.current = { ...positionsRef.current, [hash]: { dx, dy } };
    };
    const onUp = () => {
      img.classList.remove("xhs-img-dragging");
      img.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (moved) {
        // 只持久化 + 更新状态，不触发卡片重建：位置已在预览 DOM 上实时生效，
        // 全量重建（含重新内联图片）只在内容 / 设置变化时进行，避免拖拽微调时卡顿
        persistImagePositions(positionsRef.current);
        setImagePositions(positionsRef.current);
      }
    };
    img.setPointerCapture?.(e.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // 事件委托：点击图片 → 选中并拖拽；点击卡片空白 → 放大；点击空白 → 取消选中
  useEffect(() => {
    const container = cardsRef.current;
    if (!container) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // 下载 / 查看按钮：交给按钮自身的 onClick，跳过下方逻辑，
      // 否则这里会命中 .xhs-card-item 分支，导致按钮的 click 事件不再落到按钮上
      if (target.closest(".xhs-card-download, .xhs-card-view")) return;
      const img = target.closest("img[data-xhs-img-hash]") as HTMLImageElement | null;
      if (img) {
        selectImage(img);
        startDragImage(e, img);
        return;
      }
      // 点击卡片本身不再放大查看（改由卡片右上角「查看」按钮触发），仅清除图片选中态
      clearSelection();
    };
    container.addEventListener("pointerdown", onPointerDown);
    return () => container.removeEventListener("pointerdown", onPointerDown);
  }, [selectImage, startDragImage, clearSelection]);

  // 放大视图：把对应卡片的 DOM 克隆挂到舞台并等比缩放（保留图片位置）
  const zoomStageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = zoomStageRef.current;
    if (!stage || zoomIndex === null) return;
    const card = cards[zoomIndex];
    if (!card) return;
    stage.querySelectorAll(".xhs-zoom-dom").forEach((n) => n.remove());
    const host = document.createElement("div");
    host.className = "xhs-zoom-dom";
    host.appendChild(card.el.cloneNode(true) as HTMLElement);
    stage.appendChild(host);
    const inner = host.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const w = inner.offsetWidth;
    const h = inner.offsetHeight;
    if (w === 0 || h === 0) return;
    const availW = Math.max(160, stage.clientWidth - 40);
    const availH = Math.max(160, stage.clientHeight - 70);
    const k = Math.min(availW / w, availH / h, 1);
    host.style.width = `${w}px`;
    host.style.height = `${h * k}px`;
    inner.style.transform = `scale(${k})`;
    inner.style.transformOrigin = "top left";
    host.style.margin = "auto";
  }, [zoomIndex, cards]);

  // 拖拽调整侧栏宽度
  const handleResizeDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      setResizing(true);
      const onMove = (ev: MouseEvent) => {
        onWidthChange(Math.min(720, Math.max(280, startWidth - (ev.clientX - startX))));
      };
      const onUp = () => {
        setResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, onWidthChange],
  );

  // 放大视图键盘操作：←/→ 切换卡片，Esc 关闭
  useEffect(() => {
    if (zoomIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setZoomIndex(null);
      } else if (e.key === "ArrowRight") {
        setZoomIndex((i) => (i === null || i >= cards.length - 1 ? i : i + 1));
      } else if (e.key === "ArrowLeft") {
        setZoomIndex((i) => (i === null || i <= 0 ? i : i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIndex, cards.length]);

  // 放大期间卡片重建（数量变化）时，把下标限制在有效范围内
  useEffect(() => {
    if (zoomIndex !== null && cards.length === 0) setZoomIndex(null);
  }, [cards.length, zoomIndex]);

  const errorText =
    error === "XHS_SOURCE_MODE"
      ? t("xhs.sourceModeHint")
      : error === "XHS_EMPTY"
        ? t("xhs.emptyHint")
        : error;

  return (
    <div
      className={`xhs-panel${resizing ? " resizing" : ""}${fullscreen ? " fullscreen" : ""}`}
      style={fullscreen ? undefined : { width }}
    >
      {!fullscreen && <div className="xhs-resize-handle" onMouseDown={handleResizeDown} />}
      <div className="xhs-panel-header">
        <svg
          className="xhs-panel-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2.5" y="3.5" width="19" height="17" rx="3" />
          <circle cx="8.5" cy="8.5" r="2" />
          <polyline points="5 17 9.5 12.5 13.5 16 18 10.5" />
        </svg>
        <span className="xhs-panel-title">{t("xhs.title")}</span>
        <button
          className="xhs-fullscreen-btn"
          onClick={() => setFullscreen((f) => !f)}
          title={fullscreen ? t("xhs.exitFullscreen") : t("xhs.enterFullscreen")}
        >
          {fullscreen ? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          )}
        </button>
      </div>

      <div className="xhs-toolbar">
        <div className="xhs-toolbar-row">
          <select
            className="xhs-select"
            value={settings.themeId}
            onChange={(e) => updateSettings({ themeId: e.target.value })}
            disabled={isBusy}
            title={t("xhs.themeLabel")}
          >
            {XHS_THEMES.map((th) => (
              <option key={th.id} value={th.id}>
                {t(`xhs.themes.${th.id}`, th.name)}
              </option>
            ))}
          </select>

          <div className="xhs-segmented xhs-segmented-ratio">
            {(["3:4", "3:5", "1:1"] as const).map((r) => (
              <button
                key={r}
                className={settings.ratio === r ? "active" : ""}
                onClick={() => updateSettings({ ratio: r })}
                disabled={isBusy}
                title={r}
              >
                {r}
              </button>
            ))}
          </div>

          <select
            className="xhs-select"
            value={settings.fontFamily}
            onChange={(e) => updateSettings({ fontFamily: e.target.value as XhsFontFamily })}
            disabled={isBusy}
            title={t("xhs.fontFamily")}
          >
            {XHS_FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {t(`xhs.fonts.${f.labelKey}`)}
              </option>
            ))}
          </select>

          <select
            className="xhs-select"
            value={String(settings.fontSize)}
            onChange={(e) => updateSettings({ fontSize: Number(e.target.value) as XhsFontSize })}
            disabled={isBusy}
            title={t("xhs.fontSize")}
          >
            {XHS_FONT_SIZES.map((s) => (
              <option key={s} value={String(s)}>
                {s}
              </option>
            ))}
          </select>

          <label className="xhs-check" title={t("xhs.gridLinesHint")}>
            <input
              type="checkbox"
              checked={settings.gridLines}
              onChange={(e) => updateSettings({ gridLines: e.target.checked })}
              disabled={isBusy}
            />
            <span>{t("xhs.gridLines")}</span>
          </label>
        </div>
      </div>

      <div className="xhs-status">
        <div className="xhs-status-row">
          <button className="xhs-close xhs-status-close" onClick={onClose} title={t("xhs.close")} disabled={isBusy}>
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1.5" y="1.5" width="15" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <rect x="10.5" y="2.5" width="5" height="13" rx="1" fill="currentColor" opacity="0.25" />
              <line x1="10.5" y1="2.5" x2="10.5" y2="15.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          {viewMode === "sv" ? (
            <span className="xhs-status-hint">{t("xhs.sourceModeHint")}</span>
          ) : building ? (
            <span className="xhs-status-building">{t("xhs.building")}</span>
          ) : error ? (
            <span className="xhs-status-error">{t("xhs.error")}: {errorText}</span>
          ) : (
            <span className="xhs-status-count">
              {t("xhs.totalCards", { count: cards.length })}
              <button
                className="xhs-help-btn"
                onClick={() => setHelpOpen(true)}
                title={t("xhs.help")}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9.5" />
                  <path d="M9.2 9a3 3 0 0 1 5.6 1.3c0 1.6-2.6 2.2-2.6 3.7" />
                  <line x1="12" y1="17.2" x2="12.01" y2="17.2" />
                </svg>
              </button>
            </span>
          )}
          <span className="xhs-status-actions">
            <button
              className="xhs-action-btn xhs-action-primary"
              onClick={handleExport}
              disabled={isBusy || cards.length === 0 || viewMode !== "ir"}
            >
              {exporting ? t("xhs.exporting") : t("xhs.export")}
            </button>
            {savedDir && (
              <button className="xhs-action-btn" onClick={handleOpenDir}>
                {t("xhs.openFolder")}
              </button>
            )}
          </span>
        </div>
        {actionError && <div className="xhs-action-error">{actionError}</div>}
        {savedDir && (
          <div className="xhs-action-ok">{t("xhs.exportSuccess", { count: cards.length, dir: savedDir })}</div>
        )}
      </div>

      <div className={`xhs-cards${fullscreen ? " xhs-cards-horizontal" : ""}`} ref={cardsRef}>
        {viewMode === "ir" &&
          cards.map((card) => (
            <div key={card.index} className="xhs-card-item" data-index={card.index}>
              <button
                className="xhs-card-view"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomIndex(card.index);
                }}
                title={t("xhs.viewCard")}
              >
                {t("xhs.viewCard")}
              </button>
              <button
                className="xhs-card-download"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDownloadCard(card);
                }}
                title={t("xhs.download")}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          ))}
      </div>

      {helpOpen && (
        <div className="xhs-help-overlay" onClick={() => setHelpOpen(false)}>
          <div className="xhs-help-body" onClick={(e) => e.stopPropagation()}>
            <div className="xhs-help-header">
              <span className="xhs-help-title">{t("xhs.helpTitle")}</span>
              <button className="xhs-help-close" onClick={() => setHelpOpen(false)} title={t("xhs.close")}>
                ✕
              </button>
            </div>
            <div className="xhs-help-content">
              <p>{t("xhs.helpIntro")}</p>
              <h4>{t("xhs.helpRuleTitle")}</h4>
              <ul>
                <li>{t("xhs.helpRule1")}</li>
                <li>{t("xhs.helpRule2")}</li>
                <li>{t("xhs.helpRule3")}</li>
              </ul>
              <h4>{t("xhs.helpExampleTitle")}</h4>
              <pre className="xhs-help-example">{t("xhs.helpExample")}</pre>
            </div>
            <div className="xhs-help-footer">
              <button className="xhs-action-btn xhs-action-primary" onClick={() => setHelpOpen(false)}>
                {t("xhs.helpClose")}
              </button>
            </div>
          </div>
        </div>
      )}

      {zoomIndex !== null && cards[zoomIndex] && (
        <div className="xhs-zoom-overlay" onClick={() => setZoomIndex(null)}>
          <button
            className="xhs-zoom-nav xhs-zoom-prev"
            onClick={(e) => {
              e.stopPropagation();
              setZoomIndex((i) => (i === null || i <= 0 ? i : i - 1));
            }}
            disabled={zoomIndex <= 0}
            title={t("xhs.prevCard")}
            aria-label={t("xhs.prevCard")}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="xhs-zoom-body">
            {/* 点击卡片、关闭按钮、页码时阻止冒泡避免误关；点击背景阴影时让事件冒泡到遮罩关闭 */}
            <div
              className="xhs-zoom-stage"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest(".xhs-zoom-dom, .xhs-zoom-close, .xhs-zoom-page")) {
                  e.stopPropagation();
                }
              }}
              ref={zoomStageRef}
            >
              <button
                className="xhs-zoom-close"
                onClick={() => setZoomIndex(null)}
                title={t("xhs.close")}
              >
                ✕
              </button>
              <span className="xhs-zoom-page">
                {zoomIndex + 1} / {cards.length}
              </span>
            </div>
          </div>
          <button
            className="xhs-zoom-nav xhs-zoom-next"
            onClick={(e) => {
              e.stopPropagation();
              setZoomIndex((i) => (i === null || i >= cards.length - 1 ? i : i + 1));
            }}
            disabled={zoomIndex >= cards.length - 1}
            title={t("xhs.nextCard")}
            aria-label={t("xhs.nextCard")}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
