---
title: Code Highlight Themes
tags: [themes]
---

# Code Highlight Themes

Code block colors are **independent of the app theme**. Choose freely among 11 highlighting themes to keep code both legible and easy on the eyes.

> [!NOTE]
> Code highlighting is driven by highlight.js, and the code block language picker covers 30 languages (see [[02-Editor/03-Code-Blocks]]).

## Available Themes

### Light Themes (4)

- **GitHub Light** — GitHub-style light (the default light theme)
- **Atom One Light** — Atom editor's classic light theme
- **VS Code Light** — VS Code's default light theme
- **Solarized Light** — the Solarized light palette

### Dark Themes (7)

- **GitHub Dark** — GitHub-style dark (the default dark theme)
- **Atom One Dark** — Atom editor's classic dark theme
- **VS Code Dark** — VS Code's default dark theme
- **Nord** — a cool Nordic palette
- **Monokai** — the classic Monokai
- **Dracula** — the vampire-inspired dark theme
- **Solarized Dark** — the Solarized dark palette

## Switching Themes

1. Open Settings (`Ctrl+,`).
2. Switch to the "Theme" tab.
3. In the "Code highlight theme" area, click a swatch to apply it.

> [!TIP]
> Besides the settings panel, you can click the "Theme" button on a code block's toolbar to switch the highlighting for that block in place.

## Following the App Theme

By default the code highlight theme **follows the app appearance**, switching between light and dark automatically:

- App is light → uses your configured light code theme (GitHub Light by default)
- App is dark → uses your configured dark code theme (GitHub Dark by default)

Select "Follow app theme" in the "Code highlight theme" area to enable this behavior; or specify a light theme and a dark theme separately, so each appearance uses its own colors. See "Light / Dark Preferences" in [[06-Themes-Appearance/01-Built-in-Themes]].

> [!TIP]
> If you write under a dark app theme year-round, consider pinning a dark highlight theme so light code blocks don't glare against the dark background.

## Custom Code Themes

Code themes can be customized too:

| Action | Description |
| --- | --- |
| Duplicate & edit | Built-in code themes are read-only; click "Duplicate & edit" to base a recolorable copy on one |
| Import code theme | Choose a code theme file to import a third-party palette |
| Rename / delete | Custom code themes support renaming and deletion (with confirmation) |

The editor provides **live highlighting previews** for JavaScript, Python, CSS, C++, Rust, and other languages, and lets you adjust keyword, string, comment, number, and builtin / operator colors under the "Syntax highlighting colors" group.

## Related Settings

- [[06-Themes-Appearance/01-Built-in-Themes]] — App themes and appearance modes
- [[06-Themes-Appearance/02-Custom-Themes]] — Custom themes and theme packs

## Related Documents

- [[02-Editor/03-Code-Blocks]] — Using code blocks
- [[07-Settings/01-General-Settings]] — Code font and font size
