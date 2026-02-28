import { and, desc, eq, gte, sql } from "drizzle-orm";

import { mapBookmarkRowToUnifiedBookmark } from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import { aiAnalysisLatest } from "@/lib/db/schema/ai-analysis";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { contentEngagement } from "@/lib/db/schema/content-engagement";
import { canonicalizeCategoryLabel } from "@/lib/utils/tag-utils";
import type { SerializableBookmark } from "@/types/features/bookmarks";
import type {
  DiscoverFeedData,
  GroupOptions,
  RecentOptions,
  ScoredBookmarkRow,
  TopicSection,
} from "@/types/features/discovery";

import {
  computeBaseRecencyScore,
  computeDiscoveryScore,
  computeEngagementSignal,
} from "./discovery-scores";

export type { DiscoverFeedData, GroupOptions, RecentOptions, ScoredBookmarkRow, TopicSection };

export function groupByCategory(rows: ScoredBookmarkRow[], options: GroupOptions): TopicSection[] {
  const grouped = new Map<string, ScoredBookmarkRow[]>();

  for (const row of rows) {
    if (row.category === null) continue;
    const category = canonicalizeCategoryLabel(row.category);
    if (!category) continue;
    const existing = grouped.get(category);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(category, [row]);
    }
  }

  const sections: TopicSection[] = [];

  for (const [category, catRows] of grouped) {
    if (catRows.length < options.minPerSection) continue;

    const sorted = catRows.toSorted((a, b) => b.discoveryScore - a.discoveryScore);
    const topRow = sorted[0];
    if (!topRow) continue;
    sections.push({
      category,
      topScore: topRow.discoveryScore,
      totalCount: catRows.length,
      bookmarks: sorted.slice(0, options.perSection).map((r) => r.bookmark),
    });
  }

  return sections.toSorted((a, b) => b.topScore - a.topScore);
}

const MS_PER_DAY = 86_400_000;
const NINETY_DAYS_MS = 90 * MS_PER_DAY;
const GRID_MAX_COLS = 4;
const PER_SECTION = 8;
const MIN_PER_SECTION = 2;
const RECENT_DAYS = 7;
const RECENT_LIMIT = 8;
const DEFAULT_SECTIONS_PER_PAGE = 4;
const MAX_SECTIONS_PER_PAGE = 12;

export function filterRecentlyAdded(
  rows: ScoredBookmarkRow[],
  options: RecentOptions,
): ScoredBookmarkRow["bookmark"][] {
  const cutoff = Date.now() - options.days * MS_PER_DAY;

  return rows
    .filter((row) => {
      const ts = Date.parse(row.bookmark.dateBookmarked);
      return !Number.isNaN(ts) && ts >= cutoff;
    })
    .toSorted((a, b) => b.discoveryScore - a.discoveryScore)
    .slice(0, options.limit)
    .map((r) => r.bookmark);
}

function toSerializableBookmark(
  bm: ScoredBookmarkRow["bookmark"],
  category: string | null,
): SerializableBookmark {
  return {
    id: bm.id,
    url: bm.url,
    title: bm.title,
    description: bm.description,
    slug: bm.slug,
    tags: Array.isArray(bm.tags) ? bm.tags : [],
    dateBookmarked: bm.dateBookmarked,
    ogImage: bm.ogImage,
    ogImageExternal: bm.ogImageExternal,
    content: bm.content,
    isPrivate: bm.isPrivate ?? false,
    isFavorite: bm.isFavorite ?? false,
    readingTime: bm.readingTime,
    wordCount: bm.wordCount,
    ogTitle: bm.ogTitle,
    ogDescription: bm.ogDescription,
    domain: bm.domain,
    logoData: bm.logoData
      ? {
          url: bm.logoData.url,
          alt: bm.logoData.alt ?? "Logo",
          width: bm.logoData.width,
          height: bm.logoData.height,
        }
      : null,
    category,
  };
}

async function findSimilarBookmarkIds(
  anchorId: string,
  excludeIds: ReadonlySet<string>,
  limit: number,
): Promise<string[]> {
  const rows = await db.execute<{ entity_id: string }>(sql`
    SELECT e2.entity_id
    FROM embeddings e1, embeddings e2
    WHERE e1.domain = 'bookmark' AND e1.entity_id = ${anchorId}
      AND e2.domain = 'bookmark'
      AND e2.entity_id != e1.entity_id
      AND e2.qwen_4b_fp16_embedding IS NOT NULL
    ORDER BY e2.qwen_4b_fp16_embedding <=> e1.qwen_4b_fp16_embedding
    LIMIT ${limit + excludeIds.size}
  `);

  return rows
    .map((r) => r.entity_id)
    .filter((id) => !excludeIds.has(id))
    .slice(0, limit);
}

/**
 * Pad a list of bookmarks to the next multiple of GRID_MAX_COLS using
 * HNSW cosine-similarity neighbors of the section's top-scored bookmark.
 * All bookmarks are looked up from the in-memory scored array — no extra
 * full-row DB queries needed.
 */
