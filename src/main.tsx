import ReactDOM from "react-dom/client";
import App from "./App";
import Settings from "./Settings";
import VaultManagerWindow from "./VaultManager/VaultManagerWindow";
import { MindmapWindow } from "./mindmap";
import { GraphWindow } from "./graph";
import CanvasWindow from "./Canvas/CanvasWindow";
import { ThemeProvider } from "./themes";
import "./themes.css";

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    {isSettingsWindow ? <Settings /> : isVaultManagerWindow ? <VaultManagerWindow /> : isMindmapWindow ? <MindmapWindow /> : isGraphWindow ? <GraphWindow /> : isCanvasWindow ? <CanvasWindow /> : <App initialFilePath={initialFilePath} initialVaultPath={initialVaultPath} />}
  </ThemeProvider>,
);
