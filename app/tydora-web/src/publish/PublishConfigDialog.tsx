// src/publish/PublishConfigDialog.tsx
// 发布配置弹窗：仓库缺少 markdown-publish.config.json 时，引导用户先完成配置

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  loadPublishConfig,
  savePublishConfig,
  getDefaultConfig,
  type PublishConfig,
} from "./PublishService";
import PublishConfigFields from "./PublishConfigFields";
import "../Settings.css";
import "./PublishConfigDialog.css";

interface PublishConfigDialogProps {
  vaultPath: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function PublishConfigDialog({ vaultPath, onClose, onSaved }: PublishConfigDialogProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<PublishConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (vaultPath) {
      loadPublishConfig(vaultPath).then(setConfig);
    }
  }, [vaultPath]);

  const handleChange = useCallback((key: keyof PublishConfig, value: string) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaveFailed(false);
  }, []);

  const handleReset = useCallback(() => {
    if (!vaultPath) return;
    setConfig(getDefaultConfig(vaultPath));
    setSaveFailed(false);
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

  const handleSave = useCallback(async () => {
    if (!vaultPath || !config) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await savePublishConfig(vaultPath, config);
      onSaved?.();
    } catch (e) {
      console.error(t("settings.publish.saveFailed"), e);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [vaultPath, config, onSaved]);

  return (
    <div className="publish-config-overlay" onClick={onClose}>
      <div className="publish-config-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="publish-config-header">
          <div>
            <span className="publish-config-title">{t("publish.configTitle")}</span>
            <span className="publish-config-desc">{t("publish.configMissingHint")}</span>
          </div>
          <button className="publish-config-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="publish-config-body">
          {!vaultPath ? (
            <div className="canvas-settings-card">
              <div className="canvas-settings-row">
                <div className="canvas-settings-row-label">
                  <span className="canvas-settings-row-desc">{t("publish.openVaultFirst")}</span>
                </div>
              </div>
            </div>
          ) : !config ? (
            <div className="canvas-settings-card">
              <div className="canvas-settings-row">
                <div className="canvas-settings-row-label">
                  <span className="canvas-settings-row-desc">{t("settings.publish.loading")}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <PublishConfigFields config={config} onChange={handleChange} onBrowseOutput={handleBrowseOutput} />

              {/* 操作按钮 */}
              <div className="canvas-settings-card">
                <div className="canvas-settings-row canvas-settings-row-actions">
                  <button className="settings-button" onClick={handleReset}>
                    {t("settings.publish.resetToDefault")}
                  </button>
                  <div style={{ flex: 1 }} />
                  {saveFailed && (
                    <span className="settings-hint publish-config-error">
                      {t("settings.publish.saveFailed")}
                    </span>
                  )}
                  <button className="settings-button primary" onClick={handleSave} disabled={saving}>
                    {saving ? t("settings.publish.saving") : t("publish.saveAndPublish")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
