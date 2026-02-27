import { and, desc, eq, gte, sql } from "drizzle-orm";

import { mapBookmarkRowToUnifiedBookmark } from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import { aiAnalysisLatest } from "@/lib/db/schema/ai-analysis";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { contentEngagement } from "@/lib/db/schema/content-engagement";

const MS_PER_DAY = 86_400_000;
const NINETY_DAYS_MS = 90 * MS_PER_DAY;
const DWELL_TARGET_MS = 120_000;
const RECENCY_PRIMARY_WEIGHT = 0.82;
const ENGAGEMENT_SECONDARY_WEIGHT = 0.18;
const MIN_ENGAGEMENT_COVERAGE = 0.05;

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

export function computeEngagementSignal(input: {
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
  const weightedEngagement = ctrScore * 0.45 + dwellScore * 0.35 + externalScore * 0.2;
  return Math.min(1.5, weightedEngagement * recencyFactor * noveltyBoost);
}

export function computeBaseRecencyScore(dateBookmarked: string): number {
  const bookmarkedAtMs = parseTimestamp(dateBookmarked, Date.now());
  return Math.exp(-toAgeInDays(bookmarkedAtMs) / 21);
}

export function computeColdStartScore(input: {
  isFavorite: boolean;
  dateBookmarked: string;
}): number {
  const recencyScore = computeBaseRecencyScore(input.dateBookmarked);
  const favoriteBoost = input.isFavorite ? 0.05 : 0;
  return recencyScore + favoriteBoost;
}

export function computeDiscoveryScore(input: {
  baseRecencyScore: number;
  engagementSignal: number | null;
  engagementCoverage: number;
}): number {
  if (input.engagementSignal === null || input.engagementCoverage < MIN_ENGAGEMENT_COVERAGE) {
    return input.baseRecencyScore;
  }

  return (
    input.baseRecencyScore * RECENCY_PRIMARY_WEIGHT +
    input.engagementSignal * ENGAGEMENT_SECONDARY_WEIGHT
  );
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

  let engagementRows: Array<{
    contentId: string;
    impressions: number;
    clicks: number;
    avgDwellMs: number;
    externalClicks: number;
    latestEventAt: string;
  }> = [];

  try {
    engagementRows = await db
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
  } catch (error) {
    console.warn(
      "[DiscoveryScores] Failed to load engagement events. Using recency-only fallback for discover ranking.",
      error,
    );
  }

  const engagementByBookmarkId = new Map(
    engagementRows.map((row) => {
      const latestEventMs = parseTimestamp(row.latestEventAt, Date.now());
      const engagementSignal = computeEngagementSignal({
        impressions: row.impressions,
        clicks: row.clicks,
        avgDwellMs: row.avgDwellMs,
        externalClicks: row.externalClicks,
        ageInDays: toAgeInDays(latestEventMs),
      });
      return [row.contentId, engagementSignal] as const;
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

  const engagementCoverage =
    bookmarkRows.length === 0 ? 0 : engagementByBookmarkId.size / bookmarkRows.length;

  const ranked = bookmarkRows
    .map((row) => {
      const engagementSignal = engagementByBookmarkId.get(row.bookmark.id) ?? null;
      const baseRecencyScore = computeBaseRecencyScore(row.bookmark.dateBookmarked);
      const score = computeDiscoveryScore({
        baseRecencyScore,
        engagementSignal,
        engagementCoverage,
      });
      return {
        bookmark: mapBookmarkRowToUnifiedBookmark(row.bookmark),
        category: row.category,
        discoveryScore: score,
        hasEngagement: engagementSignal !== null,
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
