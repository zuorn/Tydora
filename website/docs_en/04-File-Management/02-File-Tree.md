---
title: File Tree
tags: [file-management]
---

# File Tree

The sidebar **file tree** displays the current vault's folders and files in a tree structure. It is your main entry point for browsing and managing notes.

> [!NOTE]
> "Files" is one of the sidebar's five tabs (Files / Search / Outline / Bookmarks / Tags), and can be assigned to the left or right sidebar in Settings.

## Toolbar

The top of the Files tab provides:

| Button | Description |
| --- | --- |
| New file | Create a new file in the directory of the currently selected file |
| New folder | Create a subfolder in the directory of the currently selected file |
| Collapse all | Collapse every folder |
| Expand all | Expand every folder |
| Reveal current file | Scroll to and highlight the file currently being edited |
| Sort | Switch the sort order (see below) |

## Sort Orders

Clicking the sort button cycles through these; your choice is remembered:

- File name (A–Z)
- File name (Z–A)
- Modified time (newest first)
- Modified time (oldest first)
- Created time (newest first)
- Created time (oldest first)

## Expanding and Collapsing

- Click the **arrow** in front of a folder to expand or collapse it
- The toolbar's "Collapse all / Expand all" acts on everything at once

## Context Menu

Right-clicking a file, a folder, or empty space yields slightly different menus:

### File

| Menu item | Description |
| --- | --- |
| Open in new pane | Open in a new pane within the current window |
| Open in new window | Open in a separate window |
| New file / New canvas / New folder | Create alongside the current item |
| Bookmark | Add to [[03-Knowledge-Management/07-Bookmarks]] |
| Rename | Rename in place (inline) |
| Copy | Submenu: "Create duplicate" or "Copy to clipboard" |
| Move to… | Move to another directory inside the vault |
| Delete | Delete the file (with confirmation) |
| Copy path | Copy the file's full path |
| Open in terminal | Open the [[08-Advanced-Features/05-Terminal]] in that file's directory |
| Show file location | Locate the file in the system file manager |

### Folder

New file / New canvas / New folder, Bookmark, Rename, Move to…, Delete, Copy path, Open in terminal, Show file location.

### Empty Space

New file / New canvas / New folder, Copy path, Open in terminal, Show file location.

> [!WARNING]
> Deleting a folder also deletes everything inside it, and it is **irreversible** (it does not use the system recycle bin). Please be careful.

## Multi-Select and Batch Operations

- Hold the modifier key while clicking to **multi-select** files
- Deleting a multi-selection shows a confirmation dialog asking "Delete the N selected items?"

## Drag and Drop

1. Press and hold a file or folder in the file tree.
2. Drag it onto a target folder (the target folder highlights).
3. Release to complete the move.

> [!NOTE]
> After a move or rename, Tydora rewrites the `[[WikiLink]]`s pointing at it and refreshes the index, keeping links resolvable where possible. See [[03-Knowledge-Management/05-Link-Index]].

## Inline Rename

1. Right-click and choose "Rename".
2. The file name becomes editable.
3. Type the new name and press `Enter` to confirm (`Esc` to cancel).

> [!NOTE]
> The file tree has no `F2` shortcut bound; with [[02-Editor/11-Vim-Mode]] enabled you can press `r` in the file tree to rename.

## Sidebar Search

The "Search" tab next to the file tree provides global search: type a keyword to search **file names and body content**, and it also supports `#tag keyword` syntax for tag filtering. See [[03-Knowledge-Management/06-Tags]] and [[05-Navigation-Search/01-Quick-Open]].

## Related Documents

- [[04-File-Management/03-File-Operations]] — File management in detail
- [[04-File-Management/04-File-Preview]] — File preview
- [[04-File-Management/01-Vaults]] — Vault management
- [[03-Knowledge-Management/07-Bookmarks]] — Bookmarking frequently used files
