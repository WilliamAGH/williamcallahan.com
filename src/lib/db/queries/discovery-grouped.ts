import { and, desc, eq, gte, sql } from "drizzle-orm";

import { mapBookmarkSelectToUnifiedBookmark } from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { contentEngagement } from "@/lib/db/schema/content-engagement";
import { loadCanonicalTagMaps } from "@/lib/db/queries/discovery-tag-taxonomy";
import { findSimilarBookmarkIds } from "@/lib/db/queries/discovery-similarity";
import { resolvePrimaryTag } from "@/lib/bookmarks/tag-resolver";
import type {
  BookmarkForDiscovery,
  DiscoverFeedContent,
  GroupOptions,
  RecentOptions,
  ScoredBookmark,
  TopicSection,
} from "@/types/features/discovery";
import { createSerializeWithHref } from "@/lib/bookmarks/discovery-serialization";
import {
  computeBaseRecencyScore,
  computeDiscoveryScore,
  computeEngagementSignal,
} from "./discovery-scores";

export type { DiscoverFeedContent, GroupOptions, RecentOptions, ScoredBookmark, TopicSection };

const MS_PER_DAY = 86_400_000;
const NINETY_DAYS_MS = 90 * MS_PER_DAY;
const PER_SECTION = 8;
const MIN_PER_SECTION = 2;
const RECENT_DAYS = 7,
  RECENT_LIMIT = 8;
const DEFAULT_SECTIONS_PER_PAGE = 4,
  MAX_SECTIONS_PER_PAGE = 12;

export function groupByPrimaryTag(rows: ScoredBookmark[], options: GroupOptions): TopicSection[] {
  const grouped = new Map<string, { tagName: string; rows: ScoredBookmark[] }>();
  for (const row of rows) {
    if (row.primaryTag === null) continue;
    const existing = grouped.get(row.primaryTag.slug);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    grouped.set(row.primaryTag.slug, { tagName: row.primaryTag.name, rows: [row] });
  }

  const sections: TopicSection[] = [];
  for (const [tagSlug, group] of grouped.entries()) {
    if (group.rows.length < options.minPerSection) continue;
    const sorted = group.rows.toSorted((a, b) => b.discoveryScore - a.discoveryScore);
    const topRow = sorted[0];
    if (!topRow) continue;
    sections.push({
      tagSlug,
      tagName: group.tagName,
      topScore: topRow.discoveryScore,
      totalCount: sorted.length,
      bookmarks: sorted.slice(0, options.perSection).map((entry) => entry.bookmark),
    });
  }

  return sections.toSorted((a, b) => b.topScore - a.topScore);
}

export function filterRecentlyAdded(
  rows: ScoredBookmark[],
  options: RecentOptions,
): ScoredBookmark["bookmark"][] {
  const cutoff = Date.now() - options.days * MS_PER_DAY;
  return rows
    .filter((row) => {
      const ts = Date.parse(row.bookmark.dateBookmarked);
      return !Number.isNaN(ts) && ts >= cutoff;
    })
    .toSorted((a, b) => b.discoveryScore - a.discoveryScore)
    .slice(0, options.limit)
    .map((row) => row.bookmark);
}

