/** Content Hydration: batch-fetch rich metadata for pgvector similarity results. */

import { db } from "@/lib/db/connection";
import { inArray, eq, and } from "drizzle-orm";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { blogPosts } from "@/lib/db/schema/blog-posts";
import { investments } from "@/lib/db/schema/investments";
import { projects } from "@/lib/db/schema/projects";
import { booksIndividual } from "@/lib/db/schema/books-individual";
import { thoughts } from "@/lib/db/schema/thoughts";
import { resolveImageUrl } from "@/lib/seo/url-utils";
import {
  buildCdnUrl,
  getBlogPostImageCdnUrl,
  getCdnConfigFromEnv,
  isOurCdnUrl,
} from "@/lib/utils/cdn-utils";
import { resolveInvestmentLogo } from "./investment-logo-resolver";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import type {
  ScoredCandidate,
  HydrationEntry,
  RelatedContentSuggestion,
} from "@/types/related-content";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";
import type { BookmarkTag } from "@/types/schemas/bookmark";
import type { RelatedContentMetadata } from "@/types/schemas/related-content";

/** Extract tag names from bookmark tags (which may be objects or strings). */
function extractTagNames(tags: Array<BookmarkTag | string> | null | undefined): string[] {
  if (!tags) return [];
  return tags.map((t) => (typeof t === "string" ? t : t.name)).filter(Boolean);
}

async function hydrateBookmarks(entries: HydrationEntry[]): Promise<RelatedContentSuggestion[]> {
  const ids = entries.map((e) => e.entityId);
  const rows = await db
    .select({
      id: bookmarks.id,
      title: bookmarks.title,
      slug: bookmarks.slug,
      url: bookmarks.url,
      description: bookmarks.description,
      tags: bookmarks.tags,
      domain: bookmarks.domain,
      ogImage: bookmarks.ogImage,
      content: bookmarks.content,
      dateBookmarked: bookmarks.dateBookmarked,
    })
    .from(bookmarks)
    .where(inArray(bookmarks.id, ids));

  const scoreMap = new Map(entries.map((e) => [e.entityId, e.score]));
  const cdnConfig = getCdnConfigFromEnv();

  return rows.map((r) => {
    // Only trust CDN OG URLs; pass undefined for external to let selectBestImage use asset fallbacks.
    let trustedOgImage: string | undefined;
    if (r.ogImage && isOurCdnUrl(r.ogImage, cdnConfig)) {
      trustedOgImage = r.ogImage;
    } else if (r.ogImage) {
      console.warn(
        `[content-hydration] Ignoring non-CDN ogImage for bookmark ${r.id}: ${r.ogImage}`,
      );
    }
    const score = scoreMap.get(r.id);
    if (score === undefined) {
      console.warn(`[content-hydration] Missing score for bookmark ${r.id}; defaulting to 0.`);
    }

    return {
      type: "bookmark" as const,
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      url: `/bookmarks/${r.slug || r.id}`,
      score: score ?? 0,
      metadata: {
        tags: extractTagNames(r.tags as Array<BookmarkTag | string> | null),
        domain: r.domain ?? undefined,
        date: r.dateBookmarked ?? undefined,
        imageUrl: resolveImageUrl(
          selectBestImage(
            { ogImage: trustedOgImage, content: r.content ?? undefined, id: r.id, url: r.url },
            { includeImageAssets: false, includeScreenshots: true, preferScreenshots: true },
          ) ?? undefined,
        ),
      } satisfies RelatedContentMetadata,
    };
  });
}

