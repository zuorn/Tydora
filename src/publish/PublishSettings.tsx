// src/PublishSettings.tsx

import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import {
  loadPublishConfig,
  savePublishConfig,
  getDefaultConfig,
  CONFIG_FILE,
  type PublishConfig,
} from "./PublishService";
import PublishPanel from "./PublishPanel";
import "../Settings.css";

interface VaultInfo {
  name: string;
  path: string;
}

function getActiveVaultPath(): string | null {
  try {
    const vaultsRaw = localStorage.getItem("zmd-vaults");
    const activeIndexRaw = localStorage.getItem("zmd-active-vault");
    if (!vaultsRaw || activeIndexRaw === null) return null;
    const vaults: VaultInfo[] = JSON.parse(vaultsRaw);
    const idx = parseInt(activeIndexRaw, 10);
    if (isNaN(idx) || idx < 0 || idx >= vaults.length) return null;
    return vaults[idx].path;
  } catch {
    return null;
  }
}

export default function PublishSettings() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [config, setConfig] = useState<PublishConfig | null>(null);
  const [configExists, setConfigExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [siteGenerated, setSiteGenerated] = useState(false);
  const [previewRunning, setPreviewRunning] = useState(false);

  // 检查输出目录是否存在
  useEffect(() => {
    if (vaultPath && config) {
      const outDir = /^[A-Za-z]:/.test(config.out) || config.out.startsWith("/")
        ? config.out
        : `${vaultPath}/${config.out}`;
      exists(outDir).then(setSiteGenerated);
    }
  }, [vaultPath, config]);

  useEffect(() => {
    const path = getActiveVaultPath();
    setVaultPath(path);
    if (path) {
      loadPublishConfig(path).then(setConfig);
      exists(`${path}/${CONFIG_FILE}`).then(setConfigExists);
    }
  }, []);

  const handleChange = useCallback(
    (key: keyof PublishConfig, value: string) => {
      if (!config) return;
      setConfig({ ...config, [key]: value });
      setSaved(false);
    },
    [config]
  );

  const handleSave = useCallback(async () => {
    if (!vaultPath || !config) return;
    setSaving(true);
    try {
      await savePublishConfig(vaultPath, config);
      setConfigExists(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("保存发布配置失败:", e);
    } finally {
      setSaving(false);
    }
  }, [vaultPath, config]);

  const handlePreview = useCallback(async () => {
    if (!vaultPath || !config) return;
    const outDir = /^[A-Za-z]:/.test(config.out) || config.out.startsWith("/")
      ? config.out
      : `${vaultPath}/${config.out}`;

    if (previewRunning) {
      // 停止预览
      try {
        await invoke("stop_preview");
        setPreviewRunning(false);
      } catch (e) {
        console.error("停止预览失败:", e);
      }
    } else {
      // 启动预览
      try {
        await invoke("preview_site", { dir: outDir });
        setPreviewRunning(true);
      } catch (e) {
        console.error("预览失败:", e);
      }
    }
  }, [vaultPath, config, previewRunning]);

  const handleReset = useCallback(() => {
    if (!vaultPath) return;
    setConfig(getDefaultConfig(vaultPath));
    setSaved(false);
  }, [vaultPath]);

  const handleBrowseOutput = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择输出目录",
    });
    if (selected && vaultPath) {
      const relative = selected.startsWith(vaultPath)
        ? selected.slice(vaultPath.length).replace(/^[/\\]/, "")
        : selected;
      handleChange("out", relative || "dist");
    }
  }, [vaultPath, handleChange]);

  if (!vaultPath) {
    return (
      <div className="settings-section">
        <p className="settings-hint">请先打开一个仓库</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="settings-section">
        <p className="settings-hint">加载配置中...</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">站点信息</h3>

      <div className="settings-item">
        <label className="settings-item-label">站点名称</label>
        <input
          className="settings-input"
          type="text"
          value={config.siteName}
          onChange={(e) => handleChange("siteName", e.target.value)}
          placeholder="我的笔记"
        />
      </div>

      <div className="settings-item">
        <label className="settings-item-label">站点描述</label>
        <input
          className="settings-input"
          type="text"
          value={config.siteDescription || ""}
          onChange={(e) => handleChange("siteDescription", e.target.value)}
          placeholder="笔记与想法"
        />
      </div>

      <div className="settings-item">
        <label className="settings-item-label">站点语言</label>
        <select
          className="settings-select"
          value={config.siteLang}
          onChange={(e) => handleChange("siteLang", e.target.value)}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
        </select>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">站点 URL</label>
        <input
          className="settings-input"
          type="url"
          value={config.siteUrl || ""}
          onChange={(e) => handleChange("siteUrl", e.target.value)}
          placeholder="https://yourusername.github.io/yourrepo"
        />
      </div>

      <div className="settings-item">
        <label className="settings-item-label">页脚署名</label>
        <input
          className="settings-input"
          type="text"
          value={config.siteFooter || ""}
          onChange={(e) => handleChange("siteFooter", e.target.value)}
          placeholder="留空则不显示"
        />
      </div>

      <h3 className="settings-section-title">构建选项</h3>

      <div className="settings-item-vertical">
        <label className="settings-label">笔记目录</label>
        <input
          className="settings-input"
          type="text"
          value={config.vaultDir}
          onChange={(e) => handleChange("vaultDir", e.target.value)}
          placeholder="."
        />
        <span className="settings-hint">相对于仓库根目录，默认为根目录 (.)</span>
      </div>

      <div className="settings-item-vertical">
        <label className="settings-label">构建模式</label>
        <div className="settings-radio-group">
          <label className="settings-radio">
            <input
              type="radio"
              name="buildMode"
              value="full"
              checked={config.buildMode === "full"}
              onChange={() => handleChange("buildMode", "full")}
            />
            <span>全部发布</span>
          </label>
          <label className="settings-radio">
            <input
              type="radio"
              name="buildMode"
              value="public"
              checked={config.buildMode === "public"}
              onChange={() => handleChange("buildMode", "public")}
            />
            <span>仅公开笔记</span>
          </label>
        </div>
        <span className="settings-hint">
          {config.buildMode === "public"
            ? '仅发布 frontmatter 中带 "publish: public" 的笔记'
            : "发布所有笔记"}
        </span>
      </div>

      <div className="settings-item-vertical">
        <label className="settings-label">基础路径</label>
        <input
          className="settings-input"
          type="text"
          value={config.baseHref}
          onChange={(e) => handleChange("baseHref", e.target.value)}
          placeholder="/"
        />
        <span className="settings-hint">
          GitHub Pages 用 /仓库名/，其他平台通常用 /
        </span>
      </div>

      <div className="settings-item-vertical">
        <label className="settings-label">输出目录</label>
        <div className="settings-input-row">
          <input
            className="settings-input"
            type="text"
            value={config.out}
            onChange={(e) => handleChange("out", e.target.value)}
            placeholder="dist"
          />
          <button className="settings-button" onClick={handleBrowseOutput}>
            浏览
          </button>
        </div>
        <span className="settings-hint">相对于仓库根目录</span>
      </div>

      <div className="settings-actions">
        <button className="settings-button" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : saved ? "已保存 ✓" : "保存配置"}
        </button>
        <button className="settings-button" onClick={handleReset}>
          重置为默认
        </button>
        <div style={{ flex: 1 }} />
        <button
          className={`settings-button${previewRunning ? ' warning' : ''}`}
          onClick={handlePreview}
          disabled={!siteGenerated}
        >
          {previewRunning ? "停止预览" : "预览网站"}
        </button>
        <button
          className="settings-button primary"
          onClick={() => setPublishOpen(true)}
          disabled={!configExists}
        >
          生成
        </button>
        {!configExists && (
          <span className="settings-hint">请先保存配置后再生成</span>
        )}
      </div>

      {publishOpen && vaultPath && (
        <PublishPanel
          vaultPath={vaultPath}
          onClose={() => setPublishOpen(false)}
          onDone={() => setSiteGenerated(true)}
        />
      )}
    </div>
  );
}
