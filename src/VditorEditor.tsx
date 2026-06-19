import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useCallback, useLayoutEffect } from "react";
import Vditor from "vditor";
import "./VditorEditor.css";

type EditorMode = "wysiwyg" | "sv";

interface VditorEditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: EditorMode;
  theme: "catppuccin-mocha" | "white" | "mint" | "mint-dark";
}

export interface VditorEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  resize: () => void;
}

export const MODE_LABELS: Record<EditorMode, string> = {
  wysiwyg: "</>",
  sv: "</> 退出源码",
};

export type { EditorMode };

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface SubMenuItem {
  name: string;
  label: string;
  shortcut?: string;
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
}

const CUSTOM_ICONS: Record<string, string> = {
  cut: "M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z",
  paste: "M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z",
  delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  quote: "M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z",
};

const HEADING_SUBMENU: SubMenuItem[] = [
  { name: "heading-1", label: "一级标题", shortcut: "Ctrl+1" },
  { name: "heading-2", label: "二级标题", shortcut: "Ctrl+2" },
  { name: "heading-3", label: "三级标题", shortcut: "Ctrl+3" },
  { name: "heading-4", label: "四级标题", shortcut: "Ctrl+4" },
  { name: "heading-5", label: "五级标题", shortcut: "Ctrl+5" },
  { name: "heading-6", label: "六级标题", shortcut: "Ctrl+6" },
  { name: "paragraph", label: "段落", shortcut: "Ctrl+0" },
];

const INSERT_SUBMENU: SubMenuItem[] = [
  { name: "upload", label: "图像" },
  { name: "footnotes", label: "脚注" },
  { name: "link-ref", label: "链接引用" },
  { name: "line", label: "水平分割线" },
  { name: "table", label: "表格" },
  { name: "code", label: "代码块" },
  { name: "math", label: "公式块" },
  { name: "toc", label: "内容目录" },
];

