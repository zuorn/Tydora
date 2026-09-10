---
title: Keyboard Shortcuts
tags: [settings]
---

# Keyboard Shortcuts

Tydora ships **48 customizable** editing shortcuts. You can review every binding in Settings, change them to combinations you prefer, or reset them all to the defaults in one click.

> [!NOTE]
> Press `Ctrl+,` to open Settings and switch to the "Shortcuts" tab. For the complete default list, see [[07-Settings/04-Shortcut-Reference]].

## Shortcut Groups

Shortcuts in Settings are grouped by function for easy lookup:

| Group | Count | Contents |
| --- | --- | --- |
| Format | 9 | Bold, italic, strikethrough, inline code, code block, hyperlink, highlight, quote, horizontal rule |
| List | 6 | Bullet list, ordered list, task list, indent / outdent, toggle task state |
| Heading | 7 | Headings 1–6, paragraph |
| Insert | 3 | Table, insert above, insert below |
| Table | 9 | Insert / delete rows and columns, cell alignment |
| Edit | 3 | Undo, redo, select all (inside code blocks) |
| View | 6 | Toggle sidebar, typewriter mode, open mind map, split horizontally / vertically, new terminal |
| Mode | 1 | Mode switch (IR ↔ SV) |
| System | 4 | Close overlay, quick open file, command palette, open / close settings |

> [!NOTE]
> Besides those 48, a few **app-level shortcuts** are fixed in the program and are not in the Settings panel: `Ctrl+S` (save), `Ctrl+W` (close window), `Ctrl+F` (find), `Ctrl+H` (replace), `Ctrl+G` (knowledge graph).

## Customizing Shortcuts

1. Find the target command in the shortcut list.
2. Click its current key combination.
3. Press the new combination.
4. It saves automatically and takes effect immediately.

> [!TIP]
> No restart is needed after a change; the configuration is stored locally and persists with the app.

## Resetting Shortcuts

Click the "Reset" button to restore **all** shortcuts to their default values.

## Conflicts and Handover

### Overlapping Combinations Within the App

A few combinations have two meanings depending on context, resolved at runtime:

| Shortcut | Context A | Context B |
| --- | --- | --- |
| `Ctrl+-` | Inside a table: delete row | Outside a table: split vertically |

> [!WARNING]
> In the default configuration, "Ordered list" **has no shortcut bound**, and `Ctrl+O` belongs solely to "Quick Open". If you want a shortcut to insert an ordered list, assign a non-conflicting combination yourself.

### Conflicts with Vim Mode

With [[02-Editor/11-Vim-Mode]] enabled, some app shortcuts conflict with Vim keys (such as `Ctrl+D`, `Ctrl+U`, `Ctrl+E`, `Ctrl+F`, `Ctrl+H`, `Ctrl+W`, `Ctrl+O`, `Ctrl+G`). The "Vim Mode" tab in Settings offers **per-item handover toggles**, so you can decide individually whether each conflicting key goes to Vim or stays with the app.

## Related Documents

- [[07-Settings/04-Shortcut-Reference]] — Shortcut reference table
- [[05-Navigation-Search/02-Command-Palette]] — Command search
- [[02-Editor/11-Vim-Mode]] — Vim mode and conflict handover
- [[07-Settings/01-General-Settings]] — Basic settings
