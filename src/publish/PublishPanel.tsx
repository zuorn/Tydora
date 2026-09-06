// src/PublishPanel.tsx

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  publishVault,
  loadPublishConfig,
} from "./PublishService";
import "./PublishPanel.css";

const INSTALL_CMD = "npm install -g @abstractwebunit/markdown-publish";

interface PublishPanelProps {
  vaultPath: string | null;
  onClose: () => void;
  onDone?: () => void;
}

export default function PublishPanel({ vaultPath, onClose, onDone }: PublishPanelProps) {
  const { t } = useTranslation();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const handlePublish = useCallback(async () => {
    if (!vaultPath) return;

    setPublishing(true);
    setError(null);
    setDone(false);
    setPreviewing(false);

    try {
      const config = await loadPublishConfig(vaultPath);
      await publishVault(vaultPath, config);
      setDone(true);
      const outDir = /^[A-Za-z]:/.test(config.out) || config.out.startsWith("/")
        ? config.out
        : `${vaultPath}/${config.out}`;
      setOutputPath(outDir);
      onDone?.();
    } catch (e: any) {
      const msg = e?.message || String(e) || t("publish.failed");
      setError(msg);
      console.error(t("publish.failedLog"), e);
    } finally {
      setPublishing(false);
    }
  }, [vaultPath]);

  const missingCli = error != null && error.includes("markdown-publish CLI");

  const copyInstallCmd = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
    } catch {
      /* 忽略剪贴板失败 */
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (!outputPath) return;
    try {
      await invoke("preview_site", { dir: outputPath });
      setPreviewing(true);
    } catch (e) {
      console.error(t("publish.previewFailed"), e);
    }
  }, [outputPath]);

  const handleStopPreview = useCallback(async () => {
    try {
      await invoke("stop_preview");
      setPreviewing(false);
    } catch (e) {
      console.error(t("publish.stopPreviewFailed"), e);
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (!outputPath) return;
    try {
      await invoke("open_directory", { dirPath: outputPath });
    } catch (e) {
      console.error(t("publish.openFolderFailed"), e);
    }
  }, [outputPath]);

  if (!vaultPath) {
    return (
      <div className="publish-panel-overlay" onClick={onClose}>
        <div className="publish-panel" onClick={(e) => e.stopPropagation()}>
          <div className="publish-panel-header">
            <h2>{t("publish.title")}</h2>
            <button className="publish-panel-close" onClick={onClose}>×</button>
          </div>
          <div className="publish-panel-body">
            <p className="publish-hint">{t("publish.openVaultFirst")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="publish-panel-overlay" onClick={onClose}>
      <div className="publish-panel" onClick={(e) => e.stopPropagation()}>
        <div className="publish-panel-header">
          <h2>{t("publish.title")}</h2>
          <button className="publish-panel-close" onClick={onClose}>×</button>
        </div>
        <div className="publish-panel-body">
          {missingCli && (
            <div className="publish-cli-missing">
              <div className="publish-cli-missing-title">{t("publish.cliMissingTitle")}</div>
              <p className="publish-cli-missing-desc">{t("publish.cliMissingDesc")}</p>
              <div className="publish-cli-install-cmd">
                <code>{INSTALL_CMD}</code>
                <button className="publish-cli-copy-btn" onClick={copyInstallCmd}>
                  {t("publish.copyInstallCmd")}
                </button>
              </div>
              <p className="publish-cli-missing-hint">{t("publish.cliMissingHint")}</p>
            </div>
          )}
          {error && !missingCli && (
            <div className="publish-error">
              <span className="publish-error-icon">⚠</span>
              {error}
            </div>
          )}

          {done && (
            <div className="publish-success">
              <span className="publish-success-icon">✓</span>
              {t("publish.done")}
              <div className="publish-success-actions">
                {previewing ? (
                  <button className="publish-button" onClick={handleStopPreview}>
                    {t("publish.stopPreview")}
                  </button>
                ) : (
                  <button className="publish-button" onClick={handlePreview}>
                    {t("publish.previewSite")}
                  </button>
                )}
                <button className="publish-button" onClick={handleOpenFolder}>
                  {t("publish.openOutputDir")}
                </button>
              </div>
            </div>
          )}

          {publishing && (
            <div className="publish-progress">
              <div className="publish-progress-info">
                <span className="publish-phase">{t("publish.building")}</span>
              </div>
              <div className="publish-progress-bar">
                <div className="publish-progress-fill indeterminate" />
              </div>
              <div className="publish-current-file">{t("publish.buildingDesc")}</div>
            </div>
          )}

          {!publishing && !done && (
            <div className="publish-actions">
              <p className="publish-description">
                {t("publish.description1")}<br/>
                {t("publish.description2")}
              </p>
              <button className="publish-button primary" onClick={handlePublish}>
                {t("publish.startPublish")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
