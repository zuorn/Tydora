---
title: Tags
tags: [knowledge-management]
---

# Tags

Tags are the second way to relate notes besides WikiLinks. Links express "these two notes point at each other explicitly"; tags express "these notes belong to the same topic." The two complement each other and together form the skeleton of your knowledge network.

> [!NOTE]
> The sidebar "Tags" tab offers two views — a **list** and a **tag graph** — and is placed in the right sidebar by default.

## Creating Tags

### Inline Tags in the Body

Write `#tagname` directly in the body:

```markdown
Read a chapter of #reading today, and jotted down a few points on #methodology.
```

Typing `#` triggers **tag autocomplete**: it lists tags that already exist in the vault — use `↑` / `↓` to choose, `Enter` or `Tab` to confirm. If nothing matches, pressing `Enter` creates that new tag.

### Frontmatter Tags

You can also declare them in the file's metadata:

```yaml
---
tags: [reading, methodology]
---
```

Both forms are **exactly equivalent** and both feed the tag index. See [[02-Editor/07-Frontmatter]].

## The Tags Tab

### List View

- Lists every tag in the current vault, **sorted by usage count** — the most frequent tags come first
- A filter box at the top lets you narrow down by keyword
- Clicking any tag → switches to the "Search" tab and fills `#tagname` into the search box, listing all documents carrying that tag

### Tag Graph

Click the toggle in the tab header to switch to the **tag graph**:

- Nodes are tags; **tags that appear in the same document are connected** (co-occurrence)
- Connected tags tend to appear together, which helps you spot topic clusters
- Hovering or clicking a node also starts a global filter

> [!TIP]
> The tag graph answers "which topics always show up together," while the [[03-Knowledge-Management/04-Knowledge-Graph]] answers "which notes reference each other." Compare the two and you can see both the **topic structure** and the **reference structure**.

## Filtering Notes with Tags

Tag filtering is available from several entry points:

| Entry point | How to use it |
| --- | --- |
| Sidebar "Search" tab | The search box supports `#tag keyword` syntax: first take the documents carrying that tag, then filter by the keyword |
| [[05-Navigation-Search/01-Quick-Open]] | The input box also supports `#tag keyword` |
| Tags tab / tag graph | Clicking a tag fills the search box automatically |

> Tags support hierarchical prefix matching — for example, `#tech` can match tags like `#tech/frontend`.

## Tips

- **Use links for specific references and tags for topical belonging** — don't let one substitute for the other
- **Keep the number of tags under control**: too fine and tags degenerate into links; too coarse and they lose filtering value
- **Review the tag graph periodically**: tags stranded in a corner usually mean inconsistent naming and are worth merging

## Related Documents

- [[03-Knowledge-Management/01-Wiki-Links]] — Bidirectional links
- [[03-Knowledge-Management/04-Knowledge-Graph]] — The note relationship graph
- [[03-Knowledge-Management/05-Link-Index]] — How the tag index is built
- [[02-Editor/07-Frontmatter]] — `tags` in Frontmatter
- [[05-Navigation-Search/01-Quick-Open]] — Filtering files by tag
