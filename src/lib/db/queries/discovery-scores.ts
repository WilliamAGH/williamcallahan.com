import { and, desc, eq, gte, sql } from "drizzle-orm";

import { mapBookmarkRowToUnifiedBookmark } from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import { aiAnalysisLatest } from "@/lib/db/schema/ai-analysis";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { contentEngagement } from "@/lib/db/schema/content-engagement";

const MS_PER_DAY = 86_400_000;
const NINETY_DAYS_MS = 90 * MS_PER_DAY;
const DWELL_TARGET_MS = 120_000;

function toAgeInDays(timestamp: number): number {
  const ageMs = Math.max(0, Date.now() - timestamp);
  return ageMs / MS_PER_DAY;
}

function parseTimestamp(input: string | null | undefined, fallbackMs: number): number {
  if (!input) {
    return fallbackMs;
  }
  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? fallbackMs : parsed;
}

function computeRecencyFactor(ageInDays: number): number {
  return Math.exp(-ageInDays / 30);
}

function computeNoveltyBoost(impressions: number): number {
  if (impressions <= 0) {
    return 1.2;
  }
  if (impressions < 5) {
    return 1.1;
  }
  return 1;
}

export function computeDiscoveryScore(input: {
  impressions: number;
  clicks: number;
  avgDwellMs: number;
  externalClicks: number;
  ageInDays: number;
}): number {
  const denominator = Math.max(1, input.impressions);
  const ctrScore = input.clicks / denominator;
  const dwellScore = Math.min(1, input.avgDwellMs / DWELL_TARGET_MS);
  const externalScore = input.externalClicks / denominator;
  const recencyFactor = computeRecencyFactor(input.ageInDays);
  const noveltyBoost = computeNoveltyBoost(input.impressions);
  return (ctrScore + dwellScore + externalScore) * recencyFactor * noveltyBoost;
}

export function computeColdStartScore(input: {
  isFavorite: boolean;
  dateBookmarked: string;
}): number {
  const bookmarkedAtMs = parseTimestamp(input.dateBookmarked, Date.now());
  const recencyScore = Math.exp(-toAgeInDays(bookmarkedAtMs) / 21);
  const favoriteBoost = input.isFavorite ? 0.25 : 0;
  return recencyScore + favoriteBoost;
}

export async function getDiscoveryRankedBookmarks(
  page: number,
  limit: number,
): Promise<
  Array<{
    bookmark: ReturnType<typeof mapBookmarkRowToUnifiedBookmark>;
    category: string | null;
    discoveryScore: number;
    hasEngagement: boolean;
  }>
> {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`page must be a positive integer. Received: ${page}`);
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit must be a positive integer. Received: ${limit}`);
  }

  const engagementRows = await db
    .select({
      contentId: contentEngagement.contentId,
      impressions: sql<number>`count(*) filter (where ${contentEngagement.eventType} = 'impression')::int`,
      clicks: sql<number>`count(*) filter (where ${contentEngagement.eventType} = 'click')::int`,
      avgDwellMs: sql<number>`coalesce(avg(${contentEngagement.durationMs}) filter (where ${contentEngagement.eventType} = 'dwell'), 0)::float`,
      externalClicks: sql<number>`count(*) filter (where ${contentEngagement.eventType} = 'external_click')::int`,
      latestEventAt: sql<string>`max(${contentEngagement.createdAt})::text`,
    })
    .from(contentEngagement)
    .where(
      and(
        eq(contentEngagement.contentType, "bookmark"),
        gte(contentEngagement.createdAt, new Date(Date.now() - NINETY_DAYS_MS)),
      ),
    )
    .groupBy(contentEngagement.contentId);

  const engagementByBookmarkId = new Map(
    engagementRows.map((row) => {
      const latestEventMs = parseTimestamp(row.latestEventAt, Date.now());
      const discoveryScore = computeDiscoveryScore({
        impressions: row.impressions,
        clicks: row.clicks,
        avgDwellMs: row.avgDwellMs,
        externalClicks: row.externalClicks,
        ageInDays: toAgeInDays(latestEventMs),
      });
      return [row.contentId, discoveryScore] as const;
    }),
  );

  const bookmarkRows = await db
    .select({
      bookmark: bookmarks,
      category: sql<
        string | null
      >`nullif(trim(${aiAnalysisLatest.payload} -> 'analysis' ->> 'category'), '')`,
    })
    .from(bookmarks)
    .leftJoin(
      aiAnalysisLatest,
      and(eq(aiAnalysisLatest.domain, "bookmarks"), eq(aiAnalysisLatest.entityId, bookmarks.id)),
    )
    .orderBy(desc(bookmarks.dateBookmarked));

  const ranked = bookmarkRows
    .map((row) => {
      const engagementScore = engagementByBookmarkId.get(row.bookmark.id);
      const coldStartScore = computeColdStartScore({
        isFavorite: row.bookmark.isFavorite,
        dateBookmarked: row.bookmark.dateBookmarked,
      });
      const score = engagementScore ?? coldStartScore;
      return {
        bookmark: mapBookmarkRowToUnifiedBookmark(row.bookmark),
        category: row.category,
        discoveryScore: score,
        hasEngagement: engagementScore !== undefined,
      };
    })
    .toSorted((a, b) => {
      if (b.discoveryScore !== a.discoveryScore) {
        return b.discoveryScore - a.discoveryScore;
      }
      return b.bookmark.dateBookmarked.localeCompare(a.bookmark.dateBookmarked);
    });

  const offset = (page - 1) * limit;
  return ranked.slice(offset, offset + limit);
}
