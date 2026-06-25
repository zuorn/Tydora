import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useCallback, useLayoutEffect } from "react";
import Vditor from "vditor";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveImageToLocal, loadImageSettings, type ImageSettings, dirName, relativePath, resolveRelativePath } from "./ImageManager";
import "./VditorEditor.css";
import { SHORTCUTS_KEY, DEFAULT_SHORTCUTS, DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "./Settings";
import type { ThemeName } from "./themes";

type EditorMode = "wysiwyg" | "ir" | "sv";

interface VditorEditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: EditorMode;
  theme: ThemeName;
  typewriterMode?: boolean;
  editorSettings?: EditorSettings;
  imageSettings?: ImageSettings;
  currentFilePath?: string | null;
  activeVaultPath?: string | null;
  onWordCount?: (count: number) => void;
}

export interface VditorEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  resize: () => void;
  highlightSearch: (query: string) => void;
  clearHighlight: () => void;
  executeCommand: (name: string) => void;
  scrollToHeading: (text: string, line: number) => void;
  scrollToLine: (line: number) => void;
}

export const MODE_LABELS: Record<EditorMode, string> = {
  wysiwyg: "</>",
  ir: "IR",
  sv: "</> 退出源码",
};

export type { EditorMode };

// ── 图片路径转换辅助函数 ──

/** 百分号解码（用于 local-file:// URL 中的路径） */
function percentDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  }
}

/**
 * 将 markdown 中的相对图片路径转换为 local-file:// URL（供 Vditor 显示用）
 * ./assets/img.png → http://local-file.localhost/D%3A%2F...img.png
 * SV 模式下不做转换，保持相对路径显示
 */
function resolveImagePaths(markdown: string, currentFilePath: string | null, mode: EditorMode): string {
  if (!currentFilePath || mode === "sv") return markdown;
  const currentDir = dirName(currentFilePath);

  return markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (fullMatch, alt: string, url: string) => {
      // 跳过外部链接、data URL、已有协议前缀的 URL
      if (/^(https?:|data:|[a-z]+:\/\/)/i.test(url)) {
        return fullMatch;
      }
      const absPath = resolveRelativePath(currentDir, url);
      return `![${alt}](${convertFileSrc(absPath, 'local-file')})`;
    },
  );
}

/**
 * 将 markdown 中的 local-file:// URL 还原为相对路径（供保存文件用）
 * http://local-file.localhost/D%3A%2F...img.png → ./assets/img.png
 * SV 模式下不做转换（SV 内容本身不含 local-file:// URL）
 */
function unresolveImagePaths(markdown: string, currentFilePath: string | null, mode: EditorMode): string {
  if (!currentFilePath || mode === "sv") return markdown;
  const currentDir = dirName(currentFilePath);
  const PREFIX = "http://local-file.localhost/";

  return markdown.replace(
    /!\[([^\]]*)\]\((http:\/\/local-file\.localhost\/[^)]+)\)/g,
    (_match, alt: string, url: string) => {
      const encodedPath = url.slice(PREFIX.length);
      const absPath = percentDecode(encodedPath);
      const rel = relativePath(currentDir, absPath).replace(/\\/g, "/");
      return `![${alt}](${rel.startsWith(".") ? rel : "./" + rel})`;
    },
  );
}

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface SubMenuItem {
  name?: string;
  label?: string;
  shortcut?: string;
  divider?: boolean;
}

interface ContextMenuItem {
  name?: string;
  label?: string;
  icon?: string;
  disabled?: boolean;
  submenu?: SubMenuItem[];
  divider?: boolean;
  highlight?: boolean;
  rowType?: "icons" | "text";
  shortcut?: string;
}

const CUSTOM_ICONS: Record<string, string> = {
  cut: "M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z",
  paste: "M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z",
  delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  quote: "M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z",
};

// ── Search highlight helpers ──

const HIGHLIGHT_CLASS = "search-highlight";

function clearHighlightMarks() {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ""), el);
      parent.normalize();
    }
  });
}

function highlightInElement(el: HTMLElement, query: string) {
  if (!query) return;

  // Skip elements that shouldn't be highlighted
  const skipTags = new Set(["PRE", "CODE", "SCRIPT", "STYLE", "TEXTAREA"]);
  const skipClasses = new Set(["vditor-ir__marker", "vditor-toolbar", "vditor-menu"]);

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Text) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (skipTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest("pre, code, .vditor-ir__marker")) return NodeFilter.FILTER_REJECT;
      for (const cls of skipClasses) {
        if (parent.classList?.contains(cls)) return NodeFilter.FILTER_REJECT;
      }
      // Only process nodes with actual text content
      if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  const lowerQuery = query.toLowerCase();
  for (const textNode of textNodes) {
    const text = textNode.textContent || "";
    const lowerText = text.toLowerCase();

    // Find all occurrences in this text node
    const indices: number[] = [];
    let pos = 0;
    while (pos < lowerText.length) {
      const idx = lowerText.indexOf(lowerQuery, pos);
      if (idx < 0) break;
      indices.push(idx);
      pos = idx + 1;
    }

    if (indices.length === 0) continue;

    // Build fragment with highlights
    const fragment = document.createDocumentFragment();
    let lastIdx = 0;

    for (const idx of indices) {
      if (idx > lastIdx) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
      }
      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      mark.textContent = text.slice(idx, idx + query.length);
      fragment.appendChild(mark);
      lastIdx = idx + query.length;
    }

    if (lastIdx < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

const getHeadingSubmenu = (shortcuts: Record<string, string>): SubMenuItem[] => [
  { name: "heading-1", label: "一级标题", shortcut: shortcuts["heading-1"] || "Ctrl+Alt+1" },
  { name: "heading-2", label: "二级标题", shortcut: shortcuts["heading-2"] || "Ctrl+Alt+2" },
  { name: "heading-3", label: "三级标题", shortcut: shortcuts["heading-3"] || "Ctrl+Alt+3" },
  { name: "heading-4", label: "四级标题", shortcut: shortcuts["heading-4"] || "Ctrl+Alt+4" },
  { name: "heading-5", label: "五级标题", shortcut: shortcuts["heading-5"] || "Ctrl+Alt+5" },
  { name: "heading-6", label: "六级标题", shortcut: shortcuts["heading-6"] || "Ctrl+Alt+6" },
  { divider: true },
  { name: "paragraph", label: "段落", shortcut: shortcuts["paragraph"] || "Ctrl+Alt+0" },
];

const getInsertSubmenu = (shortcuts: Record<string, string>): SubMenuItem[] => [
  { name: "upload", label: "图像" },
  { name: "footnotes", label: "脚注" },
  { name: "line", label: "水平分割线", shortcut: shortcuts["hr"] || "Ctrl+Shift+H" },
  { name: "table", label: "表格", shortcut: shortcuts["table"] || "Ctrl+T" },
  { name: "code", label: "代码块", shortcut: shortcuts["code-block"] || "Ctrl+U" },
  { name: "math", label: "公式块" },
];

const getShortcuts = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem(SHORTCUTS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = DEFAULT_SHORTCUTS.map((def) => {
        const savedItem = parsed.find((s: { id: string }) => s.id === def.id);
        return savedItem ? savedItem : def;
      });
      return merged.reduce((acc: Record<string, string>, s: { id: string; keys: string[] }) => {
        acc[s.id] = s.keys.join("+");
        return acc;
      }, {});
    }
  } catch {}
  return DEFAULT_SHORTCUTS.reduce((acc: Record<string, string>, s) => {
    acc[s.id] = s.keys.join("+");
    return acc;
  }, {});
};

