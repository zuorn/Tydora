---
title: Link Index
tags: [knowledge-management]
---

# Link Index

The link index is a **background service** in Tydora that scans the vault and builds and maintains the relationships between all notes. It is the data foundation for [[03-Knowledge-Management/01-Wiki-Links]] autocomplete, the [[03-Knowledge-Management/03-Backlinks]] local graph, the [[03-Knowledge-Management/04-Knowledge-Graph]], [[03-Knowledge-Management/06-Tags]], and [[05-Navigation-Search/01-Quick-Open]].

> [!ABSTRACT]
> You normally never touch the link index — it works silently in the background. This page explains its mechanics, so you can understand why links "always resolve correctly."

## What It Indexes

| Index type | Description |
| --- | --- |
| Outlinks | Which notes the current note links to |
| Backlinks | Which notes link to the current note |
| File name index | File name → path mapping, powering `[[Note Name]]` resolution and autocomplete |
| Image name index | Image file name → path mapping, powering `![[image.png]]` embeds and hover previews |
| Tag index | Tag → document mapping, powering the tag list, tag graph, and `#tag` filtering |

## How It Works

### First Build

1. Scan the whole directory tree when a vault is opened
2. Skip hidden files and directories starting with `.` (such as `.git`, `.obsidian`)
3. Parse `[[links]]`, `![[embeds]]`, `#tags`, and Frontmatter `tags` in every Markdown file
4. Build the link relationship table and the tag table in one pass

### Combined Build

The link index and the tag index **share a single scan**: it first tries to restore from the local cache; if the cache is unusable it scans the vault again, batch-reads file contents, and feeds both the link parser and the tag parser at once. That way even a very large vault only reads its files once.

### Incremental Updates

- Saving a file updates only that file's links and tags
- The file system watcher (see [[04-File-Management/01-Vaults]]) detects additions, deletions, renames, and external changes, and refreshes the affected entries
- Renaming or moving a file also **rewrites the WikiLinks pointing to it**, keeping links intact

## Persistence

| Item | Description |
| --- | --- |
| Link index | `localStorage` key `zmd-link-index` |
| Owning vault | `localStorage` key `zmd-index-vault`, used to decide whether the cache is still valid |
| Tag index | `localStorage` key `zmd-tag-index` |

> [!TIP]
> When you switch vaults, if the cached index belongs to a different vault, Tydora rebuilds it automatically — data never crosses over.

## Performance

- **Batch reads**: files are read in batches during a build, avoiding the stutter of one I/O call at a time
- **Async in the background**: index building never blocks editing
- **Incremental first**: day-to-day editing triggers only small updates
- **Deferred loading**: the graph renders with WebGL and stays smooth at large node counts

> [!NOTE]
> With a very large vault, the first index build may take a moment; afterwards it is always lightweight incremental updates. During the build, link autocomplete and the graph may be temporarily incomplete — just wait a moment.

## What It Powers

- [[03-Knowledge-Management/01-Wiki-Links]] autocomplete and click-to-navigate
- [[03-Knowledge-Management/03-Backlinks]] local graph and linked references
- [[03-Knowledge-Management/04-Knowledge-Graph]] rendering
- [[03-Knowledge-Management/06-Tags]] tag list, tag graph, and filtering
- [[05-Navigation-Search/01-Quick-Open]] file search
- [[04-File-Management/02-File-Tree]] link repair after a rename or move

## Related Documents

- [[03-Knowledge-Management/01-Wiki-Links]] — WikiLink syntax
- [[03-Knowledge-Management/03-Backlinks]] — Backlinks
- [[03-Knowledge-Management/04-Knowledge-Graph]] — Knowledge graph
- [[03-Knowledge-Management/06-Tags]] — The tag system
