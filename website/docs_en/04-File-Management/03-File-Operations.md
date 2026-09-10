---
title: File Operations
tags: [file-management]
---

# File Operations

Tydora offers complete file management from the file tree and the editor: create, rename, delete, move, copy, open in terminal, and more.

> [!NOTE] The vast majority of operations are available from the file tree's context menu. See [[04-File-Management/02-File-Tree]].

## Creating

### New File

1. Right-click the target directory (or the root) in the file tree and choose "New file".
2. Type a filename, e.g. `note.md` (`.md` is optional — Tydora adds it).
3. Press `Enter` to confirm, and the editor opens the new file.

### New Folder

Right-click → "New folder" → type a name → `Enter`.

### New Canvas

Right-click → "New canvas" → type a name, which creates a `.canvas` file and opens the whiteboard in the main area. The default canvas location is configurable in [[07-Settings/07-Canvas-Settings]].

> [!TIP] If a file or folder of the same name already exists, Tydora generates a non-conflicting name instead of overwriting existing content.

## Renaming

1. Right-click a file or folder → "Rename".
2. The name becomes inline-editable.
3. Type the new name and press `Enter` (`Esc` to cancel).

> [!TIP] After renaming a note file, Tydora **automatically rewrites** the `[[WikiLink]]`s pointing at it so links don't break. See [[03-Knowledge-Management/05-Link-Index]].

## Deleting

1. Right-click a file or folder → "Delete".
2. Confirm in the dialog. When multiple items are selected, the dialog shows how many will be deleted.

> [!WARNING] Deletion is **irreversible**, does not use the system recycle bin, and removes a folder's entire contents recursively. Back up important files, or keep them under version control.

## Moving to Another Directory

1. Right-click → "Move to…".
2. Pick the target folder in the directory picker that appears.
3. On confirm the file moves, and WikiLinks pointing at it are repaired.

You can also **drag** a file or folder directly onto a target directory in the file tree.

## Copying

The context menu's "Copy" contains two subitems:

| Subitem | Effect |
| --- | --- |
| Create duplicate | Create a copy in the **same directory** (duplicate names are handled automatically) |
| Copy to clipboard | Copy the file itself to the system clipboard, so you can paste it in your file manager |

## Copying the Path

Right-click → "Copy path" writes the file's or folder's full path to the clipboard — handy for referencing it in a terminal, a publish config, or a chat.

## Opening in the Terminal

Right-click → "Open in terminal" opens an [[08-Advanced-Features/05-Terminal]] pane in that file's directory — useful when you need to process assets from the command line.

## Showing the File Location

Right-click → "Show file location" locates and selects the file in the system file manager.

## Opening in a New Window / Pane

| Command | Effect |
| --- | --- |
| Open in new pane | Add an editor pane inside the current window (Markdown files only) |
| Open in new window | Open a separate editor window |

> For details on splits and pane management, see [[05-Navigation-Search/04-Split-and-Panes]].

## Saving

- Manual save: `Ctrl+S`
- Auto-save: on by default; the file is written to disk about 1 second after you stop typing (turn it off in the "Behavior" group of [[07-Settings/01-General-Settings]])

> [!NOTE] An unsaved file (for example one created through a "Save As" flow) prompts you to save, discard, or cancel when you close the window.

## Related Documents

- [[04-File-Management/02-File-Tree]] — File tree operations
- [[04-File-Management/04-File-Preview]] — File preview
- [[04-File-Management/01-Vaults]] — Vault management
- [[03-Knowledge-Management/05-Link-Index]] — Link updates after renaming
- [[08-Advanced-Features/05-Terminal]] — The built-in terminal
