---
title: Shortcut Quick Reference
tags: [Shortcuts]
---

# Shortcut Quick Reference

Tydora comes with 40+ keyboard shortcuts. The table below shows the **default configuration**. All shortcuts can be viewed, modified, or reset to defaults in [[07-Settings/03-Keyboard-Shortcuts]].

> [!NOTE]In the tables, Ctrl corresponds to Cmd (⌘) on macOS. Some combinations use Ctrl+Alt+Number — use the main keyboard number row directly; a numeric keypad is not required.

## Global Shortcuts

The following shortcuts are available anywhere in the application (system-level bindings):

| Shortcut | Function | Related Document |
| --- | --- | --- |
| `Ctrl+S` | Save current file |  |
| `Ctrl+O` | Quick open file |  |
| `Ctrl+P` | Command palette |  |
| `Ctrl+/` | Toggle editing mode (IR ↔ SV) |  |
| `Ctrl+M` | Open mind map |  |
| `Ctrl+G` | Open knowledge graph |  |
| `Ctrl+\` | Toggle sidebar | — |
| `Ctrl+W` | Close current window | — |
| `Ctrl+Alt+T` | Toggle typewriter mode |  |
| `Ctrl+E` | Inline code |  |

## Format

| Shortcut | Function |
| --- | --- |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+D` | Strikethrough |
| `Ctrl+E` | Inline code |
| `Ctrl+U` | Code block |
| `Ctrl+K` | Insert link |
| `Ctrl+=` | Highlight |
| `Ctrl+;` | Blockquote |
| `Ctrl+Shift+H` | Horizontal rule |

## List

| Shortcut | Function |
| --- | --- |
| `Ctrl+L` | Unordered list |
| `Ctrl+O` | Ordered list *（see note below）* |
| `Ctrl+J` | Task list |
| `Ctrl+Shift+O` | Increase indent |
| `Ctrl+Shift+I` | Decrease indent |
| `Ctrl+Shift+J` | Toggle task completion status |

## Headings

| Shortcut | Function |
| --- | --- |
| `Ctrl+Alt+1` | Heading level 1 |
| `Ctrl+Alt+2` | Heading level 2 |
| `Ctrl+Alt+3` | Heading level 3 |
| `Ctrl+Alt+4` | Heading level 4 |
| `Ctrl+Alt+5` | Heading level 5 |
| `Ctrl+Alt+6` | Heading level 6 |
| `Ctrl+Alt+0` | Paragraph (clear heading level) |

## Insert

| Shortcut | Function |
| --- | --- |
| `Ctrl+T` | Insert table |
| `Ctrl+Shift+B` | Insert content above |
| `Ctrl+Shift+E` | Insert content below |

## Table

| Shortcut | Function |
| --- | --- |
| `Ctrl+Shift+F` | Insert row above |
| `Ctrl+Shift+.` | Insert row below |
| `Ctrl+Shift+G` | Insert column to the left |
| `Ctrl+Shift+=` | Insert column to the right |
| `Ctrl+-` | Delete row |
| `Ctrl+Shift+-` | Delete column |
| `Ctrl+Shift+L` | Cell align left |
| `Ctrl+Shift+C` | Cell align center |
| `Ctrl+Shift+R` | Cell align right |

> In instant rendering mode, you can also use `Tab` / `Shift+Tab` to move within a table and automatically add rows. See [[02-Editor/08-Table-Operations]] for details.

## Edit

| Shortcut | Function |
| --- | --- |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all (within code block) |

## View & Mode

| Shortcut | Function |
| --- | --- |
| `Ctrl+\` | Toggle sidebar |
| `Ctrl+Alt+T` | Typewriter mode |
| `Ctrl+M` | Open mind map |
| `Ctrl+/` | Toggle mode (IR ↔ SV) |

## System

| Shortcut | Function |
| --- | --- |
| `Esc` | Dismiss overlay / prompt |
| `Ctrl+O` | Quick open |
| `Ctrl+P` | Command palette |
| `Ctrl+,` | Open settings |

## Notes on Shortcut Conflicts

> [!WARNING]Due to historical reasons, some default shortcuts overlap. At runtime, global shortcuts take precedence:
> `Ctrl+O` is bound to both "Ordered List" and "Quick Open File". At runtime, **Quick Open takes priority**, so `Ctrl+O` opens files rather than inserting an ordered list. If you frequently use the ordered list shortcut, consider reassigning "Ordered List" to a non-conflicting combination in [[07-Settings/03-Keyboard-Shortcuts]].

> All shortcuts can be customized in Settings and take effect immediately after assignment.

## Customizing Shortcuts

1. Press `Ctrl+,` to open Settings.
2. Switch to the "Shortcuts" tab.
3. Find the target command in the list and click the current shortcut combination.
4. Press the new key combination and save.

> See [[07-Settings/03-Keyboard-Shortcuts]] for details.

## Related Documents

- [[07-Settings/03-Keyboard-Shortcuts]] — Shortcut customization and reset
- [[05-Navigation-Search/02-Command-Palette]] — Command search
- [[02-Editor/09-Context-Menu]] — Right-click formatting actions
- [[02-Editor/01-Editing-Modes]] — Editing mode switching