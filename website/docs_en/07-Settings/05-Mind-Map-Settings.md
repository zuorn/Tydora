---
title: Mind Map and Knowledge Graph Settings
tags: [settings]
---

# Mind Map and Knowledge Graph Settings

This page configures the display parameters for the [[08-Advanced-Features/02-Mind-Map]] and the [[03-Knowledge-Management/04-Knowledge-Graph]]. They are two **independent** settings tabs:

- The "Mind map" tab — the Markmap mind map
- The "Knowledge graph" tab — the D3 force-directed knowledge graph

> [!NOTE]
> Press `Ctrl+,` to open Settings, then pick the corresponding tab in the list on the left.

## Mind Map Settings

Rendered with Markmap; adjustable parameters:

| Setting | Description | Default |
| --- | --- | --- |
| Max node width | Node text wraps once it exceeds this width | 200 |
| Horizontal spacing | Horizontal distance between sibling nodes | 80 |
| Vertical spacing | Vertical distance between parent and child nodes | 5 |
| Link width | Thickness of the lines between nodes | 1.5 |
| Initial expand depth | How many levels are expanded when the mind map opens (can be "all") | 2 |
| Animation duration | Animation time for expanding / collapsing nodes (ms) | 300 |
| Color freeze depth | The level from which fixed colors are used (can be "no freeze") | No freeze |

> [!TIP]
> With many nodes and deep structure, lowering "Initial expand depth" lets the map open in a condensed state, then you expand the branches you care about.

## Knowledge Graph Settings

Based on a D3 force-directed layout plus WebGL rendering; adjustable parameters:

| Setting | Description | Default |
| --- | --- | --- |
| Open in a new window | When on, `Ctrl+G` and the toolbar button open the graph in a separate window | Off |
| Max node size | The maximum size of a node in the graph | 15 |
| Label font size | Text size of node labels | 11 |
| Link distance | The ideal distance between nodes | 160 |
| Repulsion strength | The repulsive force between nodes; **a larger negative value spreads nodes further apart** | -200 |
| Edge opacity | How visible the links are | 0.8 |

> [!TIP]
> With many links in the vault, increasing the absolute value of "Repulsion strength" makes clusters clearer; with sparse links, decreasing it keeps nodes from flying apart. When nodes are too dense to read labels, lower "Label font size" or raise "Link distance".

## Related Documents

- [[08-Advanced-Features/02-Mind-Map]] — Using mind maps
- [[03-Knowledge-Management/04-Knowledge-Graph]] — The knowledge graph
- [[07-Settings/01-General-Settings]] — Basic settings
