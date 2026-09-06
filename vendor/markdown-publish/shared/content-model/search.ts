/** Compact per-note record used by the search service and WebMCP agent tools. */
export interface SearchDoc {
  slug: string;
  title: string;
  url: string;
  /** Plain-text body (markdown stripped), used for keyword scoring + snippets. */
  text: string;
}

export interface SearchIndex {
  docs: SearchDoc[];
}

/** Metadata for the semantic embedding store (vectors live in embeddings.bin). */
export interface EmbeddingMeta {
  model: string;
  dim: number;
  /** Slugs in the same order as the Float32 vectors packed into embeddings.bin. */
  slugs: string[];
}
