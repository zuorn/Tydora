import ReactDOM from "react-dom/client";
import App from "./App";
import Settings from "./Settings";
import MindmapWindow from "./MindmapWindow";
import { ThemeProvider } from "./themes";
import "vditor/dist/index.css";
import "./themes.css";

const urlParams = new URLSearchParams(window.location.search);
const isSettingsWindow = urlParams.get("window") === "settings";
const isMindmapWindow = urlParams.get("window") === "mindmap";
const initialFilePath = urlParams.get("window") === "editor"
  ? urlParams.get("file")?.replace(/\//g, "\\")
  : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    {isSettingsWindow ? <Settings /> : isMindmapWindow ? <MindmapWindow /> : <App initialFilePath={initialFilePath} />}
  </ThemeProvider>,
);
