import { useState, useRef, useEffect } from "react";
import type { Editor } from "@tiptap/core";

interface TableFloatingToolbarProps {
  editor: Editor;
  onClose: () => void;
}

export function TableFloatingToolbar({ editor, onClose }: TableFloatingToolbarProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        toolbarRef.current && !toolbarRef.current.contains(e.target as Node) &&
        moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleAlign = (align: string) => {
    editor.chain().focus().command(({ tr, state }) => {
      const { $from } = state.selection;
      const cell = $from.node(-1);
      if (cell && (cell.type.name === "tableCell" || cell.type.name === "tableHeader")) {
        tr.setNodeMarkup($from.before(-1), undefined, { ...cell.attrs, textAlign: align });
        return true;
      }
      return false;
    }).run();
  };

  const handleInsertRowAbove = () => {
    editor.chain().focus().addRowBefore().run();
    setShowMoreMenu(false);
  };

  const handleInsertRowBelow = () => {
    editor.chain().focus().addRowAfter().run();
    setShowMoreMenu(false);
  };

  const handleInsertColLeft = () => {
    editor.chain().focus().addColumnBefore().run();
    setShowMoreMenu(false);
  };

  const handleInsertColRight = () => {
    editor.chain().focus().addColumnAfter().run();
    setShowMoreMenu(false);
  };

  const handleDeleteRow = () => {
    editor.chain().focus().deleteRow().run();
    setShowMoreMenu(false);
  };

  const handleDeleteCol = () => {
    editor.chain().focus().deleteColumn().run();
    setShowMoreMenu(false);
  };

  const handleMergeCells = () => {
    editor.chain().focus().mergeCells().run();
    setShowMoreMenu(false);
  };

  const handleSplitCell = () => {
    editor.chain().focus().splitCell().run();
    setShowMoreMenu(false);
  };

  const handleDeleteTable = () => {
    editor.chain().focus().deleteTable().run();
    onClose();
  };

  const ICONS = {
    table: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    ),
    alignLeft: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" />
      </svg>
    ),
    alignCenter: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    ),
    alignRight: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" />
      </svg>
    ),
    more: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
      </svg>
    ),
    trash: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      </svg>
    ),
  };

  return (
    <div ref={toolbarRef} className="table-floating-toolbar">
      <div className="table-floating-toolbar-left">
        <button className="table-toolbar-btn" title="插入表格">{ICONS.table}</button>
        <div className="table-toolbar-divider" />
        <button className="table-toolbar-btn" title="左对齐" onClick={() => handleAlign("left")}>{ICONS.alignLeft}</button>
        <button className="table-toolbar-btn" title="居中对齐" onClick={() => handleAlign("center")}>{ICONS.alignCenter}</button>
        <button className="table-toolbar-btn" title="右对齐" onClick={() => handleAlign("right")}>{ICONS.alignRight}</button>
      </div>
      <div className="table-floating-toolbar-right">
        <div className="table-toolbar-more-wrapper" ref={moreMenuRef}>
          <button
            className={`table-toolbar-btn ${showMoreMenu ? "active" : ""}`}
            title="更多操作"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
          >
            {ICONS.more}
          </button>
          {showMoreMenu && (
            <div className="table-toolbar-dropdown">
              <button onClick={handleInsertRowAbove}>上方插入行</button>
              <button onClick={handleInsertRowBelow}>下方插入行</button>
              <div className="table-toolbar-dropdown-divider" />
              <button onClick={handleInsertColLeft}>左侧插入列</button>
              <button onClick={handleInsertColRight}>右侧插入列</button>
              <div className="table-toolbar-dropdown-divider" />
              <button onClick={handleDeleteRow}>删除行</button>
              <button onClick={handleDeleteCol}>删除列</button>
              <div className="table-toolbar-dropdown-divider" />
              <button onClick={handleMergeCells}>合并单元格</button>
              <button onClick={handleSplitCell}>拆分单元格</button>
            </div>
          )}
        </div>
        <button className="table-toolbar-btn delete" title="删除表格" onClick={handleDeleteTable}>{ICONS.trash}</button>
      </div>
    </div>
  );
}
