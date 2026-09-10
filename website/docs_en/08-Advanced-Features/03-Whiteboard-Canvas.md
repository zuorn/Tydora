---
title: Whiteboard Canvas
tags: [features]
---

# Whiteboard Canvas

The whiteboard canvas is built on **React Flow** and provides an **infinite canvas** where you can freely arrange ideas, notes, images, media, and links as nodes — like spreading things out on paper, except it extends forever and connects with a line.

> [!NOTE]
> Canvas files are saved with the `.canvas` extension, using the Obsidian-compatible **JSON Canvas** format.

## Opening a Canvas

- Right-click in the file tree → "New canvas" to create and open a new whiteboard
- Click an existing `.canvas` file in the file tree
- Canvases can also open in their own window, handy for a second monitor

Where new canvases are stored is determined by [[07-Settings/07-Canvas-Settings]] (vault root / current folder / a specified attachment folder).

## Node Types

The canvas is compatible with the JSON Canvas spec and supports **7 node types**:

| Type | Description |
| --- | --- |
| **Text card (text)** | A freely editable text block using TipTap live rendering; supports Markdown syntax |
| **Note card (note)** | References a Markdown file in the vault, showing the note content and interworking with the WikiLink system |
| **File reference (file)** | References a file in the vault (including images, PDFs, etc.); images display directly |
| **Media (media)** | Video / audio and similar media files, shown with a player or an icon |
| **Canvas (canvas)** | Nested reference to another canvas file |
| **Link (link)** | Embeds an external URL, opened in the browser when clicked |
| **Group (group)** | Groups several nodes together, with a configurable background and label |

> [!TIP]
> **Drag an image file into the canvas** to create an image node.

## Toolbar

The canvas top toolbar provides three add buttons (click, or drag onto the canvas to place):

| Tool | Description |
| --- | --- |
| Add card | Create a text card |
| Add note | Create a note card (chosen from the vault) |
| Add media file | Insert an image / video / audio / canvas and similar media |

## Context Menu

Right-click on empty canvas space:

| Command | Description |
| --- | --- |
| Add card | Create a text card |
| Add note | Create a note card |
| Add media file | Insert media |
| Add link | Enter a URL to create a link node |
| Add group | Create a group container |
| Undo / Redo | Operation history |

## Canvas Operations

| Action | Description |
| --- | --- |
| Scroll wheel | Zoom (the bounds are configurable in Settings) |
| Drag empty space | Pan the canvas |
| Drag a node | Move it; with snapping enabled, alignment guides appear |
| Select a node | Handles appear to resize, edit content, and draw connections |
| Minimap | A minimap can be shown in a corner (enabled in Settings) |

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+Shift+Z` | Redo (alternate) |
| `Ctrl+C` / `Ctrl+V` | Copy / paste nodes |
| `Ctrl+A` | Select all |
| `Esc` | Deselect |
| Arrow keys | Move the selected node |

## File Format

The canvas uses the **JSON Canvas** format (`.canvas`), compatible with Obsidian's whiteboard format:

- **Cross-platform compatible**: interoperable with tools that support the format
- **Version-controllable**: plain-text JSON, well suited to Git
- **Human-readable**: inspect and hand-edit it directly
- **Relative paths**: referenced file paths are relative to the vault root, so they stay valid after moving the canvas file

## Separate Windows

A canvas can open in its own Tauri window:

- Supports multiple monitors — put the canvas on a second screen
- Independent operation does not disturb editing in the main window
- Window position and size are saved and restored automatically

## Related Settings

- [[07-Settings/07-Canvas-Settings]] — Default location, snapping, minimap, and zoom range

## Related Documents

- [[04-File-Management/02-File-Tree]] — File management
- [[03-Knowledge-Management/01-Wiki-Links]] — Bidirectional links
- [[03-Knowledge-Management/02-Embedded-Content]] — Canvas thumbnail previews
- [[08-Advanced-Features/01-Publish-Website]] — How canvases appear on a published site
