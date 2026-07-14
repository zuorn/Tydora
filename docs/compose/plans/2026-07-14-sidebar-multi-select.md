# Sidebar Multi-Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task.

**Goal:** Add Shift+click range selection and Ctrl+click multi-selection to the sidebar file tree.

**Architecture:** Add `selectedPaths` and `lastClickedPath` state to `FileTree` component. Modify `TreeNodeComp` click handler to check keyboard modifiers. Use DOM query for range selection ordering. Batch operations (delete) apply to all selected files.

**Tech Stack:** React state, DOM API for range calculation, existing Tauri FS APIs.

---

### Task 1: Add multi-select state to FileTree

**Files:**
- Modify: `src/Sidebar.tsx:752-756` (FileTree state)
- Modify: `src/Sidebar.tsx:500-530` (TreeNodeComp props)

**Steps:**

- [ ] Add state variables to `FileTree`:

```typescript
const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
const lastClickedPathRef = useRef<string | null>(null);
```

- [ ] Add `selectedPaths` and `lastClickedPath` to `TreeNodeComp` props type:

```typescript
selectedPaths: Set<string>;
onMultiSelect: (paths: string[], mode: 'toggle' | 'range' | 'replace') => void;
```

- [ ] Pass new props from `FileTree` to each `TreeNodeComp`:

```tsx
<TreeNodeComp
  ...
  selectedPaths={selectedPaths}
  onMultiSelect={handleMultiSelect}
/>
```

- [ ] Create `handleMultiSelect` in `FileTree`:

```typescript
const handleMultiSelect = useCallback((paths: string[], mode: 'toggle' | 'range' | 'replace') => {
  setSelectedPaths(prev => {
    const next = new Set(mode === 'replace' ? [] : prev);
    if (mode === 'toggle') {
      for (const p of paths) {
        if (next.has(p)) next.delete(p); else next.add(p);
      }
    } else {
      for (const p of paths) next.add(p);
    }
    return next;
  });
}, []);
```

---

### Task 2: Modify TreeNodeComp click handler for modifiers

**Files:**
- Modify: `src/Sidebar.tsx:548-553` (handleToggle in TreeNodeComp)

**Steps:**

- [ ] Modify `handleToggle` to accept the click event and check modifiers:

```typescript
const handleToggle = useCallback(async (e: React.MouseEvent) => {
  if (!node.isDirectory) {
    // Shift+click: range select
    if (e.shiftKey) {
      e.preventDefault();
      const allNodes = Array.from(document.querySelectorAll('.tree-node[data-path]'));
      const paths = allNodes.map(n => (n as HTMLElement).dataset.path!);
      const anchor = lastClickedPathRef.current;
      if (anchor) {
        const start = paths.indexOf(anchor);
        const end = paths.indexOf(node.path);
        if (start !== -1 && end !== -1) {
          const [lo, hi] = start < end ? [start, end] : [end, start];
          const range = paths.slice(lo, hi + 1);
          onMultiSelect(range, 'range');
        }
      }
      lastClickedPathRef.current = node.path;
      onSelect(node.path);
      return;
    }
    // Ctrl+click: toggle selection
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onMultiSelect([node.path], 'toggle');
      lastClickedPathRef.current = node.path;
      onSelect(node.path);
      return;
    }
    // Normal click: clear selection
    onMultiSelect([], 'replace');
    lastClickedPathRef.current = node.path;
    onSelect(node.path);
    return;
  }
  // Directory toggle (unchanged)
  if (node.children === null) {
    node.children = await loadDirectory(node.path);
  }
  node.expanded = !node.expanded;
  onRefresh();
}, [node, onSelect, onRefresh, onMultiSelect]);
```

- [ ] Pass `lastClickedPathRef` from `FileTree` to `TreeNodeComp` (or use a shared ref/context).

---

### Task 3: Add CSS for selected state

**Files:**
- Modify: `src/Sidebar.css:133-161`

**Steps:**

- [ ] Add `.tree-node.selected` style after `.tree-node.active`:

```css
.tree-node.selected {
  background: rgba(var(--accent-rgb, 137, 180, 250), 0.08);
  border: 0.5px solid rgba(var(--accent-rgb, 137, 180, 250), 0.12);
}
```

- [ ] Update `TreeNodeComp` to apply `selected` class:

```tsx
className={`tree-node${isActive ? " active" : ""}${selectedPaths.has(node.path) ? " selected" : ""}${isDragOver ? " drag-over" : ""}`}
```

---

### Task 4: Batch delete for selected files

**Files:**
- Modify: `src/Sidebar.tsx:586-594` (handleDeleteConfirm in TreeNodeComp)

**Steps:**

- [ ] Modify `handleDeleteConfirm` to delete all selected files when multiple are selected:

```typescript
const handleDeleteConfirm = useCallback(async () => {
  setDeleteConfirmOpen(false);
  try {
    const pathsToDelete = selectedPaths.size > 0 && selectedPaths.has(node.path)
      ? Array.from(selectedPaths)
      : [node.path];
    for (const p of pathsToDelete) {
      await remove(p, { recursive: true });
    }
    onMultiSelect([], 'replace');
    onReload();
  } catch (err) { console.error("删除失败:", err); }
}, [node, onReload, selectedPaths, onMultiSelect]);
```

- [ ] Update delete confirmation message to show count when multiple selected:

```tsx
message={selectedPaths.size > 1
  ? `确定要删除选中的 ${selectedPaths.size} 个项目吗？`
  : node.isDirectory
    ? `确定要删除文件夹 "${node.name}" 及其所有内容吗？`
    : `确定要删除文件 "${node.name}" 吗？`}
```

---

### Task 5: Clear selection on blur/click blank area

**Files:**
- Modify: `src/Sidebar.tsx:1078` (FileTree root div)

**Steps:**

- [ ] Add click handler on blank area to clear selection:

```tsx
onClick={(e) => {
  if (e.target === e.currentTarget) {
    setSelectedPaths(new Set());
  }
}}
```
