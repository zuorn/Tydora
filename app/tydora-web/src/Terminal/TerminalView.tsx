/**
 * 终端面板组件：在 xterm.js 中渲染一个真实 PTY 会话。
 *
 * 职责仅限"渲染单个终端会话 + 提供本面板的分屏/关闭按钮"；
 * 分屏/关闭的实际布局操作由父级（App）通过 onSplit / onClose 回调执行，
 * 以保持布局树逻辑集中在 App 中。
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import "./Terminal.css";
import {
  spawnTerminal,
  writeTerminal,
  resizeTerminal,
  listenTerminalOutput,
  listenTerminalClosed,
} from "./terminalApi";
import {
  getTerminalSettings,
  setTerminalSettings,
  subscribeTerminalSettings,
  resolveXtermTheme,
  resolveFontFamily,
  TERMINAL_MIN_FONT_SIZE,
  TERMINAL_MAX_FONT_SIZE,
} from "./terminal-settings";
import { createOscTitleParser } from "./oscTitleParser";
import { TerminalContextMenu } from "./TerminalContextMenu";
import { TerminalSearch } from "./TerminalSearch";

export type SplitDirection = "lr" | "tb";

interface TerminalViewProps {
  /** 会话唯一 id（与 Rust 端 TerminalManager 对应）。 */
  sessionId: string;
  /** 工作目录。 */
  cwd: string;
  /** 外观主题，切换时会重建终端以保证配色正确。 */
  theme: string;
  /** 请求在当前面板旁按指定方向分屏一个新的终端。 */
  onSplit: (dir: SplitDirection) => void;
  /** 请求关闭当前终端面板。 */
  onClose: () => void;
  /** 终端字号变化时的回调（用于显示与编辑器一致的字号提示气泡）。 */
  onFontSizeChange?: (size: number) => void;
}

// 配色方案与字体已迁移至 terminal-settings.ts（含预设、跨窗口同步）。
// TerminalView 只消费：构造时读取一次，挂载后通过订阅热更新。

