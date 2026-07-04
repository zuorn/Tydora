import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";

const GRID_ROWS = 8;
const GRID_COLS = 10;

interface TableFloatingToolbarProps {
  editor: Editor;
  tableElement: HTMLElement;
  onClose: () => void;
  onContentChange: (md: string) => void;
}

export function TableFloatingToolbar({ editor, tableElement, onClose, onContentChange }: TableFloatingToolbarProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showGridPicker, setShowGridPicker] = useState(false);
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const gridPickerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 调整表格大小（通过 Markdown 操作）
  const handleResizeTable = useCallback((targetRows: number, targetCols: number) => {
    const md = (editor.storage as any).markdown.getMarkdown();
    const lines = md.split("\n");

    // 找到表格的起止行
    let tableStart = -1;
    let tableEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("|")) {
        if (tableStart === -1) tableStart = i;
        tableEnd = i;
      } else if (tableStart !== -1) {
        break;
      }
    }
    if (tableStart === -1) return;

    // 解析表格行（跳过分隔行 |---|---|）
    const dataLines: string[] = [];
    for (let i = tableStart; i <= tableEnd; i++) {
      const line = lines[i].trim();
      if (line.match(/^\|[\s\-:|]+\|$/)) continue; // 跳过分隔行
      dataLines.push(line);
    }

    // 解析每个单元格
    const parseRow = (line: string) => {
      return line.split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1);
    };

    const rows = dataLines.map(parseRow);
    const currentRows = rows.length;
    const currentCols = rows.length > 0 ? rows[0].length : 0;

    // 构建新表格
    const newRows: string[][] = [];
    for (let r = 0; r < targetRows; r++) {
      const row: string[] = [];
      for (let c = 0; c < targetCols; c++) {
        if (r < currentRows && c < currentCols) {
          row.push(rows[r][c]);
        } else {
          row.push(" ");
        }
      }
      newRows.push(row);
    }

    // 生成 Markdown 表格
    const headerLine = "| " + newRows[0].join(" | ") + " |";
    const separatorLine = "| " + newRows[0].map(() => "---").join(" | ") + " |";
    const dataLinesNew = newRows.slice(1).map(row => "| " + row.join(" | ") + " |");
    const tableMd = [headerLine, separatorLine, ...dataLinesNew].join("\n");

    // 替换 Markdown 中的表格
    const beforeTable = lines.slice(0, tableStart).join("\n");
    const afterTable = lines.slice(tableEnd + 1).join("\n");
    const newMd = [beforeTable, tableMd, afterTable].filter(Boolean).join("\n");

    onContentChange(newMd);
    editor.commands.focus();
    setShowGridPicker(false);
  }, [editor, onContentChange]);

  const updatePosition = useCallback(() => {
    const rect = tableElement.getBoundingClientRect();
    const toolbarHeight = toolbarRef.current?.offsetHeight || 36;
    setPos({
      top: rect.top - toolbarHeight - 4,
      left: rect.left,
    });
  }, [tableElement]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    updatePosition();
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        toolbarRef.current && !toolbarRef.current.contains(e.target as Node) &&
        moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node) &&
        gridPickerRef.current && !gridPickerRef.current.contains(e.target as Node)
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
      for (let depth = $from.depth; depth >= 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === "paragraph") {
          const pos = $from.before(depth);
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: align });
          return true;
        }
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

  const gridPicker = showGridPicker && (
    <div ref={gridPickerRef} className="table-grid-picker">
      <div className="table-grid-grid">
        {Array.from({ length: GRID_ROWS }, (_, row) => (
          <div key={row} className="table-grid-row">
            {Array.from({ length: GRID_COLS }, (_, col) => {
              const isHovered = row < hoverRow && col < hoverCol;
              return (
                <div
                  key={col}
                  className={`table-grid-cell ${isHovered ? "hover" : ""}`}
                  onMouseEnter={() => {
                    setHoverRow(row + 1);
                    setHoverCol(col + 1);
                  }}
                  onClick={() => handleResizeTable(row + 1, col + 1)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="table-grid-size">
        {hoverRow > 0 && hoverCol > 0
          ? `${hoverRow} × ${hoverCol}`
          : "选择表格大小"}
      </div>
    </div>
  );

  const toolbar = (
    <div
      ref={toolbarRef}
      className="table-floating-toolbar"
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
    >
      <div className="table-floating-toolbar-left">
        <div className="table-toolbar-grid-wrapper" ref={gridPickerRef}>
          <button
            className={`table-toolbar-btn ${showGridPicker ? "active" : ""}`}
            title="调整表格大小"
            onClick={() => {
              setShowGridPicker(!showGridPicker);
              setShowMoreMenu(false);
            }}
          >
            {ICONS.table}
          </button>
          {gridPicker}
        </div>
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
            onClick={() => {
              setShowMoreMenu(!showMoreMenu);
              setShowGridPicker(false);
            }}
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

  return createPortal(toolbar, document.body);
}
