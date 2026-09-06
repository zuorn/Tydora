import { inject, Injectable } from '@angular/core';
import type { SearchDoc } from '@shared/content-model';
import { ContentService } from '../content/content.service';

export interface SearchHit {
  slug: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
}

/**
 * Unified search over the static index. Keyword scoring (title-weighted term
 * frequency) with a windowed snippet. The semantic layer (R8.2) augments this
 * via {@link semanticHits}; results are merged in {@link search}.
 *
 * Shared by the human search-overlay and the WebMCP `search_notes` agent tool.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly content = inject(ContentService);
  private docs?: SearchDoc[];

  private async index(): Promise<SearchDoc[]> {
    if (!this.docs) {
      this.docs = (await this.content.loadSearchIndex()).docs;
    }
    return this.docs;
  }

  async search(query: string, limit = 10): Promise<SearchHit[]> {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }
    const terms = q.split(/\s+/).filter(Boolean);
    const docs = await this.index();
    const hits: SearchHit[] = [];
    for (const doc of docs) {
      const title = doc.title.toLowerCase();
      const text = doc.text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) {
          score += title === t ? 12 : 6;
        }
        const occ = countOccurrences(text, t);
        score += Math.min(occ, 8);
      }
      // small boost when the whole phrase appears
      if (terms.length > 1 && text.includes(q)) {
        score += 5;
      }
      if (score > 0) {
        hits.push({
          slug: doc.slug,
          title: doc.title,
          url: doc.url,
          snippet: makeSnippet(doc.text, terms),
          score,
        });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

function makeSnippet(text: string, terms: string[], window = 180): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) {
      at = i;
    }
  }
  if (at === -1) {
    return text.slice(0, window).trim() + (text.length > window ? '…' : '');
  }
  const start = Math.max(0, at - window / 3);
  const end = Math.min(text.length, start + window);
  return (
    (start > 0 ? '…' : '') +
    text.slice(start, end).trim() +
    (end < text.length ? '…' : '')
  );
}
