---
title: Code Blocks
tags: [editor]
---

# Code Blocks

Tydora provides full syntax highlighting for code, with a language picker, copy, and theme switching built into every code block.

## Creating a Code Block

### Method 1: Markdown Syntax

Wrap the code in three backticks and annotate the language to get matching highlighting:

````markdown
```javascript
function hello() {
  console.log("Hello, Tydora!");
}
```
````

> [!TIP]
> Annotating a language (such as `js`, `python`, `rust`) enables the corresponding highlighting; leaving it blank or writing `plaintext` shows plain text.

### Method 2: Shortcut

Press `Ctrl+U` to insert a code block directly.

### Method 3: Context Menu

1. Right-click in the editing area.
2. Choose "Insert" → "Code Block".

> After inserting, use the code block toolbar's language picker to switch languages.

## Code Block Toolbar

Move the cursor into a code block and the toolbar appears, offering:

| Button | Description |
| --- | --- |
| Language picker | Switch the highlighting language from a dropdown |
| Copy | Copy the code block contents to the clipboard |
| Delete | Delete the entire code block |
| Theme | Quickly switch the code highlighting theme |

The toolbar has two styles, switchable in the "Appearance" group of [[07-Settings/01-General-Settings]]:

- **Floating (minimal)** — shows only the language picker in the top-right corner; the default style
- **Top bar (with copy/delete)** — a full toolbar across the top, with more prominent action buttons

## Supported Languages

The language picker includes **30 languages** (including Plain Text):

Plain Text, JavaScript, TypeScript, Python, Java, C, C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, HTML, CSS, SCSS, Less, JSON, YAML, TOML, XML, SQL, Bash, Shell, PowerShell, Markdown, Mermaid, Dockerfile, GraphQL.

In addition, highlighting definitions are registered for the following languages — annotate them directly in a code block and they work:

`vim`, `latex`, `nginx`, `cmake`, `scala`, `haskell`, `elixir`, `julia`, `tcl`, `properties`, `gradle`.

## Inline Code

Wrap a code fragment in single backticks for variable names, commands, and so on inside prose:

```markdown
Use `console.log()` to print a log line
```

> Shortcut: `Ctrl+E`.

## Line Numbers

In IR mode you can control editor line numbers with the "Show line numbers" toggle in the "Appearance" group of [[07-Settings/01-General-Settings]]; it is on by default.

## Copying Code

Hover over a code block and click the **Copy** button in its toolbar to copy the code to the clipboard.

## Code Highlighting Themes

Code block colors are independent of the app theme. Switch them from the "Theme" tab in Settings — there are 11 highlighting themes:

- Light: Atom One Light, GitHub Light, VS Code Light, Solarized Light
- Dark: Atom One Dark, GitHub Dark, VS Code Dark, Nord, Monokai, Dracula, Solarized Dark

> By default it follows the app appearance, switching automatically between a light and a dark highlighting theme. You can also pin one, or import / create your own code theme. See [[06-Themes-Appearance/03-Code-Highlight-Themes]].

## Related Documents

- [[02-Editor/02-Markdown-Syntax]] — Syntax in detail
- [[02-Editor/09-Context-Menu]] — Right-click actions
- [[02-Editor/04-Math-Formulas]] — Formula rendering
- [[02-Editor/05-Mermaid-Diagrams]] — Diagram code blocks
- [[06-Themes-Appearance/03-Code-Highlight-Themes]] — Choosing a highlighting theme
