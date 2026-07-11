const BOOKMARKS_KEY = "zmd-bookmarks";

export interface Bookmark {
  id: string;
  path: string;
  title: string;
  createdAt: number;
  order: number;
}

export interface BookmarkGroup {
  id: string;
  name: string;
  bookmarks: Bookmark[];
  order: number;
}

export type BookmarkStore = Record<string, BookmarkGroup[]>;

function generateId(): string {
  return crypto.randomUUID();
}

export function loadBookmarks(): BookmarkStore {
  try {
    const saved = localStorage.getItem(BOOKMARKS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function saveBookmarks(store: BookmarkStore): void {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(store));
}

export function getGroupsForVault(vaultPath: string): BookmarkGroup[] {
  const store = loadBookmarks();
  return (store[vaultPath] || []).sort((a, b) => a.order - b.order);
}

export function isBookmarked(vaultPath: string, filePath: string): boolean {
  const groups = getGroupsForVault(vaultPath);
  return groups.some((g) => g.bookmarks.some((b) => b.path === filePath));
}

export function addBookmark(
  vaultPath: string,
  path: string,
  title: string,
  groupId: string,
): void {
  const store = loadBookmarks();
  if (!store[vaultPath]) store[vaultPath] = [];

  let group = store[vaultPath].find((g) => g.id === groupId);
  if (!group) {
    group = {
      id: generateId(),
      name: "未分组",
      bookmarks: [],
      order: store[vaultPath].length,
    };
    store[vaultPath].push(group);
  }

  const maxOrder = group.bookmarks.reduce((max, b) => Math.max(max, b.order), -1);
  group.bookmarks.push({
    id: generateId(),
    path,
    title,
    createdAt: Date.now(),
    order: maxOrder + 1,
  });

  saveBookmarks(store);
}

export function removeBookmark(vaultPath: string, bookmarkId: string): void {
  const store = loadBookmarks();
  if (!store[vaultPath]) return;

  for (const group of store[vaultPath]) {
    const idx = group.bookmarks.findIndex((b) => b.id === bookmarkId);
    if (idx !== -1) {
      group.bookmarks.splice(idx, 1);
      break;
    }
  }

  saveBookmarks(store);
}

export function updateBookmark(
  vaultPath: string,
  bookmarkId: string,
  updates: { title?: string; groupId?: string },
): void {
  const store = loadBookmarks();
  if (!store[vaultPath]) return;

  let bookmark: Bookmark | null = null;
  for (const group of store[vaultPath]) {
    const idx = group.bookmarks.findIndex((b) => b.id === bookmarkId);
    if (idx !== -1) {
      bookmark = group.bookmarks.splice(idx, 1)[0];
      break;
    }
  }

  if (!bookmark) return;

  if (updates.title !== undefined) bookmark.title = updates.title;

  if (updates.groupId) {
    let targetGroup = store[vaultPath].find((g) => g.id === updates.groupId);
    if (!targetGroup) {
      targetGroup = {
        id: generateId(),
        name: "未分组",
        bookmarks: [],
        order: store[vaultPath].length,
      };
      store[vaultPath].push(targetGroup);
    }
    const maxOrder = targetGroup.bookmarks.reduce((max, b) => Math.max(max, b.order), -1);
    bookmark.order = maxOrder + 1;
    targetGroup.bookmarks.push(bookmark);
  } else {
    // Put back in original group (bookmark was already removed)
    const originalGroup = store[vaultPath].find((g) =>
      g.bookmarks.some((b) => b.id === bookmark!.id),
    );
    if (originalGroup) {
      originalGroup.bookmarks.push(bookmark);
    } else if (store[vaultPath].length > 0) {
      store[vaultPath][0].bookmarks.push(bookmark);
    }
  }

  saveBookmarks(store);
}

export function createGroup(vaultPath: string, name: string): BookmarkGroup {
  const store = loadBookmarks();
  if (!store[vaultPath]) store[vaultPath] = [];

  const maxOrder = store[vaultPath].reduce((max, g) => Math.max(max, g.order), -1);
  const group: BookmarkGroup = {
    id: generateId(),
    name,
    bookmarks: [],
    order: maxOrder + 1,
  };

  store[vaultPath].push(group);
  saveBookmarks(store);
  return group;
}

export function renameGroup(vaultPath: string, groupId: string, name: string): void {
  const store = loadBookmarks();
  if (!store[vaultPath]) return;

  const group = store[vaultPath].find((g) => g.id === groupId);
  if (group) {
    group.name = name;
    saveBookmarks(store);
  }
}

export function deleteGroup(vaultPath: string, groupId: string): void {
  const store = loadBookmarks();
  if (!store[vaultPath]) return;

  const idx = store[vaultPath].findIndex((g) => g.id === groupId);
  if (idx !== -1) {
    store[vaultPath].splice(idx, 1);
    saveBookmarks(store);
  }
}

export function reorderBookmarks(
  vaultPath: string,
  groupId: string,
  bookmarkIds: string[],
): void {
  const store = loadBookmarks();
  if (!store[vaultPath]) return;

  const group = store[vaultPath].find((g) => g.id === groupId);
  if (!group) return;

  const bookmarkMap = new Map(group.bookmarks.map((b) => [b.id, b]));
  group.bookmarks = bookmarkIds
    .map((id, i) => {
      const b = bookmarkMap.get(id);
      if (b) b.order = i;
      return b!;
    })
    .filter(Boolean);

  saveBookmarks(store);
}

export function moveBookmark(
  vaultPath: string,
  bookmarkId: string,
  fromGroupId: string,
  toGroupId: string,
  toIndex: number,
): void {
  const store = loadBookmarks();
  if (!store[vaultPath]) return;

  const fromGroup = store[vaultPath].find((g) => g.id === fromGroupId);
  const toGroup = store[vaultPath].find((g) => g.id === toGroupId);
  if (!fromGroup || !toGroup) return;

  const idx = fromGroup.bookmarks.findIndex((b) => b.id === bookmarkId);
  if (idx === -1) return;

  const [bookmark] = fromGroup.bookmarks.splice(idx, 1);
  toGroup.bookmarks.splice(toIndex, 0, bookmark);

  // Re-order both groups
  fromGroup.bookmarks.forEach((b, i) => (b.order = i));
  toGroup.bookmarks.forEach((b, i) => (b.order = i));

  saveBookmarks(store);
}

export function reorderGroups(vaultPath: string, groupIds: string[]): void {
  const store = loadBookmarks();
  if (!store[vaultPath]) return;

  const groupMap = new Map(store[vaultPath].map((g) => [g.id, g]));
  store[vaultPath] = groupIds
    .map((id, i) => {
      const g = groupMap.get(id);
      if (g) g.order = i;
      return g!;
    })
    .filter(Boolean);

  saveBookmarks(store);
}
