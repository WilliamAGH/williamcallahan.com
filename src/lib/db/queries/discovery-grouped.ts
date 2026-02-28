import { and, desc, eq, gte, sql } from "drizzle-orm";

import { mapBookmarkRowToUnifiedBookmark } from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { contentEngagement } from "@/lib/db/schema/content-engagement";
import { bookmarkTagAliasLinks, bookmarkTags } from "@/lib/db/schema/bookmark-taxonomy";
import { formatTagDisplay, tagToSlug } from "@/lib/utils/tag-utils";
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

const MS_PER_DAY = 86_400_000;
const NINETY_DAYS_MS = 90 * MS_PER_DAY;
const PER_SECTION = 8;
const MIN_PER_SECTION = 2;
const RECENT_DAYS = 7,
  RECENT_LIMIT = 8;
const DEFAULT_SECTIONS_PER_PAGE = 4,
  MAX_SECTIONS_PER_PAGE = 12;

function extractTagNames(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  const names: string[] = [];
  for (const rawTag of rawTags) {
    if (typeof rawTag === "string") {
      const trimmed = rawTag.trim();
      if (trimmed.length > 0) names.push(trimmed);
      continue;
    }
    if (typeof rawTag !== "object" || rawTag === null) continue;
    const maybeName = Reflect.get(rawTag, "name");
    if (typeof maybeName !== "string") continue;
    const trimmed = maybeName.trim();
    if (trimmed.length > 0) names.push(trimmed);
  }
  return names;
}

async function loadCanonicalTagMaps(): Promise<{
  primaryBySlug: ReadonlyMap<string, string>;
  aliasToCanonical: ReadonlyMap<string, string>;
}> {
  const [primaryRows, aliasRows] = await Promise.all([
    db
      .select({ tagSlug: bookmarkTags.tagSlug, tagName: bookmarkTags.tagName })
      .from(bookmarkTags)
      .where(eq(bookmarkTags.tagStatus, "primary")),
    db
      .select({
        sourceTagSlug: bookmarkTagAliasLinks.sourceTagSlug,
        targetTagSlug: bookmarkTagAliasLinks.targetTagSlug,
      })
      .from(bookmarkTagAliasLinks)
      .where(eq(bookmarkTagAliasLinks.linkType, "alias")),
  ]);

  return {
    primaryBySlug: new Map(primaryRows.map((row) => [row.tagSlug, row.tagName] as const)),
    aliasToCanonical: new Map(
      aliasRows.map((row) => [row.sourceTagSlug, row.targetTagSlug] as const),
    ),
  };
}

function resolvePrimaryTag(
  bookmark: ScoredBookmarkRow["bookmark"],
  taxonomy: {
    primaryBySlug: ReadonlyMap<string, string>;
    aliasToCanonical: ReadonlyMap<string, string>;
  } | null,
): { slug: string; name: string } | null {
  const tags = extractTagNames(bookmark.tags);
  if (tags.length === 0) return null;

  if (taxonomy) {
    for (const rawTag of tags) {
      const slug = tagToSlug(rawTag);
      if (!slug) continue;
      const canonicalSlug = taxonomy.aliasToCanonical.get(slug) ?? slug;
      const canonicalName = taxonomy.primaryBySlug.get(canonicalSlug);
      if (!canonicalName) continue;
      return { slug: canonicalSlug, name: canonicalName };
    }
  }

  const first = tags[0];
  if (!first) return null;
  const fallbackSlug = tagToSlug(first);
  if (!fallbackSlug) return null;
  return { slug: fallbackSlug, name: formatTagDisplay(first) };
}

export function groupByPrimaryTag(
  rows: ScoredBookmarkRow[],
  options: GroupOptions,
): TopicSection[] {
  const grouped = new Map<string, { tagName: string; rows: ScoredBookmarkRow[] }>();
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
    .map((row) => row.bookmark);
}

