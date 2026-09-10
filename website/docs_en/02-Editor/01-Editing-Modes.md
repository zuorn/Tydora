---
title: Editing Modes
tags: [editor]
---

# Editing Modes

Tydora offers two editing modes, matching the two needs of "writing comfortably" and "seeing precisely." You can switch at any point while writing, with no effect on either.

> [!NOTE] Press `Ctrl+/` to toggle between the two modes. Opening a file always starts in **live preview (IR)** mode.

## The Two Modes

### Live Preview (IR / WYSIWYG)

In live preview, the Markdown you type **immediately becomes the rendered result** — what you see is what you get. It is powered by the TipTap 3.x engine.

**Characteristics:**

- Headings, bold, lists, and so on are shown with their typeset styling
- Images can be resized by dragging
- Native support for callout blocks, Mermaid diagrams, highlighted code blocks, math formulas, and other rich elements
- Markdown markers near the cursor are revealed as needed and hidden again once you move away
- Tables show a floating toolbar supporting row/column insertion and deletion, alignment, and cell merge/split
- Frontmatter appears as an inline-editable YAML block
- Best for everyday writing, note-taking, and quick edits

> [!TIP] Live preview is the recommended mode for most situations. It feels closest to Typora / Obsidian's "live preview."

### Source Mode (SV)

Source mode shows **plain Markdown text**, with professional syntax highlighting and editing from CodeMirror 6.

**Characteristics:**

- Keeps every Markdown marker intact for precise control
- CodeMirror 6 syntax highlighting
- Code folding and bracket matching
- Best for fine-grained formatting, bulk rewrites, and editing code blocks

## How to Switch

| Method | Action |
| --- | --- |
| Shortcut | `Ctrl+/` toggles IR ↔ SV |
| Status bar | Click the mode indicator at the bottom status bar (it shows the current mode) |
| Command Palette | `Ctrl+P` → "Switch to live preview mode / Switch to source mode" |

> [!NOTE] Switching modes does not change the file contents — only how they are presented and edited. What gets saved is always standard Markdown text.

> [!NOTE] Tydora always opens files in live preview mode; there is currently no "default editing mode" setting in the UI. To start in source mode, open the file and press `Ctrl+/`.

## Mode Comparison

| Feature | IR / WYSIWYG | SV (Source) |
| --- | --- | --- |
| Formatting display | Rendered immediately | Syntax markers visible |
| Syntax visibility | Low (shown locally near the cursor) | High |
| Editing feel | What you see is what you get | Full control over plain text |
| Tables | Visual editing via floating toolbar | Hand-edit pipe tables |
| Frontmatter | Inline editable block | Plain YAML text |
| Images | Drag to resize | Shows markers and paths |
| Best for | Everyday writing, reading | Fine-tuning, code editing |

## Relationship to Vim Mode

Vim mode is **not** a third editing mode — it is a keybinding layer on top of the other two. Once enabled, both source mode and live preview support the full normal / insert / visual triad. See [[02-Editor/11-Vim-Mode]].

## Features That Pair Well

- **Typewriter mode**: keeps the cursor vertically centered → [[02-Editor/10-Typewriter-Mode]]
- **Context menu**: apply formatting quickly in live preview → [[02-Editor/09-Context-Menu]]
- **Table floating toolbar**: appears when you hover a table in live preview → [[02-Editor/08-Table-Operations]]
- **Splits**: `Ctrl+\` splits left/right, so you can open two files in different modes in two panes → [[05-Navigation-Search/04-Split-and-Panes]]

## Related Documents

- [[02-Editor/02-Markdown-Syntax]] — Supported syntax
- [[02-Editor/09-Context-Menu]] — Formatting commands
- [[02-Editor/03-Code-Blocks]] — Code highlighting
- [[07-Settings/04-Shortcut-Reference]] — Mode switching shortcut
