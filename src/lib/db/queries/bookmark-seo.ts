import { sql } from "drizzle-orm";
import { BOOKMARK_TAG_ALIAS_CTE } from "@/lib/db/bookmark-tag-aliases.mjs";
import { db } from "@/lib/db/connection";
import {
  evaluateBookmarkIndexability,
  MIN_BOOKMARK_COMBINED_CHARS,
  MIN_BOOKMARK_NOTE_CHARS,
  MIN_BOOKMARK_NOTE_WORDS,
  MIN_TAG_HUB_BOOKMARKS,
} from "@/lib/seo/bookmark-seo-policy";
import {
  bookmarkTopicHubEvidenceSchema,
  graduatedBookmarkCandidateRowSchema,
  graduatedTagHubSitemapEntrySchema,
  topicHubResourceBriefSchema,
  type BookmarkTopicHubEvidence,
  type GraduatedBookmarkSitemapEntry,
  type GraduatedTagHubSitemapEntry,
} from "@/types/schemas/bookmark-seo";

const MAX_GRADUATED_BOOKMARK_SITEMAP_ROWS = 2000;
const MAX_GRADUATED_TAG_SITEMAP_ROWS = 500;
const MAX_CANDIDATE_HUB_RESOURCES = 24;
const MAX_MATRIX_RESOURCES = 15;
const MAX_ANNOTATED_BOOKMARKS = 6;
const MAX_FACET_COUNT = 5;

export async function listGraduatedBookmarkSitemapEntries(): Promise<
  GraduatedBookmarkSitemapEntry[]
> {
  const rows = await db.execute(sql`
    SELECT b.slug AS "slug",
      coalesce(nullif(btrim(b.modified_at), ''), nullif(btrim(b.source_updated_at), ''),
        b.date_bookmarked) AS "lastModified",
      b.note AS "note", b.summary AS "summary", b.description AS "description"
    FROM bookmarks b
    WHERE b.archived = false AND b.is_private = false
      AND btrim(b.slug) <> ''
      AND NOT (
        coalesce(b.content->>'crawlStatus', '') = 'blocked'
        AND btrim(coalesce(b.scraped_content_text, '')) = ''
      )
      AND char_length(regexp_replace(btrim(coalesce(b.note, '')), '[[:space:]]+', ' ', 'g')) >= ${MIN_BOOKMARK_NOTE_CHARS}
      AND cardinality(regexp_split_to_array(
        regexp_replace(btrim(coalesce(b.note, '')), '[[:space:]]+', ' ', 'g'),
        '[[:space:]]+')) >= ${MIN_BOOKMARK_NOTE_WORDS}
      AND char_length(btrim(concat_ws(' ',
        nullif(regexp_replace(btrim(coalesce(b.note, '')), '[[:space:]]+', ' ', 'g'), ''),
        nullif(regexp_replace(btrim(coalesce(b.summary, '')), '[[:space:]]+', ' ', 'g'), ''),
        nullif(regexp_replace(btrim(coalesce(b.description, '')), '[[:space:]]+', ' ', 'g'), '')))) >= ${MIN_BOOKMARK_COMBINED_CHARS}
    ORDER BY b.date_bookmarked DESC, b.slug ASC
    LIMIT ${MAX_GRADUATED_BOOKMARK_SITEMAP_ROWS}
  `);
  const parsed = graduatedBookmarkCandidateRowSchema.array().safeParse(Array.from(rows));
  if (!parsed.success) {
    throw new Error("Invalid graduated bookmark sitemap entries", { cause: parsed.error });
  }
  return parsed.data
    .filter(
      (candidate) =>
        evaluateBookmarkIndexability({
          note: candidate.note,
          summary: candidate.summary,
          description: candidate.description,
          archived: false,
          isPrivate: false,
          isCanonicalSlug: true,
          sourceUnavailable: false,
        }).indexable,
    )
    .map((candidate) => ({ slug: candidate.slug, lastModified: candidate.lastModified }));
}

