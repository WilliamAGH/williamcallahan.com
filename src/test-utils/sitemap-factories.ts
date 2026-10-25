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
    lastModified: string;
    pageSize: number;
  }> = {},
) => ({
  count: overrides.count ?? 0,
  totalPages: overrides.totalPages ?? 1,
  pageSize: overrides.pageSize ?? BOOKMARKS_PER_PAGE,
  lastModified: overrides.lastModified ?? new Date().toISOString(),
  lastFetchedAt: Date.now(),
  lastAttemptedAt: Date.now(),
  checksum: "test",
  changeDetected: true,
});
