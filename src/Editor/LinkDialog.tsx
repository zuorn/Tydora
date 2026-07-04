import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import "./LinkDialog.css";

interface LinkDialogProps {
  defaultText: string;
  onConfirm: (text: string, url: string) => void;
  onCancel: () => void;
}

export function LinkDialog({ defaultText, onConfirm, onCancel }: LinkDialogProps) {
  const [text, setText] = useState(defaultText);
  const [url, setUrl] = useState("");
  const textRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const handleConfirm = useCallback(() => {
    const trimmedText = text.trim();
    const trimmedUrl = url.trim();
    if (!trimmedText || !trimmedUrl) return;
    onConfirm(trimmedText, trimmedUrl);
  }, [text, url, onConfirm]);

  useEffect(() => {
    // 如果没有默认文本，聚焦文本输入框；否则聚焦 URL 输入框
    if (!defaultText) {
      textRef.current?.focus();
    } else {
      urlRef.current?.focus();
    }
  }, [defaultText]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  };

  return createPortal(
    <div className="link-dialog-overlay" onClick={onCancel}>
      <div className="link-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="link-dialog-title">插入链接</div>
        <div className="link-dialog-field">
          <label className="link-dialog-label">链接文本</label>
          <input
            ref={textRef}
            className="link-dialog-input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="链接显示文本"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); urlRef.current?.focus(); } }}
          />
        </div>
        <div className="link-dialog-field">
          <label className="link-dialog-label">URL</label>
          <input
            ref={urlRef}
            className="link-dialog-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="link-dialog-actions">
          <button className="link-dialog-btn link-dialog-btn-cancel" onClick={onCancel}>取消</button>
          <button
            className="link-dialog-btn link-dialog-btn-confirm"
            onClick={handleConfirm}
            disabled={!text.trim() || !url.trim()}
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
