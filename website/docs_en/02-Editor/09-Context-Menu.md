---
title: Context Menu
tags: [editor]
---

# Context Menu

**Right-clicking** in the editing area opens a context menu that gathers the most common formatting and insertion commands. It complements the toolbar and keyboard shortcuts, and is a fast route for mouse-driven users.

> [!NOTE] Most commands in the context menu also have shortcuts; the default binding is shown in parentheses. See the full list in [[07-Settings/04-Shortcut-Reference]].

## Menu Structure

The menu consists of three rows of icon buttons plus two submenus:

| Section | Contents |
| --- | --- |
| Row 1 · Clipboard | Cut, copy, paste, delete |
| Row 2 · Inline formatting | Bold, italic, strikethrough, inline code, link |
| Row 3 · Block formatting | Quote, bullet list, ordered list, task list, highlight |
| Submenu · Heading | Heading levels 1–6, paragraph |
| Submenu · Insert | Image, horizontal rule, table, code block, formula block, WikiLink |

## Clipboard

- **Cut** / **Copy** / **Paste** — standard clipboard operations
- **Delete** — delete the current selection or the block the cursor is in

## Formatting

| Command | Default shortcut | Description |
| --- | --- | --- |
| Bold | `Ctrl+B` | Wrap the selection in bold |
| Italic | `Ctrl+I` | Wrap the selection in italics |
| Strikethrough | `Ctrl+D` | Wrap the selection in strikethrough |
| Inline code | `Ctrl+E` | Wrap the selection in `inline code` |
| Link | `Ctrl+K` | Open the "Insert link" dialog to fill in link text and URL |
| Highlight | `Ctrl+=` | Wrap the selection in `==highlight==` |

## Headings

With text selected (or the cursor in a paragraph), quickly set a level 1–6 heading, or convert back to a normal paragraph.

> Shortcuts: `Ctrl+1` through `Ctrl+6`, and `Ctrl+0` for a paragraph.

## Lists and Quotes

| Command | Default shortcut |
| --- | --- |
| Quote | `Ctrl+;` |
| Bullet list | `Ctrl+L` |
| Ordered list | No default binding |
| Task list | `Ctrl+J` |

> [!TIP] "Ordered list" has no shortcut bound by default (`Ctrl+O` belongs to "Quick Open"). To add one, assign it yourself in [[07-Settings/03-Keyboard-Shortcuts]].

## Insert Submenu

| Command | Default shortcut | Description |
| --- | --- | --- |
| Image | None | Open a file picker and insert an image (stored per the rules in [[07-Settings/06-Image-Settings]]) |
| Horizontal rule | `Ctrl+Shift+H` | Insert `---` |
| Table | `Ctrl+T` | Insert a table |
| Code block | `Ctrl+U` | Insert a code block |
| Formula block | None | Open the formula dialog and insert a block formula on confirm |
| WikiLink | None | Insert `[[` and immediately bring up the autocomplete list |

> [!TIP] To apply formatting in bulk, select the text first and then right-click — the menu command applies to the selection. With nothing selected, it applies to the block the cursor is in.

## Related Documents

- [[02-Editor/02-Markdown-Syntax]] — Syntax in detail
- [[02-Editor/08-Table-Operations]] — Table editing
- [[02-Editor/03-Code-Blocks]] — Code blocks
- [[03-Knowledge-Management/01-Wiki-Links]] — WikiLink syntax
- [[07-Settings/04-Shortcut-Reference]] — Shortcut list