async function padToGridMultiple(
  current: ScoredBookmarkRow["bookmark"][],
  scoredIndex: ReadonlyMap<string, ScoredBookmarkRow>,
  usedIds: Set<string>,
): Promise<ScoredBookmarkRow["bookmark"][]> {
  const remainder = current.length % GRID_MAX_COLS;
  if (remainder === 0 || current.length === 0) return current;

  const needed = GRID_MAX_COLS - remainder;
  const anchor = current[0];
  if (!anchor) return current;

  const similarIds = await findSimilarBookmarkIds(anchor.id, usedIds, needed);

  const padded = [...current];
  for (const id of similarIds) {
    const row = scoredIndex.get(id);
    if (row) {
      padded.push(row.bookmark);
      usedIds.add(id);
    }
  }
  return padded;
}

async function loadEngagementMap(): Promise<Map<string, number>> {
  const rows = await db
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

  return new Map(
    rows.map((row) => {
      const latestMs = Date.parse(row.latestEventAt);
      const ageInDays =
        Math.max(0, Date.now() - (Number.isNaN(latestMs) ? Date.now() : latestMs)) / MS_PER_DAY;
      return [
        row.contentId,
        computeEngagementSignal({
          impressions: row.impressions,
          clicks: row.clicks,
          avgDwellMs: row.avgDwellMs,
          externalClicks: row.externalClicks,
          ageInDays,
        }),
      ] as const;
    }),
  );
}

export async function getDiscoveryGroupedBookmarks(
  options: { sectionPage?: number; sectionsPerPage?: number } = {},
): Promise<DiscoverFeedData> {
  const sectionPage = Number.isInteger(options.sectionPage)
    ? Math.max(1, options.sectionPage ?? 1)
    : 1;
  const sectionsPerPage = Number.isInteger(options.sectionsPerPage)
    ? Math.min(
        MAX_SECTIONS_PER_PAGE,
        Math.max(1, options.sectionsPerPage ?? DEFAULT_SECTIONS_PER_PAGE),
      )
    : DEFAULT_SECTIONS_PER_PAGE;

  const degradationReasons: string[] = [];
  let engagementMap = new Map<string, number>();
  try {
    engagementMap = await loadEngagementMap();
  } catch (error: unknown) {
    degradationReasons.push(
      "Engagement telemetry unavailable. Discover used recency-only scoring.",
    );
    console.warn(
      "[DiscoverGrouped] Failed to load engagement events. Using recency-only fallback.",
      error,
    );
  }

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
    bookmarkRows.length === 0 ? 0 : engagementMap.size / bookmarkRows.length;

  const scored: ScoredBookmarkRow[] = bookmarkRows.map((row) => {
    const mapped = mapBookmarkRowToUnifiedBookmark(row.bookmark);
    const engagementSignal = engagementMap.get(row.bookmark.id) ?? null;
    const baseRecencyScore = computeBaseRecencyScore(mapped.dateBookmarked);
    return {
      bookmark: mapped,
      category: row.category,
      discoveryScore: computeDiscoveryScore({
        baseRecencyScore,
        engagementSignal,
        engagementCoverage,
      }),
    };
  });

  const topicSections = groupByCategory(scored, {
    perSection: PER_SECTION,
    minPerSection: MIN_PER_SECTION,
  });

  const recentBookmarks = filterRecentlyAdded(scored, {
    days: RECENT_DAYS,
    limit: RECENT_LIMIT,
  });

  // Build O(1) lookup for padding and track globally-used IDs
  const scoredIndex = new Map(scored.map((r) => [r.bookmark.id, r]));
  const usedIds = new Set<string>([
    ...recentBookmarks.map((bm) => bm.id),
    ...topicSections.flatMap((s) => s.bookmarks.map((bm) => bm.id)),
  ]);

  let paddedRecent = recentBookmarks;
  let paddedSections = topicSections;
  try {
    paddedRecent = await padToGridMultiple(recentBookmarks, scoredIndex, usedIds);
    paddedSections = await Promise.all(
      topicSections.map(async (section) => ({
        ...section,
        bookmarks: await padToGridMultiple(section.bookmarks, scoredIndex, usedIds),
      })),
    );
  } catch (error: unknown) {
    degradationReasons.push(
      "Similarity-based padding unavailable. Returned unpadded topic sections.",
    );
    console.warn("[DiscoverGrouped] Failed to pad sections using embeddings.", error);
  }

  const totalSections = paddedSections.length;
  const offset = (sectionPage - 1) * sectionsPerPage;
  const pagedSections = paddedSections.slice(offset, offset + sectionsPerPage);
  const hasNextSectionPage = offset + sectionsPerPage < totalSections;

  const internalHrefs: Record<string, string> = {};
  const serializeWithHref = (
    bm: ScoredBookmarkRow["bookmark"],
    cat: string | null,
  ): SerializableBookmark => {
    internalHrefs[bm.id] = `/bookmarks/${bm.slug}`;
    return toSerializableBookmark(bm, cat);
  };

  return {
    recentlyAdded: sectionPage === 1 ? paddedRecent.map((bm) => serializeWithHref(bm, null)) : [],
    topicSections: pagedSections.map((section) => ({
      category: section.category,
      topScore: section.topScore,
      totalCount: section.totalCount,
      bookmarks: section.bookmarks.map((bm) => serializeWithHref(bm, section.category)),
    })),
    internalHrefs,
    pagination: {
      sectionPage,
      sectionsPerPage,
      totalSections,
      hasNextSectionPage,
      nextSectionPage: hasNextSectionPage ? sectionPage + 1 : null,
    },
    degradation: {
      isDegraded: degradationReasons.length > 0,
      reasons: degradationReasons,
    },
  };
}
