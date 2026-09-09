import { useState, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from './canvas-store';
import NotePicker from './NotePicker';
import MediaPicker from './MediaPicker';

// Convert absolute path to relative path (relative to vault)
function toRelativePath(absolutePath: string, vaultPath: string): string {
  if (!vaultPath || !absolutePath) return absolutePath;
  
  const normalizedAbsolute = absolutePath.replace(/\\/g, '/');
  const normalizedVault = vaultPath.replace(/\\/g, '/');
  
  if (normalizedAbsolute.startsWith(normalizedVault)) {
    let relative = normalizedAbsolute.slice(normalizedVault.length);
    if (relative.startsWith('/')) {
      relative = relative.slice(1);
    }
    return relative;
  }
  
  return absolutePath;
}

export default function CanvasToolbar() {
  const { getViewport } = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

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

  const getCenterPosition = useCallback(() => {
    const viewport = getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    return { x: centerX - 200, y: centerY - 100 };
  }, [getViewport]);

  // Text card
  const handleAddText = useCallback(() => {
    addNode('text', getCenterPosition());
  }, [addNode, getCenterPosition]);

  // Note card - shows NotePicker
  const handleAddNote = useCallback(() => {
    setShowNotePicker(true);
  }, []);

  // Handle note selection from NotePicker
  const handleNoteSelect = useCallback((path: string, name: string) => {
    const vaultPath = getVaultPath();
    const relativePath = toRelativePath(path, vaultPath);
    addNode('note', getCenterPosition(), { file: relativePath, label: name });
    setShowNotePicker(false);
  }, [addNode, getCenterPosition]);

  // Media card - shows MediaPicker
  const handleAddMedia = useCallback(() => {
    setShowMediaPicker(true);
  }, []);

  // Handle media selection from MediaPicker
  const handleMediaSelect = useCallback((path: string) => {
    const vaultPath = getVaultPath();
    const relativePath = toRelativePath(path, vaultPath);
    // Check if it's a canvas file
    const isCanvas = /\.canvas$/i.test(path);
    addNode(isCanvas ? 'canvas' : 'media', getCenterPosition(), { file: relativePath });
    setShowMediaPicker(false);
  }, [addNode, getCenterPosition]);

  return (
    <>
      <div className="canvas-toolbar">
        {/* Text card */}
        <button className="canvas-toolbar-btn" data-tooltip="添加卡片（点击或拖动）" onClick={handleAddText}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </button>

        {/* Note card */}
        <button className="canvas-toolbar-btn" data-tooltip="添加笔记（点击或拖动）" onClick={handleAddNote}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </button>

        {/* Media card */}
        <button className="canvas-toolbar-btn" data-tooltip="添加媒体文件（点击或拖动）" onClick={handleAddMedia}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
      </div>

      {showNotePicker && (
        <NotePicker
          vaultPath={getVaultPath()}
          onSelect={handleNoteSelect}
          onClose={() => setShowNotePicker(false)}
        />
      )}

      {showMediaPicker && (
        <MediaPicker
          vaultPath={getVaultPath()}
          onSelect={handleMediaSelect}
          onClose={() => setShowMediaPicker(false)}
        />
      )}
    </>
  );
}
