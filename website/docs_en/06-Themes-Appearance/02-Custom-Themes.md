---
title: Custom Themes
tags: [themes]
---

# Custom Themes

When the built-in themes don't match your taste, Tydora lets you **create a theme**, **import a theme pack**, or duplicate a built-in theme and recolor it item by item. Custom themes also support separate light / dark preference sets.

> [!NOTE]
> All theme operations happen in the Settings "Theme" tab. Tydora **does not support importing Typora themes**; custom themes come from two sources — editing inside the app, or importing Tydora's own theme pack.

## Creating a Custom Theme

### Option 1: Duplicate a Built-in Theme

1. Find the theme you want to modify in the "Built-in themes" area.
2. Hover the card and click "Duplicate & edit".
3. Tydora creates a copy named "Original name (custom)" and opens it for editing.

> [!NOTE]
> Built-in themes are read-only — you must duplicate one before you can change its colors.

### Option 2: Create a Blank Theme

Click "New theme" in the "Custom themes" area to go straight to the editor and color it item by item.

## Editing a Theme

The theme editor exposes color variables grouped semantically, each with a live preview:

| Group | Contents |
| --- | --- |
| UI | Main background, sidebar / secondary background, overlay / card, hover background, input background, border, sidebar control opacity |
| Body text | Body, secondary text, hint text, bold / emphasis, accent color and its hover state |
| Code block | Code block background and corner radius |
| Inline code | Background, text, radius, padding |
| Blockquote | Left bar color, background, text, padding |
| Metadata / Frontmatter | Background, border, radius |
| Table | Header background, content background, radius |
| Tags | Background, text, border, radius, padding |
| Scrollbar | Thumb, thumb hover, track, radius, width |
| Syntax highlighting colors | Keyword, string, comment, number, builtin / operator |

The right side of the editor provides a **body preview** with live examples of headings, bold, inline code, code blocks, quotes, tables, tags, and other typical elements.

> [!TIP]
> Every swatch supports a color picker and manual value entry; variables with alpha (such as the accent RGB and sidebar control opacity) can have their alpha adjusted separately.

## Importing a CSS Theme File

Click "Import theme" → "Choose theme file" to import a CSS file:

- The file must contain CSS variable definitions in the form `:root` or `[data-theme=...]`
- It must define at least `--bg-primary`, otherwise the import reports a failure
- After importing, Tydora parses the color variables, infers whether the theme is light or dark, and generates matching preview swatches

> [!NOTE]
> This is the way to bring a "CSS-variable theme from elsewhere" into Tydora. It is not compatible with Typora theme variable naming.

## Theme Packs (Full Import/Export)

Theme packs are for **backing up or sharing an entire color setup**:

| Action | Description |
| --- | --- |
| Export theme pack | Generates a `.tydora-theme.json` file containing **all four** themes — the app theme and code theme for both the light and dark preferences |
| Import theme pack | Choose a `.tydora-theme.json` file to restore all four at once |

> [!TIP]
> Export a theme pack before switching computers or reinstalling, and you can restore your whole color environment in minutes.

## Renaming and Deleting

- **Rename**: choose "Rename" on a custom theme card
- **Delete**: choose "Delete theme" — a confirmation dialog appears (irreversible)

## Related Documents

- [[06-Themes-Appearance/01-Built-in-Themes]] — Built-in themes and appearance modes
- [[06-Themes-Appearance/03-Code-Highlight-Themes]] — Code highlighting colors
- [[02-Editor/03-Code-Blocks]] — Code blocks and highlighting
