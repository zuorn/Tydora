---
title: FAQ
tags: [help]
---

# FAQ

This page collects the most common questions and debugging approaches when using Tydora. If your question isn't covered here, please file it on GitHub Issues (see [[01-Getting-Started/02-About]]).

## Getting Started

### Which vault should I pick the first time?

A vault is just "a folder on your disk." We recommend creating different folders for different purposes (e.g. `Work Notes`, `Personal Wiki`) and adding them one by one through the vault switcher. See [[04-File-Management/01-Vaults]].

### Will my files be moved or modified?

No. Tydora only reads and writes the files you point it at. It will **not** move, copy, or restructure your vault. Removing a vault only unregisters it. See [[04-File-Management/01-Vaults]].

### Can I recover a deleted note?

**No.** Deletion is irreversible, does not use the system recycle bin, and removes an entire folder's contents recursively. Back up important material, or keep it under version control such as Git.

### How do I switch the UI to Chinese?

Open Settings (`Ctrl+,`) → "General" tab → "Language", and choose between "简体中文" and "English". It takes effect immediately.

## Editing & Shortcuts

### Why does `Ctrl+O` open a file instead of inserting an ordered list?

Because in the default configuration, **"Ordered List" has no shortcut bound at all** — `Ctrl+O` belongs solely to "Quick Open". If you want a shortcut for ordered lists, assign one yourself in [[07-Settings/03-Keyboard-Shortcuts]]. See [[07-Settings/04-Shortcut-Reference]].

### How do I switch between live preview and source?

Press `Ctrl+/` to toggle; you can also run "Switch to live preview mode / Switch to source mode" from the Command Palette. See [[02-Editor/01-Editing-Modes]].

### Is the heading shortcut `Ctrl+1` or `Ctrl+Alt+1`?

It's `Ctrl+1` through `Ctrl+6`, and `Ctrl+0` resets to a normal paragraph. All shortcuts can be viewed and changed in [[07-Settings/03-Keyboard-Shortcuts]].

### How do I add or remove table rows and columns quickly?

In live preview, placing the cursor inside a table reveals a floating toolbar where you can add/remove rows and columns, set alignment, and merge/split cells. For shortcuts, see the "Table" group in [[07-Settings/04-Shortcut-Reference]]. See also [[02-Editor/08-Table-Operations]].

### `Ctrl+F` doesn't find what I need?

`Ctrl+F` searches **within the current document**, and `Ctrl+H` is replace. To search file names and body text across the whole vault, use the sidebar "Search" tab or `Ctrl+O` Quick Open. See [[02-Editor/12-Find-and-Replace]].

### How do I enable Vim mode, and will it break my existing shortcuts?

Settings → "Vim Mode" → enable "Enable Vim mode" (off by default). Once enabled, both source mode and live preview support the full normal / insert / visual triad. Some app shortcuts (such as `Ctrl+D`, `Ctrl+U`, `Ctrl+F`) conflict with Vim — decide item by item on that settings page whether to yield them to Vim. See [[02-Editor/11-Vim-Mode]].

## Knowledge Management

### Clicking `[[a link]]` does nothing, or it says the note can't be found

- Check that the note name is spelled correctly and exists in the current vault.
- Link resolution depends on the [[03-Knowledge-Management/05-Link-Index]]. When you first open a large vault, the index may still be building — wait a moment.
- When a file is renamed, Tydora tries to repair old links. If a link is still broken, check whether it points across vaults (links resolve only within the current vault by default).

### Where do I see backlinks?

There is no standalone "Backlinks" tab in the sidebar. Backlink/outlink information is shown as **badges** on file items in the file tree; press `Ctrl+G` to open the [[03-Knowledge-Management/04-Knowledge-Graph]] and observe references from a network perspective. See [[03-Knowledge-Management/03-Backlinks]].

### The knowledge graph is empty?

The graph only shows notes that have [[03-Knowledge-Management/01-Wiki-Links]] relationships. If the vault has no bidirectional links yet, the graph is naturally empty. Create a few links first. See [[03-Knowledge-Management/04-Knowledge-Graph]].

### How do tags work — are they the same as `tags` in Frontmatter?

Both feed into the tag index. You can write `#tagname` directly in the body, or declare `tags: [tagname]` in Frontmatter. The sidebar "Tags" tab offers both a list view and a tag graph view; clicking a tag fills `#tagname` into the search box for global filtering. See [[03-Knowledge-Management/06-Tags]].

### How do I add a bookmark?

Right-click a file or folder in the file tree → "Bookmark". It's added to the sidebar "Bookmarks" tab, with support for groups, renaming, and drag-and-drop ordering. See [[03-Knowledge-Management/07-Bookmarks]].

