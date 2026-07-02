import ReactDOM from "react-dom/client";
import App from "./App";
import Settings from "./Settings";
import MindmapWindow from "./MindmapWindow";
import GraphWindow from "./GraphWindow";
import { ThemeProvider } from "./themes";
import "./themes.css";

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
const isMindmapWindow = urlParams.get("window") === "mindmap";
const isGraphWindow = urlParams.get("window") === "graph";
const initialFilePath = urlParams.get("window") === "editor"
  ? urlParams.get("file")?.replace(/\//g, "\\")
  : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    {isSettingsWindow ? <Settings /> : isMindmapWindow ? <MindmapWindow /> : isGraphWindow ? <GraphWindow /> : <App initialFilePath={initialFilePath} />}
  </ThemeProvider>,
);
