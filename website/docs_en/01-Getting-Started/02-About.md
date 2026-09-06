---
title: About Tydora
tags: [getting-started]
---

1. About Tydora

Tydora is a modern desktop Markdown editor built with Tauri v2 + React 19. It supports WYSIWYG & source dual-mode editing, WikiLink bidirectional links, knowledge graph, mind maps, and a whiteboard canvas. The name comes from *Type/Typography* and the Ancient Greek *δῶρον* (gift), meaning "gift at your fingertips."

> [!NOTE]Tydora is open-source software licensed under the Apache License 2.0. Issues, discussions, and code contributions are welcome on GitHub.

## Version Info

| Item | Details |
| --- | --- |
| Current Version | 0.2.5 |
| Build Framework | Tauri v2 |
| Frontend Framework | React 19 |
| Editor Engine | TipTap 3.x (WYSIWYG) + CodeMirror 6 (Source) |
| Supported Platforms | Windows / macOS / Linux |

## Check for Updates

Tydora supports automatic updates: on startup, it checks for new versions in the background and prompts you to download if one is available.

Manual check steps:

1. Open Settings (press `Ctrl+,`).
2. Switch to the "About" tab.
3. Click "Check for Updates."

> [!TIP]Automatic updates rely on signed files (.sig and latest.json) on GitHub Releases. See  for contributor setup details.

## Feature Overview

- **Dual-Mode Editing**: WYSIWYG (IR) + Source Mode (SV), toggle with `Ctrl+/`
- **Multi-Vault Management**: Folder-based vaults with drag-and-drop file tree
- **WikiLink Bidirectional Links**: `<a data-note="Note Name">Note Name</a>` syntax, autocomplete + backlinks panel
- **Knowledge Graph**: D3.js force-directed graph visualizing note relationships
- **Mind Map**: Auto-generated from Markdown heading hierarchy, powered by markmap
- **Whiteboard Canvas**: Infinite React Flow canvas with text / note / image / media / URL / group nodes
- **Callout Blocks**: 15 GitHub-style callout types
- **Mermaid Diagrams**: Flowcharts, sequence diagrams, Gantt charts — live rendered
- **Math Formulas**: KaTeX / MathJax dual engine support
- **Frontmatter Properties Panel**: YAML metadata management
- **One-Click Publish**: Publish your vault as a static website with built-in preview server
- **Theme System**: 9 built-in themes + custom/Typora theme import
- **Code Highlighting**: 11 highlight themes, 36 languages supported
- **Customizable Shortcuts**: 40+ keyboard shortcuts, all rebindable in settings
- **Multimedia Preview**: Images, video, audio, PDF

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Rust (Tauri v2) |
| Frontend | React 19 + TypeScript + Vite 6 |
| Editor | TipTap 3.x (WYSIWYG) + CodeMirror 6 (Source) |
| Visualization | D3.js (Graph), markmap (Mind Map), Mermaid (Diagrams), React Flow (Canvas) |
| Plugins | tauri-plugin-fs / dialog / window-state / updater / process |

## Open Source License

Tydora is licensed under the [Apache License 2.0](LICENSE). You are free to use, modify, and redistribute, subject to the license terms (preserving copyright and license notices).

## Feedback

Encountered an issue or have a suggestion? Reach out through:

- **GitHub Issues**: Submit bug reports and feature requests
- **GitHub Discussions**: Participate in usage discussions and experience sharing

> [!TIP]When submitting an issue, include your OS version, Tydora version, and reproduction steps — it helps us locate the problem faster.

## Related Documents

- [[01-Getting-Started/01-Quick-Start]] — Getting started guide
- [[index]] — Documentation home
- [[09-blog/Auto-Update-Configuration]] — Auto-update signing setup (contributor-oriented)
- [[01-Getting-Started/03-FAQ]] — Frequently asked questions