export function TerminalView({
  sessionId,
  cwd,
  theme,
  onSplit,
  onClose,
  onFontSizeChange,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // xterm 实例与 fit 插件持有在 ref 中，便于"字号订阅" effect 在挂载后更新字号而不重建会话。
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // 工具栏"智能标题"：默认显示路径，shell/程序通过 OSC 标题序列覆盖为当前运行命令（如 htop）。
  const [title, setTitle] = useState<string>(cwd || "终端");
  // 右键菜单状态
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // 查找面板状态
  const [showSearch, setShowSearch] = useState(false);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCopy = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    const selection = term.getSelection();
    if (selection) {
      try {
        await navigator.clipboard.writeText(selection);
      } catch {
        // fallback: use legacy execCommand
        const ta = document.createElement("textarea");
        ta.value = selection;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch {}
        document.body.removeChild(ta);
      }
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        await writeTerminal(sessionId, text);
      }
    } catch {
      // clipboard read may fail (permissions); silently ignore
    }
  }, [sessionId]);

  const handleFind = useCallback(() => {
    setShowSearch(true);
    setCtxMenu(null);
  }, []);

  // 生命周期：依赖于会话 id、工作目录、应用明暗主题（仅 auto 配色方案需要）。
  // 注意：配色/字体/字号的热更新由下方的订阅 effect 处理，不触发此处重建，
  // 切换配色方案不会重建会话、不中断正在运行的命令。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialSettings = getTerminalSettings();
    const term = new XTerm({
      fontFamily: resolveFontFamily(initialSettings.fontFamily),
      fontSize: initialSettings.fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: resolveXtermTheme(initialSettings.colorScheme, theme as "light" | "dark"),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    const fitAndReport = () => {
      try {
        fit.fit();
      } catch {
        // 容器尚未布局（不可见）时忽略
      }
      resizeTerminal(sessionId, term.cols, term.rows).catch(() => {});
    };

    // Ctrl + 滚轮：缩放终端字号（与浏览器页面缩放手势一致），并阻止默认页面缩放。
    // 缩放通过全局存储广播，所有已挂载终端同步变化（不局限于当前这一个）。
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const current = getTerminalSettings().fontSize;
      const desired = current + dir;
      if (desired < TERMINAL_MIN_FONT_SIZE || desired > TERMINAL_MAX_FONT_SIZE) return;
      setTerminalSettings({ ...getTerminalSettings(), fontSize: desired }); // 裁剪 + 持久化 + 广播给所有终端
      onFontSizeChange?.(desired); // 显示字号提示气泡（与编辑器一致）
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    // 等一帧确保容器已有尺寸再 fit
    const raf = requestAnimationFrame(fitAndReport);

    let disposed = false;
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenClosed: UnlistenFn | null = null;
    let closeTimer: number | null = null;

    // 即时 OSC 标题解析器：直接从字节流解析标题序列并 setTitle，
    // 绕过 xterm.js 异步分片解析导致的标题滞后（htop 等高频刷新程序"标题慢一拍"）。
    const titleParser = createOscTitleParser((t) => setTitle(t));

    listenTerminalOutput(sessionId, (bytes) => {
      if (disposed) return;
      titleParser.feed(bytes); // 即时更新标题（同步，先于 xterm 解析）
      term.write(bytes);
    })
      .then((fn) => {
        unlistenOutput = fn;
      })
      .catch(() => {});

    // shell 退出（用户输入 exit 等）时，Rust 端 emit terminal-closed。
    // 先显示退出提示，短暂延时后自动关闭面板（onClose -> App 移除 pane -> 卸载时 kill PTY）。
    listenTerminalClosed(sessionId, () => {
      if (disposed) return;
      term.write("\r\n\x1b[90m⏹ 进程已退出 (Process exited)\x1b[0m\r\n");
      closeTimer = window.setTimeout(() => {
        if (!disposed) onClose();
      }, 1000);
    })
      .then((fn) => {
        unlistenClosed = fn;
      })
      .catch(() => {});

    const dataSub = term.onData((data) => {
      writeTerminal(sessionId, data).catch(() => {});
    });

    // 智能标题：shell/程序通过 OSC 0/2 序列设置 xterm 标题时，实时更新工具栏标题。
    // 空标题忽略（保持上一次或默认路径），避免程序清空标题时闪回。
    const titleDisposable = term.onTitleChange((t) => {
      const next = t.trim();
      if (next.length > 0) setTitle(next);
    });

    spawnTerminal(sessionId, cwd).catch((err) => {
      term.write(`\x1b[31m终端启动失败: ${String(err)}\x1b[0m\r\n`);
    });

    const ro = new ResizeObserver(fitAndReport);
    ro.observe(container);

    return () => {
      disposed = true;
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("wheel", onWheel);
      dataSub.dispose();
      titleDisposable.dispose();
      unlistenOutput?.();
      unlistenClosed?.();
      // 注意：不在此 kill 会话。分屏等布局变化会卸载并重挂当前 TerminalView，
      // 此时进程与屏幕缓冲按 sessionId 保留在前端（见 terminalApi），
      // 重挂后回放缓冲即可恢复屏幕、命令不中断。
      // 真正销毁由 App 在关闭窗格（closePane）时调用 killTerminal + unregisterTerminal。
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      if (container) container.innerHTML = "";
    };
  }, [sessionId, cwd, theme]);

  // 订阅终端设置变化：设置窗口或 Ctrl+滚轮修改配色/字体/字号后，本终端实时热更新，
  // 不重建会话、不中断正在运行的命令。
  useEffect(() => {
    return subscribeTerminalSettings((s) => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term) return;
      let needFit = false;
      // 字号
      if (term.options.fontSize !== s.fontSize) {
        term.options.fontSize = s.fontSize;
        needFit = true;
      }
      // 字体族（字形变化需重新 fit）
      const ff = resolveFontFamily(s.fontFamily);
      if (term.options.fontFamily !== ff) {
        term.options.fontFamily = ff;
        needFit = true;
      }
      // 配色方案（纯颜色变更，无需 fit）
      term.options.theme = resolveXtermTheme(s.colorScheme, theme as "light" | "dark");
      if (needFit) {
        try {
          fit?.fit();
        } catch {
          // 容器尚未布局（不可见）时忽略
        }
        resizeTerminal(sessionId, term.cols, term.rows).catch(() => {});
      }
    });
  }, [sessionId, theme]);

  return (
    <div className={`terminal-pane terminal-theme-${theme}`}>
      <div className="terminal-toolbar">
        <span className="terminal-title" title={cwd}>
          {title}
        </span>
        <div className="terminal-toolbar-actions">
          <button
            className="terminal-tool-btn"
            title="左右分屏"
            aria-label="左右分屏"
            onClick={() => onSplit("lr")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>
          <button
            className="terminal-tool-btn"
            title="上下分屏"
            aria-label="上下分屏"
            onClick={() => onSplit("tb")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="12" x2="20" y2="12" />
            </svg>
          </button>
          <button
            className="terminal-tool-btn terminal-tool-close"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className="terminal-body"
        ref={containerRef}
        onContextMenu={handleContextMenu}
        onMouseUp={() => {
          if (ctxMenu) setCtxMenu(null);
        }}
      />
      {showSearch && termRef.current && (
        <TerminalSearch
          terminal={termRef.current}
          onClose={() => setShowSearch(false)}
        />
      )}
      {ctxMenu && termRef.current && (
        <TerminalContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          hasSelection={termRef.current.hasSelection()}
          onClose={() => setCtxMenu(null)}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onFind={handleFind}
          onSplit={(dir) => onSplit(dir)}
          onClosePane={onClose}
        />
      )}
    </div>
  );
}
