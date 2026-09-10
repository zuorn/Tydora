---
title: About Tydora
tags: [getting-started]
---

# About Tydora

Tydora is a modern desktop Markdown editor built on Tauri v2 + React 19. It supports WYSIWYG and source dual-mode editing, WikiLink bidirectional links, tags and bookmarks, a knowledge graph, mind maps, a whiteboard canvas, a built-in terminal, and multi-format export. The name blends *Type/Typography* with the Ancient Greek *δῶρον* ("gift") — a gift at your fingertips.

> [!NOTE]
> Tydora is open-source software released under the Apache License 2.0. Issues, discussions, and code contributions are welcome on GitHub.

## Version Information

| Item | Value |
| --- | --- |
| Current version | 0.2.5 | <!-- x-release-please-version -->
| Build framework | Tauri v2 |
| Frontend | React 19 + TypeScript + Vite 6 |
| Editor engines | TipTap 3.x (WYSIWYG) + CodeMirror 6 (source) |
| Supported platforms | Windows / macOS / Linux |

## Check for Updates

Tydora supports auto-update: it checks for a new version in the background on startup and prompts you to download and install if one is found.

To check manually:

1. Open Settings (press `Ctrl+,`).
2. Switch to the "About" tab.
3. Click "Check for Updates".

> [!NOTE]
> Update behavior differs by distribution channel:
> - **GitHub build**: uses the Tauri updater to read `latest.json` and the `.sig` signature from GitHub Releases, then downloads and installs the new version.
> - **Microsoft Store build**: updates follow the Store. When a newer version exists on GitHub, the About page offers a one-click switch to the GitHub build (after which updates come from GitHub).
> - **Portable build**: checks and installs updates through a dedicated portable channel.

> [!TIP]
> For signing key configuration, see [[09-blog/Auto-Update-Configuration]] (contributor-facing).

## Feature Highlights

- **Dual-mode editing**: live preview (IR / WYSIWYG) + source mode (SV), switch with `Ctrl+/`
- **Vim mode**: LazyVim-style keybindings, a Leader (which-key) menu, and pane navigation (off by default; enable in Settings)
- **Multi-vault management**: folder-based vaults; the file tree supports sorting, multi-select, and drag & drop
- **WikiLink bidirectional links**: `[[Note Name]]` syntax with autocomplete, aliases, heading anchors, and automatic repair on rename
- **Tag system**: `#tag` syntax plus a tag list and tag graph, with global `#tag keyword` filtering
- **Bookmarks**: bookmark files and folders, organized in groups with drag-and-drop ordering
- **Knowledge graph**: WebGL force-directed graph (D3 layout) visualizing note relationships
- **Mind map**: generated automatically from Markdown heading levels, powered by Markmap; export SVG or copy as image
- **Whiteboard canvas**: React Flow infinite canvas, compatible with the JSON Canvas (`.canvas`) format, 7 node types
- **Callouts**: 15 GitHub-style types, collapsible
- **Mermaid diagrams**: flowcharts, sequence diagrams, Gantt charts, and more, rendered live
- **Math**: KaTeX rendering plus a formula dialog with live preview
- **Frontmatter**: inline YAML metadata editing in live-preview mode
- **Find and replace**: `Ctrl+F` / `Ctrl+H`
- **Splits and multiple panes**: horizontal / vertical splits; editors and terminals can share any layout
- **Built-in terminal**: xterm.js + a real shell, 12 color schemes
- **Export and copy**: PDF, HTML, Word, long image, Markdown, WeChat article, social cards (Xiaohongshu)
- **One-click publish**: publish a vault as a static site with a built-in preview server
- **Theme system**: 10 built-in themes plus a custom theme editor and theme pack import/export
- **Code highlighting**: 11 color schemes; the code block language picker covers 30+ languages
- **Customizable shortcuts**: 48 shortcuts can be rebound in Settings
- **Multilingual UI**: Simplified Chinese / English
- **Media preview**: images, video, audio, PDF

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Rust (Tauri v2), acting only as an IPC and file I/O gateway |
| Frontend | React 19 + TypeScript + Vite 6 |
| Editors | TipTap 3.x (WYSIWYG) + CodeMirror 6 (source) |
| Visualization | D3.js (graph layout), markmap (mind map), Mermaid (diagrams), React Flow (canvas) |
| Terminal | xterm.js + a Rust-side PTY |
| Tauri plugins | fs / dialog / window-state / updater / process / clipboard-manager / single-instance |

## License

Tydora is released under the [Apache License 2.0](LICENSE). You are free to use, modify, and redistribute it, provided you comply with the license terms (keep the copyright and license notices).

## Feedback

Found a problem or have a suggestion? Reach out through:

- **GitHub Issues**: bug reports and feature requests
- **GitHub Discussions**: usage discussions and experience sharing

> [!TIP]
> When filing an issue, include your OS version, the Tydora version, and reproduction steps — it helps us locate the problem much faster.

## Related Documents

- [[01-Getting-Started/01-Quick-Start]] — Getting started guide
- [[index]] — Documentation home
- [[09-blog/Auto-Update-Configuration]] — Auto-update signing configuration (contributors)
- [[01-Getting-Started/03-FAQ]] — Troubleshooting common problems
