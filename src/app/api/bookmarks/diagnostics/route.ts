/**
 * Bookmarks Diagnostics API
 *
 * Reports PostgreSQL bookmark/index-state health and slug mapping status.
 * Intended for development and secure diagnostics in production via DEBUG_API_SECRET.
 */

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  getBookmarksIndex,
  getBookmarksPage,
  listBookmarkTagSlugs,
} from "@/lib/bookmarks/service.server";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import {
  getEnvironment,
  getEnvironmentSuffix,
  logEnvironmentConfig,
} from "@/lib/config/environment";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function allowWithoutSecret(): boolean {
  // Allow open access in non-production; require secret in production.
  return process.env.NODE_ENV !== "production";
}

function isAuthorized(request: NextRequest): boolean {
  if (allowWithoutSecret()) return true;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const secret = process.env.DEBUG_API_SECRET || "";
  return Boolean(secret && token && token === secret);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) return unauthorized();

  if (process.env.NODE_ENV !== "production") {
    logEnvironmentConfig();
  }

  const env = getEnvironment();
  const suffix = getEnvironmentSuffix();

  const [indexState, firstPage, tagSlugs, slugMapping] = await Promise.all([
    getBookmarksIndex(),
    getBookmarksPage(1),
    listBookmarkTagSlugs(),
    loadSlugMapping(),
  ]);

  const bookmarkCount = indexState?.count ?? 0;
  const totalPages = indexState?.totalPages ?? 0;

  const checks = {
    indexOk: indexState !== null,
    firstPageOk: totalPages === 0 ? firstPage.length === 0 : firstPage.length > 0,
    tagStateOk: Array.isArray(tagSlugs),
    slugMapOk: slugMapping !== null,
  };

  const allOk = checks.indexOk && checks.firstPageOk && checks.tagStateOk;

  return NextResponse.json(
    {
      status: allOk ? "ok" : "fail",
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        resolved: env,
        suffix,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
        apiBaseUrl: process.env.API_BASE_URL || null,
      },
      storage: {
        backend: "postgres",
        indexExists: indexState !== null,
        bookmarkCount,
        totalPages,
        lastFetchedAt: indexState?.lastFetchedAt ?? null,
        lastModified: indexState?.lastModified ?? null,
        checksum: indexState?.checksum ?? null,
      },
      checks,
      details: {
        firstPageCount: firstPage.length,
        tagSlugCount: tagSlugs.length,
        sampleTagSlugs: tagSlugs.slice(0, 10),
        slugMappingCount: slugMapping?.count ?? 0,
        slugMappingGeneratedAt: slugMapping?.generated ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