export function dedupeDiscoverSections(
  recentBookmarks: ReadonlyArray<ScoredBookmark["bookmark"]>,
  rankedSections: ReadonlyArray<TopicSection>,
): { recentBookmarks: ScoredBookmark["bookmark"][]; rankedSections: TopicSection[] } {
  const seenBookmarkIds = new Set<string>();
  const dedupedRecentBookmarks = recentBookmarks.filter((bookmark) => {
    if (seenBookmarkIds.has(bookmark.id)) {
      return false;
    }
    seenBookmarkIds.add(bookmark.id);
    return true;
  });

  const dedupedRankedSections = rankedSections
    .map((section) => {
      const dedupedBookmarks = section.bookmarks.filter((bookmark) => {
        if (seenBookmarkIds.has(bookmark.id)) {
          return false;
        }
        seenBookmarkIds.add(bookmark.id);
        return true;
      });
      return {
        ...section,
        totalCount: dedupedBookmarks.length,
        bookmarks: dedupedBookmarks,
      };
    })
    .filter((section) => section.bookmarks.length > 0);

  return {
    recentBookmarks: dedupedRecentBookmarks,
    rankedSections: dedupedRankedSections,
  };
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

async function applySectionBlend(sections: TopicSection[]): Promise<TopicSection[]> {
  const blended = await Promise.all(
    sections.map(async (section) => {
      const anchor = section.bookmarks[0];
      if (!anchor) return section;

      const similarIds = await findSimilarBookmarkIds(
        anchor.id,
        new Set<string>([anchor.id]),
        Math.max(8, section.bookmarks.length * 2),
      );
      const similarSet = new Set(similarIds);
      const overlap = section.bookmarks
        .slice(1)
        .filter((bookmark) => similarSet.has(bookmark.id)).length;
      const cohesion = section.bookmarks.length <= 1 ? 0 : overlap / (section.bookmarks.length - 1);
      const coverage = Math.min(1, Math.log1p(section.totalCount) / Math.log(12));
      const freshness = computeBaseRecencyScore(anchor.dateBookmarked);
      const popularity = section.topScore * 0.7 + coverage * 0.2 + freshness * 0.1;
      return {
        ...section,
        topScore: section.topScore * 0.55 + popularity * 0.3 + cohesion * 0.15,
      };
    }),
  );

  return blended.toSorted((a, b) => b.topScore - a.topScore);
}

export async function getDiscoveryGroupedBookmarks(
  options: { sectionPage?: number; sectionsPerPage?: number } = {},
): Promise<DiscoverFeedContent> {
  const sectionPage = Number.isInteger(options.sectionPage)
    ? Math.max(1, options.sectionPage ?? 1)
    : 1;
  const sectionsPerPage = Number.isInteger(options.sectionsPerPage)
    ? Math.min(
        MAX_SECTIONS_PER_PAGE,
        Math.max(1, options.sectionsPerPage ?? DEFAULT_SECTIONS_PER_PAGE),
      )
    : DEFAULT_SECTIONS_PER_PAGE;

  // Parallelize initial metadata and data fetches to eliminate waterfall
  // Signals are required for the Discover feed - failure propagates to the caller [RC1]
  const [engagementMap, taxonomyMaps, bookmarkRows] = await Promise.all([
    loadEngagementMap(),
    loadCanonicalTagMaps(),
    db.select({ bookmark: bookmarks }).from(bookmarks).orderBy(desc(bookmarks.dateBookmarked)),
  ]);

  const engagementCoverage =
    bookmarkRows.length === 0 ? 0 : engagementMap.size / bookmarkRows.length;

  const scored: ScoredBookmark[] = bookmarkRows.map((row) => {
    const mappedBookmark = mapBookmarkSelectToUnifiedBookmark(row.bookmark);
    const engagementSignal = engagementMap.get(row.bookmark.id) ?? null;
    return {
      bookmark: mappedBookmark,
      primaryTag: resolvePrimaryTag(mappedBookmark as BookmarkForDiscovery, taxonomyMaps),
      discoveryScore: computeDiscoveryScore({
        baseRecencyScore: computeBaseRecencyScore(mappedBookmark.dateBookmarked),
        engagementSignal,
        engagementCoverage,
      }),
    };
  });

  const rankedSections = groupByPrimaryTag(scored, {
    perSection: PER_SECTION,
    minPerSection: MIN_PER_SECTION,
  });

  const recentBookmarks = filterRecentlyAdded(scored, { days: RECENT_DAYS, limit: RECENT_LIMIT });
  const dedupedDiscoverData = dedupeDiscoverSections(recentBookmarks, rankedSections);
  const totalSections = dedupedDiscoverData.rankedSections.length;
  const offset = (sectionPage - 1) * sectionsPerPage;

  // CRITICAL: Slicing sections BEFORE applying expensive similarity blend/scoring.
  // This eliminates the vector search waterfall for pages that are not being rendered.
  const pagedSectionsRaw = dedupedDiscoverData.rankedSections.slice(
    offset,
    offset + sectionsPerPage,
  );

  // applySectionBlend is now a mandatory part of the pipeline - no catch block [RC1]
  const pagedSections = await applySectionBlend(pagedSectionsRaw);

  const hasNextSectionPage = offset + sectionsPerPage < totalSections;

  const internalHrefs: Record<string, string> = {};
  const serializeWithHref = createSerializeWithHref(internalHrefs);

  return {
    recentlyAdded:
      sectionPage === 1
        ? dedupedDiscoverData.recentBookmarks.map((bookmark) => serializeWithHref(bookmark))
        : [],
    topicSections: pagedSections.map((section) => ({
      tagSlug: section.tagSlug,
      tagName: section.tagName,
      topScore: section.topScore,
      totalCount: section.totalCount,
      bookmarks: section.bookmarks.map((bookmark) => serializeWithHref(bookmark)),
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
      isDegraded: false,
      reasons: [],
    },
  };
}
