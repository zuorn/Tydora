---
title: Built-in Themes
tags: [themes]
---

# Built-in Themes

Tydora ships **10** carefully designed built-in themes covering fresh, calm, energetic, and futuristic styles. You can switch with one click in Settings, or create or import your own (see [[06-Themes-Appearance/02-Custom-Themes]]).

> [!NOTE]
> The default appearance mode is **follow system**: "White" when the system is light, "Mint Dark" when it is dark. Code block colors are independent of the app theme — see [[06-Themes-Appearance/03-Code-Highlight-Themes]].

## Theme List

| Theme | Style | Background / accent |
| --- | --- | --- |
| **White** | Clean, pure white background; a general-purpose light theme | `#ffffff` / `#2563eb` |
| **Mint** | A fresh mint theme: white background with a mint-green accent | `#ffffff` / `#4eb289` |
| **Mint Dark** | The dark version of Mint, keeping the mint accent on a dark background | `#272729` / `#4eb289` |
| **Modern Dark** | A modern dark theme: cool-toned background with a bright blue accent | `#1b1d24` / `#74a7fe` |
| **Claude Code** | A warm theme inspired by the Claude code editor: cream background with an amber accent | `#faf8f5` / `#c47a2a` |
| **Purple** | An elegant purple theme — soft violet tones, a tranquil mood | `#faf5ff` / `#7c3aed` |
| **Hermes** | An energetic indigo theme with a vivid accent and a modern feel | `#f0f1ff` / `#0000f2` |
| **NexT** | Inspired by the Hexo NexT Pisces style: teal accent on cream, refined and restrained | `#fffef8` / `#00796b` |
| **Slate** | A graphite-gray minimal theme with low-saturation cool grays — calm and professional | `#f8fafc` / `#475569` |
| **Ocean** | An oceanic cool theme: pale blue background with a cyan accent — crisp and airy | `#f0f9ff` / `#0891b2` |

## Switching Themes

1. Open Settings (`Ctrl+,`).
2. Switch to the "Theme" tab.
3. In the "Built-in themes" area, click a theme card — it applies immediately.

> [!TIP]
> Theme cards show a representative color swatch for quick comparison. Hovering a card also offers "Duplicate & edit", which forks a built-in theme into a custom theme you can recolor item by item.

## Appearance Mode

Tydora supports three appearance modes:

| Mode | Description |
| --- | --- |
| **Follow system** (default) | Automatically matches the OS light / dark setting |
| **Light** | Force light rendering |
| **Dark** | Force dark rendering |

> Appearance mode is set at the top of the "Theme" tab, and can also be adjusted in the "Appearance" group of [[07-Settings/01-General-Settings]].

### Light / Dark Preferences

Tydora stores **a separate set of preferences for light and dark**, each containing:

- **App theme** (UI colors)
- **Code theme** (code highlighting colors)

In other words, you can have light mode use "White + GitHub Light" and dark mode use "Mint Dark + Dracula" — each snaps into place as you switch appearance. The top of the settings page shows the current combination, e.g. "Current: Follow system · White + GitHub Light".

> [!TIP]
> In "Follow system" mode, if the system switches between light and dark during the day, Tydora switches to the preference set you configured for that appearance — rather than simply inverting the UI.

## Related Documents

- [[06-Themes-Appearance/02-Custom-Themes]] — Creating, importing, and editing themes
- [[06-Themes-Appearance/03-Code-Highlight-Themes]] — Code highlighting colors
- [[07-Settings/01-General-Settings]] — Appearance mode and font settings
