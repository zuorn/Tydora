// Slug helpers. slug = vault-relative path without extension, each segment
// lower-kebab (spaces->-, collapse runs of non-letter/number to -), joined by
// '/'. Unicode-aware so Cyrillic (and other scripts) survive — emoji and
// punctuation are dropped, matching Obsidian Publish's Cyrillic URLs.

export function slugifySegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build a slug from a vault-relative posix path (e.g. "Notes/Note B.md"). */
export function pathToSlug(relPath: string): string {
  const noExt = relPath.replace(/\.[^./]+$/, '');
  return noExt
    .split('/')
    .map(slugifySegment)
    .filter(Boolean)
    .join('/');
}

/** Posix basename without extension. */
export function baseName(relPath: string): string {
  const file = relPath.split('/').pop() ?? relPath;
  return file.replace(/\.[^./]+$/, '');
}
