import { useEffect, useRef } from "react";

interface UpdateLinkDialogProps {
  isOpen: boolean;
  filesCount: number;
  linksCount: number;
  onAlwaysUpdate: () => void;
  onUpdateOnce: () => void;
  onSkip: () => void;
}

export function UpdateLinkDialog({
  isOpen,
  filesCount,
  linksCount,
  onAlwaysUpdate,
  onUpdateOnce,
  onSkip,
}: UpdateLinkDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSkip();
      }
    };

    const handleOverlayClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onSkip();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOverlayClick);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOverlayClick);
    };
  }, [isOpen, onSkip]);

  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-overlay">
      <div ref={dialogRef} className="confirm-dialog confirm-dialog-warning">
        <div className="confirm-dialog-title">更新链接</div>
        <div className="confirm-dialog-message">
          你是否需要更新与此文件相关联的内部链接？
          <br />
          这将影响 {filesCount} 个文件 中 的 {linksCount} 个链接。
        </div>
        <div className="update-link-actions">
          <button className="update-link-btn update-link-btn-primary" onClick={onAlwaysUpdate}>
            总是更新
          </button>
          <button className="update-link-btn" onClick={onUpdateOnce}>
            仅此一次
          </button>
          <button className="update-link-btn" onClick={onSkip}>
            不做更新
          </button>
        </div>
      </div>
    </div>
  );
}
