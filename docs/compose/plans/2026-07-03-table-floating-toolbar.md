# Table Floating Toolbar Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/table-floating-toolbar.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating toolbar above tables that provides alignment controls, insert/delete operations, and cell merge/split functionality.

**Architecture:** Create a new TipTap Extension (`TableFloatingToolbar`) that uses a ProseMirror plugin to detect when the cursor is inside a table. When active, render a React-based floating toolbar above the table DOM element. The toolbar communicates with the editor via TipTap commands.

**Tech Stack:** TipTap 3.x, ProseMirror, React 19, TypeScript

## Global Constraints

- TipTap v3.27.1, React 19, TypeScript strict mode
- Follow existing patterns in `src/Editor/extensions/` for extensions
- Follow existing CSS variable patterns from `src/themes.css`
- No new dependencies — use only what's already in package.json

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/Editor/extensions/table-floating-toolbar.ts` | ProseMirror plugin: detect cursor in table, manage toolbar visibility/position |
| `src/Editor/TableFloatingToolbar.tsx` | React component: toolbar UI with buttons and dropdown menu |
| `src/Editor/TipTapEditor.tsx` | Register the new extension |
| `src/Editor/theme.css` | Toolbar styles |
| `src/Editor/extensions/custom-commands.ts` | Add table alignment commands |

---

### Task 1: Add table alignment commands

**Files:**
- Modify: `src/Editor/extensions/custom-commands.ts`

**Interfaces:**
- Produces: `table-align-left`, `table-align-center`, `table-align-right` command cases

- [ ] **Step 1: Add alignment command cases to custom-commands.ts**

Add three new cases in the `switch (name)` block, after the existing table column delete case (line ~118):

```typescript
case "table-align-left":
  chain.setTextSelection(editor.state.selection.from).run();
  editor.chain().focus().command(({ tr, state }) => {
    const { $from } = state.selection;
    const cell = $from.node(-1);
    if (cell && (cell.type.name === "tableCell" || cell.type.name === "tableHeader")) {
      tr.setNodeMarkup($from.before(-1), undefined, { ...cell.attrs, textAlign: "left" });
      return true;
    }
    return false;
  }).run();
  break;
case "table-align-center":
  chain.setTextSelection(editor.state.selection.from).run();
  editor.chain().focus().command(({ tr, state }) => {
    const { $from } = state.selection;
    const cell = $from.node(-1);
    if (cell && (cell.type.name === "tableCell" || cell.type.name === "tableHeader")) {
      tr.setNodeMarkup($from.before(-1), undefined, { ...cell.attrs, textAlign: "center" });
      return true;
    }
    return false;
  }).run();
  break;
case "table-align-right":
  chain.setTextSelection(editor.state.selection.from).run();
  editor.chain().focus().command(({ tr, state }) => {
    const { $from } = state.selection;
    const cell = $from.node(-1);
    if (cell && (cell.type.name === "tableCell" || cell.type.name === "tableHeader")) {
      tr.setNodeMarkup($from.before(-1), undefined, { ...cell.attrs, textAlign: "right" });
      return true;
    }
    return false;
  }).run();
  break;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Editor/extensions/custom-commands.ts
git commit -m "feat: add table alignment commands"
```

---

### Task 2: Create TableFloatingToolbar React component

**Files:**
- Create: `src/Editor/TableFloatingToolbar.tsx`

**Interfaces:**
- Consumes: `editor: Editor` from TipTap
- Produces: `TableFloatingToolbar` React component

- [ ] **Step 1: Create the TableFloatingToolbar component**

Create `src/Editor/TableFloatingToolbar.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import type { Editor } from "@tiptap/core";

interface TableFloatingToolbarProps {
  editor: Editor;
  tablePos: number;
  onClose: () => void;
}

