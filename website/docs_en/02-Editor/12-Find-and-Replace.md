---
title: Find and Replace
tags: [editor]
---

# Find and Replace

Tydora provides find and replace within the current document. The panel floats above the editing area and supports live match counting and highlighting.

> [!NOTE]
> `Ctrl+F` opens find; `Ctrl+H` opens find with the replace row expanded.

## Find

1. Press `Ctrl+F` and the panel appears above the editing area.
2. Type a keyword — all matches in the document highlight immediately, with a `current index / total matches` readout.
3. Use "Previous match / Next match" to step through results; the editor scrolls to each one.
4. Press `Esc` or click "Close" to dismiss, and the highlights are cleared.

## Replace

1. Press `Ctrl+H` to open the panel (or click the expand arrow on the left of the panel to turn find into replace).
2. Fill in the replacement text in the "Replace with…" field.
3. Click **Replace** to replace the current match, or **Replace all** to replace every match in the document at once.

> [!TIP]
> Once the panel is expanded, pressing `Enter` replaces the current item and jumps to the next — ideal when you want to confirm one by one. For bulk work, use "Replace all" directly.

## Behavior

| Item | Description |
| --- | --- |
| Scope | **Current document only**; it does not search across files |
| Matching | Literal text matching, case-sensitive |
| Regular expressions | Not supported |
| Highlighting | Matches are highlighted in the body and cleared when the panel closes |
| Editing modes | Works in both live preview (IR) and source (SV) modes |

> [!NOTE]
> To search file names or body content across the whole vault, use the sidebar "Search" tab; to jump quickly by file name, use `Ctrl+O` Quick Open. See [[05-Navigation-Search/01-Quick-Open]] and [[03-Knowledge-Management/05-Link-Index]].

## Related Documents

- [[05-Navigation-Search/01-Quick-Open]] — Open files by name
- [[05-Navigation-Search/02-Command-Palette]] — Global command search
- [[05-Navigation-Search/03-Outline-Panel]] — Jump by heading
- [[07-Settings/04-Shortcut-Reference]] — Shortcut list
