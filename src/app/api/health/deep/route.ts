import { NextResponse } from "next/server";
import { loadSlugMapping, getBookmarkBySlug } from "@/lib/bookmarks/slug-manager";
import { getBookmarksIndex } from "@/lib/bookmarks/bookmarks-data-access.server";
import logger from "@/lib/utils/logger";
import type { DeepCheckResult } from "@/types/health";

const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

async function measure<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ result: T | null; check: DeepCheckResult }> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    return { result, check: { name, status: "ok", details: "Check passed", duration } };
  } catch (error: unknown) {
    const duration = performance.now() - start;
    const details = error instanceof Error ? error.message : String(error);
    logger.error(`[Deep Health Check] Check '${name}' failed:`, error);
    return { result: null, check: { name, status: "error", details, duration } };
  }
}

async function checkBookmarks(): Promise<DeepCheckResult> {
  const { check: indexCheck } = await measure("Bookmarks: Get Index", async () => {
    const idx = await getBookmarksIndex();
    if (!idx || idx.count === 0) {
      throw new Error("Bookmarks index is missing, empty, or invalid.");
    }
    return idx;
  });
  if (indexCheck.status === "error") return indexCheck;

  const { result: mapping, check: mappingCheck } = await measure(
    "Bookmarks: Load Slug Mapping",
    async () => {
      const m = await loadSlugMapping();
      if (!m || Object.keys(m.slugs).length === 0) {
        throw new Error("Slug mapping is missing, empty, or invalid.");
      }
      return m;
    },
  );
  if (mappingCheck.status === "error") return mappingCheck;

  const { check: validationCheck } = await measure(
    "Bookmarks: Validate First Bookmark",
    async () => {
      if (!mapping) throw new Error("Slug mapping is null");
      const firstSlug = Object.values(mapping.slugs)[0]?.slug;
      if (!firstSlug) {
        throw new Error("Could not get the first slug from the mapping.");
      }

      const bookmark = await getBookmarkBySlug(firstSlug);
      if (!bookmark) {
        throw new Error(`Failed to fetch bookmark for the first slug: ${firstSlug}`);
      }
      return bookmark;
    },
  );

  return validationCheck;
}

export async function GET() {
  if (isProductionBuild) {
    return NextResponse.json(
      { status: "skipped", timestamp: new Date().toISOString(), reason: "build-phase" },
      { status: 200 },
    );
  }
  logger.info("[Deep Health Check] Starting deep health check...");
  const checks: DeepCheckResult[] = [];

  const { result: bookmarksResult, check: wrapperCheck } = await measure(
    "Bookmarks Critical Path",
    checkBookmarks,
  );
  // Use the actual inner result if available, otherwise fall back to the wrapper check
  const bookmarksCheck = bookmarksResult ?? { ...wrapperCheck, status: "error" as const };
  checks.push(bookmarksCheck);

  // Future checks for other critical paths (e.g., GitHub activity, Blog posts) can be added here.

  const overallStatus = checks.every((c) => c.status === "ok") ? "ok" : "error";
  const httpStatus = overallStatus === "ok" ? 200 : 503; // 503 Service Unavailable

  logger.info(`[Deep Health Check] Completed. Overall status: ${overallStatus}`);

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: httpStatus },
  );
}