const CONTEXT_MENU_ITEMS = (hasSelection: boolean, hasClipboard: boolean): ContextMenuItem[] => {
  const shortcuts = getShortcuts();
  return [
    { name: "undo", label: "撤销", shortcut: shortcuts["undo"] || "Ctrl+Z", icon: "#vditor-icon-undo", rowType: "icons" },
    { name: "redo", label: "重做", shortcut: shortcuts["redo"] || "Ctrl+Y", icon: "#vditor-icon-redo", rowType: "icons" },
    { divider: true },
    { name: "cut", label: "剪切", shortcut: "Ctrl+X", icon: "#vditor-icon-cut", disabled: !hasSelection, rowType: "icons" },
    { name: "copy", label: "复制", shortcut: "Ctrl+C", icon: "#vditor-icon-copy", disabled: !hasSelection, rowType: "icons" },
    { name: "paste", label: "粘贴", shortcut: "Ctrl+V", icon: "#vditor-icon-paste", disabled: !hasClipboard, rowType: "icons" },
    { name: "delete", label: "删除", shortcut: "Delete", icon: "#vditor-icon-delete", rowType: "icons" },
    { divider: true },
    { divider: true },
    { name: "bold", label: "加粗", shortcut: shortcuts["bold"] || "Ctrl+B", icon: "#vditor-icon-bold", rowType: "icons" },
    { name: "italic", label: "斜体", shortcut: shortcuts["italic"] || "Ctrl+I", icon: "#vditor-icon-italic", rowType: "icons" },
    { name: "inline-code", label: "行内代码", shortcut: shortcuts["inline-code"] || "Ctrl+G", icon: "#vditor-icon-inline-code", rowType: "icons" },
    { name: "link", label: "链接", shortcut: shortcuts["link"] || "Ctrl+K", icon: "#vditor-icon-link", rowType: "icons" },
    { divider: true },
    { name: "quote", label: "引用", shortcut: shortcuts["quote"] || "Ctrl+;", icon: "#vditor-icon-quote", rowType: "icons" },
    { name: "ordered-list", label: "有序列表", shortcut: shortcuts["ordered-list"] || "Ctrl+O", icon: "#vditor-icon-ordered-list", rowType: "icons" },
    { name: "list", label: "无序列表", shortcut: shortcuts["unordered-list"] || "Ctrl+L", icon: "#vditor-icon-list", rowType: "icons" },
    { name: "check", label: "任务列表", shortcut: shortcuts["check-list"] || "Ctrl+J", icon: "#vditor-icon-check", rowType: "icons" },
    { divider: true },
    { divider: true },
    { name: "paragraph", label: "段落", icon: "#vditor-icon-paragraph", submenu: getHeadingSubmenu(shortcuts), rowType: "text" },
    { divider: true },
    { name: "insert", label: "插入", icon: "#vditor-icon-upload", submenu: getInsertSubmenu(shortcuts), rowType: "text" },
  ];
};

interface ContextMenuProps {
  items: ContextMenuItem[];
  onClick: (e: React.MouseEvent, name: string) => void;
  onClose: () => void;
  position: { x: number; y: number } | null;
}

