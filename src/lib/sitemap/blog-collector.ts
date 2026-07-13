/**
 * Blog Sitemap Collector
 * @module lib/sitemap/blog-collector
 * @description
 * Projects the canonical blog inventory into post and tag sitemap entries.
 */

import type { MetadataRoute } from "next";

import { getAllPostsMeta } from "@/lib/blog";
import { kebabCase } from "@/lib/utils/formatters";
import {
  BLOG_CHANGE_FREQUENCY,
  BLOG_POST_PRIORITY,
  BLOG_TAG_PRIORITY,
} from "@/lib/sitemap/constants";
import { getSafeDate, getLatestDate, handleSitemapCollectorError } from "@/lib/sitemap/date-utils";

export const collectBlogSitemapData = async (
  siteUrl: string,
): Promise<{
  blogPostEntries: MetadataRoute.Sitemap;
  blogTagEntries: MetadataRoute.Sitemap;
  latestPostUpdateTime?: Date;
}> => {
  const postsData: { slug: string; lastModified?: Date; tags: string[] }[] = [];
  const tagLastModifiedMap: Record<string, Date> = {};
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

      postsData.push({
        slug: post.slug,
        lastModified: postLastModified,
        tags: post.tags,
      });

      latestPostUpdateTime = getLatestDate(latestPostUpdateTime, postLastModified);

      if (postLastModified) {
        for (const tag of post.tags) {
          const tagSlug = kebabCase(tag);
          tagLastModifiedMap[tagSlug] =
            getLatestDate(tagLastModifiedMap[tagSlug], postLastModified) ?? postLastModified;
        }
      }
    }
  } catch (error) {
    return handleSitemapCollectorError(
      "Error reading blog posts directory",
      error,
      {
        blogPostEntries: [],
        blogTagEntries: [],
      },
      "throw-in-production",
    );
  }

  const blogPostEntries: MetadataRoute.Sitemap = postsData.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: post.lastModified,
    changeFrequency: BLOG_CHANGE_FREQUENCY,
    priority: BLOG_POST_PRIORITY,
  }));

  const blogTagEntries: MetadataRoute.Sitemap = Object.entries(tagLastModifiedMap).map(
    ([tagSlug, lastModified]) => ({
      url: `${siteUrl}/blog/tags/${tagSlug}`,
      lastModified,
      changeFrequency: BLOG_CHANGE_FREQUENCY,
      priority: BLOG_TAG_PRIORITY,
    }),
  );

  return { blogPostEntries, blogTagEntries, latestPostUpdateTime };
};
