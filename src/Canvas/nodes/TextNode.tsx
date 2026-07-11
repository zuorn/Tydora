import { useEffect, memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { getCanvasColor } from '../canvas-utils';
import { useCanvasStore } from '../canvas-store';

function TextNode({ data, selected, id }: NodeProps) {
  const text = (data as any)?.text || '';
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Placeholder.configure({
        placeholder: '输入内容...',
      }),
    ],
    content: text || '',
    editorProps: {
      attributes: {
        class: 'canvas-text-editor',
      },
    },
    onUpdate: ({ editor: ed }) => {
      updateNodeData(id as string, { text: ed.getText() });
    },
  });

  // Sync external changes
  useEffect(() => {
    if (editor && editor.getText() !== text) {
      editor.commands.setContent(text || '');
    }
  }, [text, editor]);

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
    >
      {/* Node Resizer - only shows when selected */}
      <NodeResizer
        color={color || 'var(--accent)'}
        isVisible={selected}
        minWidth={100}
        minHeight={60}
        handleClassName="canvas-resize-handle"
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
