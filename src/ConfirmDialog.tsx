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
    info: "ℹ️",
    warning: "⚠️",
    danger: "🗑️",
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
