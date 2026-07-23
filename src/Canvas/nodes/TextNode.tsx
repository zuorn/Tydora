import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { getCanvasColor } from '../canvas-utils';
import { useCanvasStore } from '../canvas-store';
import { useNearestEdge } from '../useNearestEdge';
import { useCanvasZoom, shouldHideContent } from '../CanvasZoomContext';

function TextNode({ data, selected, id }: NodeProps) {
  const text = (data as any)?.text || '';
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();
  const [isHovered, setIsHovered] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const textContentRef = useRef<HTMLDivElement>(null);
  const handleNodeMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleNodeMouseLeave = useCallback(() => { setIsHovered(false); handleMouseLeave(); }, [handleMouseLeave]);
  const { zoom, hideContentThreshold } = useCanvasZoom();
  const hideContent = shouldHideContent(zoom, hideContentThreshold);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Placeholder.configure({
        placeholder: '输入内容...',
      }),
      Markdown.configure({
        html: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: text || '',
    editorProps: {
      attributes: {
        class: 'canvas-text-editor',
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Get markdown content using the Markdown extension
      const md = (ed.storage as any).markdown?.getMarkdown?.() || ed.getText();
      updateNodeData(id as string, { text: md });
    },
  });

  // Sync external changes
  useEffect(() => {
    if (editor && text) {
      const currentContent = (editor.storage as any).markdown?.getMarkdown?.() || editor.getText();
      if (currentContent !== text) {
        editor.commands.setContent(text);
      }
    }
  }, [text, editor]);

  // Focus editor on double-click
  const handleDoubleClick = useCallback(() => {
    if (editor) {
      editor.commands.focus();
    }
  }, [editor]);

  // Sync interactive mode with selection
  useEffect(() => {
    setInteractive(selected);
  }, [selected]);

  // Capture-phase wheel listener: prevent React Flow zoom when scrolling text content
  useEffect(() => {
    const el = textContentRef.current;
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

  // Calculate background: light tint of the color, or default
  const backgroundColor = color
    ? `${color}15` // 15 = ~8% opacity in hex
    : 'var(--bg-primary)';

  // Calculate border color: use node color if set, otherwise accent when selected
  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  return (
    <div
      ref={nodeRef}
      className={`canvas-node canvas-text-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleNodeMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleNodeMouseLeave}
    >
      {/* Node Resizer - small subtle handles */}
      <NodeResizer
        color={color || 'var(--accent)'}
        isVisible={selected || isHovered}
        minWidth={100}
        minHeight={60}
        handleClassName="canvas-resize-handle"
        lineClassName="canvas-resize-line"
        autoScale={false}
      />

      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      <div className="canvas-node-content">
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
        ) : editor ? (
          <div ref={textContentRef} className="canvas-text-editor-wrapper no-wheel">
            <EditorContent editor={editor} />
          </div>
        ) : (
          <div className="canvas-text-preview">
            {text || <span className="canvas-placeholder">输入内容...</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TextNode);
