// src/PublishSettings.tsx

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
import PublishConfigFields from "./PublishConfigFields";
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
  const { t } = useTranslation();
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
      console.error(t("settings.publish.saveFailed"), e);
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
        console.error(t("publish.stopPreviewFailed"), e);
      }
    } else {
      // 启动预览
      try {
        await invoke("preview_site", { dir: outDir });
        setPreviewRunning(true);
      } catch (e) {
        console.error(t("publish.previewFailed"), e);
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
      title: t("settings.publish.selectOutputDir"),
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
              <span className="canvas-settings-row-desc">{t("settings.publish.noVault")}</span>
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
              <span className="canvas-settings-row-desc">{t("settings.publish.loading")}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-settings-page">
      {/* 站点信息 + 构建选项 */}
      <PublishConfigFields config={config} onChange={handleChange} onBrowseOutput={handleBrowseOutput} />

      {/* 操作按钮 */}
      <div className="canvas-settings-card">
        <div className="canvas-settings-row canvas-settings-row-actions">
          <button className="settings-button" onClick={handleReset}>
            {t("settings.publish.resetToDefault")}
          </button>
          <button className="settings-button" onClick={handlePreview} disabled={!siteGenerated}>
            {previewRunning ? t("settings.publish.stopPreview") : t("settings.publish.previewSite")}
          </button>
          <div style={{ flex: 1 }} />
          <button className="settings-button" onClick={handleSave} disabled={saving}>
            {saving ? t("settings.publish.saving") : saved ? t("settings.publish.saved") : t("settings.publish.saveConfig")}
          </button>
          <button
            className="settings-button primary"
            onClick={() => setPublishOpen(true)}
            disabled={!configExists}
          >
            {t("settings.publish.generateSite")}
          </button>
          {!configExists && (
            <span className="settings-hint" style={{ marginLeft: 8 }}>{t("settings.publish.saveConfigFirst")}</span>
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
