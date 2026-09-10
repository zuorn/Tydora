---
title: Shortcut Reference
tags: [shortcuts]
---

# Shortcut Reference

Tydora ships 48 customizable editing shortcuts. The tables below show the **default configuration**. Every shortcut can be viewed, changed, or reset in [[07-Settings/03-Keyboard-Shortcuts]].

> [!NOTE]
> In these tables, Ctrl corresponds to Cmd (⌘) on macOS.

## App-Level Shortcuts

These are fixed in the program and are not in the shortcut settings panel:

| Shortcut | Action | Related page |
| --- | --- | --- |
| `Ctrl+S` | Save the current file | [[04-File-Management/03-File-Operations]] |
| `Ctrl+W` | Close the current window | — |
| `Ctrl+F` | Find within the current document | [[02-Editor/12-Find-and-Replace]] |
| `Ctrl+H` | Replace within the current document | [[02-Editor/12-Find-and-Replace]] |
| `Ctrl+G` | Open the knowledge graph | [[03-Knowledge-Management/04-Knowledge-Graph]] |

## Format

| Shortcut | Action |
| --- | --- |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+D` | Strikethrough |
| `Ctrl+E` | Inline code |
| `Ctrl+U` | Code block |
| `Ctrl+K` | Hyperlink |
| `Ctrl+=` | Highlight |
| `Ctrl+;` | Quote |
| `Ctrl+Shift+H` | Horizontal rule |

## List

| Shortcut | Action |
| --- | --- |
| `Ctrl+L` | Bullet list |
| — | Ordered list (**no default binding**) |
| `Ctrl+J` | Task list |
| `Ctrl+Shift+O` | Increase indent |
| `Ctrl+Shift+I` | Decrease indent |
| `Ctrl+Shift+J` | Toggle task completion |

## Heading

| Shortcut | Action |
| --- | --- |
| `Ctrl+1` | Heading 1 |
| `Ctrl+2` | Heading 2 |
| `Ctrl+3` | Heading 3 |
| `Ctrl+4` | Heading 4 |
| `Ctrl+5` | Heading 5 |
| `Ctrl+6` | Heading 6 |
| `Ctrl+0` | Paragraph (clear heading level) |

## Insert

| Shortcut | Action |
| --- | --- |
| `Ctrl+T` | Insert table |
| `Ctrl+Shift+B` | Insert above |
| `Ctrl+Shift+E` | Insert below |

## Table

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+F` | Insert row above |
| `Ctrl+Shift+.` | Insert row below |
| `Ctrl+Shift+G` | Insert column left |
| `Ctrl+Shift+=` | Insert column right |
| `Ctrl+-` | Delete row (inside a table) |
| `Ctrl+Shift+-` | Delete column |
| `Ctrl+Shift+L` | Align cell left |
| `Ctrl+Shift+C` | Align cell center |
| `Ctrl+Shift+R` | Align cell right |

> In live preview mode you can also use `Tab` / `Shift+Tab` to move within a table and add rows automatically. See [[02-Editor/08-Table-Operations]].

## Edit

| Shortcut | Action |
| --- | --- |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all (inside code blocks) |

## View

| Shortcut | Action |
| --- | --- |
| `Ctrl+Tab` | Toggle the sidebar |
| `Ctrl+Alt+T` | Typewriter mode |
| `Ctrl+M` | Open the mind map |
| `Ctrl+\` | Split horizontally |
| `Ctrl+-` | Split vertically (outside a table) |
| ``Ctrl+` `` | New terminal pane |

## Mode

| Shortcut | Action |
| --- | --- |
| `Ctrl+/` | Switch editing mode (live preview ↔ source) |

## System

| Shortcut | Action |
| --- | --- |
| `Esc` | Close an overlay / hint |
| `Ctrl+O` | Quick Open a file |
| `Ctrl+P` | Command Palette |
| `Ctrl+,` | Open / close Settings |

## A Note on Overlapping Shortcuts

> [!WARNING] The default configuration contains two kinds of overlap, resolved by context at runtime:
> - **`Ctrl+-`**: with focus inside a table it deletes a row; outside a table it splits vertically.
> - **`Ctrl+E` / `Ctrl+D` / `Ctrl+U` and similar**: with [[02-Editor/11-Vim-Mode]] enabled, they are handed to Vim by default in normal / visual mode, so the same-named app shortcut does not fire; you can change each back on the "Vim Mode" settings page.

> All customizable shortcuts can be changed in Settings, taking effect as soon as they are assigned.

## Related Documents

- [[07-Settings/03-Keyboard-Shortcuts]] — Customizing and resetting shortcuts
- [[05-Navigation-Search/02-Command-Palette]] — Command search
- [[02-Editor/09-Context-Menu]] — Right-click formatting
- [[02-Editor/11-Vim-Mode]] — Vim keybindings and conflict handover
