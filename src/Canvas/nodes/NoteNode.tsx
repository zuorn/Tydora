import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { emit } from '@tauri-apps/api/event';
import { getCanvasColor, resolveFilePath } from '../canvas-utils';
import { useNearestEdge } from '../useNearestEdge';
import { useCanvasZoom, shouldHideContent } from '../CanvasZoomContext';

function NoteNode({ data, selected }: NodeProps) {
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [initialContent, setInitialContent] = useState('');
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();
  const [isHovered, setIsHovered] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const noteContentRef = useRef<HTMLDivElement>(null);
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

  // Load content first
  useEffect(() => {
    if (!filePath) return;

    // Extract title from filename
    const name = filePath.split(/[/\\]/).pop() || filePath;
    setTitle(name.replace(/\.(md|markdown)$/i, ''));

    const loadContent = async () => {
      setIsLoading(true);
      try {
        // Resolve the path
        let resolvedPath = filePath;
        if (!filePath.match(/^[A-Z]:\\/i) && !filePath.startsWith('/')) {
          const vaultPath = getVaultPath();
          if (vaultPath) {
            resolvedPath = resolveFilePath(vaultPath, filePath);
          }
        }

        const text = await readTextFile(resolvedPath);
        setInitialContent(text || '');
      } catch (err) {
        console.error('Failed to load note:', err);
        setInitialContent('<p>无法加载笔记内容</p>');
      }
      setIsLoading(false);
    };

    loadContent();
  }, [filePath]);

  // Sync interactive mode with selection
  useEffect(() => {
    setInteractive(selected);
  }, [selected]);

  // Create editor with initial content
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Markdown.configure({
        html: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initialContent,
    editable: false,
    editorProps: {
      attributes: {
        class: 'canvas-note-editor',
      },
    },
  });

  // Update editor when content changes
  useEffect(() => {
    if (editor && initialContent && !editor.isDestroyed) {
      editor.commands.setContent(initialContent);
    }
  }, [initialContent, editor]);

  const handleDoubleClick = useCallback(() => {
    if (filePath) {
      let resolvedPath = filePath;
      if (!filePath.match(/^[A-Z]:\\/i) && !filePath.startsWith('/')) {
        const vaultPath = getVaultPath();
        if (vaultPath) {
          resolvedPath = resolveFilePath(vaultPath, filePath);
        }
      }
      emit('open-file', { path: resolvedPath });
    }
  }, [filePath]);

  // Capture-phase wheel listener: prevent React Flow zoom when scrolling note content
  useEffect(() => {
    const el = noteContentRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (!interactive) return;

      // Check if at scroll boundaries
      const atTop = el.scrollTop <= 0 && e.deltaY < 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0;

      // Always prevent zoom when node is selected and has scrollable content
      // or is at a boundary (let it propagate for canvas zoom only at boundaries)
      if (!atTop && !atBottom) {
        e.stopPropagation();
      }
    };

    el.addEventListener('wheel', handler, { capture: true });
    return () => el.removeEventListener('wheel', handler, { capture: true });
  }, [interactive]);

  const color = getCanvasColor((data as any)?.color);

  const backgroundColor = color
    ? `${color}15`
    : 'var(--bg-primary)';

  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  return (
    <div
      ref={nodeRef}
      className={`canvas-node canvas-note-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
        overflow: 'visible',
      }}
      onMouseEnter={handleNodeMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleNodeMouseLeave}
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        isVisible={selected || isHovered}
        minWidth={150}
        minHeight={150}
        handleClassName="canvas-resize-handle"
        lineClassName="canvas-resize-line"
      />

      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      <div className="canvas-note-header" style={{ cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span className="canvas-note-title">{title}</span>
      </div>

      <div ref={noteContentRef} className="canvas-note-content no-wheel">
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
        ) : isLoading ? (
          <span className="canvas-placeholder">加载中...</span>
        ) : editor ? (
          <EditorContent editor={editor} className="canvas-note-editor-wrapper" />
        ) : (
          <span className="canvas-placeholder">加载中...</span>
        )}
      </div>
    </div>
  );
}

export default memo(NoteNode);
