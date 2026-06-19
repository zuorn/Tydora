import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "./themes";
import "./Settings.css";

function Settings() {
  const [fontSize, setFontSize] = useState(14);
  const [lineHeight, setLineHeight] = useState(1.6);
  const { theme, setTheme } = useTheme();

  const handleClose = () => {
    getCurrentWindow().close();
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h2>设置</h2>
        <button className="settings-close" onClick={handleClose}>
          ✕
        </button>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h3>编辑器</h3>
          <div className="settings-item">
            <label>字体大小</label>
            <input
              type="range"
              min="10"
              max="24"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
            <span>{fontSize}px</span>
          </div>
          <div className="settings-item">
            <label>行高</label>
            <input
              type="range"
              min="1.2"
              max="2.2"
              step="0.1"
              value={lineHeight}
              onChange={(e) => setLineHeight(Number(e.target.value))}
            />
            <span>{lineHeight}</span>
          </div>
        </div>

        <div className="settings-section">
          <h3>外观</h3>
          <div className="settings-item">
            <label>主题</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
            >
              <option value="catppuccin-mocha">Catppuccin Mocha</option>
              <option value="white">白色</option>
              <option value="mint">Mint</option>
              <option value="mint-dark">Mint Dark</option>
            </select>
          </div>
        </div>

        <div className="settings-section">
          <h3>关于</h3>
          <div className="settings-item">
            <span className="about-text">zmd v0.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
