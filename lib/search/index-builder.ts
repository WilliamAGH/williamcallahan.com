/**
 * Search Index Builder
 *
 * Builds and serializes MiniSearch indexes for storage in S3.
 * This is run at build time to pre-generate search indexes,
 * avoiding the need to build them on every request.
 *
 * @module lib/search/index-builder
 */

import { assertServerOnly } from "../utils/ensure-server-only";
assertServerOnly();

import MiniSearch from "minisearch";
import type { BlogPost } from "@/types/blog";
import type { EducationItem, BookmarkIndexItem, SerializedIndex, AllSerializedIndexes } from "@/types/search";
import { investments } from "@/data/investments";
import { experiences } from "@/data/experience";
import { education, certifications } from "@/data/education";
import { projects } from "@/data/projects";
import type { Project } from "@/types/project";
import { getAllMDXPostsForSearch } from "@/lib/blog/mdx";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { prepareDocumentsForIndexing } from "@/lib/utils/search-helpers";
import { loadSlugMapping, getSlugForBookmark } from "@/lib/bookmarks/slug-manager";
import type { UnifiedBookmark } from "@/types/bookmark";

/**
 * Build search index for blog posts
 */
async function buildPostsIndex(): Promise<SerializedIndex> {
  // Get lightweight posts without rawContent
  const allPosts = await getAllMDXPostsForSearch();

  // Create MiniSearch index
  const index = new MiniSearch<BlogPost>({
    fields: ["title", "excerpt", "tags", "authorName"],
    storeFields: ["id", "title", "excerpt", "slug", "publishedAt"],
    idField: "slug",
    searchOptions: {
      boost: { title: 2 },
      fuzzy: 0.1,
      prefix: true,
    },
    extractField: (document, fieldName) => {
      if (fieldName === "authorName") {
        return document.author?.name || "";
      }
      if (fieldName === "tags") {
        return Array.isArray(document.tags) ? document.tags.join(" ") : "";
      }
      const field = fieldName as keyof BlogPost;
      const value = document[field];
      return typeof value === "string" ? value : "";
    },
  });

  // Deduplicate and add to index
  const dedupedPosts = prepareDocumentsForIndexing(allPosts, "Blog Posts", (post) => post.slug);
  index.addAll(dedupedPosts);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedPosts.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for investments
 */
function buildInvestmentsIndex(): SerializedIndex {
  const index = new MiniSearch<(typeof investments)[0]>({
    fields: [
      "name",
      "description",
      "type",
      "status",
      "founded_year",
      "invested_year",
      "acquired_year",
      "shutdown_year",
    ],
    storeFields: ["id", "name", "description"],
    idField: "id",
    searchOptions: {
      boost: { name: 2 },
      fuzzy: 0.1,
      prefix: true,
    },
  });

  const dedupedInvestments = prepareDocumentsForIndexing(investments, "Investments");
  index.addAll(dedupedInvestments);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedInvestments.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for experience
 */
function buildExperienceIndex(): SerializedIndex {
  const index = new MiniSearch<(typeof experiences)[0]>({
    fields: ["company", "role", "period"],
    storeFields: ["id", "company", "role"],
    idField: "id",
    searchOptions: {
      boost: { company: 2, role: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  const dedupedExperiences = prepareDocumentsForIndexing(experiences, "Experience");
  index.addAll(dedupedExperiences);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedExperiences.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for education
 */
function buildEducationIndex(): SerializedIndex {
  const index = new MiniSearch<EducationItem>({
    fields: ["label", "description"],
    storeFields: ["id", "label", "description", "path"],
    idField: "id",
    searchOptions: {
      boost: { label: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Combine education and certifications
  const allEducationItems = [
    ...education.map((edu) => ({
      id: edu.id,
      label: edu.institution,
      description: edu.degree,
      path: `/education#${edu.id}`,
    })),
    ...certifications.map((cert) => ({
      id: cert.id,
      label: cert.institution,
      description: cert.name,
      path: `/education#${cert.id}`,
    })),
  ];

  const dedupedEducationItems = prepareDocumentsForIndexing(allEducationItems, "Education");
  index.addAll(dedupedEducationItems);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedEducationItems.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for projects
 */
function buildProjectsIndexForBuilder(): SerializedIndex {
  const index = new MiniSearch<Project>({
    fields: ["name", "description", "tags"],
    storeFields: ["name", "description", "url"],
    idField: "name",
    searchOptions: { boost: { name: 2 }, fuzzy: 0.2, prefix: true },
  });

  // Deduplicate by name (assumed unique) - explicitly type for index builder
  const dedupedProjects: Project[] = prepareDocumentsForIndexing(
    projects as Array<Project & { id?: string | number }>,
    "Projects",
    (p) => p.name,
  );
  index.addAll(dedupedProjects);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedProjects.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for bookmarks
 */
async function buildBookmarksIndex(): Promise<SerializedIndex> {
  // Fetch bookmarks from API
  const bookmarks = (await getBookmarks({ skipExternalFetch: false })) as UnifiedBookmark[];

  const index = new MiniSearch<BookmarkIndexItem>({
    fields: ["title", "description", "tags", "author", "publisher", "url"],
    storeFields: ["id", "title", "description", "url", "slug"],
    idField: "id",
    searchOptions: {
      boost: { title: 2, description: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Load centralized slug mapping (preferred), but allow embedded slug fallback
  const slugMapping = await loadSlugMapping();

  // Transform bookmarks for indexing
  const bookmarksForIndex = bookmarks.map((b) => {
    // Prefer embedded slug when present; fallback to centralized mapping
    const embedded = (b as unknown as { slug?: string })?.slug;
    const slug = embedded && typeof embedded === "string" && embedded.length > 0
      ? embedded
      : (slugMapping ? getSlugForBookmark(slugMapping, b.id) : null);

    // Every bookmark MUST have a slug for idempotency
    if (!slug) {
      throw new Error(
        `[Search Index Builder] CRITICAL: No slug found for bookmark ${b.id}. ` +
          `Title: ${b.title}, URL: ${b.url}. ` +
          `This indicates an incomplete slug mapping.`,
      );
    }

    return {
      id: b.id,
      title: b.title || b.url,
      description: b.description || "",
      tags: Array.isArray(b.tags)
        ? b.tags.map((t) => (typeof t === "string" ? t : (t as { name?: string })?.name || "")).join(" ")
        : "",
      url: b.url,
      author: b.content?.author || "",
      publisher: b.content?.publisher || "",
      slug, // slug is required (either embedded or via mapping)
    };
  });

  index.addAll(bookmarksForIndex);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: bookmarksForIndex.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build all search indexes
 */
export async function buildAllSearchIndexes(): Promise<AllSerializedIndexes> {
  console.log("[Search Index Builder] Starting build process...");

  const [postsIndex, bookmarksIndex] = await Promise.all([buildPostsIndex(), buildBookmarksIndex()]);

  const investmentsIndex = buildInvestmentsIndex();
  const experienceIndex = buildExperienceIndex();
  const educationIndex = buildEducationIndex();
  const projectsIndex = buildProjectsIndexForBuilder();

  const buildMetadata = {
    buildTime: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0",
    environment: process.env.NODE_ENV || "development",
  };

  console.log("[Search Index Builder] Build complete. Index counts:");
  console.log(`  - Posts: ${postsIndex.metadata.itemCount}`);
  console.log(`  - Investments: ${investmentsIndex.metadata.itemCount}`);
  console.log(`  - Experience: ${experienceIndex.metadata.itemCount}`);
  console.log(`  - Education: ${educationIndex.metadata.itemCount}`);
  console.log(`  - Projects: ${projectsIndex.metadata.itemCount}`);
  console.log(`  - Bookmarks: ${bookmarksIndex.metadata.itemCount}`);

  return {
    posts: postsIndex,
    investments: investmentsIndex,
    experience: experienceIndex,
    education: educationIndex,
    projects: projectsIndex,
    bookmarks: bookmarksIndex,
    buildMetadata,
  };
}

/**
 * Load a MiniSearch index from serialized JSON
 */
export function loadIndexFromJSON<T>(serializedIndex: SerializedIndex): MiniSearch<T> {
  return MiniSearch.loadJSON(serializedIndex.index as string, {
    fields: [], // These are stored in the JSON
    storeFields: [], // These are stored in the JSON
  });
}
