export interface Manifest {
  site: {
    title: string;
    homeSlug: string;
    defaultTheme: 'light' | 'dark';
    /** Absolute origin for canonical/OG URLs (from $SITE_URL at build). '' if unset. */
    url: string;
    /** Site-wide description (home page + OG fallback). */
    description: string;
    /** BCP-47 language of the content, set on <html lang>. Default 'en'. */
    lang: string;
    /** Optional sidebar footer credit. Empty → no footer shown. */
    footer: string;
  };
  routes: RouteEntry[];
  nav: NavNode[];
}

export interface RouteEntry {
  slug: string;
  kind: 'note' | 'canvas';
  title: string;
}

export interface NavNode {
  type: 'folder' | 'note' | 'canvas';
  name: string;
  slug?: string;
  children?: NavNode[];
}
