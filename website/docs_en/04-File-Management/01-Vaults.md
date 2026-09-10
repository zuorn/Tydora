---
title: Vaults
tags: [file-management]
---

# Vaults

Tydora uses the "vault" concept to manage note files. **Each vault is a local folder**, and every Markdown file, canvas file, subfolder, and image inside it is picked up by the file tree, the link index, the tag index, and the knowledge graph.

> [!NOTE]
> A vault records only the folder's **path**; it never moves, copies, or modifies any of your files. You can safely add an existing Markdown folder as a vault.

## Opening and Managing Vaults

There is a **vault switcher** at the bottom of the sidebar showing the current vault name, next to which you can open the **Manage Vaults** window. That window provides:

| Action | Description |
| --- | --- |
| Create vault | Create a new folder at a chosen location as a vault |
| Open local folder | Add an existing folder as a vault |
| Switch vault | Click a vault in the list to open it in a new window |
| Rename | Change the vault's display name inside Tydora |
| Move | Move the vault folder as a whole to a new location |
| Show in file manager | Locate that folder in the system file manager |
| Remove | Unregister the folder from Tydora (**without deleting files**) |

> [!WARNING]
> Removing a vault **only unregisters it from Tydora** — it does not delete the folder or files on disk. The confirmation dialog states this explicitly. To delete it for real, do so in your file manager.

## Switching Vaults

1. Click the vault switcher, or open the Manage Vaults window.
2. Select the target vault from the list.
3. The vault opens in a new window, and the file tree, link index, and graph switch along with it.

> [!TIP]
> Multiple vaults suit notes split by project, topic, or work/personal. For example: one vault for work notes, one for a personal wiki. The currently active vault is remembered and restored on the next launch.

## Multi-Vault Isolation

- Each vault maintains its own file tree, link index, tag index, and bookmarks
- When switching vaults, if the locally cached index belongs to a different vault it is rebuilt automatically, so data never crosses over
- `[[links]]` are never resolved across vaults

## Recently Opened Files

Tydora remembers recently visited files and shows them first when the [[05-Navigation-Search/01-Quick-Open]] panel opens, so you can quickly return to where you left off.

## File System Watching

Tydora watches the vault folder for external changes: when you add, rename, or delete files in your file manager, the file tree and indexes **update automatically** — no manual refresh needed.

> [!NOTE]
> Index updates triggered by external changes are incremental; only the changed parts are processed, so the editor never stutters. See [[03-Knowledge-Management/05-Link-Index]].

## Related Documents

- [[04-File-Management/02-File-Tree]] — File tree operations
- [[04-File-Management/03-File-Operations]] — File management
- [[05-Navigation-Search/01-Quick-Open]] — Finding files quickly
- [[03-Knowledge-Management/05-Link-Index]] — The link index
