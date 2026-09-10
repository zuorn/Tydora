---
title: Outline Panel
tags: [navigation-search]
---

# Outline Panel

The sidebar "Outline" tab shows the **heading structure of the current document**, letting you see the skeleton of a piece at a glance and jump to any section. It also doubles as a "relationship overview" for the current note: its top sections show the local graph and linked references as needed.

> [!NOTE]
> "Outline" is one of the sidebar's five tabs (Files / Search / Outline / Bookmarks / Tags), and is placed in the **right sidebar** by default.

## Panel Structure

After opening the "Outline" tab, the page shows several sections from top to bottom depending on the current note:

| Section | Contents | When it appears |
| --- | --- | --- |
| **Graph** | The current note's **local graph** (depth-1 neighborhood: the note + direct neighbors + the edges among them) | When the note has incoming or outgoing links |
| **On this page** | The current note's **heading outline** | Always |
| **Linked references** | The list of **WikiLink outlinks** in the current note (deduplicated, in order of appearance) | When the note contains `[[...]]` outlinks |

> For how to use the local graph and linked references, see [[03-Knowledge-Management/03-Backlinks]].

## Outline (On this page)

### What It Does

- Automatically parses Markdown headings (levels 1–6)
- **Indents by heading level** so the structure is immediately clear
- Clicking any heading scrolls the editor to that position
- When a document has no headings, it shows the hint "Use # heading syntax to create an outline"

### Heading Levels

The outline supports all six heading levels:

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

## The Graph Section

The section header has two buttons:

| Button | Description |
| --- | --- |
| Expand / collapse the local graph | Show a small neighborhood graph of the current note inside the sidebar |
| Open the global graph | Open the full [[03-Knowledge-Management/04-Knowledge-Graph]] |

> [!TIP]
> If a note has neither outlinks nor any note referencing it (an orphan), the Graph section is hidden entirely — which is itself a signal that it's time to add some links.

## Auto-Expand on Startup

With "Expand outline on startup" enabled in the "Behavior" group of [[07-Settings/01-General-Settings]], double-clicking a `.md` file to open it in this app automatically expands the sidebar and switches to the outline view.

## Use Cases

- **Navigating long documents**: with thousands of words, the outline beats scrolling by a wide margin
- **Checking structure**: outline before you write, then verify completeness as you go
- **Jumping to sections**: one click, no manual searching

> [!TIP]
> The outline shows "the structure of a single piece," while the [[03-Knowledge-Management/04-Knowledge-Graph]] shows "the relationships between notes" — the two complement each other.

## Related Documents

- [[02-Editor/02-Markdown-Syntax]] — Heading syntax
- [[03-Knowledge-Management/03-Backlinks]] — Local graph and linked references
- [[03-Knowledge-Management/04-Knowledge-Graph]] — The global knowledge graph
- [[04-File-Management/02-File-Tree]] — File tree navigation
