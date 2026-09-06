---
title: Mind Map
tags: [feature]
---

# Mind Map

Tydora has a built-in mind map feature that uses **Markmap** to automatically convert the heading hierarchy of your Markdown into an interactive mind map, helping you shift from "linear text" to a "tree structure" when reviewing content.

> [!NOTE]
> Shortcut: `Ctrl+M`. The mind map opens in a separate Tauri window and supports multiple monitors.

## How to Use

1. Press `Ctrl+M` to open the mind map.
2. View the mind map generated from the current note (or document) in the separate window.
3. Use the mouse wheel to zoom and drag the canvas to pan.
4. Click a node to collapse / expand its child nodes.

> [!TIP]
> The mind map content is taken from the document currently being edited; after saving, reopening it will reflect the latest structure.

## Feature Highlights

### Zoom and Pan

- **Wheel zoom**: Zoom in / out
- **Drag to pan**: Hold and drag on empty space to adjust the view
- **Double-click to center**: Double-click a node to center it in view

### Collapse and Expand

- Click a node to **collapse** its sub-branches
- Click a collapsed node to **expand** it
- Supports collapsing / expanding everything at once (controls are available within the window)

### Zoom Level Settings

Configurable in [[07-Settings/05-Mind-Map-Settings]]:

- Default expansion level
- Animation duration
- Node spacing
- Connection line width
- Color freeze level (the level from which different colors distinguish depth)

## Markdown Format

The mind map is generated entirely from the heading hierarchy, requiring no extra markup:

```markdown
# Root node
## Level 1 node 1
### Level 2 node 1.1
### Level 2 node 1.2
## Level 1 node 2
### Level 2 node 2.1
```

- The level-1 heading `#` serves as the root
- Level-2 `##` headings form the first level of branches, and so on
- Lists and body text do not enter the map; only headings participate

## Use Cases

- **Outline visualization**: List headings before writing a long document; the map shows the structure at a glance
- **Idea brainstorming**: Use heading levels as the skeleton for mind mapping
- **Project planning**: Expand goals → phases → tasks level by level
- **Knowledge organization**: Turn the chapters of a book note into a knowledge map

## Related Settings

- [[07-Settings/05-Mind-Map-Settings]] — Mind map and graph display parameters

## Related Documents

- [[03-Knowledge-Management/04-Knowledge-Graph]] — Knowledge graph
- [[05-Navigation-Search/03-Outline-Panel]] — Outline navigation
- [[02-Editor/01-Editing-Modes]] — Editing modes