function serializeBookmark(
  bookmark: ScoredBookmarkRow["bookmark"],
): DiscoverFeedData["recentlyAdded"][number] {
  return {
    id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    slug: bookmark.slug,
    tags: Array.isArray(bookmark.tags) ? bookmark.tags : [],
    dateBookmarked: bookmark.dateBookmarked,
    ogImage: bookmark.ogImage,
    ogImageExternal: bookmark.ogImageExternal,
    content: bookmark.content,
    isPrivate: bookmark.isPrivate ?? false,
    isFavorite: bookmark.isFavorite ?? false,
    readingTime: bookmark.readingTime,
    wordCount: bookmark.wordCount,
    ogTitle: bookmark.ogTitle,
    ogDescription: bookmark.ogDescription,
    domain: bookmark.domain,
    logoData: bookmark.logoData
      ? {
          url: bookmark.logoData.url,
          alt: bookmark.logoData.alt ?? "Logo",
          width: bookmark.logoData.width,
          height: bookmark.logoData.height,
        }
      : null,
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
    .map((row) => row.entity_id)
    .filter((bookmarkId) => !excludeIds.has(bookmarkId))
    .slice(0, limit);
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

  let taxonomyMaps: Awaited<ReturnType<typeof loadCanonicalTagMaps>> | null = null;
  try {
    taxonomyMaps = await loadCanonicalTagMaps();
  } catch (error: unknown) {
    degradationReasons.push("Tag taxonomy unavailable. Discover used inline bookmark tags.");
    console.warn(
      "[DiscoverGrouped] Failed to load tag taxonomy. Using inline tag fallback.",
      error,
    );
  }

  const bookmarkRows = await db
    .select({ bookmark: bookmarks })
    .from(bookmarks)
    .orderBy(desc(bookmarks.dateBookmarked));
  const engagementCoverage =
    bookmarkRows.length === 0 ? 0 : engagementMap.size / bookmarkRows.length;

  const scored: ScoredBookmarkRow[] = bookmarkRows.map((row) => {
    const mappedBookmark = mapBookmarkRowToUnifiedBookmark(row.bookmark);
    const engagementSignal = engagementMap.get(row.bookmark.id) ?? null;
    return {
      bookmark: mappedBookmark,
      primaryTag: resolvePrimaryTag(mappedBookmark, taxonomyMaps),
      discoveryScore: computeDiscoveryScore({
        baseRecencyScore: computeBaseRecencyScore(mappedBookmark.dateBookmarked),
        engagementSignal,
        engagementCoverage,
      }),
    };
  });

  let rankedSections = groupByPrimaryTag(scored, {
    perSection: PER_SECTION,
    minPerSection: MIN_PER_SECTION,
  });
  try {
    rankedSections = await applySectionBlend(rankedSections);
  } catch (error: unknown) {
    degradationReasons.push(
      "Embedding similarity boost unavailable. Discover used popularity-only tag ranking.",
    );
    console.warn("[DiscoverGrouped] Failed to apply embedding similarity section boost.", error);
  }

  const recentBookmarks = filterRecentlyAdded(scored, { days: RECENT_DAYS, limit: RECENT_LIMIT });
  const totalSections = rankedSections.length;
  const offset = (sectionPage - 1) * sectionsPerPage;
  const pagedSections = rankedSections.slice(offset, offset + sectionsPerPage);
  const hasNextSectionPage = offset + sectionsPerPage < totalSections;

  const internalHrefs: Record<string, string> = {};
  const serializeWithHref = (bookmark: ScoredBookmarkRow["bookmark"]) => {
    internalHrefs[bookmark.id] = `/bookmarks/${bookmark.slug}`;
    return serializeBookmark(bookmark);
  };

  return {
    recentlyAdded:
      sectionPage === 1 ? recentBookmarks.map((bookmark) => serializeWithHref(bookmark)) : [],
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
      isDegraded: degradationReasons.length > 0,
      reasons: degradationReasons,
    },
  };
}
