---
title: Knowledge Graph
tags: [knowledge-management]
---

# Knowledge Graph

The knowledge graph visualizes the link relationships between your notes, letting you rise from "a single note" to "a knowledge network" — discovering structure, hubs, and islands.

> [!NOTE]
> Shortcut: `Ctrl+G`. The graph uses **WebGL rendering + a D3 force-directed layout**, and stays smooth even with thousands of notes.

## What It Does

- **Force-directed layout**: nodes attract and repel each other, clustering automatically
- **Node size reflects link count**: the formula is `4 + min(8, √linkCount × 0.85)`, so the more a note is referenced, the larger it grows
- **Notes with no links appear gray**, making orphans obvious at a glance
- **The currently open note is highlighted and enlarged**, so you can see "where am I"
- Supports zooming, dragging, hovering to highlight neighbors, and clicking to navigate

## How to Open It

Press `Ctrl+G`. Its behavior is controlled by settings (the "Knowledge Graph" tab in [[07-Settings/05-Mind-Map-Settings]]):

- Turn on "Open in a new window" → it appears in a separate Tauri window, which you can move to a second monitor
- Turn it off (default) → it appears as a panel in the main area

You can also search for "Open knowledge graph" in the Command Palette (`Ctrl+P`), or click "Open global graph" in the header of the Graph section on the sidebar "Outline" tab.

## Reading the Graph

### Nodes

- The circle size represents that note's link count
- Notes referenced more often are larger and more likely to be "core notes"
- Notes with no links at all are small gray dots scattered at the edges
- The currently open note is highlighted and enlarged

### Edges

- Represent [[03-Knowledge-Management/01-Wiki-Links]] relationships between notes
- Direction indicates the direction of reference (A → B means A references B)
- Edge opacity is adjustable in Settings

### Layout

- The force-directed graph finds a balanced layout on its own
- Densely connected notes cluster together
- Isolated (unlinked) notes are pulled slightly toward the center so they don't fly off the canvas

## Interactions

| Action | Effect |
| --- | --- |
| Scroll wheel | Zoom the view (the zoom range is bounded to prevent over-zooming in or out) |
| Drag a node | Move a single node; it rejoins the force simulation when released |
| Drag empty space | Pan the whole canvas |
| Hover a node | Highlight that node and its direct neighbors, dimming the rest |
| Click a node | Open the corresponding note |

> [!TIP]
> Hover highlighting is a great way to "follow the thread": rest the mouse on a core node and its ring of neighbors appears immediately.

## Use Cases

- Survey the **overall structure** of your knowledge network
- Find the **core notes** (the biggest nodes)
- Spot **orphan notes** (gray, unlinked) and go back to connect them
- Understand the threads and clusters of your knowledge system

## Related Settings

- [[07-Settings/05-Mind-Map-Settings]] — Node size, label font size, link distance, repulsion strength, edge opacity, and open-in-new-window for the knowledge graph

## Related Documents

- [[03-Knowledge-Management/01-Wiki-Links]] — WikiLink syntax
- [[03-Knowledge-Management/03-Backlinks]] — Local graph and linked references
- [[03-Knowledge-Management/05-Link-Index]] — How the link index works
- [[03-Knowledge-Management/06-Tags]] — The tag graph (another relational view)
- [[08-Advanced-Features/02-Mind-Map]] — Mind maps
