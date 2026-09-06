---
title: FAQ
tags: [help]
---

# Frequently Asked Questions (FAQ)

This page summarizes common issues and troubleshooting tips for Tydora. If your question isn't covered here, feel free to report it on GitHub Issues (see [[01-Getting-Started/02-About]]).

## Getting Started & Basics 

### Which vault should I choose when starting for the first time?

A vault is simply "a local folder." We recommend creating separate folders for different purposes (e.g., `work-notes`, `personal-knowledge-base`) and adding them individually via the vault switcher. See [[04-File-Management/01-Vaults]].

### Will my files be moved or modified?

No. Tydora only reads and writes files you specify — it does **not** move, copy, or alter your vault structure. Removing a vault only removes the reference. See [[04-File-Management/01-Vaults]].

### Can deleted notes be recovered?

**No.** Deletion is irreversible and will recursively delete all contents within a folder. Back up important data first or use version control (e.g., Git).

## Editing & Shortcuts

### Why does `Ctrl+O` behave differently from "Ordered List" in the docs?

This combo is **bound to two commands** in the default config (`Ctrl+O`: Quick Open + Ordered List). At runtime, **global commands take priority**, so `Ctrl+O` actually opens files. If you frequently use the ordered list shortcut, reassign it in [[07-Settings/03-Keyboard-Shortcuts]]. See [[07-Settings/04-Shortcut-Reference]].

### How do I switch between WYSIWYG and Source mode?

Press `Ctrl+/` to toggle; or click the mode indicator in the status bar. See [[02-Editor/01-Editing-Modes]].

### How do I quickly add/remove table rows and columns?

In WYSIWYG mode, placing the cursor in a table reveals a floating toolbar. See the "Table" group in [[07-Settings/04-Shortcut-Reference]]. See [[02-Editor/08-Table-Operations]].

## Knowledge Management

### `[[wikilinks]]` don't respond when clicked / show "not found"?

- Confirm the linked note name is spelled correctly and exists in the current vault
- Link resolution depends on [[03-Knowledge-Management/05-Link-Index]]; the index may still be building in a large vault — wait briefly
- When renaming files, Tydora attempts to fix old links; if still broken, check for cross-vault references (links resolve within the current vault by default)

### Backlinks panel is empty — is that normal?

Yes. Backlinks only appear when **other notes link to the current note**. A note without backlinks may be an "information island" — consider adding links proactively. See [[03-Knowledge-Management/03-Backlinks]].

### The knowledge graph is empty?

The graph only shows notes with [[03-Knowledge-Management/01-Wiki-Links]] relationships. If no bidirectional links exist in your vault yet, the graph will naturally be empty. Create some links first. See [[03-Knowledge-Management/04-Knowledge-Graph]].

## Rendering & Display

### Math formulas don't render?

- Confirm "Math Formulas" is enabled in [[07-Settings/02-Editor-Settings]]
- Check syntax: inline uses `$...$`, block uses `$$...$$`
- Some complex formulas may error under KaTeX — switch to the MathJax engine

### Mermaid diagrams not rendering?

- Confirm the code block language is labeled `mermaid` and the "Mermaid Diagrams" toggle is on
- Check bracket and arrow pairing against the [Mermaid official docs](https://mermaid.js.org/)
- See [[02-Editor/05-Mermaid-Diagrams]]

### UI display issues (styling messed up, diagrams not updating)?

Try "Clear Cache" in [[07-Settings/02-Editor-Settings]] and restart the app — this usually resolves it.

### Want to change themes / code highlighting?

- App themes: [[06-Themes-Appearance/01-Built-in-Themes]] (9 themes) or import [[06-Themes-Appearance/02-Typora-Themes]]
- Code themes: [[06-Themes-Appearance/03-Code-Highlight-Themes]] (11 themes)

## Publishing & Updates

### Resources return 404 after publishing to GitHub Pages?

Most likely the Base Path is incorrect. In publish settings, set "Base Path" to `/<repo-name>/` and "Site URL" to `https://<username>.github.io/<repo-name>/`. See [[08-Advanced-Features/01-Publish-Website]].

### How do I publish only some notes?

Use "Public Notes Only" mode and add `publish: public` to the Frontmatter of notes you want to make public. See [[08-Advanced-Features/01-Publish-Website]] and [[02-Editor/07-Frontmatter]].

### Auto-update fails / keeps showing signature errors?

Usually a signing key or GitHub Secret configuration issue. Verify the key generation, Secret values, and the public key in `tauri.conf.json` against [[09-blog/Auto-Update-Configuration]].

## Related Documents

- [[01-Getting-Started/01-Quick-Start]] — Get started from scratch
- [[07-Settings/04-Shortcut-Reference]] — All default keyboard shortcuts
- [[01-Getting-Started/02-About]] — Version, tech stack & feedback channels
- [[index]] — Documentation home