const CONTEXT_MENU_ITEMS = (hasSelection: boolean, hasClipboard: boolean): ContextMenuItem[] => [
  { name: "undo", label: "", icon: "#vditor-icon-undo", rowType: "icons" },
  { name: "redo", label: "", icon: "#vditor-icon-redo", rowType: "icons" },
  { divider: true },
  { name: "cut", label: "", icon: "#vditor-icon-cut", disabled: !hasSelection, rowType: "icons" },
  { name: "copy", label: "", icon: "#vditor-icon-copy", disabled: !hasSelection, rowType: "icons" },
  { name: "paste", label: "", icon: "#vditor-icon-paste", disabled: !hasClipboard, rowType: "icons" },
  { name: "delete", label: "", icon: "#vditor-icon-delete", rowType: "icons" },
  { divider: true },
  { divider: true },
  { name: "bold", label: "", icon: "#vditor-icon-bold", rowType: "icons" },
  { name: "italic", label: "", icon: "#vditor-icon-italic", rowType: "icons" },
  { name: "inline-code", label: "", icon: "#vditor-icon-inline-code", rowType: "icons" },
  { name: "link", label: "", icon: "#vditor-icon-link", rowType: "icons" },
  { divider: true },
  { name: "quote", label: "", icon: "#vditor-icon-quote", rowType: "icons" },
  { name: "ordered-list", label: "", icon: "#vditor-icon-ordered-list", rowType: "icons" },
  { name: "list", label: "", icon: "#vditor-icon-list", rowType: "icons" },
  { name: "check", label: "", icon: "#vditor-icon-check", rowType: "icons" },
  { divider: true },
  { name: "paragraph", label: "段落", icon: "#vditor-icon-paragraph", submenu: HEADING_SUBMENU, rowType: "text" },
  { divider: true },
  { name: "insert", label: "插入", icon: "#vditor-icon-upload", submenu: INSERT_SUBMENU, rowType: "text" },
];

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

  const menuGroups: (ContextMenuItem | { type: "divider" })[][] = [];
  let currentGroup: (ContextMenuItem | { type: "divider" })[] = [];
  items.forEach((item) => {
    if (item.divider) {
      if (currentGroup.length > 0) {
        menuGroups.push(currentGroup);
        currentGroup = [];
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

  const renderMenuItem = (menuItem: ContextMenuItem) => {
    if (menuItem.submenu) {
      return (
        <div key={menuItem.name} className="context-menu-submenu-wrapper">
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
            <span className="context-menu-arrow">›</span>
          </button>
          <div className="context-menu-submenu">
            {menuItem.submenu.map((sub) => (
              <button
                key={sub.name}
                className="context-menu-subitem"
                onClick={(e) => onClick(e, sub.name)}
              >
                <span>{sub.label}</span>
                {sub.shortcut && <span className="context-menu-shortcut">{sub.shortcut}</span>}
              </button>
            ))}
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
      {menuGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="context-menu-row">
          {group.map((item) => renderMenuItem(item as ContextMenuItem))}
        </div>
      ))}
    </div>
  );
});

const VditorEditor = forwardRef<VditorEditorHandle, VditorEditorProps>(
  ({ value, onChange, mode, theme }, ref) => {
    const elRef = useRef<HTMLDivElement>(null);
    const vditorRef = useRef<Vditor | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const onChangeRef = useRef(onChange);
    const isInternalRef = useRef(false);
    const mountedRef = useRef(true);
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

    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      getValue: () => vditorRef.current?.getValue() ?? "",
      setValue: (val: string) => {
        if (vditorRef.current) {
          isInternalRef.current = true;
          vditorRef.current.setValue(val, true);
        }
      },
      resize: () => {
        // 触发窗口 resize 事件让 Vditor 内部重新计算布局
        window.dispatchEvent(new Event("resize"));
      },
    }));

    // 初始化 Vditor（mode 变化时重建）
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

      try {
        const vditor = new Vditor(el, {
          mode,
          value,
          cdn: "/vditor",
          icon: "ant",
          lang: "zh_CN",
          placeholder: "开始输入 Markdown... ✍️",
          theme: theme === "white" || theme === "mint" ? "classic" : "dark",
          height: "100%",
          width: "100%",
          outline: { enable: false, position: "left" },
          counter: { enable: false },
          resize: { enable: false },
          cache: { enable: false },
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
            onChangeRef.current(val);
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
            maxWidth: 800,
            hljs: {
              style: theme === "white" || theme === "mint" ? "atom-one-light" : "atom-one-dark",
              enable: true,
            },
            markdown: {
              codeBlockPreview: true,
              mathBlockPreview: true,
              footnotes: true,
              gfmAutoLink: true,
            },
          },
        });

        vditorRef.current = vditor;

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
          try { vditorRef.current.destroy(); } catch {}
          vditorRef.current = null;
        }
      };
    }, [mode, theme]);

    // 外部 value 同步
    useEffect(() => {
      const vditor = vditorRef.current;
      if (!vditor || status !== "ready") return;
      const cur = vditor.getValue();
      if (value !== cur) {
        isInternalRef.current = true;
        vditor.setValue(value, true);
      }
    }, [value, status]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      checkSelection();
      checkClipboard();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    }, [checkSelection, checkClipboard]);

    const executeCommand = useCallback((name: string) => {
      const vditor = vditorRef.current;
      if (!vditor) return;

      const internalVditor = (vditor as any).vditor;
      if (!internalVditor?.toolbar?.element) return;

      const button = internalVditor.toolbar.element.querySelector(`[data-type="${name}"]`);
      if (button) {
        button.click();
        return;
      }

      if (name === "cut") {
        document.execCommand("cut");
      } else if (name === "copy") {
        document.execCommand("copy");
      } else if (name === "paste") {
        document.execCommand("paste");
      } else if (name === "delete") {
        document.execCommand("delete");
      } else if (name === "heading-1") {
        internalVditor.toolbar.element.querySelector('[data-type="headings"]')?.click();
      } else if (name === "heading-2") {
        internalVditor.toolbar.element.querySelector('[data-type="headings"]')?.click();
      } else if (name === "heading-3") {
        internalVditor.toolbar.element.querySelector('[data-type="headings"]')?.click();
      } else if (name === "heading-4") {
        internalVditor.toolbar.element.querySelector('[data-type="headings"]')?.click();
      } else if (name === "heading-5") {
        internalVditor.toolbar.element.querySelector('[data-type="headings"]')?.click();
      } else if (name === "heading-6") {
        internalVditor.toolbar.element.querySelector('[data-type="headings"]')?.click();
      } else if (name === "paragraph") {
        internalVditor.toolbar.element.querySelector('[data-type="headings"]')?.click();
      } else if (name === "footnotes") {
        internalVditor.toolbar.element.querySelector('[data-type="footnotes"]')?.click();
      } else if (name === "link-ref") {
        internalVditor.toolbar.element.querySelector('[data-type="link"]')?.click();
      } else if (name === "math") {
        internalVditor.toolbar.element.querySelector('[data-type="math"]')?.click();
      } else if (name === "toc") {
        internalVditor.toolbar.element.querySelector('[data-type="toc"]')?.click();
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
          className="vditor-editor-container"
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
