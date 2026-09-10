---
title: Splits and Multiple Panes
tags: [navigation-search]
---

# Splits and Multiple Panes

Tydora's editing area supports **splits**: cut the window into multiple panes, each opening its own file, switching editing modes independently, or even hosting a terminal. When writing a long piece, you can keep references beside you and run commands as you write, without switching windows.

> [!NOTE]
> A **pane** is a divided region inside one window; a **window** is a separate operating-system window. The two can be combined.

## Splitting

| Shortcut | Effect |
| --- | --- |
| `Ctrl+\` | Split left/right |
| `Ctrl+-` | Split top/bottom |
| ``Ctrl+` `` | Create a terminal pane (horizontal direction) |

You can also split from these entry points:

- Command Palette (`Ctrl+P`) → "Split horizontally / Split vertically / New terminal"
- The editor's top "More" menu → "Split horizontally / Split vertically / New terminal"
- A result in [[05-Navigation-Search/01-Quick-Open]] → "Open in right split / Open in bottom split"

> [!NOTE]
> `Ctrl+-` is also the table "Delete row" shortcut. When focus is inside a table it deletes a row; outside a table it splits the view. You can rebind either in [[07-Settings/03-Keyboard-Shortcuts]].

## Pane Operations

| Action | How |
| --- | --- |
| Switch focus | Click anywhere in the target pane |
| Resize | Drag the **divider** between panes |
| Close a pane | Click the close button at the pane's top-right corner; or Command Palette → "Close pane" |
| Move a pane | With [[02-Editor/11-Vim-Mode]] enabled, use the Leader menu's `H` / `J` / `K` / `L` to move the current pane to far left / bottom / top / right |

> [!TIP]
> Splits can nest: splitting again inside an already-split pane produces a more complex layout tree. Each pane keeps its own editing mode and scroll position.

## Pane Types

| Type | Description |
| --- | --- |
| Editor pane | Opens Markdown files; IR / SV mode can be switched independently |
| Canvas pane | Shows a `.canvas` whiteboard in the main area |
| Preview pane | Shows images / video / audio / PDF |
| Terminal pane | A real shell session; see [[08-Advanced-Features/05-Terminal]] |

## Vim Pane Navigation

With Vim mode enabled, normal mode offers tmux-style keys to jump between panes:

| Shortcut | Effect |
| --- | --- |
| `Ctrl+h` / `Ctrl+j` / `Ctrl+k` / `Ctrl+l` | Move focus to the left / bottom / top / right pane |

## Separate Windows

When you genuinely need two things side by side, you can put a file in its own window:

- File tree right-click → "Open in new window"
- [[05-Navigation-Search/01-Quick-Open]] → "Open in new window"
- The knowledge graph, mind map, and canvas can each open in their own window, handy for a second monitor

> Window position and size are remembered and restored on the next launch.

## Related Documents

- [[08-Advanced-Features/05-Terminal]] — Terminal panes
- [[02-Editor/11-Vim-Mode]] — Vim pane navigation
- [[05-Navigation-Search/01-Quick-Open]] — Opening files in a split
- [[08-Advanced-Features/03-Whiteboard-Canvas]] — Canvas windows
