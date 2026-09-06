export interface Note {
  slug: string;
  title: string;
  html: string;
  /** Raw markdown body (frontmatter stripped). Served to AI agents via WebMCP. */
  markdown: string;
  headings: Heading[];
  backlinks: LinkRef[];
  outgoing: LinkRef[];
  frontmatter: Record<string, unknown>;
  publish: 'public' | 'private';
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
}

export interface LinkRef {
  slug: string;
  title: string;
}
