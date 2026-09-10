---
title: Wiki Links
tags: [knowledge-management]
---

# Wiki Links

Wiki links are the heart of knowledge management in Tydora: `[[Note Name]]` creates a **bidirectional link** between notes, weaving scattered pages into a network. The syntax matches Obsidian's.

> [!NOTE]
> Typing `[[` triggers autocomplete — type a keyword to filter the target notes. Link resolution relies on the [[03-Knowledge-Management/05-Link-Index]].

## Basic Syntax

### Link to a Note

```markdown
[[Note Name]]
```

Renders as a clickable link that jumps to that note.

### Link with an Alias

```markdown
[[Note Name|Display text]]
```

Shows "Display text" but points to "Note Name". Handy for natural references inside a sentence.

### Link to a Heading

```markdown
[[Note Name#Heading]]
```

Jumps straight to the specified heading inside the target note.

### Link with a Path

When several notes share the same name, use a path to disambiguate:

```markdown
[[Folder/Note Name]]
[[Note Name.md]]
[[My Board.canvas]]
```

> [!TIP]
> Without a path, Tydora first does a **case-insensitive match on the file name**; if multiple files share that name, it picks the one with the shortest path. To be exact, write the relative path.

## How to Use It

1. Type `[[` in the editor.
2. Keep typing the note name (fuzzy matching is supported).
3. Pick the target from the autocomplete list.
4. Press `Enter` to confirm and the link is inserted.

> [!TIP]
> The candidate list shows the matching file path, so notes with duplicate names can be told apart. If there are **no matches at all**, pressing `Enter` will **create a new note** with the name you typed and open it.

## Autocomplete

After you type `[[`, Tydora pops up a list of matching notes:

- **Fuzzy search**: type part of a keyword to filter
- Live updates as you type
- Keyboard control: `↑` / `↓` (or `Ctrl+K` / `Ctrl+J`) to move, `Enter` to confirm, `Esc` to close

> In live preview mode, the context menu's "Insert → WikiLink" also inserts `[[` and brings up the autocomplete list.

## Linking to a Note That Doesn't Exist

If a link points to a note that doesn't exist yet, **clicking it creates** a note of that name (containing `# Note Name`) and opens it. This makes the "link first, write later" workflow very smooth.

## Hover Preview

Move your mouse over a WikiLink and a **preview card** appears:

- A regular note: shows the rendered body content
- A `.canvas` whiteboard file: shows a thumbnail
- If the target doesn't exist, it says so

> [!TIP]
> The preview card supports hovering through its own links, so you can drill down layer by layer without actually navigating there.

## Automatic Repair on Rename

When you **rename or move** a note in the file tree, Tydora scans the whole vault, rewrites every `[[old name]]` reference to the new name, and refreshes the link index. You never have to fix broken links by hand.

## Embedded Content

Prefixing `[[` with `!` inserts an image (Obsidian embed syntax):

```markdown
![[image.png]]
![[image.png|400]]
```

> See [[03-Knowledge-Management/02-Embedded-Content]].

## Backlinks and the Graph

Every `[[Note Name]]` relationship feeds the link index and can be visualized in the graph. To see "who references me," see [[03-Knowledge-Management/03-Backlinks]]; for the network view, see [[03-Knowledge-Management/04-Knowledge-Graph]].

## Related Documents

- [[03-Knowledge-Management/02-Embedded-Content]] — Image embeds and hover previews
- [[03-Knowledge-Management/03-Backlinks]] — Backlinks and the local graph
- [[03-Knowledge-Management/04-Knowledge-Graph]] — The knowledge graph
- [[03-Knowledge-Management/05-Link-Index]] — How the link index works
