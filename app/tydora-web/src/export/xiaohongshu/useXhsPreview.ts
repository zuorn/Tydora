// 实时联动：编辑器内容 / 设置变化 → 防抖重建卡片 DOM（预览用）。
// 图片位置变化不重建，位置在预览 DOM 上实时生效（见 XhsPreviewPanel 拖拽逻辑）。
import { useCallback, useEffect, useRef, useState } from "react";
import { buildXhsCardDoms } from "./render";
import type { XhsSettings, XhsCardDom, XhsImagePositions } from "./types";

export interface XhsPreviewState {
  cards: XhsCardDom[];
  building: boolean;
  error: string | null;
  /** 手动触发重建（如「重新生成」按钮） */
  rebuild: () => void;
}

export function useXhsPreview(opts: {
  /** 是否启用（分栏打开且处于 IR 模式） */
  enabled: boolean;
  /** 内容联动信号（markdown 字符串） */
  content: string;
  settings: XhsSettings;
  /** 用户拖拽调整后的图片位置（供构建时应用；变化本身不触发重建） */
  imagePositions: XhsImagePositions;
  getContentElement: () => HTMLElement | null;
  editorTheme: string;
  title: string;
}): XhsPreviewState {
  const { enabled, content, settings, imagePositions, getContentElement, editorTheme, title } = opts;

  const [cards, setCards] = useState<XhsCardDom[]>([]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versionRef = useRef(0);
  const getContentRef = useRef(getContentElement);
  const editorThemeRef = useRef(editorTheme);
  const titleRef = useRef(title);
  const settingsRef = useRef(settings);
  const imagePositionsRef = useRef(imagePositions);

  getContentRef.current = getContentElement;
  editorThemeRef.current = editorTheme;
  titleRef.current = title;
  settingsRef.current = settings;
  imagePositionsRef.current = imagePositions;

  const runBuild = useCallback(async () => {
    const version = ++versionRef.current;
    setBuilding(true);
    setError(null);
    try {
      const result = await buildXhsCardDoms({
        getContentElement: getContentRef.current,
        editorTheme: editorThemeRef.current,
        settings: settingsRef.current,
        title: titleRef.current,
        imagePositions: imagePositionsRef.current,
      });
      if (version !== versionRef.current) return; // 过期结果丢弃
      setCards(result);
    } catch (e) {
      if (version !== versionRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (version === versionRef.current) setBuilding(false);
    }
  }, []);

  // 初始 + 设置变化（300ms 防抖）。
  // 图片位置变化不再触发重建：拖拽时位置已在预览 DOM 上实时生效，
  // 全量重建（含重新内联所有图片）只发生在内容 / 设置变化时，
  // 避免拖拽微调过程中反复重建导致卡顿。后续任何重建仍会应用当前图片位置。
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(runBuild, 300);
    return () => clearTimeout(timer);
  }, [enabled, settings, runBuild]);

  // 内容变化（600ms 防抖；首次构建交给上面的 settings effect）
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    const timer = setTimeout(runBuild, 600);
    return () => clearTimeout(timer);
  }, [content, enabled, runBuild]);

  // enabled 变回 false 时重置首次标志，下次打开能正确首次构建
  useEffect(() => {
    if (!enabled) firstRunRef.current = true;
  }, [enabled]);

  return { cards, building, error, rebuild: runBuild };
}