export function TableFloatingToolbar({ editor, tablePos, onClose }: TableFloatingToolbarProps) {
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

  const runCommand = (name: string) => {
    editor.chain().focus().command(({ tr, state }) => {
      const { $from } = state.selection;
      const cellNode = $from.node(-1);
      if (!cellNode) return false;
      return true;
    }).run();
    (editor as any).commands.executeCommand?.(name) || editor.chain().focus().run();
    setShowMoreMenu(false);
  };

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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Editor/TableFloatingToolbar.tsx
git commit -m "feat: add TableFloatingToolbar React component"
```

---

### Task 3: Create TableFloatingToolbar TipTap Extension

**Files:**
- Create: `src/Editor/extensions/table-floating-toolbar.ts`

**Interfaces:**
- Consumes: `TableFloatingToolbar` React component
- Produces: `TableFloatingToolbar` TipTap Extension

- [ ] **Step 1: Create the extension**

Create `src/Editor/extensions/table-floating-toolbar.ts`:

```typescript
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const TableFloatingToolbar = Extension.create({
  name: "tableFloatingToolbar",

  addProseMirrorPlugins() {
    const extension = this;

    const plugin = new Plugin({
      key: new PluginKey("tableFloatingToolbar"),

      props: {
        handleDOMEvents: {
          click: (view, event) => {
            const target = event.target as HTMLElement;
            const table = target.closest("table");
            if (table) {
              // Dispatch custom event to show toolbar
              const event = new CustomEvent("table-toolbar-show", {
                detail: { table },
                bubbles: true,
              });
              target.dispatchEvent(event);
            }
            return false;
          },
        },
      },
    });

    return [plugin];
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Editor/extensions/table-floating-toolbar.ts
git commit -m "feat: add TableFloatingToolbar TipTap extension"
```

---

### Task 4: Register extension and integrate toolbar in TipTapEditor

**Files:**
- Modify: `src/Editor/TipTapEditor.tsx`

**Interfaces:**
- Consumes: `TableFloatingToolbar` extension, `TableFloatingToolbar` React component

- [ ] **Step 1: Import and register the extension**

In `src/Editor/TipTapEditor.tsx`, add import after line 28:

```typescript
import { TableFloatingToolbar } from "./extensions/table-floating-toolbar";
import { TableFloatingToolbar as TableFloatingToolbarComponent } from "./TableFloatingToolbar";
```

Add `TableFloatingToolbar` to the extensions array (after line 129, after `CodeBlockToolbar`):

```typescript
TableFloatingToolbar,
```

- [ ] **Step 2: Add toolbar state and rendering**

Add state for toolbar visibility and position after the `contextMenuPos` state (around line 66):

```typescript
const [tableToolbar, setTableToolbar] = useState<{ table: HTMLElement; pos: number } | null>(null);
```

Add useEffect to listen for the custom event, after the other useEffect blocks:

```typescript
// Listen for table toolbar show event
useEffect(() => {
  const handleTableToolbarShow = (e: Event) => {
    const customEvent = e as CustomEvent;
    if (customEvent.detail?.table && editor) {
      const table = customEvent.detail.table;
      setTableToolbar({ table, pos: 0 });
    }
  };
  window.addEventListener("table-toolbar-show", handleTableToolbarShow);
  return () => window.removeEventListener("table-toolbar-show", handleTableToolbarShow);
}, [editor]);
```

Add the toolbar component in the JSX, inside the `editor-wrapper` div, after the `EditorContent`:

```typescript
{tableToolbar && editor && (
  <TableFloatingToolbarComponent
    editor={editor}
    tablePos={tableToolbar.pos}
    onClose={() => setTableToolbar(null)}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/Editor/TipTapEditor.tsx
git commit -m "feat: register TableFloatingToolbar extension and integrate component"
```

---

### Task 5: Add CSS styles for the floating toolbar

**Files:**
- Modify: `src/Editor/theme.css`

**Interfaces:**
- Consumes: CSS class names from `TableFloatingToolbar.tsx`

- [ ] **Step 1: Add toolbar styles**

Add the following CSS at the end of `src/Editor/theme.css` (before the last closing comment or at end of file):

```css
/* 表格浮动工具栏 */
.table-floating-toolbar {
  position: absolute;
  top: -40px;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 50;
  min-width: 200px;
}

.table-floating-toolbar-left,
.table-floating-toolbar-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.table-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary, #666);
  cursor: pointer;
  transition: all 0.15s ease;
}

.table-toolbar-btn:hover {
  background: var(--bg-hover, #f0f0f0);
  color: var(--text-primary, #333);
}

.table-toolbar-btn.active {
  background: var(--bg-active, #e3f2fd);
  color: var(--text-link, #0969da);
}

.table-toolbar-btn.delete:hover {
  background: #fee2e2;
  color: #dc2626;
}

.table-toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--border, #e0e0e0);
  margin: 0 4px;
}

.table-toolbar-more-wrapper {
  position: relative;
}

.table-toolbar-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 160px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
}

.table-toolbar-dropdown button {
  display: block;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary, #333);
  transition: background 0.1s ease;
}

.table-toolbar-dropdown button:hover {
  background: var(--bg-hover, #f0f0f0);
}

.table-toolbar-dropdown-divider {
  height: 1px;
  background: var(--border, #e0e0e0);
  margin: 4px 0;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/Editor/theme.css
git commit -m "feat: add CSS styles for table floating toolbar"
```

---

### Task 6: Final verification and cleanup

**Files:**
- None (verification only)

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Start dev server and test manually**

Run: `npm run dev`
Test:
1. Insert a table via toolbar or right-click menu
2. Click inside the table → toolbar should appear above
3. Test alignment buttons (left/center/right)
4. Test "more" menu operations
5. Test delete button
6. Click outside the table → toolbar should disappear

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues found during testing"
```
