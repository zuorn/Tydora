<p align="center">
  <img src=".github/media/logo.svg" width="88" alt="markdown-publish logo">
</p>

<h1 align="center">markdown-publish</h1>

<p align="center">
  Turn a folder of Markdown / Obsidian notes into a fast static website —<br>
  instant search, interactive link graph, canvas boards. In a couple of clicks.
</p>

<p align="center">
  <sub>A free, open-source <b>alternative to Obsidian Publish</b>: your notes stay in your repo,<br>
  the site is hosted on your own account (GitHub Pages / Netlify / Vercel / Cloudflare) — $0/month.</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@abstractwebunit/markdown-publish"><img src="https://img.shields.io/npm/v/%40abstractwebunit%2Fmarkdown-publish?color=8a5cf5&label=npm" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <a href="https://abstractwebunit.github.io/markdown-publish-docs/"><img src="https://img.shields.io/badge/docs-6%20languages-8a5cf5" alt="Docs in 6 languages"></a>
  <a href="https://github.com/abstractwebunit/markdown-publish-template/generate"><img src="https://img.shields.io/badge/template-use%20it-2ea44f" alt="Use the template"></a>
</p>

<p align="center">
  <b>Live demo & docs:</b>
  <a href="https://abstractwebunit.github.io/markdown-publish-docs/">Русский</a> ·
  <a href="https://abstractwebunit.github.io/markdown-publish-docs/en/">English</a> ·
  <a href="https://abstractwebunit.github.io/markdown-publish-docs/es/">Español</a> ·
  <a href="https://abstractwebunit.github.io/markdown-publish-docs/de/">Deutsch</a> ·
  <a href="https://abstractwebunit.github.io/markdown-publish-docs/fr/">Français</a> ·
  <a href="https://abstractwebunit.github.io/markdown-publish-docs/zh/">中文</a>
  <br><sub>The docs site is itself built by markdown-publish — what you see is what you ship.</sub>
</p>

![A published vault: sidebar navigation, note content, interactive link graph](.github/media/home.png)

## Publish your vault in a couple of clicks

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/abstractwebunit/markdown-publish-template)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/abstractwebunit/markdown-publish-template&project-name=my-notes&repository-name=my-notes)

One click clones the [starter template](https://github.com/abstractwebunit/markdown-publish-template) into your GitHub and builds the site. Drop `.md` files into `vault/` — the site rebuilds on every commit. Prefer GitHub Pages? [Use the template](https://github.com/abstractwebunit/markdown-publish-template/generate) and enable Pages — the workflow is already inside.

## Features

| Interactive link graph | Canvas boards | Instant search |
|---|---|---|
| ![Graph](.github/media/graph.png) | ![Canvas](.github/media/canvas.png) | ![Search](.github/media/search.png) |

- **Search in the browser** ([Pagefind](https://pagefind.app)) — no server, `Ctrl+K`, works offline.
- **Link graph** (WebGL) — global view + a local graph beside every note; smooth at 1,500+ notes.
- **Canvas boards** — `.canvas` files ([JSON Canvas](https://jsoncanvas.org)) render as interactive boards: drag, resize, follow links.
- **Obsidian-flavoured Markdown** — `[[wikilinks]]`, embeds, callouts, tags, footnotes, code highlighting, backlinks, hover previews.
- **SEO out of the box** — per-page meta/OG/JSON-LD, sitemap, robots.txt, [llms.txt](https://llmstxt.org), and a generated social card with your site's name.
- **AI-agent ready** — every site exposes [WebMCP](https://github.com/webmachinelearning/webmcp) tools (`search_notes`, `get_note`, …) so agents can query your notes.
- **Non-Latin URLs** — Cyrillic, CJK and other scripts survive in page addresses.
- Light/dark theme, mobile layout, zero runtime dependencies — pure static output.

## Use it as a CLI

```bash
npx @abstractwebunit/markdown-publish build --vault ./my-notes --out dist
```

Configure via flags or `markdown-publish.config.json`:

```json
{
  "siteName": "My Notes",
  "siteLang": "en",
  "vaultDir": "vault",
  "buildMode": "full"
}
```

Key options: `siteName`, `siteUrl`, `siteLang`, `siteDescription`, `vaultDir`, `buildMode` (`full` | `public` — publish everything or only `publish: public` notes), `baseHref` (e.g. `/repo/` for GitHub Pages project sites), `home` (explicit home note). Full reference: [docs → Configuration](https://abstractwebunit.github.io/markdown-publish-docs/en/setup/configuration).

## Use it as a GitHub Action

```yaml
- uses: abstractwebunit/markdown-publish@v1
  with:
    vault-dir: vault
    base-href: "/${{ github.event.repository.name }}/"
    site-url: "https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}"
```

A complete Pages workflow ships in [`templates/publish.yml`](templates/publish.yml); Netlify/Vercel configs in [`templates/`](templates/).

## How it works

A build-time Node parser turns the vault into a content bundle (notes, link graph, canvas models, search docs); an Angular SSG prerenders every route into static HTML. No backend, nothing to maintain — host the output anywhere.

## License

[MIT](LICENSE). Not affiliated with, endorsed by, or connected to Obsidian.MD Inc. — "Obsidian" is referenced only to describe vault compatibility; the `.canvas` format is the open [JSON Canvas](https://jsoncanvas.org) standard.
