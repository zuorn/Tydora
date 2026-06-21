import { useEffect, useState, useCallback } from "react";
import { readFile } from "@tauri-apps/plugin-fs";

type FileType = "image" | "video" | "audio" | "pdf" | "unsupported";

function getFileType(fileName: string): FileType {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "svg", "avif", "heic", "heif"];
  const videoExts = ["mp4", "webm", "ogg", "mov", "avi", "mkv", "wmv", "flv", "m4v"];
  const audioExts = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"];
  const pdfExts = ["pdf"];

  if (imageExts.includes(ext)) return "image";
  if (videoExts.includes(ext)) return "video";
  if (audioExts.includes(ext)) return "audio";
  if (pdfExts.includes(ext)) return "pdf";
  return "unsupported";
}

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
    "ico": "image/x-icon",
    "svg": "image/svg+xml",
    "avif": "image/avif",
    "heic": "image/heic",
    "heif": "image/heif",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "ogg": "video/ogg",
    "mov": "video/quicktime",
    "avi": "video/x-msvideo",
    "mkv": "video/x-matroska",
    "wmv": "video/x-ms-wmv",
    "flv": "video/x-flv",
    "m4v": "video/x-m4v",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "flac": "audio/flac",
    "aac": "audio/aac",
    "m4a": "audio/mp4",
    "wma": "audio/x-ms-wma",
    "pdf": "application/pdf",
  };
  return mimeMap[ext] || "application/octet-stream";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface FilePreviewProps {
  filePath: string;
  onBack: () => void;
}

export default function FilePreview({ filePath, onBack }: FilePreviewProps) {
  const [fileSrc, setFileSrc] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);

  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const fileType = getFileType(fileName);
  const mimeType = getMimeType(fileName);
  const canZoom = fileType === "image";

  // 滚轮缩放处理
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!canZoom) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.min(Math.max(prev + delta, 0.1), 5));
  }, [canZoom]);

  // 重置缩放
  const handleResetScale = useCallback(() => {
    setScale(1);
  }, []);

  useEffect(() => {
    const loadFile = async () => {
      try {
        setLoading(true);
        setError(null);
        const content = await readFile(filePath);
        const base64 = arrayBufferToBase64(content.buffer);
        const dataUrl = `data:${mimeType};base64,${base64}`;
        setFileSrc(dataUrl);
      } catch (e) {
        setError("无法加载文件: " + (e as Error).message);
        console.error("加载文件失败:", e);
      } finally {
        setLoading(false);
      }
    };
    loadFile();
  }, [filePath, mimeType]);

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="preview-loading">
          <span className="preview-loading-spinner">⏳</span>
          <span className="preview-loading-text">加载中...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="preview-error">
          <span className="preview-error-icon">❌</span>
          <span className="preview-error-text">{error}</span>
        </div>
      );
    }

    switch (fileType) {
      case "image":
        return (
          <div
            className="preview-image-container"
            onWheel={handleWheel}
          >
            <img
              src={fileSrc}
              alt={fileName}
              className="preview-image"
              style={{ transform: `scale(${scale})` }}
              onError={(e) => {
                e.preventDefault();
                setError("图片加载失败");
              }}
            />
          </div>
        );

      case "video":
        return (
          <div className="preview-video-container">
            <video
              src={fileSrc}
              className="preview-video"
              controls
              autoPlay={false}
              onError={(e) => {
                e.preventDefault();
                setError("视频加载失败");
              }}
            />
          </div>
        );

      case "audio":
        return (
          <div className="preview-audio-container">
            <div className="preview-audio-icon">🎵</div>
            <div className="preview-audio-name">{fileName}</div>
            <audio
              src={fileSrc}
              className="preview-audio"
              controls
              onError={(e) => {
                e.preventDefault();
                setError("音频加载失败");
              }}
            />
          </div>
        );

      case "pdf":
        return (
          <div className="preview-pdf-container">
            <iframe
              src={fileSrc}
              className="preview-pdf"
              title={fileName}
              onError={(e) => {
                e.preventDefault();
                setError("PDF 加载失败");
              }}
            />
          </div>
        );

      default:
        return (
          <div className="preview-unsupported">
            <span className="preview-unsupported-icon">📄</span>
            <span className="preview-unsupported-text">
              无法预览此类型文件
            </span>
            <span className="preview-unsupported-hint">
              您可以使用外部程序打开此文件
            </span>
          </div>
        );
    }
  };

  return (
    <div className="file-preview">
      <div className="preview-header">
        <button className="preview-back-btn" onClick={onBack} title="返回">
          ◀ 返回
        </button>
        <div className="preview-file-info">
          <span className="preview-file-name" title={fileName}>
            {fileName}
          </span>
        </div>
        {canZoom && (
          <div className="preview-zoom-controls">
            <span className="preview-zoom-level">{Math.round(scale * 100)}%</span>
            <button
              className="preview-zoom-reset"
              onClick={handleResetScale}
              title="重置缩放"
              style={{ opacity: scale !== 1 ? 1 : 0.5 }}
            >
              ⟲
            </button>
          </div>
        )}
      </div>
      <div className="preview-content">{renderPreview()}</div>
    </div>
  );
}