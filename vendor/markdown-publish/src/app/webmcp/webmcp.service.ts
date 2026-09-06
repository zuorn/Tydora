import { inject, Injectable } from '@angular/core';
import { ContentService } from '../content/content.service';
import { SearchService } from '../search/search.service';
import { ensureModelContext, type McpToolResult } from './model-context-polyfill';

/**
 * Exposes the published vault to in-browser AI agents via WebMCP
 * (`navigator.modelContext`, W3C Web Model Context draft). Each tool is a pure
 * read over the static content bundle — no backend. Uses the native API when
 * present, otherwise our own minimal in-page polyfill (no third-party code).
 */
@Injectable({ providedIn: 'root' })
export class WebmcpService {
  private readonly content = inject(ContentService);
  private readonly search = inject(SearchService);
  private registered = false;

  register(): void {
    if (this.registered) {
      return;
    }
    const mc = ensureModelContext();
    if (!mc) {
      return; // not a browser — nothing to expose
    }
    this.registered = true;

    mc.registerTool({
      name: 'search_notes',
      description:
        'Search the published notes by keyword and return the best matches ' +
        '(title, slug, url, snippet). Use this first to find which notes are ' +
        'relevant to a question, then fetch full text with get_note.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search query.' },
          limit: {
            type: 'number',
            description: 'Max results to return (1–25, default 10).',
            minimum: 1,
            maximum: 25,
          },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const hits = await this.search.search(
          String(args?.['query'] ?? ''),
          clamp(args?.['limit'], 1, 25, 10),
        );
        return ok({
          results: hits.map((h) => ({
            title: h.title,
            slug: h.slug,
            url: h.url,
            snippet: h.snippet,
          })),
        });
      },
    });

    mc.registerTool({
      name: 'get_note',
      description:
        'Fetch the full markdown text of a single published note by its slug ' +
        '(as returned by search_notes or list_notes), with title, url and backlinks.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            description: 'Note slug, e.g. "v21-prosto/00-bolshaya-kartina".',
          },
        },
        required: ['slug'],
      },
      execute: async (args) => {
        const slug = String(args?.['slug'] ?? '').replace(/^\//, '');
        try {
          const note = await this.content.loadNote(slug);
          return ok({
            slug: note.slug,
            title: note.title,
            url: `/${note.slug}`,
            markdown: note.markdown,
            backlinks: note.backlinks,
          });
        } catch {
          return fail(`Note not found: ${slug}`);
        }
      },
    });

    mc.registerTool({
      name: 'list_notes',
      description:
        'List every published note (title, slug, url) so an agent can browse ' +
        'the full contents of the site.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const idx = await this.content.loadSearchIndex();
        return ok({
          count: idx.docs.length,
          notes: idx.docs.map((d) => ({
            title: d.title,
            slug: d.slug,
            url: d.url,
          })),
        });
      },
    });

    mc.registerTool({
      name: 'get_backlinks',
      description: 'List the notes that link to the given note (its backlinks).',
      inputSchema: {
        type: 'object',
        properties: { slug: { type: 'string', description: 'Note slug.' } },
        required: ['slug'],
      },
      execute: async (args) => {
        const slug = String(args?.['slug'] ?? '').replace(/^\//, '');
        try {
          const note = await this.content.loadNote(slug);
          return ok({ slug: note.slug, backlinks: note.backlinks });
        } catch {
          return fail(`Note not found: ${slug}`);
        }
      },
    });
  }
}

function ok(payload: Record<string, unknown>): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function fail(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(n)));
}
