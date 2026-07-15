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
      <div className="canvas-settings-page">
        <div className="canvas-settings-card">
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-desc">请先打开一个仓库</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="canvas-settings-page">
        <div className="canvas-settings-card">
          <div className="canvas-settings-row">
            <div className="canvas-settings-row-label">
              <span className="canvas-settings-row-desc">加载配置中...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-settings-page">
      {/* 站点信息 */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">站点名称</span>
            <span className="canvas-settings-row-desc">你的笔记站点名称。</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.siteName}
            onChange={(e) => handleChange("siteName", e.target.value)}
            placeholder="我的笔记"
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">站点描述</span>
            <span className="canvas-settings-row-desc">简短描述你的站点内容。</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.siteDescription || ""}
            onChange={(e) => handleChange("siteDescription", e.target.value)}
            placeholder="笔记与想法"
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">站点语言</span>
            <span className="canvas-settings-row-desc">站点的默认语言。</span>
          </div>
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
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">站点 URL</span>
            <span className="canvas-settings-row-desc">部署后的站点访问地址。</span>
          </div>
          <input
            className="settings-input"
            type="url"
            value={config.siteUrl || ""}
            onChange={(e) => handleChange("siteUrl", e.target.value)}
            placeholder="https://yourusername.github.io/yourrepo"
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">页脚署名</span>
            <span className="canvas-settings-row-desc">显示在页面底部的文字。</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.siteFooter || ""}
            onChange={(e) => handleChange("siteFooter", e.target.value)}
            placeholder="留空则不显示"
          />
        </div>
      </div>

      {/* 构建选项 */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">笔记目录</span>
            <span className="canvas-settings-row-desc">相对于仓库根目录，默认为根目录 (.)</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.vaultDir}
            onChange={(e) => handleChange("vaultDir", e.target.value)}
            placeholder="."
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">构建模式</span>
            <span className="canvas-settings-row-desc">
              {config.buildMode === "public"
                ? '仅发布 frontmatter 中带 "publish: public" 的笔记'
                : "发布所有笔记"}
            </span>
          </div>
          <div className="canvas-settings-row-control">
            <label className="settings-radio-card">
              <input
                type="radio"
                name="buildMode"
                value="full"
                checked={config.buildMode === "full"}
                onChange={() => handleChange("buildMode", "full")}
              />
              <span>全部发布</span>
            </label>
            <label className="settings-radio-card">
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
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">基础路径</span>
            <span className="canvas-settings-row-desc">GitHub Pages 用 /仓库名/，其他平台通常用 /</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={config.baseHref}
            onChange={(e) => handleChange("baseHref", e.target.value)}
            placeholder="/"
          />
        </div>
        <div className="canvas-settings-row">
          <div className="canvas-settings-row-label">
            <span className="canvas-settings-row-title">输出目录</span>
            <span className="canvas-settings-row-desc">相对于仓库根目录</span>
          </div>
          <div className="canvas-settings-row-control">
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
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row canvas-settings-row-actions">
          <button className="settings-button" onClick={handleReset}>
            重置为默认
          </button>
          <button className="settings-button" onClick={handlePreview} disabled={!siteGenerated}>
            {previewRunning ? "停止预览" : "预览网站"}
          </button>
          <div style={{ flex: 1 }} />
          <button className="settings-button" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : saved ? "已保存 ✓" : "保存配置"}
          </button>
          <button
            className="settings-button primary"
            onClick={() => setPublishOpen(true)}
            disabled={!configExists}
          >
            生成站点
          </button>
          {!configExists && (
            <span className="settings-hint" style={{ marginLeft: 8 }}>请先保存配置</span>
          )}
        </div>
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
