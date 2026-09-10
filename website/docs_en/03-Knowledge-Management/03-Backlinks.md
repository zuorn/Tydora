---
title: Backlinks
tags: [knowledge-management]
---

# Backlinks

Backlinks answer "**who references me**" — which notes link to the current one. They invert "who I reference," and they are a key perspective for discovering hidden connections between notes.

> [!NOTE]
> Tydora has **no standalone backlinks panel**. Backlink information is surfaced in two ways: the **local graph** at the top of the sidebar "Outline" tab (incoming and outgoing links together), and the global [[03-Knowledge-Management/04-Knowledge-Graph]] opened with `Ctrl+G`.

## Where to Look

Open any note and switch to the sidebar "Outline" tab; the top of the page shows several sections depending on the current note:

| Section | Contents | When it appears |
| --- | --- | --- |
| **Graph** | The current note's **local graph**: the note plus all direct neighbors (incoming and outgoing links) and the edges among them | When the note has incoming or outgoing links |
| **On this page** | The heading outline of the current note | Always |
| **Linked references** | The list of **WikiLink outlinks** from the current note (deduplicated, in order of appearance) | When the note contains `[[...]]` outlinks |

> [!TIP]
> In other words: to see "who references me," look at the **Graph** section (it draws both incoming and outgoing links); to see "who I reference," look at the **Linked references** section.

## The Local Graph

The Graph section shows the **depth-1 neighborhood**:

- The current note is in the center
- One ring out are its direct neighbors — both the notes it links to and the notes that link to it
- Edges represent link relationships between notes

The section header has two buttons:

- **Expand / collapse the local graph** (icon button): expands to show this small graph right in the sidebar
- **Open the global graph**: jumps to the full [[03-Knowledge-Management/04-Knowledge-Graph]]

> [!NOTE]
> If a note has neither outlinks nor any note referencing it (an orphan), the Graph section is hidden entirely and only the outline remains — which is itself a signal that it's time to add some links.

## The Global View

Press `Ctrl+G` to open the global graph and observe references at the scale of the entire vault: node size reflects how often a note is referenced, and isolated gray nodes are the ones that still need links. See [[03-Knowledge-Management/04-Knowledge-Graph]].

## Use Cases

- **Discover hidden connections**: you may have forgotten that some note references the current content — the local graph brings it back
- **Gauge importance**: notes referenced more often tend to be more central
- **Spot orphan notes**: if the Graph section doesn't appear, the note hasn't joined the knowledge network yet
- **Plan new links**: follow neighboring nodes to connect related notes

## The Link Index

Backlinks are powered by the [[03-Knowledge-Management/05-Link-Index]] service. Tydora builds and maintains link relationships in the background, refreshing incrementally after a save or an external change — no manual action needed.

## Related Documents

- [[03-Knowledge-Management/01-Wiki-Links]] — WikiLink syntax
- [[03-Knowledge-Management/05-Link-Index]] — How the link index works
- [[03-Knowledge-Management/04-Knowledge-Graph]] — Knowledge graph visualization
- [[03-Knowledge-Management/06-Tags]] — Using tags to complement link-based associations
