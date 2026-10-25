/**
 * Blog Sitemap Collector
 * @module lib/sitemap/blog-collector
 * @description
 * Projects the canonical blog inventory into post sitemap entries. Blog tag
 * pages are excluded from search indexing (`lib/seo/search-exclusion`).
 */

import type { MetadataRoute } from "next";

import { getAllPostsMeta } from "@/lib/blog";
import { BLOG_CHANGE_FREQUENCY, BLOG_POST_PRIORITY } from "@/lib/sitemap/constants";
import { getSafeDate, getLatestDate, handleSitemapCollectorError } from "@/lib/sitemap/date-utils";

export const collectBlogSitemapData = async (
  siteUrl: string,
): Promise<{
  blogPostEntries: MetadataRoute.Sitemap;
  latestPostUpdateTime?: Date;
}> => {
  const postsData: { slug: string; lastModified?: Date }[] = [];
  let latestPostUpdateTime: Date | undefined;

  try {
    for (const post of await getAllPostsMeta()) {
      const postLastModified = getLatestDate(
        getSafeDate(post.updatedAt),
        getSafeDate(post.publishedAt),
      );

      if (!postLastModified) {
        console.warn(`Sitemap: Could not determine lastModified date for post: ${post.slug}`);
      }

      postsData.push({ slug: post.slug, lastModified: postLastModified });
      latestPostUpdateTime = getLatestDate(latestPostUpdateTime, postLastModified);
    }
  } catch (error) {
    return handleSitemapCollectorError(
      "Error reading blog posts directory",
      error,
      { blogPostEntries: [] },
      "throw-in-production",
    );
  }

  const blogPostEntries: MetadataRoute.Sitemap = postsData.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: post.lastModified,
    changeFrequency: BLOG_CHANGE_FREQUENCY,
    priority: BLOG_POST_PRIORITY,
  }));

  return { blogPostEntries, latestPostUpdateTime };
};
