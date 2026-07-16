import {
  GET as getBookmarkRefreshStatus,
  POST as refreshBookmarks,
} from "@/app/api/bookmarks/refresh/route";
import { POST as refreshBookmarksProduction } from "@/app/api/bookmarks/refresh-production/route";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { bookmarkRefreshResponseSchema } from "@/types/schemas/bookmark";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedAuth = vi.hoisted(() => vi.fn((userId: string | null = null) => ({ userId })));
const mockedGetBookmarksIndex = vi.hoisted(() => vi.fn());
const mockedIsOperationAllowed = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockedAuth }));
vi.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarksIndex: mockedGetBookmarksIndex,
}));
vi.mock("@/lib/db/connection", () => ({
  resolveDatabaseAccessMode: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({
  isOperationAllowed: mockedIsOperationAllowed,
}));
vi.mock("@/lib/server/data-fetch-manager", () => ({
  DataFetchManager: vi.fn(),
}));

const relayFetch = vi.fn();
const mockedResolveDatabaseAccessMode = vi.mocked(resolveDatabaseAccessMode);
const internalErrorSentinel = "postgres://internal.example/private-bookmarks";

describe("bookmark refresh response contract", () => {
  it("rejects malformed refresh payloads", () => {
    expect(bookmarkRefreshResponseSchema.safeParse({}).success).toBe(false);
    expect(
      bookmarkRefreshResponseSchema.safeParse({
        status: "pending",
        message: "Refresh pending",
        data: {},
      }).success,
    ).toBe(false);
    expect(
      bookmarkRefreshResponseSchema.safeParse({
        status: "success",
        message: "Refresh complete",
      }).success,
    ).toBe(false);
  });
});

describe("public bookmark refresh route error responses", () => {
  beforeEach(() => {
    mockedGetBookmarksIndex.mockReset();
    mockedIsOperationAllowed.mockReset();
    mockedIsOperationAllowed.mockReturnValue(true);
  });

  it("does not expose internal errors to unauthenticated POST clients", async () => {
    mockedGetBookmarksIndex.mockRejectedValueOnce(new Error(internalErrorSentinel));

    const response = await refreshBookmarks(
      new NextRequest("http://localhost:3000/api/bookmarks/refresh", { method: "POST" }),
    );
    const result: unknown = await response.json();

    expect(response.status).toBe(500);
    expect(bookmarkRefreshResponseSchema.safeParse(result).success).toBe(true);
    expect(result).toEqual({
      status: "error",
      message: "Failed to refresh bookmarks",
      error: "Failed to refresh bookmarks",
    });
    expect(JSON.stringify(result)).not.toContain(internalErrorSentinel);
  });

  it("does not expose internal errors to unauthenticated GET clients", async () => {
    mockedGetBookmarksIndex.mockRejectedValueOnce(new Error(internalErrorSentinel));

    const response = await getBookmarkRefreshStatus();
    const result: unknown = await response.json();

    expect(response.status).toBe(500);
    expect(bookmarkRefreshResponseSchema.safeParse(result).success).toBe(true);
    expect(result).toEqual({
      status: "error",
      message: "Failed to check bookmark refresh status",
      error: "Failed to check bookmark refresh status",
    });
    expect(JSON.stringify(result)).not.toContain(internalErrorSentinel);
  });
});

describe("production refresh relay routes", () => {
  beforeEach(() => {
    relayFetch.mockReset();
    mockedAuth.mockClear();
    mockedResolveDatabaseAccessMode.mockReset();
    mockedResolveDatabaseAccessMode.mockReturnValue({
      allowWrites: false,
      environment: "development",
      source: "NEXT_PUBLIC_SITE_URL",
    });
    vi.stubGlobal("fetch", relayFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns 401 before relaying when optional Clerk authentication is unavailable", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    mockedAuth.mockRejectedValueOnce(
      new Error("Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()."),
    );

    const response = await refreshBookmarksProduction();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it("returns 401 before relaying without a Clerk user", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    const response = await refreshBookmarksProduction();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Clerk failures", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    mockedAuth.mockRejectedValueOnce(new Error("Clerk authentication service unavailable"));

    await expect(refreshBookmarksProduction()).rejects.toThrow(
      "Clerk authentication service unavailable",
    );
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it("returns 403 in production without relaying", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    mockedResolveDatabaseAccessMode.mockReturnValueOnce({
      allowWrites: true,
      environment: "production",
      source: "DEPLOYMENT_ENV",
    });

    const response = await refreshBookmarksProduction();

    expect(response.status).toBe(403);
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it("rejects a 2xx production bookmark refresh error response", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dev.williamcallahan.com");
    vi.stubEnv("BOOKMARK_REFRESH_SECRET", "bookmark-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    relayFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "error",
          message: "Production refresh failed",
          error: "Upstream failure",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await refreshBookmarksProduction();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Failed to trigger production bookmarks refresh",
      error: "Upstream failure",
    });
  });
});