async function hydrateBlogPosts(entries: HydrationEntry[]): Promise<RelatedContentSuggestion[]> {
  const ids = entries.map((e) => e.entityId);
  const rows = await db
    .select({
      id: blogPosts.id,
      title: blogPosts.title,
      slug: blogPosts.slug,
      excerpt: blogPosts.excerpt,
      authorName: blogPosts.authorName,
      tags: blogPosts.tags,
      publishedAt: blogPosts.publishedAt,
      coverImage: blogPosts.coverImage,
    })
    .from(blogPosts)
    .where(and(inArray(blogPosts.id, ids), eq(blogPosts.draft, false)));

  const scoreMap = new Map(entries.map((e) => [e.entityId, e.score]));
  const cdnConfig = getCdnConfigFromEnv();

  return rows.map((r) => {
    let imageUrl: string | undefined;
    if (typeof r.coverImage === "string") {
      const cdnUrl = getBlogPostImageCdnUrl(r.coverImage);
      if (cdnUrl) {
        imageUrl = cdnUrl;
      } else if (isOurCdnUrl(r.coverImage, cdnConfig)) {
        imageUrl = r.coverImage;
      } else if (r.coverImage.startsWith("/")) {
        // Local path without manifest entry — data integrity gap, not a runtime fallback
        console.warn(
          `[content-hydration] Blog cover "${r.coverImage}" missing from CDN manifest for post ${r.id}. Run "bun scripts/sync-blog-cover-images.ts".`,
        );
        imageUrl = r.coverImage;
      } else {
        console.warn(
          `[content-hydration] Ignoring non-CDN coverImage for blog post ${r.id}: ${r.coverImage}`,
        );
      }
    }
    const metadata: RelatedContentMetadata = {
      tags: (r.tags as string[]) ?? [],
      date: r.publishedAt ?? undefined,
      imageUrl: resolveImageUrl(imageUrl),
      author: r.authorName ? { name: r.authorName } : undefined,
    };
    return {
      type: "blog" as const,
      id: r.id,
      title: r.title,
      description: r.excerpt ?? "",
      url: `/blog/${r.slug}`,
      score: scoreMap.get(r.id) ?? 0,
      metadata,
    };
  });
}

async function hydrateInvestments(entries: HydrationEntry[]): Promise<RelatedContentSuggestion[]> {
  const ids = entries.map((e) => e.entityId);
  const rows = await db
    .select({
      id: investments.id,
      name: investments.name,
      slug: investments.slug,
      description: investments.description,
      stage: investments.stage,
      category: investments.category,
      website: investments.website,
      aventureUrl: investments.aventureUrl,
      logo: investments.logo,
      logoOnlyDomain: investments.logoOnlyDomain,
      investedYear: investments.investedYear,
    })
    .from(investments)
    .where(inArray(investments.id, ids));

  const scoreMap = new Map(entries.map((e) => [e.entityId, e.score]));

  return Promise.all(
    rows.map(async (r) => ({
      type: "investment" as const,
      id: r.id,
      title: r.name,
      description: r.description ?? "",
      url: `/investments#${r.slug}`,
      score: scoreMap.get(r.id) ?? 0,
      metadata: {
        date: r.investedYear ?? undefined,
        stage: r.stage ?? undefined,
        category: r.category ?? undefined,
        imageUrl: await resolveInvestmentLogo(r),
        aventureUrl: r.aventureUrl ?? undefined,
      } satisfies RelatedContentMetadata,
    })),
  );
}

async function hydrateProjects(entries: HydrationEntry[]): Promise<RelatedContentSuggestion[]> {
  const ids = entries.map((e) => e.entityId);
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      description: projects.description,
      shortSummary: projects.shortSummary,
      imageKey: projects.imageKey,
      tags: projects.tags,
    })
    .from(projects)
    .where(inArray(projects.id, ids));

  const scoreMap = new Map(entries.map((e) => [e.entityId, e.score]));

  return rows.map((r) => {
    const metadata: RelatedContentMetadata = {
      tags: (r.tags as string[]) ?? [],
      imageUrl: r.imageKey ? buildCdnUrl(r.imageKey, getCdnConfigFromEnv()) : undefined,
    };
    return {
      type: "project" as const,
      id: r.id,
      title: r.name,
      description: r.shortSummary || (r.description ?? ""),
      url: `/projects/${r.slug}`,
      score: scoreMap.get(r.id) ?? 0,
      metadata,
    };
  });
}

