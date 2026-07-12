import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: "info" | "warning" | "danger";
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  type = "warning",
  confirmText = "确定",
  cancelText = "取消",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter") {
        onConfirm();
      } else if (e.key.toLowerCase() === "y") {
        onConfirm();
      } else if (e.key.toLowerCase() === "n") {
        onCancel();
      }
    };

    const handleOverlayClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOverlayClick);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOverlayClick);
    };
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const icons = {
    info: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
    warning: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    danger: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  };

  const typeStyles = {
    info: "confirm-dialog-info",
    warning: "confirm-dialog-warning",
    danger: "confirm-dialog-danger",
  };

  return (
    <div className="confirm-dialog-overlay">
      <div ref={dialogRef} className={`confirm-dialog ${typeStyles[type]}`}>
        <div className="confirm-dialog-icon">{icons[type]}</div>
        <div className="confirm-dialog-title">{title}</div>
        <div className="confirm-dialog-message">{message}</div>
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn confirm-dialog-btn-cancel" onClick={onCancel}>
            {cancelText} <span className="confirm-dialog-btn-hint">(N)</span>
          </button>
          <button className="confirm-dialog-btn confirm-dialog-btn-confirm" onClick={onConfirm}>
            {confirmText} <span className="confirm-dialog-btn-hint">(Y/Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
