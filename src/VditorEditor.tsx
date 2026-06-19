import { useRef, useEffect, forwardRef, useImperativeHandle, useState } from "react";
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

const VditorEditor = forwardRef<VditorEditorHandle, VditorEditorProps>(
  ({ value, onChange, mode, theme }, ref) => {
    const elRef = useRef<HTMLDivElement>(null);
    const vditorRef = useRef<Vditor | null>(null);
    const onChangeRef = useRef(onChange);
    const isInternalRef = useRef(false);
    const mountedRef = useRef(true); // 防止在卸载后设置状态
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState("");

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
          toolbar: [],
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
        />
      </div>
    );
  },
);

export default VditorEditor;
