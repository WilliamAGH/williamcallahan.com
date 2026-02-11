import { BOOKMARKS_PER_PAGE } from "@/lib/constants";

export const buildBookmark = (
  id: string,
  overrides: Partial<{
    slug: string;
    url: string;
    title: string;
    description: string;
    dateBookmarked?: string;
    modifiedAt?: string;
    dateCreated?: string;
    sourceUpdatedAt?: string;
    tags: string[];
  }> = {},
) => ({
  id,
  slug: overrides.slug ?? `bookmark-${id}`,
  url: overrides.url ?? `https://example.com/${id}`,
  title: overrides.title ?? `Bookmark ${id}`,
  description: overrides.description ?? `Description for ${id}`,
  dateBookmarked: overrides.dateBookmarked ?? new Date().toISOString(),
  modifiedAt: overrides.modifiedAt ?? new Date().toISOString(),
  dateCreated: overrides.dateCreated ?? new Date().toISOString(),
  sourceUpdatedAt: overrides.sourceUpdatedAt ?? new Date().toISOString(),
  tags: overrides.tags ?? [],
  imageAssetId: undefined,
  notes: undefined,
  registryLinks: [],
  collectionId: undefined,
  sort: 0,
  type: "link" as const,
  cover: undefined,
  domain: "example.com",
  tld: "com",
  logo: undefined,
  blurhash: undefined,
});

export const buildBookmarksIndex = (
  overrides: Partial<{
    count: number;
    totalPages: number;
    lastModified: string | undefined;
    pageSize: number;
  }> = {},
) => ({
  count: overrides.count ?? 0,
  totalPages: overrides.totalPages ?? 1,
  pageSize: overrides.pageSize ?? BOOKMARKS_PER_PAGE,
  lastModified: overrides.lastModified,
  lastFetchedAt: Date.now(),
  lastAttemptedAt: Date.now(),
  checksum: "test",
  changeDetected: true,
});

export const generatePaginatedBookmarks = (
  totalPages: number,
  pageSize: number,
  baseDate = "2024-01-01T00:00:00Z",
) => {
  const pageData = new Map<number, ReturnType<typeof buildBookmark>[]>();
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * pageSize;
    // For simulation, just create full pages except maybe the last one if we tracked total items
    // But for the test we just need *some* bookmarks
    const bookmarks: ReturnType<typeof buildBookmark>[] = [];
    for (let i = 0; i < pageSize; i++) {
      const id = start + i;
      bookmarks.push(
        buildBookmark(String(id), {
          slug: `bookmark-${id}`,
          dateBookmarked: baseDate,
        }),
      );
    }
    pageData.set(page, bookmarks);
  }
  return pageData;
};

export const generateBookmarksList = (
  count: number,
  prefix: string,
  overrides: Partial<Parameters<typeof buildBookmark>[1]> = {},
) => {
  return Array.from({ length: count }, (_, idx) =>
    buildBookmark(`${prefix}-${idx}`, {
      slug: `${prefix}-${idx}`,
      ...overrides,
    }),
  );
};

export const SAMPLE_SLUG_MAPPING = {
  version: "1",
  generated: "2024-01-02T00:00:00.000Z",
  count: 2,
  checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  slugs: {
    "bookmark-1": {
      id: "bookmark-1",
      slug: "example-com-article",
      url: "https://example.com/article",
      title: "Great Article",
    },
    "bookmark-2": {
      id: "bookmark-2",
      slug: "another-com-post",
      url: "https://another.com/post",
      title: "Another Post",
    },
  },
  reverseMap: {
    "example-com-article": "bookmark-1",
    "another-com-post": "bookmark-2",
  },
};
