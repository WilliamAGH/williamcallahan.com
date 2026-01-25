/**
 * Bookmarks Diagnostics API
 *
 * Validates S3 JSON keys for bookmarks and reports health.
 * Intended for development and secure diagnostics in production via DEBUG_API_SECRET.
 */

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { BookmarksIndex, BookmarkSlugMapping } from "@/types/bookmark";
import type { ReadJsonResult } from "@/types/lib";
import { getEnvironment, getEnvironmentSuffix, logEnvironmentConfig } from "@/lib/config/environment";
import { getS3CdnUrl } from "@/lib/utils/cdn-utils";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function allowWithoutSecret(): boolean {
  // Allow open access in non-production; require secret in production
  return process.env.NODE_ENV !== "production";
}

function isAuthorized(request: NextRequest): boolean {
  if (allowWithoutSecret()) return true;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const secret = process.env.DEBUG_API_SECRET || "";
  return Boolean(secret && token && token === secret);
}

async function tryReadJson<T>(key: string): Promise<ReadJsonResult<T>> {
  try {
    const data = await readJsonS3<T>(key);
    return { key, exists: data !== null, ok: data !== null, parsed: data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { key, exists: false, ok: false, error: message };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) return unauthorized();

  // Log env summary in non-production to aid diagnosis
  if (process.env.NODE_ENV !== "production") {
    logEnvironmentConfig();
  }

  const env = getEnvironment();
  const suffix = getEnvironmentSuffix();

  const keys = {
    FILE: BOOKMARKS_S3_PATHS.FILE,
    INDEX: BOOKMARKS_S3_PATHS.INDEX,
    HEARTBEAT: BOOKMARKS_S3_PATHS.HEARTBEAT,
    PAGE_1: `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}1.json`,
    SLUG_MAPPING: BOOKMARKS_S3_PATHS.SLUG_MAPPING,
  } as const;

  // First round of checks
  const [fileRes, indexRes, heartbeatRes, page1Res, slugMapRes] = await Promise.all([
    tryReadJson<unknown>(keys.FILE),
    tryReadJson<BookmarksIndex>(keys.INDEX),
    tryReadJson<unknown>(keys.HEARTBEAT),
    tryReadJson<unknown>(keys.PAGE_1),
    tryReadJson<BookmarkSlugMapping>(keys.SLUG_MAPPING),
  ]);

  // If index shows multiple pages, spot-check next 2 pages
  const totalPages = typeof indexRes.parsed?.totalPages === "number" ? indexRes.parsed.totalPages : 0;
  const extraPageKeys: string[] = [];
  if (totalPages >= 2) extraPageKeys.push(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}2.json`);
  if (totalPages >= 3) extraPageKeys.push(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}3.json`);

  const extraPageChecks: ReadonlyArray<ReadJsonResult<unknown>> = extraPageKeys.length
    ? await Promise.all(extraPageKeys.map(k => tryReadJson<unknown>(k)))
    : [];

  // Compute health flags
  const datasetOk = fileRes.ok;
  const indexOk = indexRes.ok && typeof indexRes.parsed?.totalPages === "number";
  const firstPageOk = page1Res.ok || totalPages === 0; // If no pages expected, don’t fail on page-1
  const extraPagesOk = extraPageChecks.every(r => r.ok) || totalPages <= 1;
  const slugMapOk =
    slugMapRes.ok &&
    slugMapRes.parsed != null &&
    typeof slugMapRes.parsed === "object" &&
    "slugs" in slugMapRes.parsed &&
    slugMapRes.parsed.slugs != null &&
    typeof slugMapRes.parsed.slugs === "object" &&
    !Array.isArray(slugMapRes.parsed.slugs);

  const health = {
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      resolved: env,
      suffix,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
      apiBaseUrl: process.env.API_BASE_URL || null,
    },
    s3Config: {
      bucketSet: Boolean(process.env.S3_BUCKET),
      endpointSet: Boolean(process.env.S3_SERVER_URL),
      region: process.env.S3_REGION || process.env.AWS_REGION || "(unset)",
      cdnUrl: getS3CdnUrl() || null,
    },
    keys,
    checks: {
      datasetOk,
      indexOk,
      firstPageOk,
      extraPagesOk,
      slugMapOk,
    },
    details: {
      file: fileRes,
      index: indexRes,
      heartbeat: heartbeatRes,
      page1: page1Res,
      extraPages: extraPageChecks,
      slugMapping: slugMapRes,
      totalPages,
      count: typeof indexRes.parsed?.count === "number" ? indexRes.parsed.count : 0,
      lastFetchedAt: indexRes.parsed?.lastFetchedAt ?? null,
    },
  };

  const allOk = datasetOk && indexOk && firstPageOk && extraPagesOk && slugMapOk;
  return NextResponse.json(
    { status: allOk ? "ok" : "fail", ...health },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