export async function listGraduatedTagHubSitemapEntries(): Promise<GraduatedTagHubSitemapEntry[]> {
  const rows = await db.execute(sql`
    ${sql.raw(BOOKMARK_TAG_ALIAS_CTE)}
    SELECT coalesce(cta.target_tag_slug, link.tag_slug) AS "tagSlug",
      count(DISTINCT b.id)::int AS "bookmarkCount",
      max(coalesce(nullif(btrim(b.modified_at), ''), nullif(btrim(b.source_updated_at), ''),
        b.date_bookmarked)) AS "lastModified"
    FROM bookmark_tag_links link
    LEFT JOIN canonical_tag_aliases cta ON cta.source_tag_slug = link.tag_slug
    JOIN bookmarks b ON b.id = link.bookmark_id AND b.archived = false AND b.is_private = false
    GROUP BY coalesce(cta.target_tag_slug, link.tag_slug)
    HAVING count(DISTINCT b.id) >= ${MIN_TAG_HUB_BOOKMARKS}
    ORDER BY count(DISTINCT b.id) DESC, "tagSlug" ASC
    LIMIT ${MAX_GRADUATED_TAG_SITEMAP_ROWS}
  `);
  const parsed = graduatedTagHubSitemapEntrySchema.array().safeParse(Array.from(rows));
  if (!parsed.success) {
    throw new Error("Invalid graduated tag hub sitemap entries", { cause: parsed.error });
  }
  return parsed.data;
}

