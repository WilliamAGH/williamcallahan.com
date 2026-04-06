import { NextResponse } from "next/server";
import { getAllPostsMeta } from "@/lib/blog";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { metadata } from "@/data/metadata";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";

interface FeedItem {
  title: string;
  url: string;
  date: Date;
  description: string;
  category: "Blog" | "Bookmark";
}

// Next.js 16 + cacheComponents means pages are dynamic by default.
// API routes (`app/api/**/route.ts` and general Route Handlers) are exempt from `use cache`.
// We use HTTP caching headers (Cache-Control) to cache the feed output at the CDN/Edge.
export async function GET() {
  const [posts, bookmarks] = await Promise.all([
    getAllPostsMeta(false), // exclude drafts
    getBookmarks({ skipExternalFetch: true }), // fast local/cache fetch
  ]);

  const siteUrl = metadata.site.url;

  const feedItems: FeedItem[] = [
    ...posts.map((post) => ({
      title: post.title,
      url: `${siteUrl}/blog/${post.slug}`,
      date: post.publishedAt ? new Date(post.publishedAt) : new Date(),
      description: post.excerpt || "",
      category: "Blog" as const,
    })),
    ...(bookmarks as UnifiedBookmark[]).map((bookmark) => ({
      title: bookmark.title,
      url: `${siteUrl}/bookmarks/${bookmark.slug}`,
      date: new Date(bookmark.dateBookmarked),
      description: bookmark.description || bookmark.summary || "",
      category: "Bookmark" as const,
    })),
  ];

  // Sort chronologically newest first
  feedItems.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Cap at 100 to prevent unbounded XML growth over time
  const latestItems = feedItems.slice(0, 100);

  const rssItems = latestItems
    .map((item) => {
      // Prepending an indicator is an idiomatic pattern for combined feeds
      const titlePrefix = item.category === "Bookmark" ? "🔖 " : "📝 ";

      return `
    <item>
      <title><![CDATA[${titlePrefix}${item.title}]]></title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <pubDate>${item.date.toUTCString()}</pubDate>
      <description><![CDATA[${item.description}]]></description>
      <category>${item.category}</category>
    </item>`;
    })
    .join("");

  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${metadata.title}</title>
    <link>${siteUrl}</link>
    <description>${metadata.description}</description>
    <language>en-us</language>
    <generator>WilliamCallahan.com</generator>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    ${rssItems}
  </channel>
</rss>`;

  return new NextResponse(rssFeed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