async function hydrateBooks(entries: HydrationEntry[]): Promise<RelatedContentSuggestion[]> {
  const ids = entries.map((e) => e.entityId);
  const rows = await db
    .select({
      id: booksIndividual.id,
      title: booksIndividual.title,
      slug: booksIndividual.slug,
      description: booksIndividual.description,
      authors: booksIndividual.authors,
      formats: booksIndividual.formats,
      coverUrl: booksIndividual.coverUrl,
      genres: booksIndividual.genres,
    })
    .from(booksIndividual)
    .where(inArray(booksIndividual.id, ids));

  const scoreMap = new Map(entries.map((e) => [e.entityId, e.score]));

  return rows.map((r) => {
    const metadata: RelatedContentMetadata = {
      tags: (r.genres as string[]) ?? [],
      imageUrl: resolveImageUrl(r.coverUrl ?? undefined),
      authors: (r.authors as string[]) ?? undefined,
      formats: (r.formats as string[]) ?? undefined,
    };
    return {
      type: "book" as const,
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      url: `/books/${r.slug}`,
      score: scoreMap.get(r.id) ?? 0,
      metadata,
    };
  });
}

async function hydrateThoughts(entries: HydrationEntry[]): Promise<RelatedContentSuggestion[]> {
  const ids = entries.map((e) => e.entityId);
  const rows = await db
    .select({
      id: thoughts.id,
      title: thoughts.title,
      slug: thoughts.slug,
      content: thoughts.content,
      tags: thoughts.tags,
      createdAt: thoughts.createdAt,
      category: thoughts.category,
    })
    .from(thoughts)
    .where(and(inArray(thoughts.id, ids), eq(thoughts.draft, false)));

  const scoreMap = new Map(entries.map((e) => [e.entityId, e.score]));

  return rows.map((r) => {
    const createdAtMs = r.createdAt ? Number(r.createdAt) : null;
    const dateIso = createdAtMs ? new Date(createdAtMs).toISOString() : undefined;
    const metadata: RelatedContentMetadata = {
      tags: r.tags ?? [],
      date: dateIso,
      category: r.category ?? undefined,
    };
    return {
      type: "thought" as const,
      id: r.id,
      title: r.title,
      description: r.content?.slice(0, 200) ?? "",
      url: `/thoughts/${r.slug}`,
      score: scoreMap.get(r.id) ?? 0,
      metadata,
    };
  });
}

const DOMAIN_HYDRATORS: Record<
  ContentEmbeddingDomain,
  ((entries: HydrationEntry[]) => Promise<RelatedContentSuggestion[]>) | null
> = {
  bookmark: hydrateBookmarks,
  blog: hydrateBlogPosts,
  investment: hydrateInvestments,
  project: hydrateProjects,
  book: hydrateBooks,
  thought: hydrateThoughts,
  ai_analysis: null,
  opengraph: null,
};

/**
 * Hydrate scored similarity candidates into full RelatedContentSuggestion[].
 *
 * Groups candidates by domain, issues one batch query per domain,
 * and maps results to UI-ready items with rich metadata.
 * Domains without hydrators (ai_analysis, opengraph) are silently skipped.
 */
export async function hydrateRelatedContent(
  candidates: ScoredCandidate[],
): Promise<RelatedContentSuggestion[]> {
  // Group by domain
  const byDomain = new Map<ContentEmbeddingDomain, HydrationEntry[]>();
  for (const c of candidates) {
    const entries = byDomain.get(c.domain) ?? [];
    entries.push({ domain: c.domain, entityId: c.entityId, score: c.score });
    byDomain.set(c.domain, entries);
  }

  // Batch-fetch all domains in parallel
  const hydrationPromises: Promise<RelatedContentSuggestion[]>[] = [];
  for (const [domain, entries] of byDomain) {
    const hydrator = DOMAIN_HYDRATORS[domain];
    if (hydrator) {
      hydrationPromises.push(hydrator(entries));
    }
  }

  const results = await Promise.all(hydrationPromises);
  const allItems = results.flat();

  // Re-sort with deterministic tie-breaking (parallel fetch may interleave ordering).
  allItems.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    const typeDiff = a.type.localeCompare(b.type);
    if (typeDiff !== 0) return typeDiff;
    return a.id.localeCompare(b.id);
  });

  return allItems;
}
