import { useState, useEffect, useCallback, type ReactNode } from "react";
import "./AppModal.css";

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  /** 返回 false 可否决本次关闭（例如先收起内部菜单 / 取消重命名） */
  shouldClose?: () => boolean;
  /** 无障碍标签（role="dialog" 的 aria-label） */
  ariaLabel?: string;
  /** 关闭按钮的悬浮提示文案 */
  closeTitle?: string;
  /** 弹框尺寸（CSS 长度值，随视口自动缩放，默认 920x640） */
  width?: string;
  height?: string;
  children?: ReactNode;
}

const CLOSE_ANIMATION_MS = 160;

/**
 * 通用模态弹框：遮罩层 + 圆角对话框 + 右上角悬浮关闭按钮 + 打开/关闭动画。
 * 关闭途径统一：右上角按钮 / Esc / 点击遮罩空白处。
 * 打开期间会桥接同文档 storage 通知（原生 storage 事件只在跨窗口时触发，
 * 弹框内的 localStorage 写入需要让本窗口的 storage 监听者立即感知）。
 */
export default function AppModal({
  open,
  onClose,
  shouldClose,
  ariaLabel,
  closeTitle,
  width = "920px",
  height = "640px",
  children,
}: AppModalProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  // 打开/关闭动画：关闭时先播放动画再卸载
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, CLOSE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  const requestClose = useCallback(() => {
    if (shouldClose && !shouldClose()) return;
    onClose();
  }, [shouldClose, onClose]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      requestClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, requestClose]);

  // 同文档 storage 事件桥接（见组件注释）
  useEffect(() => {
    if (!open) return;
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      const oldValue = localStorage.getItem(key);
      original(key, value);
      try {
        window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue: value }));
      } catch {}
    };
    return () => {
      localStorage.setItem = original;
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={`app-modal-overlay${closing ? " closing" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`app-modal-dialog${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{ width: `min(${width}, 100%)`, height: `min(${height}, 100%)` }}
      >
        <button className="app-modal-close" onClick={requestClose} title={closeTitle}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
