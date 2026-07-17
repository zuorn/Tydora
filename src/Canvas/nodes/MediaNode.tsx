import { useState, useEffect, useCallback, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCanvasColor, resolveFilePath } from '../canvas-utils';
import { useNearestEdge } from '../useNearestEdge';
import { useCanvasZoom, shouldHideContent } from '../CanvasZoomContext';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a']);
const PDF_EXTENSIONS = new Set(['pdf']);

function MediaNode({ data, selected }: NodeProps) {
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'audio' | 'pdf' | 'unknown'>('unknown');
  const [mediaSrc, setMediaSrc] = useState('');
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();
  const [isHovered, setIsHovered] = useState(false);
  const handleNodeMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleNodeMouseLeave = useCallback(() => { setIsHovered(false); handleMouseLeave(); }, [handleMouseLeave]);
  const { zoom, hideContentThreshold } = useCanvasZoom();
  const hideContent = shouldHideContent(zoom, hideContentThreshold);

  const filePath = (data as any)?.file || '';

  // Get vault path from localStorage
  const getVaultPath = (): string => {
    try {
      const raw = localStorage.getItem('zmd-vaults');
      const activeIndex = parseInt(localStorage.getItem('zmd-active-vault') || '-1');
      if (raw && activeIndex >= 0) {
        const vaults = JSON.parse(raw);
        return vaults[activeIndex]?.path || '';
      }
    } catch {}
    return '';
  };

  useEffect(() => {
    if (!filePath) return;

    // Resolve the path
    let resolvedPath = filePath;
    if (!filePath.match(/^[A-Z]:\\/i) && !filePath.startsWith('/')) {
      const vaultPath = getVaultPath();
      if (vaultPath) {
        resolvedPath = resolveFilePath(vaultPath, filePath);
      }
    }

    // Determine media type
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    if (IMAGE_EXTENSIONS.has(ext)) {
      setMediaType('image');
    } else if (VIDEO_EXTENSIONS.has(ext)) {
      setMediaType('video');
    } else if (AUDIO_EXTENSIONS.has(ext)) {
      setMediaType('audio');
    } else if (PDF_EXTENSIONS.has(ext)) {
      setMediaType('pdf');
    } else {
      setMediaType('unknown');
    }

    setMediaSrc(convertFileSrc(resolvedPath));
  }, [filePath]);

  const color = getCanvasColor((data as any)?.color);

  const backgroundColor = color
    ? `${color}15`
    : 'var(--bg-primary)';

  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  const renderMedia = () => {
    switch (mediaType) {
      case 'image':
        return (
          <img
            src={mediaSrc}
            alt={filePath}
            className="canvas-media-image"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        );
      case 'video':
        return (
          <video
            src={mediaSrc}
            controls
            className="canvas-media-video"
          />
        );
      case 'audio':
        return (
          <div className="canvas-media-audio">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <audio src={mediaSrc} controls className="canvas-audio-player" />
          </div>
        );
      case 'pdf':
        return (
          <iframe
            src={mediaSrc}
            className="canvas-media-pdf"
            title="PDF Preview"
          />
        );
      default:
        return (
          <div className="canvas-media-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="canvas-placeholder">不支持的媒体类型</span>
          </div>
        );
    }
  };

  return (
    <div
      ref={nodeRef}
      className={`canvas-node canvas-media-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
        overflow: 'visible',
        padding: 0,
      }}
      onMouseEnter={handleNodeMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleNodeMouseLeave}
    >
      <NodeResizer
        isVisible={selected || isHovered}
        minWidth={100}
        minHeight={100}
        handleClassName="canvas-resize-handle"
        lineClassName="canvas-resize-line"
        autoScale={false}
      />

      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      {hideContent ? (
        <div className="canvas-node-content-placeholder" style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.5,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      ) : mediaSrc ? renderMedia() : (
        <div className="canvas-media-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="canvas-placeholder">选择媒体文件</span>
        </div>
      )}
    </div>
  );
}

export default memo(MediaNode);