export async function getBookmarkTopicHubEvidence(
  canonicalTagSlug: string,
): Promise<BookmarkTopicHubEvidence | null> {
  const normalizedSlug = canonicalTagSlug.trim();
  if (!normalizedSlug) return null;

  const [summaryRows, resourceRows] = await Promise.all([
    db.execute<{
      totalCount: number;
      analyzedCount: number;
      annotatedCount: number;
      topDomains: string[];
      topCategories: string[];
    }>(sql`
      ${sql.raw(BOOKMARK_TAG_ALIAS_CTE)}, tagged_bookmarks AS (
        SELECT DISTINCT ON (b.id) b.id,
          nullif(regexp_replace(lower(coalesce(b.domain, '')), '^www\\.', ''), '') AS clean_domain,
          nullif(btrim(a.payload #>> '{analysis,category}'), '') AS category,
          a.entity_id IS NOT NULL AS has_analysis,
          (char_length(regexp_replace(btrim(coalesce(b.note, '')), '[[:space:]]+', ' ', 'g')) >= ${MIN_BOOKMARK_NOTE_CHARS}
            AND cardinality(regexp_split_to_array(
              regexp_replace(btrim(coalesce(b.note, '')), '[[:space:]]+', ' ', 'g'),
              '[[:space:]]+')) >= ${MIN_BOOKMARK_NOTE_WORDS}) AS is_annotated
        FROM bookmark_tag_links link
        LEFT JOIN canonical_tag_aliases cta ON cta.source_tag_slug = link.tag_slug
        JOIN bookmarks b ON b.id = link.bookmark_id AND b.archived = false AND b.is_private = false
        LEFT JOIN ai_analysis_latest a ON a.domain = 'bookmarks' AND a.entity_id = b.id
        WHERE coalesce(cta.target_tag_slug, link.tag_slug) = ${normalizedSlug}
        ORDER BY b.id
      )
      SELECT count(*)::int AS "totalCount",
        count(*) FILTER (WHERE has_analysis)::int AS "analyzedCount",
        count(*) FILTER (WHERE is_annotated)::int AS "annotatedCount",
        coalesce((SELECT array_agg(d.clean_domain ORDER BY d.cnt DESC, d.clean_domain ASC)
          FROM (SELECT clean_domain, count(*) AS cnt FROM tagged_bookmarks
            WHERE clean_domain IS NOT NULL GROUP BY clean_domain
            ORDER BY count(*) DESC, clean_domain ASC LIMIT ${MAX_FACET_COUNT}) d),
          ARRAY[]::text[]) AS "topDomains",
        coalesce((SELECT array_agg(c.category ORDER BY c.cnt DESC, c.category ASC)
          FROM (SELECT category, count(*) AS cnt FROM tagged_bookmarks
            WHERE category IS NOT NULL GROUP BY category
            ORDER BY count(*) DESC, category ASC LIMIT ${MAX_FACET_COUNT}) c),
          ARRAY[]::text[]) AS "topCategories"
      FROM tagged_bookmarks
      LIMIT 1
    `),
    db.execute(sql`
      ${sql.raw(BOOKMARK_TAG_ALIAS_CTE)}
      SELECT candidates."id", candidates."slug", candidates."title", candidates."url",
        candidates."domain", candidates."dateBookmarked", candidates."note", candidates."summary",
        candidates."description", candidates."category", candidates."format",
        candidates."accessMethod", candidates."primaryHighlight"
      FROM (
        SELECT DISTINCT ON (b.id) b.id AS "id", b.slug AS "slug", b.title AS "title",
          b.url AS "url",
          regexp_replace(lower(coalesce(nullif(btrim(b.domain), ''), '')), '^www\\.', '') AS "domain",
          b.date_bookmarked AS "dateBookmarked", nullif(btrim(b.note), '') AS "note",
          coalesce(nullif(btrim(b.summary), ''),
            nullif(btrim(a.payload #>> '{analysis,summary}'), '')) AS "summary",
          coalesce(b.description, '') AS "description",
          nullif(btrim(a.payload #>> '{analysis,category}'), '') AS "category",
          nullif(btrim(a.payload #>> '{analysis,contextualDetails,format}'), '') AS "format",
          nullif(btrim(a.payload #>> '{analysis,contextualDetails,accessMethod}'), '') AS "accessMethod",
          nullif(btrim(a.payload #>> '{analysis,highlights,0}'), '') AS "primaryHighlight",
          char_length(regexp_replace(btrim(coalesce(b.note, '')), '[[:space:]]+', ' ', 'g')) >= ${MIN_BOOKMARK_NOTE_CHARS} AS has_note,
          a.entity_id IS NOT NULL AS has_analysis, b.is_favorite
        FROM bookmark_tag_links link
        LEFT JOIN canonical_tag_aliases cta ON cta.source_tag_slug = link.tag_slug
        JOIN bookmarks b ON b.id = link.bookmark_id AND b.archived = false AND b.is_private = false
        LEFT JOIN ai_analysis_latest a ON a.domain = 'bookmarks' AND a.entity_id = b.id
        WHERE coalesce(cta.target_tag_slug, link.tag_slug) = ${normalizedSlug}
        ORDER BY b.id
      ) candidates
      ORDER BY candidates.has_note DESC, candidates.has_analysis DESC, candidates.is_favorite DESC,
        candidates."dateBookmarked" DESC, candidates."id" ASC
      LIMIT ${MAX_CANDIDATE_HUB_RESOURCES}
    `),
  ]);

  const summary = summaryRows[0];
  if (!summary) throw new Error("Missing bookmark topic hub aggregate");
  if (summary.totalCount === 0) return null;

  const resources = topicHubResourceBriefSchema.array().safeParse(Array.from(resourceRows));
  if (!resources.success) {
    throw new Error("Invalid bookmark topic hub resources", { cause: resources.error });
  }
  const parsed = bookmarkTopicHubEvidenceSchema.safeParse({
    canonicalSlug: normalizedSlug,
    ...summary,
    annotatedBookmarks: resources.data
      .filter(
        (resource) =>
          (resource.note ?? "").replace(/\s+/g, " ").trim().length >= MIN_BOOKMARK_NOTE_CHARS,
      )
      .slice(0, MAX_ANNOTATED_BOOKMARKS),
    matrixResources: resources.data.slice(0, MAX_MATRIX_RESOURCES),
  });
  if (!parsed.success) {
    throw new Error("Invalid bookmark topic hub evidence", { cause: parsed.error });
  }
  return parsed.data;
}
