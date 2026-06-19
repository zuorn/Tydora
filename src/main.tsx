import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./themes";
import "vditor/dist/index.css";
import "./themes.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
