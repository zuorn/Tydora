// src/PublishPanel.tsx

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  publishVault,
  loadPublishConfig,
} from "./PublishService";
import "./PublishPanel.css";

interface PublishPanelProps {
  vaultPath: string | null;
  onClose: () => void;
  onDone?: () => void;
}

export default function PublishPanel({ vaultPath, onClose, onDone }: PublishPanelProps) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const handlePublish = useCallback(async () => {
    if (!vaultPath) return;

    setPublishing(true);
    setError(null);
    setDone(false);

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
      const msg = e?.message || String(e) || "发布失败";
      setError(msg);
      console.error("发布失败:", e);
    } finally {
      setPublishing(false);
    }
  }, [vaultPath]);

  const handlePreview = useCallback(async () => {
    if (!outputPath) return;
    try {
      await invoke("preview_site", { dir: outputPath });
    } catch (e) {
      console.error("预览失败:", e);
    }
  }, [outputPath]);

  const handleOpenFolder = useCallback(async () => {
    if (!outputPath) return;
    try {
      await invoke("open_directory", { dirPath: outputPath });
    } catch (e) {
      console.error("打开文件夹失败:", e);
    }
  }, [outputPath]);

  if (!vaultPath) {
    return (
      <div className="publish-panel-overlay" onClick={onClose}>
        <div className="publish-panel" onClick={(e) => e.stopPropagation()}>
          <div className="publish-panel-header">
            <h2>发布为网站</h2>
            <button className="publish-panel-close" onClick={onClose}>×</button>
          </div>
          <div className="publish-panel-body">
            <p className="publish-hint">请先打开一个仓库</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="publish-panel-overlay" onClick={onClose}>
      <div className="publish-panel" onClick={(e) => e.stopPropagation()}>
        <div className="publish-panel-header">
          <h2>发布为网站</h2>
          <button className="publish-panel-close" onClick={onClose}>×</button>
        </div>
        <div className="publish-panel-body">
          {error && (
            <div className="publish-error">
              <span className="publish-error-icon">⚠</span>
              {error}
            </div>
          )}

          {done && (
            <div className="publish-success">
              <span className="publish-success-icon">✓</span>
              发布完成！
              <div className="publish-success-actions">
                <button className="publish-button" onClick={handlePreview}>
                  预览网站
                </button>
                <button className="publish-button" onClick={handleOpenFolder}>
                  打开输出目录
                </button>
              </div>
            </div>
          )}

          {publishing && (
            <div className="publish-progress">
              <div className="publish-progress-info">
                <span className="publish-phase">正在构建静态网站...</span>
              </div>
              <div className="publish-progress-bar">
                <div className="publish-progress-fill indeterminate" />
              </div>
              <div className="publish-current-file">使用 markdown-publish 构建中</div>
            </div>
          )}

          {!publishing && !done && (
            <div className="publish-actions">
              <p className="publish-description">
                使用 markdown-publish 将当前仓库转换为静态网站。<br/>
                包含搜索、关系图谱、Canvas 白板等功能。
              </p>
              <button className="publish-button primary" onClick={handlePublish}>
                开始发布
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
