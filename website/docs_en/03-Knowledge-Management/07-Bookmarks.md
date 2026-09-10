---
title: Bookmarks
tags: [knowledge-management]
---

# Bookmarks

Bookmarks are for collecting **files or folders you use often**, lifting them out of deep directory trees into the sidebar for one-click access. Unlike [[03-Knowledge-Management/06-Tags]], bookmarks are a purely personal way of organizing things and are not written into note content.

> [!NOTE]
> The sidebar "Bookmarks" tab is placed in the **left sidebar** by default. Bookmarks are saved per vault, so switching vaults switches to that vault's bookmark set.

## Adding a Bookmark

1. Right-click a file or folder in the file tree.
2. Choose "Bookmark".
3. In the "Add bookmark" dialog, fill in:

| Field | Description |
| --- | --- |
| Path | Filled in automatically and not editable |
| Title | A custom display name; **leave empty to show the original file name** |
| Group | Choose an existing group, or click "+ New" to create one |

4. Click "Save".

> [!TIP]
> The "More" menu at the top of the editor also has "Bookmark", so you can bookmark the current note without switching back to the file tree.

## The Bookmarks Panel

Open the sidebar "Bookmarks" tab to see all bookmarks, collapsed by **group**:

- Items without a group fall under "Ungrouped"
- Clicking a bookmark opens the corresponding file
- Dragging a bookmark moves it **across groups** — drop it on a group header to assign it there
- With no vault open the panel shows a hint; with no bookmarks in the vault it shows an empty-state guide

## Context Menu

### On a Bookmark Item

| Command | Description |
| --- | --- |
| Open in new window | Open the file in a separate window |
| Edit title | Change the bookmark's display name (empty restores the original file name) |
| Remove bookmark | Remove it from bookmarks |
| Copy path | Copy the file / folder's absolute path |

### On a Group

| Command | Description |
| --- | --- |
| Rename | Change the group name |
| Delete group | Delete the group (the bookmarks inside are reassigned) |

## Tips

- Bookmark high-frequency entry points such as an "index page / to-do / project home"
- Create groups by purpose, e.g. "Writing", "Projects", "Reference"
- Bookmarks record only paths and **never copy files**; if a file is moved or deleted, the bookmark may stop working

## Related Documents

- [[04-File-Management/02-File-Tree]] — The file tree and its context menu
- [[04-File-Management/03-File-Operations]] — File management
- [[03-Knowledge-Management/06-Tags]] — Organizing notes by topic
- [[05-Navigation-Search/01-Quick-Open]] — Recently visited files
