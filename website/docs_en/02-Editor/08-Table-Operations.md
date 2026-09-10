---
title: Table Operations
tags: [editor]
---

# Table Operations

Tydora makes table editing convenient: write them with standard Markdown syntax, or use the floating toolbar in live preview mode to visually add and remove rows and columns, adjust alignment, and merge cells.

> [!NOTE]
> Shortcut for inserting a table: `Ctrl+T`. In live preview mode, placing the cursor inside a table reveals the floating toolbar.

## Creating a Table

### Method 1: Markdown Syntax

```markdown
| Col 1 | Col 2 | Col 3 |
|-------|-------|-------|
| cell  | cell  | cell  |
```

### Method 2: Shortcut

Press `Ctrl+T` to insert a table with a default size.

### Method 3: Context Menu

1. Right-click in the editing area.
2. Choose "Insert" → "Table".

## The Table Floating Toolbar

In live preview mode, placing the cursor inside a table brings up the floating toolbar, which contains:

| Button | Description |
| --- | --- |
| Resize table | Adjust rows/columns with a grid selector |
| Align left / center / right | Set the alignment of the current column |
| Insert row above / below | Add a row |
| Insert column left / right | Add a column |
| Delete row / Delete column | Remove rows or columns |
| Merge cells / Split cell | Merge or split selected cells |
| Delete table | Remove the entire table |
| More actions | Expand the remaining actions |

> [!TIP] Pressing `Tab` inside a cell moves to the next one, and pressing `Tab` in the last cell automatically adds a row — very handy for continuous entry.

## Row and Column Shortcuts

| Action | Shortcut |
| --- | --- |
| Insert row above | `Ctrl+Shift+F` |
| Insert row below | `Ctrl+Shift+.` |
| Insert column left | `Ctrl+Shift+G` |
| Insert column right | `Ctrl+Shift+=` |
| Delete row | `Ctrl+-` |
| Delete column | `Ctrl+Shift+-` |

> [!NOTE] `Ctrl+-` is also the "split vertically" shortcut. When focus is inside a table it deletes a row; when focus is outside a table it splits the view. If you split more often than you delete rows, rebind one of them in [[07-Settings/03-Keyboard-Shortcuts]].

## Cell Alignment

Set alignment with colons in the Markdown separator row:

```markdown
| Left    | Center  | Right   |
|:--------|:-------:|--------:|
| content | content | content |
```

Shortcuts:

| Alignment | Shortcut |
| --- | --- |
| Align left | `Ctrl+Shift+L` |
| Align center | `Ctrl+Shift+C` |
| Align right | `Ctrl+Shift+R` |

## Adjusting in Source Mode

In source mode, edit the pipe table directly; `Tab` / `Shift+Tab` move between cells. Column widths are not auto-aligned — if you want tidy pipe formatting, add columns with the floating toolbar in live preview first, then fine-tune in source mode.

## Related Documents

- [[02-Editor/02-Markdown-Syntax]] — Table syntax in detail
- [[02-Editor/09-Context-Menu]] — Right-click actions
- [[07-Settings/04-Shortcut-Reference]] — Table-related shortcuts
