---
title: Quick Open
tags: [navigation-search]
---

# Quick Open

Quick Open lets you locate and open any file in the vault instantly from the keyboard — the core feature for leaving the mouse behind and speeding up navigation.

> [!NOTE]
> Shortcut: `Ctrl+O`.

## How to Use It

1. Press `Ctrl+O` to open the Quick Open panel.
2. Type a keyword to **fuzzy search** by file name; when the panel opens it first shows **recently visited files**, so you can pick one without typing anything.
3. Use the arrow keys to choose a result and press `Enter` to open it, or click it directly.
4. Press `Esc` to close the panel.

## Two Search Modes

You can switch the search target at the top of the panel:

| Mode | Description |
| --- | --- |
| Search files | Fuzzy match by file name / path inside the current vault |
| Search vaults | Search across and switch between the vaults you have added |

## Fuzzy Search

Fuzzy matching is supported — you don't need the full file name:

- Typing `note` matches `my-note.md`, `note-management.md`
- Typing `2024di` matches `2024-diary.md`
- Typing `proj readme` matches `projects/README.md` (cross-level matches work too)

## Filtering by Tag

The input box supports `#tag keyword` syntax:

```
#tech cache
```

This first takes the documents carrying the `#tech` tag, then filters by "cache" across file names and content. See [[03-Knowledge-Management/06-Tags]].

> [!TIP]
> The search scope is every file in the **currently active vault**. To search another vault, switch to it first (see [[04-File-Management/01-Vaults]]).

## Recently Visited Files

When the panel opens it shows a **recently visited** list, so frequently used files are one click away without searching each time.

## Opening Directly in a Split

You can choose how to open a result right from the list, without opening it first and splitting afterwards:

| Action | Effect |
| --- | --- |
| Open | Open in the current pane |
| Open in right split | Create a left/right split pane and open the file there |
| Open in bottom split | Create a top/bottom split pane and open the file there |
| Open in new window | Open in a separate window |

> For more on splits, see [[05-Navigation-Search/04-Split-and-Panes]].

## Relationship to the Command Palette

- **Quick Open** (`Ctrl+O`) searches **files**.
- **Command Palette** (`Ctrl+P`) searches **commands**.

Together they let you do almost everything from the keyboard alone.

## Related Documents

- [[05-Navigation-Search/02-Command-Palette]] — Command search
- [[05-Navigation-Search/04-Split-and-Panes]] — Splits and panes
- [[04-File-Management/01-Vaults]] — Vault management
- [[03-Knowledge-Management/06-Tags]] — Filtering by tag
