---
title: Publish Website
tags: [features]
---

# Publish Website

Tydora can turn your note vault into a **static website** with one click — no server to set up, so you can share a wiki, documentation set, or digital garden with anyone. The generated site includes search, a relationship graph, and Canvas whiteboards.

> [!NOTE]
> Publishing has two entry points: the "Publish" tab in Settings, and "Publish as website" in the Command Palette (`Ctrl+P`). Under the hood, `@abstractwebunit/markdown-publish` builds the static site.

## Prerequisites

The publish feature depends on the `@abstractwebunit/markdown-publish` CLI. **The installer does not bundle this CLI** — install it once manually first:

1. Install [Node.js](https://nodejs.org) (18 or later recommended).
2. Run in a terminal:

   ```bash
   npm install -g @abstractwebunit/markdown-publish
   ```

3. Restart Tydora.

> [!IMPORTANT]
> Without it installed, clicking "Publish" reports "markdown-publish CLI not found" and provides a one-click copyable install command. The CLI pulls in large dependencies such as Angular; bundling it would inflate the installer from roughly 7 MB to over 20 MB, so it is installed on demand instead.

> [!TIP]
> Tydora looks for the CLI in this order: ① the installer's resource directory (for compatibility with older installs) → ② the project's `vendor/` and `node_modules/` (development) → ③ the global npm installation. In development you don't need a global install.

## The Publishing Workflow

1. **Configure publish settings**: fill in the site name, description, language, and other basics, then save.
2. **Choose a build mode**: publish everything, or public notes only.
3. **Start publishing**: click "Start publishing" / "Generate site" and the UI shows build progress.
4. **Preview or deploy**: click "Preview website" to view it in a browser, or upload the output directory to any static host.

## Build Modes

| Mode | Description |
| --- | --- |
| **Publish all** | Publishes **every** note in the vault — suited to a personal wiki, project docs, or anything you share wholesale |
| **Public notes only** | Publishes only notes with `publish: public` in Frontmatter — suited to selective sharing from one vault |

> How to mark a note public: add `publish: public` at the top of the file. See [[02-Editor/07-Frontmatter]].

## Publish Configuration

| Setting | Description | Default |
| --- | --- | --- |
| Site name | The site title, e.g. "My Notes" | My Notes |
| Site description | A short description for SEO | Notes and ideas |
| Site language | The site's default language: Chinese / English / Japanese / Korean | Chinese |
| Site URL | The deployment address, used for absolute links and the sitemap | — |
| Footer credit | Text shown at the bottom of pages; hidden when empty | Empty |
| Notes directory | Relative to the vault root; the root (`.`) by default | `.` |
| Build mode | Publish all / Public notes only | Publish all |
| Base path | GitHub Pages uses `/<repo>/`; other platforms usually `/` | `/` |
| Output directory | Where build artifacts go, relative to the vault root | `dist` |

The configuration is written to `markdown-publish.config.json` inside the vault. The UI also offers "Reset to defaults" and a "Browse" button to pick the output directory.

> [!TIP]
> When deploying to GitHub Pages, remember to set "Site URL" to `https://<username>.github.io/<repo>/` and "Base path" to `/<repo>/`, otherwise asset paths will 404.

## Preview and Output

| Action | Description |
| --- | --- |
| Preview website | Starts a built-in HTTP server and opens the build result in a browser |
| Stop preview | Shuts down the preview server |
| Open output directory | Opens the build artifact directory in the system file manager |

The build output is plain static files, so it can be hosted anywhere that serves static content:

| Platform | Description |
| --- | --- |
| GitHub Pages | Free, supports custom domains |
| Vercel | One-click deploy with a global CDN |
| Netlify | Supports forms and functions |
| Your own server | Any HTTP server (Nginx / Apache, etc.) |

## What the Published Site Can Do

- Preserves [[03-Knowledge-Management/01-Wiki-Links]] navigation within the site
- Built-in search
- Relationship graph
- Canvas whiteboards
- Callouts, Mermaid, math formulas, and other rich elements render normally

## Related Documents

- [[02-Editor/07-Frontmatter]] — Using `publish` to control scope
- [[03-Knowledge-Management/01-Wiki-Links]] — The bidirectional links site navigation relies on
- [[08-Advanced-Features/03-Whiteboard-Canvas]] — How canvases appear on the published site
- [[01-Getting-Started/03-FAQ]] — Publish-related troubleshooting
- [[09-blog/Website-Analytics]] — Adding visitor analytics to a published site
