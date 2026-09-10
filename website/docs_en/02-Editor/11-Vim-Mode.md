---
title: Vim Mode
tags: [editor]
---

# Vim Mode

Tydora ships an optional **Vim mode** (LazyVim style). It provides the full normal / insert / visual triad in both source mode and live preview, along with a Leader menu (which-key) and tmux-style pane navigation.

> [!NOTE]
> Vim mode is **off by default** and affects nothing while disabled. Enable it from the "Vim Mode" tab in Settings.

## Enabling and Configuring

Open Settings (`Ctrl+,`) → "Vim Mode" tab:

| Setting | Default | Description |
| --- | --- | --- |
| Enable Vim mode | Off | The master switch |
| Leader key | Space | Pressing it in normal mode opens the Leader menu; shared by source mode and live preview |
| Menu auto-close timeout | 3000 ms | How long the Leader menu waits before closing when idle |
| Conflicting shortcut handover | See below | Decide item by item whether a conflicting key goes to Vim or stays with the app |

Configuration is stored under its own `localStorage` keys, independent of the shortcut settings.

## The Three Modes

- **normal**: movement, deletion, copying, jumping — the command mode
- **insert**: ordinary typing
- **visual**: selection operations

Both source mode and live preview support all three. In live preview, Vim commands run through a TipTap adapter layer, and text-editing commands (`dw`, `ciw`, `yy`, …) behave the same as native Vim.

## The Leader Menu

In normal mode, press the Leader key (Space by default) to open a which-key style menu, then press the corresponding key:

| Key | Action |
| --- | --- |
| `e` | Toggle the file tree (sidebar) |
| `Space` / `o` | Open a file (Quick Open) |
| `s` | Global search |
| `m` | Toggle editing mode |
| `\` | Split horizontally |
| `-` | Split vertically |
| `x` | Close the pane |
| `h` `j` `k` `l` | Focus left / down / up / right |
| `H` `J` `K` `L` | Move the current pane to far left / bottom / top / right |
| `/` or `p` | Command Palette |

## Prefix Key Hints

Pressing a prefix key such as `g`, `z`, `m`, or `t` also brings up a which-key hint listing the native Vim subcommands under that prefix (`gg`, `gU`, `zz`, `zt`, …). The hints are purely visual guidance — the keys themselves are still executed natively by the Vim extension.

## Pane Navigation

In normal mode, use `Ctrl+h` / `Ctrl+j` / `Ctrl+k` / `Ctrl+l` to move focus between panes, matching the tmux habit.

## File Tree Navigation (neo-tree style)

When focus is on the sidebar file tree, Vim mode provides a dedicated set of file tree keys:

| Key | Action |
| --- | --- |
| `j` / `k` | Move the highlight down / up (**without** opening files) |
| `h` / `Backspace` | Collapse the current directory |
| `l` / `Enter` / `o` | Expand a directory or open a file |
| `H` / `G` | Jump to the first / last item |
| `p` | Jump to the parent directory |
| `W` / `E` | Collapse all / expand all |
| `C` | Collapse the current branch |
| `a` / `%` | New file |
| `A` | New folder |
| `r` | Rename |
| `d` | Delete |
| `D` / `c` | Create a duplicate |
| `x` | Move to… |
| `y` | Copy path |
| `\` / `-` | Open in a split (horizontal / vertical) |

## Conflicting Shortcut Handover

Some Vim keys conflict by nature with app shortcuts. After enabling Vim, you can decide item by item on the settings page who gets each one (defaults shown):

| Shortcut | App action | Vim meaning | Default |
| --- | --- | --- | --- |
| `Ctrl+D` | Strikethrough | Scroll down half a page | Handed to Vim |
| `Ctrl+U` | Code block | Scroll up half a page | Handed to Vim |
| `Ctrl+E` | Inline code | Scroll down one line | Handed to Vim |
| `Ctrl+H` | Replace | Move left / backspace | Handed to Vim |
| `Ctrl+F` | Find | Scroll down a full page | Handed to Vim |
| `Ctrl+W` | Close pane | Window-operation prefix | Handed to Vim |
| `Ctrl+O` | Quick Open | Jump-list back | Handed to Vim |
| `Ctrl+G` | Knowledge graph | Show file info | Handed to Vim |
| `Ctrl+P` | Command Palette | Move up one line | **Kept for the app** |

> [!TIP]
> Handover only applies in Vim's normal / visual modes, and only while focus is inside the editor. If you rely more on an app shortcut, set it to "off" so the app shortcut works as usual.

## Related Documents

- [[02-Editor/01-Editing-Modes]] — The two editing modes (Vim is a layer, not a third mode)
- [[05-Navigation-Search/04-Split-and-Panes]] — Splits and pane management
- [[07-Settings/03-Keyboard-Shortcuts]] — Customizing app shortcuts
- [[07-Settings/04-Shortcut-Reference]] — All default shortcuts
