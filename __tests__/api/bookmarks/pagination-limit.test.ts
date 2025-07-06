import { GET } from "@/app/api/bookmarks/route";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { readJsonS3 } from "@/lib/s3-utils";
// Import BOOKMARKS_PER_PAGE lazily within isolated module to avoid global cache interfering with env-config tests
// Placeholder variable – will be set in beforeAll
let BOOKMARKS_PER_PAGE: number;
import type { UnifiedBookmark } from "@/types";

// Mock dependencies used inside the route
jest.mock("@/lib/bookmarks/service.server");
jest.mock("@/lib/s3-utils");

const mockGetBookmarks = jest.mocked(getBookmarks);
const mockReadJsonS3 = jest.mocked(readJsonS3);

describe("Bookmark API – large limit behavior", () => {
  let mockBookmarks: UnifiedBookmark[];

  beforeAll(() => {
    jest.isolateModules(() => {
      BOOKMARKS_PER_PAGE = require("@/lib/constants").BOOKMARKS_PER_PAGE;
    });
    mockBookmarks = Array.from({ length: BOOKMARKS_PER_PAGE + 6 }).map((_, i) => ({
      id: `bm-${i}`,
      url: `https://example${i}.com`,
      title: `Bookmark ${i}`,
      description: `Description ${i}`,
      tags: [],
      dateBookmarked: "2025-01-01",
    })) as unknown as UnifiedBookmark[];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBookmarks.mockResolvedValue(mockBookmarks);
    mockReadJsonS3.mockResolvedValue({
      count: mockBookmarks.length,
      totalPages: Math.ceil(mockBookmarks.length / BOOKMARKS_PER_PAGE),
      lastFetchedAt: Date.now(),
    });
  });

  it("returns the full dataset when limit exceeds BOOKMARKS_PER_PAGE", async () => {
    const request = {
      url: "http://localhost:3000/api/bookmarks?limit=1000&page=1",
      nextUrl: {
        searchParams: new URLSearchParams({ limit: "1000", page: "1" }),
      },
    } as any;

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data).toHaveLength(mockBookmarks.length);
    expect(data.meta.pagination.limit).toBe(100);
    expect(data.meta.pagination.total).toBe(mockBookmarks.length);
  });

  afterAll(() => {
    jest.unmock("@/lib/bookmarks/service.server");
    jest.unmock("@/lib/s3-utils");
    jest.resetModules();
  });
});