const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(({ items, onClick, onClose, position }, ref) => {
  const internalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof ref === "function") {
      ref(internalRef.current);
    } else if (ref) {
      ref.current = internalRef.current;
    }
  }, [ref]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (internalRef.current && !internalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // 菜单位置调整
  useLayoutEffect(() => {
    if (!position || !internalRef.current) return;

    const menu = internalRef.current;
    let left = position.x;
    let top = position.y;

    // 先设置为点击位置
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // 获取实际尺寸
    const rect = menu.getBoundingClientRect();
    const GAP = 4;

    // 边界检测
    if (left + rect.width > window.innerWidth - GAP) {
      left = position.x - rect.width;
    }
    if (top + rect.height > window.innerHeight - GAP) {
      top = position.y - rect.height;
    }
    if (left < GAP) left = GAP;
    if (top < GAP) top = GAP;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [position]);

  const menuGroups: (ContextMenuItem | { type: "separator" })[][] = [];
  let currentGroup: (ContextMenuItem | { type: "separator" })[] = [];
  items.forEach((item) => {
    if (item.divider) {
      if (currentGroup.length > 0) {
        menuGroups.push(currentGroup);
        currentGroup = [];
      } else {
        // 连续分隔符 → 渲染为水平分割线
        menuGroups.push([{ type: "separator" }]);
      }
    } else {
      currentGroup.push(item);
    }
  });
  if (currentGroup.length > 0) {
    menuGroups.push(currentGroup);
  }

  const renderIcon = (icon?: string) => {
    if (!icon) return null;
    if (icon === "#vditor-icon-cut") {
      return (
        <svg className="context-menu-icon" viewBox="0 0 24 24">
          <path d={CUSTOM_ICONS.cut} fill="currentColor" />
        </svg>
      );
    }
    if (icon === "#vditor-icon-paste") {
      return (
        <svg className="context-menu-icon" viewBox="0 0 24 24">
          <path d={CUSTOM_ICONS.paste} fill="currentColor" />
        </svg>
      );
    }
    if (icon === "#vditor-icon-delete") {
      return (
        <svg className="context-menu-icon context-menu-icon-delete" viewBox="0 0 24 24">
          <path d={CUSTOM_ICONS.delete} fill="currentColor" />
        </svg>
      );
    }
    if (icon === "#vditor-icon-quote") {
      return (
        <svg className="context-menu-icon context-menu-icon-quote" viewBox="0 0 24 24">
          <path d={CUSTOM_ICONS.quote} fill="currentColor" />
        </svg>
      );
    }
    return (
      <svg className="context-menu-icon" viewBox="0 0 24 24">
        <use href={icon} />
      </svg>
    );
  };

  const handleSubmenuEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrapper = e.currentTarget;
    const submenu = wrapper.querySelector(".context-menu-submenu") as HTMLElement;
    if (!submenu) return;

    // 临时显示以测量尺寸
    const prevDisplay = submenu.style.display;
    submenu.style.display = "flex";
    submenu.style.visibility = "hidden";
    const sr = submenu.getBoundingClientRect();
    submenu.style.display = prevDisplay;
    submenu.style.visibility = "";

    const wr = wrapper.getBoundingClientRect();
    const GAP = 4;

    wrapper.dataset.flipX = wr.right + 8 + sr.width > window.innerWidth - GAP ? "true" : "false";
    wrapper.dataset.flipY = wr.top + sr.height > window.innerHeight - GAP ? "true" : "false";
  };

  const renderMenuItem = (menuItem: ContextMenuItem) => {
    if (menuItem.submenu) {
      return (
        <div key={menuItem.name} className={`context-menu-submenu-wrapper${menuItem.rowType === "text" ? " context-menu-submenu-wrapper--text" : ""}`} onMouseEnter={handleSubmenuEnter}>
          <button
            className={`context-menu-item${menuItem.disabled ? " disabled" : ""}${menuItem.rowType === "text" ? " context-menu-item-text" : ""}`}
            onClick={(e) => menuItem.name && onClick(e, menuItem.name)}
            disabled={menuItem.disabled}
          >
            {menuItem.rowType === "text" ? (
              <span>{menuItem.label}</span>
            ) : (
              renderIcon(menuItem.icon)
            )}
            <span className="context-menu-arrow">▶</span>
          </button>
          <div className="context-menu-submenu">
            {menuItem.submenu.map((sub, idx) => {
              if (sub.divider) {
                return <div key={`sub-divider-${idx}`} className="context-menu-divider" />;
              }
              return (
                <button
                  key={sub.name}
                  className="context-menu-subitem"
                  onClick={(e) => sub.name && onClick(e, sub.name)}
                >
                  <span>{sub.label}</span>
                  {sub.shortcut && <span className="context-menu-shortcut">{sub.shortcut}</span>}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <button
        key={menuItem.name}
        className={`context-menu-item${menuItem.disabled ? " disabled" : ""}`}
        onClick={(e) => menuItem.name && onClick(e, menuItem.name)}
        disabled={menuItem.disabled}
      >
        {renderIcon(menuItem.icon)}
        {menuItem.label && (
          <span className="context-menu-tooltip">
            {menuItem.label}
            {menuItem.shortcut && ` ${menuItem.shortcut}`}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      ref={internalRef}
      className="vditor-context-menu"
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
      }}
    >
      {(() => {
        let toolRowCount = 0;
        return menuGroups.map((group, groupIndex) => {
          if (group.length === 1 && "type" in group[0] && group[0].type === "separator") {
            return <div key={groupIndex} className="context-menu-divider" />;
          }
          toolRowCount++;
          const isFirstFour = toolRowCount <= 4;
          const isFirstRow = toolRowCount === 1;
          return (
            <div key={groupIndex} className={`context-menu-row${isFirstFour ? " context-menu-row--tools" : ""}${isFirstRow ? " context-menu-row--first" : ""}`}>
              {group.map((item) => renderMenuItem(item as ContextMenuItem))}
            </div>
          );
        });
      })()}
    </div>
  );
});

const VditorEditor = forwardRef<VditorEditorHandle, VditorEditorProps>(
  ({ value, onChange, mode, theme, typewriterMode, editorSettings, imageSettings, currentFilePath, activeVaultPath, onWordCount }, ref) => {
    const elRef = useRef<HTMLDivElement>(null);
    const vditorRef = useRef<Vditor | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const onChangeRef = useRef(onChange);
    const onWordCountRef = useRef(onWordCount);
    onWordCountRef.current = onWordCount;
    const isInternalRef = useRef(false);
    const mountedRef = useRef(true);
    const savedRangeRef = useRef<Range | null>(null); // 保存右键菜单打开时的 range
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState("");
    const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);
    const [hasSelection, setHasSelection] = useState(false);
    const [hasClipboard, setHasClipboard] = useState(false);

    const checkClipboard = useCallback(async () => {
      try {
        const text = await navigator.clipboard.readText();
        setHasClipboard(text.length > 0);
      } catch {
        setHasClipboard(false);
      }
    }, []);

    const checkSelection = useCallback(() => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        setHasSelection(!range.collapsed);
      } else {
        setHasSelection(false);
      }
    }, []);

    const [isDragOver, setIsDragOver] = useState(false);

    const handleImageFileRef = useRef<((file: File) => Promise<void>) | null>(null);

    const handleImageFile = useCallback(async (file: File) => {
      const vditor = vditorRef.current;
      if (!vditor) {
        console.warn("[ImageManager] vditor 未就绪");
        return;
      }

      const settings = imageSettings || loadImageSettings();
      console.log("[ImageManager] 开始保存图片:", file.name, file.size, "存储模式:", settings.storageMode);
      try {
        const result = await saveImageToLocal(file, settings, currentFilePath || null, activeVaultPath || null);
        console.log("[ImageManager] 图片已保存:", result.savedPath, "引用:", result.markdownRef);
        vditor.focus();
        // 插入相对路径（干净、可移植），但转为 local-file:// URL 让 Vditor 显示
        const mdSnippet = resolveImagePaths(
          `![${file.name}](${result.markdownRef})`,
          currentFilePath || null,
          modeRef.current,
        );
        vditor.insertValue(mdSnippet);
        // getValue() 会返回含 local-file:// URL 的 markdown，还原为相对路径再同步 React 状态
        onChangeRef.current(unresolveImagePaths(vditor.getValue(), currentFilePath || null, modeRef.current));
        console.log("[ImageManager] 图片引用已插入编辑器:", result.markdownRef);
      } catch (e: any) {
        console.error("[ImageManager] save failed:", e);
        (vditor as any).tip?.show?.(e?.message || "图片保存失败", 3000);
      }
    }, [imageSettings, currentFilePath, activeVaultPath]);

    handleImageFileRef.current = handleImageFile;

    const handleImageUrlRef = useRef<((url: string) => Promise<void>) | null>(null);

    const handleImageUrl = useCallback(async (url: string) => {
      const vditor = vditorRef.current;
      if (!vditor) return;

      const settings = imageSettings || loadImageSettings();
      if (settings.storageMode === "image-bed") {
        vditor.insertValue(`![](${url})`);
        onChangeRef.current(unresolveImagePaths(vditor.getValue(), currentFilePathRef.current ?? null, modeRef.current));
        return;
      }

      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const ext = blob.type.split("/")[1] || "png";
        const filename = `image-${Date.now()}.${ext}`;
        const file = new File([blob], filename, { type: blob.type });
        handleImageFileRef.current?.(file);
      } catch (e: any) {
        console.error("[ImageManager] download image failed:", e);
        vditor.insertValue(`![](${url})`);
        onChangeRef.current(unresolveImagePaths(vditor.getValue(), currentFilePathRef.current ?? null, modeRef.current));
      }
    }, [imageSettings]);

    handleImageUrlRef.current = handleImageUrl;

    onChangeRef.current = onChange;
    const currentFilePathRef = useRef(currentFilePath);
    currentFilePathRef.current = currentFilePath;
    const modeRef = useRef(mode);
    modeRef.current = mode;

    const isFileSwitchRef = useRef(false);
    const pendingHighlightRef = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      // getValue: 将 Vditor 内部的 local-file:// URL 还原为相对路径
      getValue: () => {
        const raw = vditorRef.current?.getValue() ?? "";
        return unresolveImagePaths(raw, currentFilePathRef.current ?? null, modeRef.current);
      },
      // setValue: 将相对路径转为 local-file:// URL 再设置到 Vditor
      setValue: (val: string) => {
        if (vditorRef.current) {
          isInternalRef.current = true;
          vditorRef.current.setValue(resolveImagePaths(val, currentFilePathRef.current ?? null, modeRef.current), true);
        }
      },
      markFileSwitch: () => {
        isFileSwitchRef.current = true;
      },
      resize: () => {
        // 触发窗口 resize 事件让 Vditor 内部重新计算布局
        window.dispatchEvent(new Event("resize"));
      },
      highlightSearch: (query: string) => {
        clearHighlightMarks();
        if (!query) { pendingHighlightRef.current = null; return; }
        pendingHighlightRef.current = query;
        const editorEl = elRef.current;
        if (!editorEl) return;
        const resetEl = editorEl.querySelector(".vditor-reset") as HTMLElement | null;
        if (!resetEl) return;
        // Try immediately, and retry after delays in case Vditor hasn't finished rendering
        const tryHighlight = () => {
          const q = pendingHighlightRef.current;
          if (!q) return;
          const el = elRef.current;
          if (!el) return;
          const reset = el.querySelector(".vditor-reset") as HTMLElement | null;
          if (!reset) return;
          // Check if there's actual text content to highlight
          if (reset.textContent && reset.textContent.includes(q)) {
            clearHighlightMarks();
            highlightInElement(reset, q);
            pendingHighlightRef.current = null;
          }
        };
        tryHighlight();
        setTimeout(tryHighlight, 200);
        setTimeout(tryHighlight, 500);
      },
      clearHighlight: () => {
        clearHighlightMarks();
      },
      executeCommand: (name: string) => {
        executeCommand(name);
      },
      scrollToHeading: (text: string, _line: number) => {
        const editorEl = elRef.current;
        if (!editorEl) return;

        const cleanText = text.replace(/[#*_`~]/g, "").trim();

        if (mode === "wysiwyg" || mode === "ir") {
          // WYSIWYG/IR：使用模式特定选择器防止查到隐藏的其他模式容器
          const modeClass = mode === "wysiwyg" ? ".vditor-wysiwyg" : ".vditor-ir";
          const resetEl = editorEl.querySelector(
            `${modeClass} .vditor-reset`
          ) as HTMLElement | null;
          if (!resetEl) return;

          const headings = resetEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
          let bestMatch: Element | null = null;
          let bestScore = 0;

          for (const h of headings) {
            const headingText = (h.textContent || "").replace(/[#*_`~]/g, "").trim();
            let score = 0;
            if (headingText === cleanText) {
              score = 100;
            } else if (headingText.includes(cleanText) || cleanText.includes(headingText)) {
              // 部分匹配：按重合比例打分
              score = (Math.min(headingText.length, cleanText.length) /
                       Math.max(headingText.length, cleanText.length)) * 50;
            }
            if (score > bestScore) {
              bestScore = score;
              bestMatch = h;
            }
          }

          if (bestMatch && bestScore > 0) {
            bestMatch.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          return;
        }

        if (mode === "sv") {
          // SV 模式：.vditor-sv 和 .vditor-reset 在同一元素上，不是父子关系
          // 通过 .vditor-sv__marker--heading 查找标题标记元素
          const svElement = editorEl.querySelector(".vditor-sv") as HTMLElement | null;
          if (!svElement) return;

          // 找到所有标题标记（# ## ### 等），匹配后面的标题文字
          const headingMarkers = svElement.querySelectorAll(".vditor-sv__marker--heading");
          for (const marker of headingMarkers) {
            // 标题标记和文字通常在同一个块级父元素中
            const blockEl = marker.closest("[data-block]") || marker.parentElement;
            if (!blockEl) continue;
            const lineText = (blockEl.textContent || "")
              .replace(/^#{1,6}\s+/, "")
              .replace(/[#*_`~]/g, "")
              .trim();
            if (lineText === cleanText || lineText.includes(cleanText) || cleanText.includes(lineText)) {
              marker.scrollIntoView({ behavior: "smooth", block: "center" });
              return;
            }
          }

          // 回退：通过 textContent 按比例估算滚动位置
          const textContent = svElement.textContent || "";
          const lines = textContent.split("\n");
          const headingLineIdx = lines.findIndex(l => {
            const cleaned = l.replace(/^#{1,6}\s+/, "").replace(/[#*_`~]/g, "").trim();
            return cleaned === cleanText || cleaned.includes(cleanText) || cleanText.includes(cleaned);
          });
          if (headingLineIdx >= 0) {
            const ratio = headingLineIdx / Math.max(lines.length - 1, 1);
            svElement.scrollTop = ratio * (svElement.scrollHeight - svElement.clientHeight);
          }
        }
      },
      scrollToLine: (line: number) => {
        const editorEl = elRef.current;
        if (!editorEl) return;

        if (mode === "sv") {
          // SV 模式：.vditor-sv 和 .vditor-reset 在同一元素上
          const svElement = editorEl.querySelector(".vditor-sv") as HTMLElement | null;
          if (svElement) {
            const textContent = svElement.textContent || "";
            const totalLines = Math.max(textContent.split("\n").length, 1);
            const ratio = Math.min((line - 1) / Math.max(totalLines - 1, 1), 1);
            svElement.scrollTop = ratio * (svElement.scrollHeight - svElement.clientHeight);
            return;
          }
        }

        // WYSIWYG/IR 或 SV 回退：按比例估算滚动位置
        const resetEl = editorEl.querySelector(".vditor-reset") as HTMLElement | null;
        if (!resetEl) return;

        const scrollContainer = resetEl.parentElement as HTMLElement | null;
        if (!scrollContainer) return;

        const lineCount = (scrollContainer.textContent || "").split("\n").length || 1;
        const ratio = Math.min((line - 1) / Math.max(lineCount - 1, 1), 1);
        scrollContainer.scrollTop = ratio * (scrollContainer.scrollHeight - scrollContainer.clientHeight);
      },
    }));

    // 编辑器设置的 JSON key，变化时触发 Vditor 重建
    const editorSettingsKey = JSON.stringify(editorSettings ?? DEFAULT_EDITOR_SETTINGS);

    // 初始化 Vditor（mode / editorSettings 变化时重建）
    useEffect(() => {
      const el = elRef.current;
      if (!el) return;

      // 标记当前 mount 周期
      mountedRef.current = true;

      // 清理上一个实例
      if (vditorRef.current) {
        try { vditorRef.current.destroy(); } catch {}
        vditorRef.current = null;
      }
      el.innerHTML = "";
      setStatus("loading");
      setErrorMsg("");

      const es = editorSettings ?? DEFAULT_EDITOR_SETTINGS;

      // 超时检测（Lute 加载失败时 after() 不会触发）
      const timeoutId = setTimeout(() => {
        if (mountedRef.current && vditorRef.current) {
          try {
            const cur = vditorRef.current.getValue();
            if (!cur) {
              setStatus("error");
              setErrorMsg("编辑器初始化超时，Lute 引擎可能加载失败。请检查网络和 /vditor/dist/js/lute/lute.min.js 路径。");
            }
          } catch {
            setStatus("error");
            setErrorMsg("编辑器初始化超时");
          }
        }
      }, 15000);

      // 防止 StrictMode 或其他原因导致的双重初始化
      const tag = Symbol("init");
      (el as any).__zmd_init_tag = tag;

      // ★ 在 document 上注册 capture 阶段 paste handler
      // 截图粘贴时剪贴板同时有 text/html（含 base64 <img>）和 files
      // Vditor 先检查 textHTML，发现不为空就走 HTML 路径，files 路径永远不会执行
      // 所以必须在 Vditor 之前拦截，阻止 Vditor 处理图片粘贴
      // 注册在 document 上确保比任何元素级别的 handler 更早执行
      const hookPaste = (e: ClipboardEvent) => {
        // 只处理编辑器内的粘贴
        if (!el.contains(e.target as Node)) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
          if (item.type.startsWith("image/")) {
            console.log("[Image] 检测到粘贴图片:", item.type);
            e.preventDefault();
            e.stopPropagation();

            // 策略1: getAsFile()
            const file = item.getAsFile();
            if (file && file.size > 0) {
              console.log("[Image] getAsFile 成功:", file.name, file.size);
              handleImageFileRef.current?.(file);
              return;
            }

            // 策略2: 从 text/html 中提取 base64 图片
            console.log("[Image] getAsFile 失败，尝试从 HTML 提取 base64...");
            const html = e.clipboardData?.getData("text/html");
            if (html) {
              const match = html.match(/<img[^>]+src=["']data:image\/([^"';\s]+);base64,([^"']+)["']/i);
              if (match) {
                const ext = match[1];
                const b64 = match[2];
                const binaryStr = atob(b64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }
                const mimeMap: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
                const mime = mimeMap[ext] || `image/${ext}`;
                const blob = new Blob([bytes], { type: mime });
                const f = new File([blob], `paste-${Date.now()}.${ext}`, { type: mime });
                console.log("[Image] 从 HTML 提取成功:", f.size);
                handleImageFileRef.current?.(f);
                return;
              }
            }

            console.warn("[Image] 所有策略均失败，无法读取图片数据");
          }
        }
      };
      document.addEventListener("paste", hookPaste, { capture: true });

      try {
        // WYSIWYG/IR 模式下将相对路径转为 local-file:// URL，SV 模式保持原样
        const initialValue = resolveImagePaths(value, currentFilePathRef.current ?? null, mode);
        const vditor = new Vditor(el, {
          mode,
          value: initialValue,
          cdn: "/vditor",
          icon: "ant",
          lang: "zh_CN",
          placeholder: "开始输入 Markdown... ✍️",
          theme: theme === "white" || theme === "mint" || theme === "liquid-glass" ? "classic" : "dark",
          height: "100%",
          width: "100%",
          typewriterMode,
          counter: { enable: true, type: es.counterType, after: (length: number) => { onWordCountRef.current?.(length); } },
          resize: { enable: es.resize },
          cache: { enable: es.cache },
          link: {
            isOpen: es.linkOpenNewTab,
            click: (href: unknown) => {
              const hrefStr = String(href);
              if (hrefStr && (hrefStr.startsWith("http://") || hrefStr.startsWith("https://"))) {
                window.open(hrefStr, "_blank", "noopener,noreferrer");
              }
            },
          },
          image: {
            isPreview: true,
          },
          upload: {
            accept: "image/*",
            max: 20 * 1024 * 1024,
            multiple: true,
            filename: (name: string) => {
              const ext = name.split(".").pop() || "png";
              const base = name.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*]/g, "_");
              const now = new Date();
              const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
              return `${base}-${ts}.${ext}`;
            },
            validate: (files: File[]): string | boolean => {
              const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml"];
              for (const file of files) {
                if (!allowed.includes(file.type)) {
                  return `不支持的文件类型: ${file.name}`;
                }
              }
              return true;
            },
            handler: (files: File[]): null => {
              for (const file of files) {
                handleImageFileRef.current?.(file);
              }
              return null;
            },
            success: (_editor: HTMLPreElement, msg: string) => {
              (vditorRef.current as any)?.tip?.show?.(msg || "图片已保存", 2000);
            },
            error: (msg: string) => {
              (vditorRef.current as any)?.tip?.show?.(msg || "图片保存失败", 3000);
            },
          },
          toolbar: [
            "emoji",
            "headings",
            "bold",
            "italic",
            "strike",
            "link",
            "|",
            "list",
            "ordered-list",
            "check",
            "outdent",
            "indent",
            "|",
            "quote",
            "line",
            "code",
            "inline-code",
            "insert-before",
            "insert-after",
            "|",
            "upload",
            "record",
            "table",
            "math",
            "footnotes",
            "toc",
            "|",
            "undo",
            "redo",
            "|",
            "fullscreen",
            "edit-mode",
          ],
          toolbarConfig: { hide: true, pin: false },
          // Vditor 内部某些路径会调用此回调但未做空值检查
          customWysiwygToolbar: () => {},
          input: (val: string) => {
            if (isInternalRef.current) {
              isInternalRef.current = false;
              return;
            }
            // 将 Vditor 内部的 local-file:// URL 还原为相对路径再同步到 React 状态
            onChangeRef.current(unresolveImagePaths(val, currentFilePathRef.current ?? null, modeRef.current));
          },
          after: () => {
            clearTimeout(timeoutId);
            // 防止过期回调
            if ((el as any).__zmd_init_tag !== tag) return;
            if (!mountedRef.current) return;
            setStatus("ready");
          },
          // 禁用右侧预览分屏，WYSIWYG 本身就是所见即所得
          preview: {
            mode: "editor",
            maxWidth: es.previewMaxWidth,
            theme: {
              current: theme === "white" || theme === "mint" || theme === "liquid-glass" ? "light" : "dark",
              path: "/vditor/dist/css/content-theme",
            },
            hljs: {
              style: es.codeTheme === "auto"
                ? (theme === "white" || theme === "mint" || theme === "liquid-glass" ? "atom-one-light" : "atom-one-dark")
                : es.codeTheme,
              enable: true,
              lineNumber: es.codeLineNumber,
            },
            markdown: {
              autoSpace: es.autoSpace,
              gfmAutoLink: es.gfmAutoLink,
              fixTermTypo: es.fixTermTypo,
              footnotes: es.footnotes,
              toc: es.toc,
              paragraphBeginningSpace: es.paragraphBeginningSpace,
              sanitize: es.sanitize,
              codeBlockPreview: es.codeBlockPreview,
              mathBlockPreview: es.mathBlockPreview,
              mark: es.mark,
              sup: es.sup,
              sub: es.sub,
            },
            math: {
              engine: es.mathEngine,
            },
          },
        } as any);

        vditorRef.current = vditor;

        // IR 模式：阻止 mousedown 在代码块预览区（嵌套 <pre>）放置光标，
        // 否则 contenteditable 会尝试合并相邻 DOM 导致下方内容被吸入代码块
        const hookIRCodeBlockMousedown = (e: MouseEvent) => {
          const previewInCodeBlock = (e.target as HTMLElement).closest(
            '.vditor-ir__node[data-type="code-block"] .vditor-ir__preview',
          );
          if (previewInCodeBlock) {
            e.preventDefault();
          }
        };
        el.addEventListener("mousedown", hookIRCodeBlockMousedown);

        // 监听链接点击，Ctrl+点击时在浏览器打开
        const hookClick = (e: MouseEvent) => {
          const origin = (e.target as HTMLElement).closest("a");
          if (origin && origin.href) {
            e.preventDefault();
            location.href = origin.href;
          }
        };
        el.addEventListener("click", hookClick, { capture: true });

        // 拦截 Ctrl+M / Ctrl+T，阻止 Vditor 内置快捷键，交给 App.tsx 处理
        const hookKeydown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === "m" || e.key === "t")) {
            e.stopPropagation();
          }
        };
        el.addEventListener("keydown", hookKeydown, { capture: true });

        // 按需隐藏 popover：仅对段落/列表/引用隐藏，保留代码块/表格/图表等
        const hideTags = new Set(["P", "UL", "OL", "BLOCKQUOTE"]);
        const popover = el.querySelector(".vditor-panel--none:last-of-type") as HTMLElement | null;
        if (popover) {
          const observer = new MutationObserver(() => {
            if (popover.style.display === "block") {
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                let node: HTMLElement | null = sel.getRangeAt(0).startContainer as HTMLElement;
                if (node.nodeType === 3) node = node.parentElement;
                while (node && node !== el) {
                  if (hideTags.has(node.tagName)) {
                    popover.style.display = "none";
                    return;
                  }
                  if (node.getAttribute("data-block") === "0") break;
                  node = node.parentElement;
                }
              }
            }
          });
          observer.observe(popover, { attributes: true, attributeFilter: ["style"] });
        }

        // 拖拽放置处理
        const hookDragOver = (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer?.types.includes("Files")) {
            setIsDragOver(true);
          }
        };

        const hookDragLeave = (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const related = e.relatedTarget as HTMLElement;
          if (!related || !el.contains(related)) {
            setIsDragOver(false);
          }
        };

        const hookDrop = (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);

          const files = e.dataTransfer?.files;
          if (!files || files.length === 0) return;

          const imageExts = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "ico"]);
          for (const file of files) {
            const ext = file.name.split(".").pop()?.toLowerCase() || "";
            if (imageExts.has(ext) || file.type.startsWith("image/")) {
              handleImageFileRef.current?.(file);
            }
          }
        };

        el.addEventListener("dragover", hookDragOver);
        el.addEventListener("dragleave", hookDragLeave);
        el.addEventListener("drop", hookDrop);

        // 存储清理函数
        const cleanup = () => {
          document.removeEventListener("paste", hookPaste, { capture: true });
          el.removeEventListener("mousedown", hookIRCodeBlockMousedown);
          el.removeEventListener("click", hookClick, { capture: true });
          el.removeEventListener("keydown", hookKeydown, { capture: true });
          el.removeEventListener("dragover", hookDragOver);
          el.removeEventListener("dragleave", hookDragLeave);
          el.removeEventListener("drop", hookDrop);
        };
        (vditor as any).__zmd_cleanup = cleanup;
      } catch (e: any) {
        console.error("[VditorEditor] init error:", e);
        if (mountedRef.current) {
          setStatus("error");
          setErrorMsg(e?.message ?? String(e));
        }
      }

      return () => {
        clearTimeout(timeoutId);
        mountedRef.current = false;
        if (vditorRef.current) {
          const cleanup = (vditorRef.current as any).__zmd_cleanup;
          if (cleanup) cleanup();
          try { vditorRef.current.destroy(); } catch {}
          vditorRef.current = null;
        }
      };
    }, [mode, editorSettingsKey]); // theme 变化不再重建，而是通过下面的 useEffect 动态切换

    // 主题变化时动态切换 Vditor 主题
    useEffect(() => {
      const vditor = vditorRef.current;
      if (!vditor || status !== "ready") return;

      const editorTheme = theme === "white" || theme === "mint" || theme === "liquid-glass" ? "classic" : "dark";
      const contentTheme = theme === "white" || theme === "mint" || theme === "liquid-glass" ? "light" : "dark";
      const codeTheme = theme === "white" || theme === "mint" || theme === "liquid-glass" ? "atom-one-light" : "atom-one-dark";

      vditor.setTheme(editorTheme, contentTheme, codeTheme, "/vditor/dist/css/content-theme");
    }, [theme, status]); // 移除 mode，避免模式切换时重复调用

    // 外部 value 同步（value 含相对路径，需转为 local-file:// URL 后与 Vditor 内部比较）
    useEffect(() => {
      const vditor = vditorRef.current;
      if (!vditor || status !== "ready") return;
      const cur = vditor.getValue();
      const resolvedValue = resolveImagePaths(value, currentFilePathRef.current ?? null, modeRef.current);
      if (resolvedValue !== cur) {
        isInternalRef.current = true;
        vditor.setValue(resolvedValue, true);
      }
    }, [value, status]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      // 保存当前的 range，因为右键菜单打开后 selection 可能会被清除
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
      checkSelection();
      checkClipboard();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    }, [checkSelection, checkClipboard]);

    const executeCommand = useCallback((name: string) => {
      const vditor = vditorRef.current;
      if (!vditor) return;

      const internalVditor = (vditor as any).vditor;
      const syncInput = () => {
        // 直接通过 onChangeRef 更新 React 状态，绕过 Vditor 的 isInternalRef 检测
        // 将 Vditor 内部的 local-file:// URL 还原为相对路径
        onChangeRef.current(unresolveImagePaths(vditor.getValue(), currentFilePathRef.current ?? null, modeRef.current));
      };

      // 标题/段落命令：直接操作 DOM，不依赖隐藏的工具栏面板
      if (name.startsWith("heading-") || name === "paragraph") {
        vditor.focus();
        const mode = internalVditor?.currentMode;
        const level = name.startsWith("heading-") ? name.replace("heading-", "") : "";
        const tagName = level ? `h${level}` : "p";

        if (mode === "wysiwyg" || mode === "ir") {
          const editorEl = internalVditor?.wysiwyg?.element as HTMLElement;
          if (!editorEl) return;

          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);

          let block: HTMLElement | null = null;
          let node: Node | null = range.startContainer;
          while (node && node !== editorEl) {
            if (node instanceof HTMLElement) {
              if (node.hasAttribute("data-block") ||
                  /^H[1-6]$/.test(node.tagName) ||
                  node.tagName === "P" ||
                  node.tagName === "BLOCKQUOTE") {
                block = node;
                break;
              }
            }
            node = node.parentElement;
          }
          if (!block || block === editorEl) return;

          range.insertNode(document.createElement("wbr"));
          const innerHTML = block.innerHTML.trim();
          block.outerHTML = `<${tagName} data-block="0">${innerHTML}</${tagName}>`;

          const wbr = editorEl.querySelector("wbr");
          if (wbr) {
            const newRange = document.createRange();
            newRange.setStartBefore(wbr);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            wbr.remove();
          }

          onChangeRef.current(unresolveImagePaths(vditor.getValue(), currentFilePathRef.current ?? null, modeRef.current));
        } else if (mode === "sv") {
          vditor.focus();
          const svEl = internalVditor?.sv?.element as HTMLElement;
          if (!svEl) return;
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const md = vditor.getValue();
          let cursorOffset = 0;
          const walker = document.createTreeWalker(svEl, NodeFilter.SHOW_TEXT);
          let textNode = walker.nextNode();
          while (textNode) {
            if (textNode === sel.anchorNode) { cursorOffset += sel.anchorOffset; break; }
            cursorOffset += (textNode.textContent || "").length;
            textNode = walker.nextNode();
          }
          let lineStart = cursorOffset;
          while (lineStart > 0 && md[lineStart - 1] !== "\n") lineStart--;
          let lineEnd = cursorOffset;
          while (lineEnd < md.length && md[lineEnd] !== "\n") lineEnd++;
          const oldLine = md.slice(lineStart, lineEnd);
          let newLine: string;
          if (name === "paragraph") {
            newLine = oldLine.replace(/^#{1,6} /, "");
          } else {
            newLine = "#".repeat(parseInt(level, 10)) + " " + oldLine.replace(/^#{1,6} /, "");
          }
          const newMd = md.slice(0, lineStart) + newLine + md.slice(lineEnd);
          vditor.setValue(newMd);
          syncInput();
          const targetOffset = lineStart + newLine.length;
          const walker2 = document.createTreeWalker(svEl, NodeFilter.SHOW_TEXT);
          let n = walker2.nextNode();
          let acc = 0;
          while (n) {
            const len = (n.textContent || "").length;
            if (acc + len >= targetOffset) {
              const r = document.createRange();
              r.setStart(n, targetOffset - acc);
              r.collapse(true);
              sel.removeAllRanges();
              sel.addRange(r);
              break;
            }
            acc += len;
            n = walker2.nextNode();
          }
        }
        return;
      }

      // 逐行/块级格式化命令
      if (name === "quote" || name === "list" || name === "ordered-list" || name === "check" || name === "inline-code" || name === "code") {
        vditor.focus();
        const mode = internalVditor?.currentMode;
        if (mode === "sv") {
          const prefixMap: Record<string, string> = {
            quote: "> ", list: "* ", "ordered-list": "1. ", check: "* [ ] ",
          };
          const svEl = internalVditor?.sv?.element as HTMLElement;
          if (!svEl) return;
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return;
          const md = vditor.getValue();

          const getOffset = (n: Node, o: number): number => {
            let off = 0;
            const w = document.createTreeWalker(svEl, NodeFilter.SHOW_TEXT);
            let t = w.nextNode();
            while (t) { if (t === n) return off + o; off += (t.textContent || "").length; t = w.nextNode(); }
            return off;
          };
          let a = getOffset(sel.anchorNode, sel.anchorOffset);
          let b = getOffset(sel.focusNode, sel.focusOffset);
          if (a > b) [a, b] = [b, a];

          let ls = a; while (ls > 0 && md[ls - 1] !== "\n") ls--;
          let le = b > a ? b : ls;
          while (le < md.length && md[le] !== "\n") le++;

          const lines = md.slice(ls, le).split("\n");
          let processed: string;
          if (name === "code") {
            const hasFence = lines.length > 0 && lines[0].startsWith("```") && lines[lines.length - 1].startsWith("```");
            processed = hasFence
              ? lines.slice(1, -1).join("\n")
              : "```\n" + lines.join("\n") + "\n```";
          } else if (name === "inline-code") {
            // 行内代码：包装非空行，空行保持原样
            const nonEmptyLines = lines.filter(l => l !== "");
            const allWrapped = nonEmptyLines.length > 0 && nonEmptyLines.every(l => { const t = l.trim(); return t.startsWith("`") && t.endsWith("`") && t.length >= 2; });
            processed = allWrapped
              ? lines.map(l => l === "" ? l : l.trim().slice(1, -1)).join("\n")
              : lines.map(l => l === "" ? l : "`" + l + "`").join("\n");
          } else {
            const prefix = prefixMap[name];
            if (name === "quote") {
              // 引用：保持空行，每行加 >
              const allHave = lines.every(l => l === "" || l.startsWith(prefix));
              processed = allHave
                ? lines.map(l => l === "" ? l : l.slice(prefix.length)).join("\n")
                : lines.map(l => l.startsWith(prefix) ? l : prefix + l).join("\n");
            } else {
              // 列表/有序列表/任务列表：移除空行，紧凑排列
              const items = lines.filter(l => l !== "");
              const allHave = items.length > 0 && items.every(l => l.startsWith(prefix));
              processed = allHave
                ? items.map(l => l.slice(prefix.length)).join("\n")
                : items.map(l => l.startsWith(prefix) ? l : prefix + l).join("\n");
            }
          }
          const newMd = md.slice(0, ls) + processed + md.slice(le);
          vditor.setValue(newMd);
          syncInput();

          const target = ls + processed.length;
          const w2 = document.createTreeWalker(svEl, NodeFilter.SHOW_TEXT);
          let t2 = w2.nextNode(); let acc = 0;
          while (t2) {
            const len = (t2.textContent || "").length;
            if (acc + len >= target) {
              const r = document.createRange(); r.setStart(t2, target - acc); r.collapse(true);
              sel.removeAllRanges(); sel.addRange(r); break;
            }
            acc += len; t2 = w2.nextNode();
          }
          return;
        }

        // WYSIWYG/IR 模式：DOM 直接操作，避免 markdown 往返丢失空行
        {
          const editorEl = internalVditor?.wysiwyg?.element as HTMLElement;
          if (!editorEl) return;

          if (savedRangeRef.current) {
            const s = window.getSelection();
            if (s) { s.removeAllRanges(); s.addRange(savedRangeRef.current); }
          }

          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);

          // 向上找到块元素（与标题命令相同的模式）
          let block: HTMLElement | null = null;
          let node: Node | null = range.startContainer;
          while (node && node !== editorEl) {
            if (node instanceof HTMLElement) {
              if (node.hasAttribute("data-block") ||
                  /^H[1-6]$/.test(node.tagName) ||
                  node.tagName === "P" || node.tagName === "BLOCKQUOTE" ||
                  node.tagName === "LI") {
                block = node;
                break;
              }
            }
            node = node.parentElement;
          }
          if (!block || block === editorEl) return;

          // 插入 wbr 标记光标
          range.insertNode(document.createElement("wbr"));

          if (name === "list" || name === "ordered-list" || name === "check") {
            if (block.tagName === "LI") {
              // 取消列表：li → p
              const listEl = block.parentElement!;
              let pHTML = "";
              for (let i = 0; i < listEl.childElementCount; i++) {
                const li = listEl.children[i];
                const inputEl = li.querySelector("input");
                if (inputEl) inputEl.remove();
                // 避免嵌套 <p>：如果有 <p> 包裹则取内部 HTML
                const inner = li.firstElementChild?.tagName === "P"
                  ? (li.firstElementChild as HTMLElement).innerHTML
                  : li.innerHTML;
                pHTML += `<p data-block="0">${inner}</p>`;
              }
              listEl.insertAdjacentHTML("beforebegin", pHTML);
              listEl.remove();
            } else {
              // 添加列表：p/h* → ul/ol > li
              // 普通列表包裹 <p> 以支持 fixList Enter 换行
              // 任务列表不加 <p>（fixTask 单独处理 Enter，用 firstElementChild 取 checkbox）
              const wrapperTag = name === "ordered-list" ? "ol" : "ul";
              const inner = name === "check"
                ? ` class="vditor-task"><input type="checkbox" /> ${block.innerHTML}`
                : `><p data-block="0">${block.innerHTML}</p>`;
              block.insertAdjacentHTML("beforebegin",
                `<${wrapperTag} data-block="0"><li${inner}</li></${wrapperTag}>`);
              block.remove();
            }
          } else if (name === "quote") {
            if (block.tagName === "BLOCKQUOTE") {
              block.outerHTML = block.innerHTML;
            } else {
              block.outerHTML = `<blockquote data-block="0">${block.outerHTML}</blockquote>`;
            }
          } else if (name === "inline-code") {
            // 行内代码：toggle <code> 包裹
            const codeParent = (range.startContainer as Element).closest?.("code") ||
                               range.startContainer.parentElement?.closest("code");
            if (codeParent) {
              const text = codeParent.textContent || "";
              codeParent.replaceWith(document.createTextNode(text));
            } else if (!range.collapsed) {
              const code = document.createElement("code");
              try { range.surroundContents(code); } catch { /* cross-node, ignore */ }
            }
          } else if (name === "code") {
            if (block.tagName === "PRE") {
              block.outerHTML = `<p data-block="0">${block.textContent || ""}</p>`;
            } else {
              block.outerHTML = `<pre data-block="0"><code>${block.textContent || ""}</code></pre>`;
            }
          }

          // 恢复光标到 wbr 位置
          const wbr = editorEl.querySelector("wbr");
          if (wbr) {
            const newRange = document.createRange();
            newRange.setStartBefore(wbr);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            wbr.remove();
          }

          onChangeRef.current(unresolveImagePaths(vditor.getValue(), currentFilePathRef.current ?? null, modeRef.current));
          return;
        }
      }

      // 工具栏按钮辅助（带 try-catch 防止 surroundContents 跨块报错）
      const safeClick = (dataType: string): boolean => {
        try {
          const btn = internalVditor?.toolbar?.element?.querySelector(`[data-type="${dataType}"]`);
          if (btn) { (btn as HTMLElement).click(); return true; }
        } catch { /* ignore */ }
        return false;
      };

      if (name === "bold" || name === "italic" || name === "strike") {
        vditor.focus();
        const cmdMap: Record<string, string> = { bold: "bold", italic: "italic", strike: "strikeThrough" };
        if (!safeClick(name)) {
          document.execCommand(cmdMap[name]);
        }
        return;
      }
      if (name === "link") {
        vditor.focus();
        const sel = window.getSelection();
        const text = sel?.toString() || "";
        if (text.includes("\n")) {
          // 多行选中：只处理第一行，弹窗输入链接地址
          const firstLine = text.split("\n")[0];
          if (!firstLine) return;
          const url = prompt("链接地址:", "https://");
          if (url) {
            const mode = internalVditor?.currentMode;
            if (mode === "sv") {
              const svEl = internalVditor?.sv?.element as HTMLElement;
              if (!svEl) return;
              const md = vditor.getValue();
              const idx = md.indexOf(firstLine);
              if (idx !== -1) {
                const newMd = md.slice(0, idx) + "[" + firstLine + "](" + url + ")" + md.slice(idx + firstLine.length);
                vditor.setValue(newMd);
          syncInput();
              }
            } else {
              const md = vditor.getValue();
              const idx = md.indexOf(firstLine);
              if (idx !== -1) {
                const newMd = md.slice(0, idx) + "[" + firstLine + "](" + url + ")" + md.slice(idx + firstLine.length);
                vditor.setValue(newMd);
          syncInput();
              }
            }
          }
          return;
        }
        // 单行：走工具栏（弹窗）
        safeClick(name);
        return;
      }

      // 插入图像：弹出文件选择器，选好后通过 handleImageFile 插入
      if (name === "upload") {
        vditor.focus();
        // 直接弹出文件选择器，不预插入 ![]()，由 handleImageFile 统一处理插入
        (async () => {
          const selected = await open({
            multiple: true,
            filters: [{
              name: "图片",
              extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "ico"],
            }],
          });
          if (!selected) return;

          const filePaths = Array.isArray(selected) ? selected : [selected];
          const { readFile } = await import("@tauri-apps/plugin-fs");
          for (const filePath of filePaths) {
            try {
              const data = await readFile(filePath);
              const parts = filePath.replace(/\\/g, "/").split("/");
              const fullName = parts[parts.length - 1];
              const ext = fullName.split(".").pop() || "png";
              const mimeMap: Record<string, string> = {
                jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
                gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
                svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
              };
              const mime = mimeMap[ext] || "image/png";
              const blob = new Blob([data], { type: mime });
              const file = new File([blob], fullName, { type: mime });
              await handleImageFileRef.current?.(file);
            } catch (e) {
              console.error("[Image] 文件读取失败:", e);
            }
          }
        })();
        return;
      }

      safeClick(name);

      if (name === "cut") {
        document.execCommand("cut");
      } else if (name === "copy") {
        document.execCommand("copy");
      } else if (name === "paste") {
        document.execCommand("paste");
      } else if (name === "delete") {
        document.execCommand("delete");
      } else if (name === "footnotes") {
        if (!safeClick("footnotes")) {
          vditor.focus();
          const md = vditor.getValue();
          const newMd = md + "\n\n[^1]: ";
          vditor.setValue(newMd);
          syncInput();
        }
      } else if (name === "math") {
        if (!safeClick("math")) {
          vditor.focus();
          const md = vditor.getValue();
          const newMd = md + "\n\n$$\n\n$$";
          vditor.setValue(newMd);
          syncInput();
          // 将光标移到两个 $$ 之间
          const svEl = internalVditor?.sv?.element as HTMLElement;
          if (svEl) {
            const sel = window.getSelection();
            const textContent = svEl.textContent || "";
            const target = textContent.indexOf("\n\n") + 4;
            const walker = document.createTreeWalker(svEl, NodeFilter.SHOW_TEXT);
            let n = walker.nextNode();
            let acc = 0;
            while (n) {
              const len = (n.textContent || "").length;
              if (acc + len >= target) {
                const r = document.createRange();
                r.setStart(n, target - acc);
                r.collapse(true);
                sel?.removeAllRanges();
                sel?.addRange(r);
                break;
              }
              acc += len;
              n = walker.nextNode();
            }
          }
        }
      }
    }, []);

    const handleMenuItemClick = useCallback((e: React.MouseEvent, name: string) => {
      e.stopPropagation();
      executeCommand(name);
      setContextMenuPos(null);
    }, [executeCommand]);

    return (
      <div className="vditor-editor-wrapper">
        {status === "error" && (
          <div className="vditor-editor-error">
            <p>❌ 编辑器加载失败: {errorMsg}</p>
            <p>请检查控制台获取更多信息</p>
          </div>
        )}
        {status === "loading" && (
          <div className="vditor-editor-loading">
            <p>⏳ 编辑器加载中...</p>
          </div>
        )}
        <div
          ref={elRef}
          className={`vditor-editor-container${isDragOver ? " drag-over" : ""}`}
          style={{ display: status === "error" ? "none" : undefined }}
          onContextMenu={handleContextMenu}
        />

        {contextMenuPos && (
          <ContextMenu
            ref={menuRef}
            items={CONTEXT_MENU_ITEMS(hasSelection, hasClipboard)}
            onClick={handleMenuItemClick}
            onClose={() => setContextMenuPos(null)}
            position={contextMenuPos}
          />
        )}
      </div>
    );
  },
);

export default VditorEditor;
