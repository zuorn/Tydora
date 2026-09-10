---
title: Mind Map
tags: [features]
---

# Mind Map

Tydora has a built-in mind map feature powered by **Markmap** that converts Markdown heading and list hierarchy into an interactive mind map, so you can switch from "linear text" to "tree structure" to examine your content.

> [!NOTE]
> Shortcut: `Ctrl+M`. The mind map opens in a **separate Tauri window**, which you can move to a second monitor.

## How to Use It

1. Press `Ctrl+M` to open the mind map.
2. The separate window reads the **document you are currently editing** and generates the map live.
3. Use the toolbar or the mouse to adjust the view; click nodes to collapse or expand branches.

> [!TIP]
> The map updates as you edit the body (with debouncing), so there is no manual refresh.

## Toolbar

The window's top toolbar provides:

| Button | Description |
| --- | --- |
| Fit view | Auto-zoom and center so the whole map fits the viewport |
| Zoom in / out | Manually adjust the zoom level |
| Expand depth | Choose the default expansion depth (all / level N) |
| Export as image | Export the current map as an SVG image |
| Copy image | Copy the map to the clipboard as a PNG, ready to paste into a chat or document |

## Interactions

| Action | Effect |
| --- | --- |
| Right-click drag | Pan the canvas |
| Scroll wheel | Zoom |
| Arrow keys | Move focus between nodes |
| `Enter` / `Space` | Collapse or expand the current node |
| Click a node | Collapse / expand its child branches |

## Markdown Format

The mind map is generated from **heading hierarchy** and **list hierarchy**, with no extra markup:

```markdown
# Root node
## First-level node 1
### Second-level node 1.1
### Second-level node 1.2
## First-level node 2
### Second-level node 2.1
```

- Heading 1 `#` becomes the root
- `##` becomes the first branch level, and so on
- Lists under a heading become child nodes
- Plain paragraphs do not appear in the map

## Related Settings

Adjustable in the "Mind map" tab of [[07-Settings/05-Mind-Map-Settings]]:

- Max node width
- Horizontal / vertical spacing
- Link width
- Initial expand depth
- Animation duration
- Color freeze depth

## Use Cases

- **Visualizing an outline**: list headings before writing a long piece and see the structure at a glance
- **Divergent thinking**: use heading levels as the skeleton of a brainstorm
- **Project planning**: expand goal → phase → task level by level
- **Knowledge organization**: turn a book note's chapters into a knowledge map

> [!TIP]
> For freer hand-drawn diagrams, you can also use Mermaid's `mindmap` syntax — see [[02-Editor/05-Mermaid-Diagrams]].

## Related Documents

- [[07-Settings/05-Mind-Map-Settings]] — Mind map display parameters
- [[03-Knowledge-Management/04-Knowledge-Graph]] — The knowledge graph (relationships between notes)
- [[05-Navigation-Search/03-Outline-Panel]] — Outline navigation
