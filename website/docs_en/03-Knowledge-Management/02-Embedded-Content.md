---
title: Embedded Content
tags: [knowledge-management]
---

# Embedded Content

Embeds let you display an **image or a canvas** directly inside the current note, instead of just placing a link to jump to it. They are commonly used to keep images in one place, or to place assets next to the text they belong to.

> [!NOTE]
> The syntax is a WikiLink prefixed with `!`: `![[filename]]`. What Tydora supports is **Obsidian-style image embedding**.

## Embedding Images

```markdown
![[image.png]]
```

An image in the vault is **displayed inline** right where the embed is. Resolution rules:

1. First look up the **file name** across the vault (case-insensitive)
2. If not found, resolve it as a path relative to the current file
3. Vault-root paths starting with `/` also work, e.g. `![[/assets/image.png]]`

### Specifying a Width

Add a `|` after the filename to set the display width in pixels:

```markdown
![[image.png|400]]
```

> [!TIP]
> In live preview mode you can also drag the image edge to resize it; the width is written back into the `![[...|width]]` syntax automatically.

## Standard Markdown Images

Besides the wiki embed syntax, the standard form works too:

```markdown
![Image description](assets/image.png)
```

> The difference: `![[image.png]]` looks up the image by **file name** anywhere in the vault, so it keeps working after you move the note; `![](relative/path)` depends on the path and breaks if the path changes. For images across directories, the wiki embed syntax is recommended.

## Hover Preview for Notes

Move your mouse over any `[[WikiLink]]` and a **preview card** appears:

- A regular note: shows the rendered body
- A `.canvas` whiteboard file: shows a thumbnail
- If the target doesn't exist, a notice is shown

Preview cards support nested hovering, so you can follow links deeper without actually opening files. See [[03-Knowledge-Management/01-Wiki-Links]].

## Use Cases

- **Centralized images**: keep images in `assets/` and reference them with `![[image.png]]`
- **Assets next to their context**: when writing a tutorial, paste the screenshot right beside the step
- **Quick canvas review**: use hover preview to revisit a whiteboard's structure

## Notes and Limitations

- `![[Note Name]]` does **not** expand into another note's body — to read that note, use the hover preview, or use `[[Note Name]]` to jump to it
- Video, audio, and PDF should be opened via standard links (see [[04-File-Management/04-File-Preview]]); inline playback is not supported
- Where images are stored and how they are named is governed by [[07-Settings/06-Image-Settings]]

## Related Documents

- [[03-Knowledge-Management/01-Wiki-Links]] — WikiLink syntax
- [[04-File-Management/04-File-Preview]] — Previewing media files
- [[07-Settings/06-Image-Settings]] — Image storage and naming
- [[08-Advanced-Features/03-Whiteboard-Canvas]] — Canvas files
