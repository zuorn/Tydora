import ReactDOM from "react-dom/client";
import App from "./App";
import Settings from "./Settings";
import { ThemeProvider } from "./themes";
import "vditor/dist/index.css";
import "./themes.css";

// 检查是否为设置窗口
const isSettingsWindow = window.location.search.includes("window=settings");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    {isSettingsWindow ? <Settings /> : <App />}
  </ThemeProvider>,
);
