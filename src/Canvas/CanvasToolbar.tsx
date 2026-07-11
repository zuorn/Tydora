import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { open } from '@tauri-apps/plugin-dialog';
import { useCanvasStore } from './canvas-store';

export default function CanvasToolbar() {
  const { getViewport } = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);

  const getCenterPosition = useCallback(() => {
    const viewport = getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    return { x: centerX - 200, y: centerY - 100 };
  }, [getViewport]);

  const handleAddText = useCallback(() => {
    addNode('text', getCenterPosition());
  }, [addNode, getCenterPosition]);

  const handleAddFile = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        multiple: false,
      });
      if (selected) {
        const filePath = selected as string;
        const fileName = filePath.split(/[/\\]/).pop() || '';
        addNode('file', getCenterPosition(), { file: filePath, label: fileName });
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, [addNode, getCenterPosition]);

  const handleAddImage = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
        multiple: false,
      });
      if (selected) {
        const filePath = selected as string;
        addNode('text', getCenterPosition(), { text: `![image](${filePath})` });
      }
    } catch (err) {
      console.error('Failed to open image:', err);
    }
  }, [addNode, getCenterPosition]);

  return (
    <div className="canvas-toolbar">
      <div className="canvas-toolbar-tooltip">添加卡片（点击或拖动）</div>

      {/* Text card - Obsidian style */}
      <button className="canvas-toolbar-btn" title="文本卡片" onClick={handleAddText}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="7" y1="8" x2="17" y2="8" />
          <line x1="7" y1="12" x2="14" y2="12" />
          <line x1="7" y1="16" x2="11" y2="16" />
        </svg>
      </button>

      {/* File card - Obsidian style */}
      <button className="canvas-toolbar-btn" title="文件卡片" onClick={handleAddFile}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </button>

      {/* Image card - Obsidian style */}
      <button className="canvas-toolbar-btn" title="图片卡片" onClick={handleAddImage}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>
    </div>
  );
}
