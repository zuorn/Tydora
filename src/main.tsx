import ReactDOM from "react-dom/client";
import App from "./App";
import Settings from "./Settings";
import { ThemeProvider } from "./themes";
import "vditor/dist/index.css";
import "./themes.css";

const urlParams = new URLSearchParams(window.location.search);
const isSettingsWindow = urlParams.get("window") === "settings";
const initialFilePath = urlParams.get("window") === "editor"
  ? urlParams.get("file")?.replace(/\//g, "\\")
  : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    {isSettingsWindow ? <Settings /> : <App initialFilePath={initialFilePath} />}
  </ThemeProvider>,
);
