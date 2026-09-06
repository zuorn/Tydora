import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type BuiltArtifact, type ExportFormat, saveExportArtifact } from "../export";
import "./ExportPreviewDialog.css";

interface ExportPreviewDialogProps {
  format: ExportFormat;
  artifact: BuiltArtifact;
  title: string;
  onClose: () => void;
  onSaveSuccess?: (savedPath: string) => void;
}

export function ExportPreviewDialog({ format, artifact, title, onClose, onSaveSuccess }: ExportPreviewDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewHtml = artifact.previewHtml;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (saving) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (format === "wechat") {
          copyWechatRef.current();
        } else {
          confirmRef.current();
        }
      }
    };
    const handleOverlayClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node) && !saving) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOverlayClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOverlayClick);
    };
  }, [onClose, saving, format]);

  // 使用 ref 保持确认回调稳定，避免 Enter 快捷键监听反复注册
  const confirmRef = useRef<() => void>(() => {});
  const copyWechatRef = useRef<() => void>(() => {});

  const handleConfirm = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const path = await saveExportArtifact(format, artifact.content, title);
      if (path) {
        onClose();
        onSaveSuccess?.(path);
      } else {
        // 用户取消保存
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [saving, format, artifact.content, title, onClose, onSaveSuccess]);
  confirmRef.current = handleConfirm;

  /** 公众号格式：将 HTML 内容写入剪贴板，支持粘贴到公众号编辑器 */
  const handleCopyWechat = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const htmlContent = typeof artifact.content === "string" ? artifact.content : new TextDecoder().decode(artifact.content);
      const blob = new Blob([htmlContent], { type: "text/html" });
      const clipboardItem = new ClipboardItem({ "text/html": blob });
      await navigator.clipboard.write([clipboardItem]);
      setCopied(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e) {
      // 降级：如果 ClipboardItem 不可用，尝试读取并用 execCommand
      try {
        const htmlContent = typeof artifact.content === "string" ? artifact.content : new TextDecoder().decode(artifact.content);
        const textContent = htmlContent.replace(/<[^>]+>/g, "");
        const blob = new Blob([htmlContent], { type: "text/html" });
        const clipboardItem = new ClipboardItem({ "text/html": blob, "text/plain": new Blob([textContent], { type: "text/plain" }) });
        await navigator.clipboard.write([clipboardItem]);
        setCopied(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } catch (e2) {
        setError(e instanceof Error ? e.message : t("app.export.copyFailed"));
      }
    } finally {
      setSaving(false);
    }
  }, [saving, artifact.content, onClose]);
  copyWechatRef.current = handleCopyWechat;

  const isWechat = format === "wechat";

  return (
    <div className="export-preview-overlay">
      <div ref={dialogRef} className="export-preview-dialog">
        <div className="export-preview-header">
          <span className="export-preview-title">{t("exportPreview.title", { label: t(`app.export.${format}`) })}</span>
          <div className="export-preview-header-actions">
            {error && <span className="export-preview-error">{t("exportPreview.exportFailed", { error })}</span>}
            {copied && <span className="export-preview-copied">{t("exportPreview.copiedToClipboard")}</span>}
            {isWechat ? (
              <button className="export-preview-btn export-preview-btn-confirm" onClick={handleCopyWechat} disabled={saving}>
                {copied ? t("exportPreview.copied") : saving ? t("exportPreview.copying") : t("exportPreview.copyToClipboard")}
              </button>
            ) : (
              <button className="export-preview-btn export-preview-btn-confirm" onClick={handleConfirm} disabled={saving}>
                {saving ? t("exportPreview.exporting") : t("exportPreview.exportAs", { label: t(`app.export.${format}`) })}
              </button>
            )}
            <button className="export-preview-close" onClick={onClose} disabled={saving} title={t("settings.close")}>
              ✕
            </button>
          </div>
        </div>

        <div className={`export-preview-body${format === "pdf" ? " export-preview-body--pdf" : ""}`}>
          {previewHtml ? (
            <iframe
              className={`export-preview-frame${format === "pdf" ? " export-preview-frame--pdf" : ""}`}
              title={t("exportPreview.dialogTitle")}
              srcDoc={previewHtml}
              sandbox={format === "pdf" ? "allow-scripts" : ""}
            />
          ) : artifact.previewPng ? (
            <div className="export-preview-img-wrap">
              <img className="export-preview-img" src={artifact.previewPng} alt={t("exportPreview.dialogTitle")} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
