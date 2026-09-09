---
title: Publish Website
tags: [feature]
---

# Publish Website

Tydora can turn your note repository (Vault) into a **static website with a single click**, letting you share your knowledge base, documentation, or digital garden with anyone without setting up a server.

> [!NOTE]
> The publish feature is operated from the "Publish" tab in Settings (or the publish panel). Under the hood, it builds a static site using `@abstractwebunit/markdown-publish`.

## Prerequisites

Publishing relies on the `@abstractwebunit/markdown-publish` CLI, which is **not bundled** with the installer. Install it once manually:

1. Install [Node.js](https://nodejs.org) (18 or newer recommended).
2. Run in a terminal:

   ```bash
   npm install -g @abstractwebunit/markdown-publish
   ```

3. Restart Tydora.

> [!IMPORTANT]
> If the CLI is missing, clicking "Publish" shows "markdown-publish CLI not found". The CLI pulls in large dependencies such as Angular; shipping it inside the installer would grow the package from ~7 MB to over 20 MB, so it is installed on demand instead.

## Publish Workflow

1. **Configure publish settings**: Fill in basic information such as site name, description, and language.
2. **Choose a publish mode**: Full publish, or public notes only.
3. **Start publishing**: Build the static website with a single click.
4. **Preview or deploy**: Preview locally, or upload the output to any static hosting service.

## Publish Modes

### Full Publish

Publishes **all** Markdown files in the Vault. Suitable for scenarios where the entire library should be exposed, such as personal knowledge bases and project documentation.

### Public Notes Only

Publishes only files with `publish: public` in their Frontmatter. Suitable for "selective sharing from a single repository" scenarios — keep private notes local and only release curated content.

> How to mark a note as public: write `publish: public` at the top of the file. See [[02-Editor/07-Frontmatter]].

## Publish Configuration

| Setting | Description |
| --- | --- |
| Site name | Website title (`<title>`) |
| Site description | Website description, used for SEO |
| Language | Website language (Chinese / English / Japanese / Korean) |
| Site URL | The final deployed website address (used for absolute links and sitemap) |
| Footer | Custom footer content |
| Vault directory | The directory within the Vault to publish (subdirectories can be specified) |
| Build mode | Full publish / Public notes only |
| Base Path | Fill in when deploying to a subpath, e.g., `/<repo>/` for GitHub Pages |
| Output directory | The output location of the build artifacts |

> [!TIP]
> When deploying to GitHub Pages, remember to set the "Site URL" to `https://<username>.github.io/<repo>/` and the "Base Path" to `/<repo>/`, otherwise resource paths will return 404.

## Preview the Site

After the build completes, you can:

- **Preview locally**: Start the built-in HTTP server and view the result in your browser
- **Open directory**: Open the output directory in your file manager to inspect the artifacts
- **Deploy directly**: Upload the entire output directory to a static hosting service

## Technical Implementation

- Built using the `@abstractwebunit/markdown-publish` CLI
- Generates a static site (with client-side routing)
- Preserves the ability to navigate within the site using `[[03-Knowledge-Management/01-Wiki-Links]]`
- Callout, Mermaid, math formulas, and other rich elements render correctly after publishing

## Deployment Suggestions

The built static site can be hosted on any service that supports static files:

| Platform | Description |
| --- | --- |
| GitHub Pages | Free, supports custom domains |
| Vercel | One-click deployment, global CDN |
| Netlify | Supports forms and functions |
| Your own server | Any HTTP server (Nginx / Apache, etc.) |

## Related Documents

- [[02-Editor/07-Frontmatter]] — Use `publish` to control the publish scope
- [[07-Settings/02-Editor-Settings]] — Editor configuration
- [[01-Getting-Started/03-FAQ]] — Troubleshooting for publishing
