---
title: Export and Copy
tags: [features]
---

# Export and Copy

Once a note is written, Tydora offers several ways to **export and copy** it — into documents, images, or social platforms. All commands live in the "Export" category of the Command Palette (`Ctrl+P`), and can also be reached from the "Copy & Export" entry at the top of the editor.

> [!NOTE]
> Export relies on the editor's **rendered output**, so it must run in **live preview (IR) mode**. Some exports fail in source mode — press `Ctrl+/` to switch to IR.

## Format Overview

| Format | Output | Description |
| --- | --- | --- |
| **Markdown** | Clipboard | Copies the raw Markdown text, ready to paste into another editor |
| **WeChat** | Clipboard | Copies HTML rich text suited to the WeChat Official Account editor; images are handled along the way |
| **PDF** | File | Generates a PDF document |
| **Long image (PNG)** | File | Renders the entire note as one tall image |
| **HTML** | File | Generates a self-contained HTML document with inline styles and inline images — a single shareable file |
| **Word (docx)** | File | Generates a Word document; export forces a light theme, and Mermaid diagrams are rasterized into images |
| **Social cards (Xiaohongshu)** | Image set | Paginated into cards, producing a set of images suited to social platforms |

## Workflow

1. Press `Ctrl+P` to open the Command Palette and search for "export", or type the target format directly (e.g. `pdf`, `word`, `xiaohongshu`).
2. Choose the corresponding command.
3. A preview dialog appears so you can check the result first:
   - **Copy to clipboard** — for formats meant to be pasted directly, such as Markdown / WeChat
   - **Save** — choose a location and write the file
4. After a successful save, the dialog shows the saved path.

> [!TIP]
> The "Copy & Export" button in the editor's top toolbar offers the same format list for mouse users; frequently used items can also be **pinned to the toolbar** for one-click access.

## Format Details

### Markdown / WeChat

These two **write no file** — they only put content on the clipboard:

- **Markdown**: the raw Markdown text
- **WeChat**: rendered rich text that keeps its styling when pasted into the WeChat editor

### HTML

Generates a **self-contained** single HTML file:

- All styles are inlined; no external CSS is required
- Images are inlined as data URLs
- Great as an email attachment, or to upload to any static space

### PDF / Long Image

- **PDF**: suited to printing and formal archiving
- **Long image**: the whole note rendered as one PNG, handy for sharing long-form content in chat apps or on social platforms

### Word

Exporting to Word applies a few adaptations:

- Forces a light theme, so a dark background doesn't become unreadable in Word
- Mermaid diagrams are **rasterized** into images so they display correctly in Word
- Task list checkboxes are replaced with graphics so the checked state isn't lost

### Social Cards

Content is automatically **paginated** into multiple cards and exported as a set of image files (with sequence numbers in the names), suited to image-centric platforms.

## Related Documents

- [[08-Advanced-Features/01-Publish-Website]] — Publishing an entire vault as a website
- [[02-Editor/03-Code-Blocks]] — How code appears in exports
- [[02-Editor/05-Mermaid-Diagrams]] — How diagrams appear in exports
- [[05-Navigation-Search/02-Command-Palette]] — Finding export commands