## Rendering & Display

### Math formulas don't render?

- Check the syntax: inline uses `$...$`, block uses `$$...$$`.
- If a complex formula errors, open the formula dialog via the right-click menu "Insert → Formula Block" and preview as you type.
- Tydora renders with **KaTeX**; there is no MathJax engine to switch to.

See [[02-Editor/04-Math-Formulas]].

### Mermaid diagrams don't render?

- Make sure the code block language is `mermaid`.
- Check that brackets and arrows are balanced; compare against the [official Mermaid documentation](https://mermaid.js.org/).
- See [[02-Editor/05-Mermaid-Diagrams]].

### The UI looks broken (styles scrambled, diagrams not updating)?

Try these in order — they usually restore things:

1. Toggle the editing mode once in the editor (`Ctrl+/`) to force a repaint.
2. Fully quit and restart Tydora.
3. If only one vault is affected, use "Collapse All / Expand All" at the top right of the sidebar "Files" tab to reload the file tree.

> [!NOTE]
> The app has **no** "Clear cache" button. If the problem persists, file it on GitHub Issues with a screenshot.

### How do I change the theme / code highlighting?

- App theme: [[06-Themes-Appearance/01-Built-in-Themes]] (10 themes), or build your own with [[06-Themes-Appearance/02-Custom-Themes]].
- Code colors: [[06-Themes-Appearance/03-Code-Highlight-Themes]] (11 schemes, can follow the app theme automatically).

### Can I import third-party CSS themes like Typora?

Tydora does not support importing Typora themes. Custom themes require **creating or duplicating a built-in theme** in Settings and adjusting colors item by item, or importing a `.tydora-theme.json` theme pack (exported by Tydora itself). See [[06-Themes-Appearance/02-Custom-Themes]].

## Terminal & Splits

### How do I open a terminal?

Press ``Ctrl+` `` to create a terminal pane. The terminal uses a real shell (on Windows, PowerShell or another system shell), and supports find, a context menu, and color scheme switching. See [[08-Advanced-Features/05-Terminal]].

### How do I split the view?

`Ctrl+\` splits left/right, `Ctrl+-` splits top/bottom. After splitting you can drag tabs between panes, or put a terminal into a new pane. See [[05-Navigation-Search/04-Split-and-Panes]].

## Publishing & Export

### It says "markdown-publish CLI not found"?

The CLI that the publish feature depends on is not bundled with the installer — install it once manually: first install [Node.js](https://nodejs.org), then run `npm install -g @abstractwebunit/markdown-publish`, and restart Tydora. See [[08-Advanced-Features/01-Publish-Website]].

### Assets 404 after publishing to GitHub Pages?

Most likely the Base Path is wrong. In the publish configuration, set "Base Path" to `/<repo>/` and "Site URL" to `https://<username>.github.io/<repo>/`. See [[08-Advanced-Features/01-Publish-Website]].

### How do I publish only some notes?

Use the "Public notes only" mode and add `publish: public` to the Frontmatter of the notes you want public. See [[08-Advanced-Features/01-Publish-Website]] and [[02-Editor/07-Frontmatter]].

### Can I export to Word / PDF?

Yes. Search for "export" in the Command Palette (`Ctrl+P`) — it supports PDF, HTML, Word, long image, and social cards. You can also "Copy as Markdown" or "Copy for WeChat" to paste directly into the target platform. See [[08-Advanced-Features/04-Export-and-Copy]].

### Auto-update fails, or keeps reporting a signature error?

This is usually a signing key or GitHub Secret configuration problem. Verify key generation, the Secret values, and the public key in `app/tydora-desktop/tauri.conf.json` as described in [[09-blog/Auto-Update-Configuration]].

## Privacy & Analytics

### Does Tydora upload my notes?

No. Note content, filenames, vault structure, and clipboard contents all stay local. See [[01-Getting-Started/Privacy-Policy]].

### What is "Walk a little further with you 🌿" in Settings?

That is the anonymous usage analytics toggle. On first launch a dialog asks for your consent; after you agree, only behavior event names (such as "open settings", "export PDF") and a few properties are reported — **never file paths, file names, or document content**, and event names are validated against an allowlist. You can turn it off at any time in Settings; once off, no data is sent.

## Related Documents

- [[01-Getting-Started/01-Quick-Start]] — From zero to productive
- [[07-Settings/04-Shortcut-Reference]] — All default shortcuts
- [[01-Getting-Started/02-About]] — Version, tech stack, and feedback channels
- [[index]] — Documentation home
