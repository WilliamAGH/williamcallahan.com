/**
 * Blog Sitemap Collector
 * @module lib/sitemap/blog-collector
 * @description
 * Reads MDX blog posts from the filesystem, parses frontmatter for dates and
 * tags, and produces sitemap entries for individual posts and blog tag pages.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { MetadataRoute } from "next";

import { kebabCase } from "@/lib/utils/formatters";
import {
  BLOG_CHANGE_FREQUENCY,
  BLOG_POST_PRIORITY,
  BLOG_TAG_PRIORITY,
} from "@/lib/sitemap/constants";
import { getSafeDate, getLatestDate, handleSitemapCollectorError } from "@/lib/sitemap/date-utils";

export const collectBlogSitemapData = (
  siteUrl: string,
): {
  blogPostEntries: MetadataRoute.Sitemap;
  blogTagEntries: MetadataRoute.Sitemap;
  latestPostUpdateTime?: Date;
} => {
  const postsDirectory = path.join(process.cwd(), "data/blog/posts");
  const postsData: { slug: string; lastModified: Date | undefined; tags: string[] }[] = [];
  const tagLastModifiedMap: Record<string, Date> = {};
  let latestPostUpdateTime: Date | undefined;

  try {
    const filenames = fs.readdirSync(postsDirectory);
    const mdxFiles = filenames.filter((filename) => filename.endsWith(".mdx"));
    for (const filename of mdxFiles) {
      const filePath = path.join(postsDirectory, filename);
      let fileMtime: Date | undefined;
      try {
        fileMtime = fs.statSync(filePath).mtime;
      } catch (statError) {
        console.error(`Sitemap: Failed to get mtime for ${filePath}:`, statError);
      }

      const fileContents = fs.readFileSync(filePath, "utf8");
      const { data } = matter(fileContents);
      const slug = filename.replace(/\.mdx$/, "");

      const postLastModified = getLatestDate(
        getSafeDate(data.updatedAt),
        getSafeDate(data.publishedAt),
        fileMtime,
      );

      if (!postLastModified) {
        console.warn(`Sitemap: Could not determine lastModified date for post: ${slug}`);
      }

      const tags: string[] = Array.isArray(data.tags) ? data.tags.map(String) : [];

      postsData.push({
        slug,
        lastModified: postLastModified,
        tags,
      });

      latestPostUpdateTime = getLatestDate(latestPostUpdateTime, postLastModified);

      if (postLastModified && tags.length > 0) {
        for (const tag of tags) {
          const tagSlug = kebabCase(tag);
          tagLastModifiedMap[tagSlug] =
            getLatestDate(tagLastModifiedMap[tagSlug], postLastModified) ?? postLastModified;
        }
      }
    }
  } catch (error) {
    return handleSitemapCollectorError("Error reading blog posts directory", error, {
      blogPostEntries: [],
      blogTagEntries: [],
    });
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
