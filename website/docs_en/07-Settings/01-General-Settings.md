---
title: General Settings
tags: [settings]
---

# General Settings

General settings manage the app's **fonts, typography, editing behavior, window behavior, sidebar placement, and UI language** — the first place worth a look after any fresh install.

> [!NOTE]
> Press `Ctrl+,` to open Settings; it lands on the "General" tab by default. Appearance mode (light / dark) is set in the "Theme" tab — see [[06-Themes-Appearance/01-Built-in-Themes]].

## Appearance

### Editor Font

Choose the font used for body text and Markdown source. The font picker supports search and groups fonts by source:

| Group | Description |
| --- | --- |
| Built-in | Fonts bundled with Tydora (such as LXGW WenKai, well suited to Chinese writing) |
| Monospace | Monospace fonts suited to code and aligned tables |
| System fonts | Fonts installed on your system, searchable |
| System default | Use the operating system's default font |

### Code Font

Set the **monospace font** used by code blocks and inline code separately.

### Font Sizes

- **Body font size**: the size of editor body text and Markdown source
- **Code font size**: the size of code blocks and inline code (default 14)

### Line and Paragraph Spacing

- **Line height**: body line height (default 1.6)
- **Paragraph spacing**: vertical space between paragraphs (default 0.5 em)
- **Code line height**: line height inside code blocks (default 1.5)

### Preview Area Width

The maximum width of the editor content area (default 800 px). Smaller makes long prose easier to read; larger suits wide screens and table-heavy documents.

### Show Line Numbers

Show editor line numbers in live preview (IR) mode; on by default.

### Code Block Toolbar

Choose the display style of the code block language picker and action buttons:

- **Floating (minimal)** — shows only the language picker in the top-right corner (default)
- **Top bar (with copy/delete)** — a full toolbar across the top

### Menu Item Height

Adjust the vertical spacing of entries in context menus and dropdowns: Compact / Standard / Relaxed.

## Behavior

### Auto Save

Saves files automatically while editing; **on by default**. When enabled, the file is written to disk about 1 second after you stop typing; `Ctrl+S` still saves immediately.

> [!NOTE]
> The auto-save delay is fixed at 1 second; there is no configurable delay setting.

### Expand Outline on Startup

When enabled, double-clicking a `.md` file to open it in this app expands the sidebar and switches to the outline view automatically; when disabled, the original collapsed-sidebar behavior is kept.

### Language

The UI display language. Supported:

- **简体中文**
- **English**

Takes effect immediately, with no restart required.

### Anonymous Usage Analytics

The "Walk a little further with you 🌿" toggle. When on, it anonymously collects feature usage and error information to improve the product:

- Reports only behavior event names and a few properties
- **Never collects** file paths, file names, or document content
- Can be turned off at any time; once off, no data is sent

See [[01-Getting-Started/Privacy-Policy]].

## Window

| Setting | Description |
| --- | --- |
| Hide the top bar when the sidebar is expanded | The top bar also hides while the sidebar is expanded; hovering the top edge reveals it temporarily |
| Hide the top bar when the sidebar is collapsed | Whether the top bar hides when the sidebar collapses; when off, the top bar stays visible with the sidebar collapsed |

> Window position and size are remembered automatically by Tydora and restored on the next launch; no manual configuration needed.

## Sidebar Settings

Configure whether each sidebar tab appears in the **left sidebar** or the **right sidebar**:

| Tab | Default position |
| --- | --- |
| Files | Left sidebar |
| Search | Left sidebar |
| Outline | Right sidebar |
| Bookmarks | Left sidebar |
| Tags | Right sidebar |

> [!TIP]
> You can also **drag a tab** in the sidebar to move it to the other side; the setting syncs accordingly.

## Related Documents

- [[06-Themes-Appearance/01-Built-in-Themes]] — Appearance modes and themes
- [[07-Settings/02-Editor-Settings]] — Where rendering toggles and editing behavior live
- [[07-Settings/03-Keyboard-Shortcuts]] — Configuring shortcuts
- [[07-Settings/06-Image-Settings]] — Image storage and naming
