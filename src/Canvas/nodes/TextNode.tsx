import { useState, useEffect, useCallback, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { getCanvasColor } from '../canvas-utils';
import { useCanvasStore } from '../canvas-store';

function TextNode({ data, selected, id }: NodeProps) {
  const text = (data as any)?.text || '';
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [isHovered, setIsHovered] = useState(false);

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

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  // Focus editor on double-click
  const handleDoubleClick = useCallback(() => {
    if (editor) {
      editor.commands.focus();
    }
  }, [editor]);

  // Focus editor on click (for IR mode)
  const handleClick = useCallback(() => {
    if (editor) {
      editor.commands.focus();
    }
  }, [editor]);

  const color = getCanvasColor((data as any)?.color);

  // Calculate background: light tint of the color, or default
  const backgroundColor = color
    ? `${color}15` // 15 = ~8% opacity in hex
    : 'var(--bg-primary)';

  // Calculate border color: use node color if set, otherwise accent when selected
  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  return (
    <div
      className={`canvas-node canvas-text-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Node Resizer - shows on hover or select */}
      <NodeResizer
        color={color || 'var(--accent)'}
        isVisible={selected || isHovered}
        minWidth={100}
        minHeight={60}
        handleClassName="canvas-resize-handle"
        lineClassName="canvas-resize-line"
        autoScale={false}
      />

      <Handle type="target" position={Position.Top} id="top" className="canvas-handle" />
      <Handle type="target" position={Position.Left} id="left" className="canvas-handle" />
      <Handle type="source" position={Position.Right} id="right" className="canvas-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="canvas-handle" />

      <div className="canvas-node-content">
        {editor ? (
          <EditorContent editor={editor} className="canvas-text-editor-wrapper" />
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
