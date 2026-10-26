/** @vitest-environment node */
import { GET } from "@/app/bookmarks/domain/[domainSlug]/route";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import { bookmarkSlugMappingSchema, unifiedBookmarkSchema } from "@/types/schemas/bookmark";

vi.mock("@/lib/bookmarks/service.server", () => ({ getBookmarks: vi.fn<typeof getBookmarks>() }));
vi.mock("@/lib/bookmarks/slug-manager", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bookmarks/slug-manager")>()),
  loadSlugMapping: vi.fn<typeof loadSlugMapping>(),
}));

const mapping = bookmarkSlugMappingSchema.parse({
  version: "1.0.0",
  generated: "2026-10-26T00:00:00.000Z",
  count: 1,
  checksum: "00000000000000000000000000000000",
  slugs: {
    known: {
      id: "known",
      slug: "stable-resource",
      url: "https://example.com/guide",
      title: "Guide",
    },
  },
  reverseMap: { "stable-resource": "known" },
});

beforeEach(() => {
  vi.mocked(loadSlugMapping).mockResolvedValue(mapping);
  vi.mocked(getBookmarks).mockResolvedValue([]);
});

it("resolves an explicit ID from the current slug mapping even when the cached feed is empty", async () => {
  const response = await GET(
    new Request("https://williamcallahan.com/bookmarks/domain/example-com?id=known"),
    {
      params: Promise.resolve({ domainSlug: "example-com" }),
    },
  );
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("/bookmarks/stable-resource");
});

it("does not permanently pin an unknown ID to a sibling bookmark on the same domain", async () => {
  vi.mocked(getBookmarks).mockResolvedValue([
    unifiedBookmarkSchema.parse({
      id: "known",
      slug: "stable-resource",
      url: "https://example.com/guide",
      title: "Guide",
      description: "A guide",
      tags: [],
      dateBookmarked: "2026-10-26T00:00:00.000Z",
      sourceUpdatedAt: "2026-10-26T00:00:00.000Z",
    }),
  ]);
  const response = await GET(
    new Request("https://williamcallahan.com/bookmarks/domain/example-com?id=missing"),
    {
      params: Promise.resolve({ domainSlug: "example-com" }),
    },
  );
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/bookmarks");
});

it("keeps an unresolved domain temporary rather than permanently caching an empty-feed lookup", async () => {
  const response = await GET(
    new Request("https://williamcallahan.com/bookmarks/domain/example-com"),
    {
      params: Promise.resolve({ domainSlug: "example-com" }),
    },
  );
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/bookmarks");
});
