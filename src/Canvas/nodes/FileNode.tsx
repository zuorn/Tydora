import { useState, useEffect, memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { emit } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCanvasColor, resolveFilePath } from '../canvas-utils';
import { useNearestEdge } from '../useNearestEdge';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico']);

function FileNode({ data, selected }: NodeProps) {
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [isImage, setIsImage] = useState(false);
  const [imageSrc, setImageSrc] = useState('');
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();

  const filePath = (data as any)?.file || '';
  const subpath = (data as any)?.subpath || '';

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

    // Extract filename from path
    const name = filePath.split(/[/\\]/).pop() || filePath;
    setFileName(name);

    // Check if it's an image file
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const isImageFile = IMAGE_EXTENSIONS.has(ext);
    setIsImage(isImageFile);

    const loadContent = async () => {
      try {
        // Resolve the path - if it's relative, resolve against vault path
        let resolvedPath = filePath;
        if (!filePath.match(/^[A-Z]:\\/i) && !filePath.startsWith('/')) {
          const vaultPath = getVaultPath();
          if (vaultPath) {
            resolvedPath = resolveFilePath(vaultPath, filePath);
          }
        }

        if (isImageFile) {
          // For images, use convertFileSrc from Tauri
          setImageSrc(convertFileSrc(resolvedPath));
          setContent('');
        } else {
          // For text files, read content
          const text = await readTextFile(resolvedPath);
          setContent(text.slice(0, 500));
        }
      } catch (err) {
        console.error('Failed to load file:', err);
        setContent('无法加载文件内容');
      }
    };

    loadContent();
  }, [filePath]);

  const handleClick = () => {
    if (filePath) {
      emit('open-file', { path: filePath });
    }
  };

  const color = getCanvasColor((data as any)?.color);

  // Calculate background: light tint of the color, or default
  const backgroundColor = color
    ? `${color}15`
    : 'var(--bg-primary)';

  // Calculate border color: use node color if set, otherwise accent when selected
  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  return (
    <div
      ref={nodeRef}
      className={`canvas-node canvas-file-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
        overflow: 'visible',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      {/* Only show header for non-image files */}
      {!isImage && (
        <div className="canvas-node-header" onClick={handleClick} style={{ cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="canvas-file-name" title={filePath}>
            {fileName || '未选择文件'}
          </span>
          {subpath && <span className="canvas-file-subpath">{subpath}</span>}
        </div>
      )}

      <div className="canvas-node-content canvas-file-content">
        {isImage && imageSrc ? (
          <img
            src={imageSrc}
            alt={fileName}
            className="canvas-image-display"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : content ? (
          <pre className="canvas-file-preview">{content}</pre>
        ) : (
          <span className="canvas-placeholder">点击选择文件</span>
        )}
      </div>
    </div>
  );
}

export default memo(FileNode);
