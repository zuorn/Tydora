import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { bootStart, bootEnd, bootStamp, bootSummary, connectRustBootTiming } from "./boot-timing";

// —— 最早的 JS 执行时间点（文件解析即执行，无需等待 import 完成）
bootStart("main_entry_to_root_rendered");
bootStamp("js_main_entry");

import { ThemeProvider } from "./themes";
import { LanguageProvider } from "./i18n/LanguageContext";
import { VimProvider } from "./vim";
import "./i18n"; // init i18next before first render
bootStamp("i18n_imported_init_done");

import "./themes.css";
import "./global.css";
import { applyMenuDensityFromStorage } from "./utils/menuDensity";
import { applyFontSettingsFromStorage } from "./utils/systemFonts";
import { initGlobalTooltip } from "./utils/globalTooltip";

// 尽早应用菜单密度 / 字体，保证各独立窗口（设置/白板/图谱等）启动即生效
applyMenuDensityFromStorage();
applyFontSettingsFromStorage();
initGlobalTooltip();
window.addEventListener("storage", (e) => {
  if (e.key === "zmd-general-settings") {
    applyMenuDensityFromStorage();
    applyFontSettingsFromStorage();
  }
});

// 滚动条自动隐藏：滚动时立即显示，停止滚动 400ms 后淡出（所有窗口共用）
{
  let timer: ReturnType<typeof setTimeout>;
  let currentTarget: HTMLElement | null = null;
  const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLElement)) return;
    if (currentTarget && currentTarget !== target) {
      currentTarget.removeAttribute("data-scrolling");
    }
    currentTarget = target;
    target.setAttribute("data-scrolling", "");
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (currentTarget) {
        currentTarget.removeAttribute("data-scrolling");
        currentTarget = null;
      }
    }, 400);
  };
  document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
}

// 平台 class：驱动各端窗口圆角策略（见 global.css）
if (typeof navigator !== "undefined") {
  const ua = navigator.userAgent;
  const platform = navigator.platform || "";
  if (/Mac|iPhone|iPod|iPad/i.test(platform) || ua.includes("Mac OS")) {
    document.documentElement.classList.add("platform-macos");
  } else if (/Win/i.test(platform) || ua.includes("Windows")) {
    document.documentElement.classList.add("platform-windows");
  } else {
    document.documentElement.classList.add("platform-linux");
  }
}

// 开始接收 Rust boot-timing 事件（异步：不阻塞当前模块解析）
connectRustBootTiming();
bootStamp("rust_boot_listener_registered");

// 按窗口代码分割：每个窗口只加载自身及其依赖的 chunk，
// 避免启动/打开窗口时解析全部窗口的代码（显著降低首屏与窗口打开耗时）
bootStart("main_window_lazy_chunks_resolve");
const App = lazy(() =>
  import("./App").then((m) => {
    bootStamp("App_chunk_resolved");
    return m;
  })
);
const Settings = lazy(() => import("./Settings"));
const VaultManagerWindow = lazy(() => import("./VaultManager/VaultManagerWindow"));
const MindmapWindow = lazy(() => import("./mindmap").then((m) => ({ default: m.MindmapWindow })));
const GraphWindow = lazy(() => import("./graph").then((m) => ({ default: m.GraphWindow })));
const CanvasWindow = lazy(() => import("./Canvas/CanvasWindow"));

// 屏蔽 ResizeObserver 循环警告（调整窗口/侧栏宽度时的良性警告）
// Chromium 的 ResizeObserver 错误走 window.onerror 和 console.error 两条路径
const RESIZE_OBSERVER_MSG = "ResizeObserver loop completed with undelivered notifications";
const prevOnError = window.onerror;
window.onerror = function (message, source, lineno, colno, error) {
  if (typeof message === "string" && message.includes(RESIZE_OBSERVER_MSG)) return true;
  if (prevOnError) return prevOnError.call(window, message, source, lineno, colno, error);
  return false;
};
const _origConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
  const msg = args[0];
  const text = msg instanceof Error ? msg.message : String(msg ?? "");
  if (text.includes(RESIZE_OBSERVER_MSG)) return;
  _origConsoleError(...args);
};

// 屏蔽 React DevTools 下载提示（Tauri 桌面应用无法使用浏览器扩展）
if (import.meta.env.DEV) {
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    if (typeof args[0] === "string" && args[0].includes("React DevTools")) return;
    originalLog(...args);
  };
}

function Root() {
  bootStamp("root_component_entered");
  const urlParams = new URLSearchParams(window.location.search);
  const isSettingsWindow = urlParams.get("window") === "settings";
  const isVaultManagerWindow = urlParams.get("window") === "vault-manager";
  const isMindmapWindow = urlParams.get("window") === "mindmap";
  const isGraphWindow = urlParams.get("window") === "graph";
  const isCanvasWindow = urlParams.get("window") === "canvas";
  const initialFilePath = urlParams.get("window") === "editor"
    ? urlParams.get("file")?.replace(/\//g, "\\")
    : null;
  const initialVaultPath = urlParams.get("window") === "editor"
    ? urlParams.get("vault")?.replace(/\//g, "\\")
    : null;

  if (isSettingsWindow) {
    bootEnd("main_window_lazy_chunks_resolve");
    return <Settings />;
  }
  if (isVaultManagerWindow) {
    bootEnd("main_window_lazy_chunks_resolve");
    return <VaultManagerWindow />;
  }
  if (isMindmapWindow) {
    bootEnd("main_window_lazy_chunks_resolve");
    return <MindmapWindow />;
  }
  if (isGraphWindow) {
    bootEnd("main_window_lazy_chunks_resolve");
    return <GraphWindow />;
  }
  if (isCanvasWindow) {
    bootEnd("main_window_lazy_chunks_resolve");
    return <CanvasWindow />;
  }
  return (
    <VimProvider>
      <App initialFilePath={initialFilePath} initialVaultPath={initialVaultPath} />
    </VimProvider>
  );
}

bootStart("react_commit_root");
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    <LanguageProvider>
      <Suspense fallback={null}>
        <Root />
      </Suspense>
    </LanguageProvider>
  </ThemeProvider>,
);

// 首帧完成后，在"下一个 rAF + 下一个 macrotask"确认"用户可见第一帧"确实发生（commit→paint）
requestAnimationFrame(() => {
  setTimeout(() => {
    bootStamp("first_paint_likely");
    bootEnd("react_commit_root");
    bootEnd("main_entry_to_root_rendered");
    bootEnd("main_window_lazy_chunks_resolve");
    // 首阶段时间点先打印一轮，后续 App 内部的埋点会继续追加到 stamps
    bootSummary();
  }, 0);
});
