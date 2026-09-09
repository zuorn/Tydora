import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import katex from "katex";
import "./MathDialog.css";

interface MathDialogProps {
  latex: string;
  block: boolean;
  lockBlock?: boolean;
  onConfirm: (latex: string, block: boolean) => void;
  onCancel: () => void;
}

export function MathDialog({ latex: initialLatex, block: initialBlock, lockBlock, onConfirm, onCancel }: MathDialogProps) {
  const { t } = useTranslation();
  const [latex, setLatex] = useState(initialLatex);
  const [block, setBlock] = useState(initialBlock);
  const [preview, setPreview] = useState<{ html: string; error: string | null }>({ html: "", error: null });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 实时预览
  useEffect(() => {
    if (!latex.trim()) {
      setPreview({ html: "", error: null });
      return;
    }
    try {
      const html = katex.renderToString(latex, {
        displayMode: block,
        throwOnError: true,
        strict: false,
      });
      setPreview({ html, error: null });
    } catch (e: any) {
      setPreview({ html: "", error: e?.message || String(e) });
    }
  }, [latex, block]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  const handleConfirm = useCallback(() => {
    if (!latex.trim()) return;
    onConfirm(latex.trim(), block);
  }, [latex, block, onConfirm]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  };

  return createPortal(
    <div className="math-dialog-overlay" onClick={onCancel}>
      <div className="math-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="math-dialog-title">{t("editor.mathDialog.title")}</div>
        <div className={`math-dialog-preview ${block ? "math-dialog-preview--block" : ""}`}>
          {preview.error ? (
            <div className="math-dialog-preview-error">{t("editor.mathDialog.previewError")}</div>
          ) : preview.html ? (
            <div className="math-dialog-preview-render" dangerouslySetInnerHTML={{ __html: preview.html }} />
          ) : (
            <div className="math-dialog-preview-empty">{t("editor.mathDialog.previewEmpty")}</div>
          )}
        </div>
        <textarea
          ref={textareaRef}
          className="math-dialog-input"
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("editor.mathDialog.placeholder")}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={3}
        />
        <div className="math-dialog-actions">
          <label className="math-dialog-block-toggle">
            <input type="checkbox" checked={block} disabled={lockBlock} onChange={(e) => setBlock(e.target.checked)} />
            {t("editor.mathDialog.block")}
          </label>
          <div className="math-dialog-actions-spacer" />
          <button className="math-dialog-btn math-dialog-btn-cancel" onClick={onCancel}>
            {t("editor.mathDialog.cancel")}
          </button>
          <button className="math-dialog-btn math-dialog-btn-confirm" onClick={handleConfirm} disabled={!latex.trim()}>
            {t("editor.mathDialog.confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
