import { NextResponse } from "next/server";
import { getAllPostsMeta } from "@/lib/blog";
import { getBookmarksPage } from "@/lib/bookmarks/service.server";
import { metadata } from "@/data/metadata";

const MAX_FEED_ITEMS = 100;

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const wrapCdata = (value: string): string =>
  `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;

const pickDescription = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

function parseFeedDate(rawValue: string, label: string): Date | null {
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    console.error(`[feed.xml] Skipping ${label} because the date is invalid: ${rawValue}`);
    return null;
  }
  return date;
}

// Next.js 16 + cacheComponents means pages are dynamic by default.
// API routes (`app/api/**/route.ts` and general Route Handlers) are exempt from `use cache`.
// We use HTTP caching headers (Cache-Control) to cache the feed output at the CDN/Edge.
export async function GET() {
  const [posts, bookmarks] = await Promise.all([
    getAllPostsMeta(false), // exclude drafts
    getBookmarksPage(1, MAX_FEED_ITEMS), // lightweight, bounded fetch for feed generation
  ]);

  const siteUrl = metadata.site.url;
  const feedUrl = `${siteUrl}/feed.xml`;
  const generatedAt = new Date().toUTCString();

  const feedItems = [
    ...posts.flatMap((post) => {
      const date = parseFeedDate(post.publishedAt, `blog post "${post.slug}"`);
      if (!date) return [];
      return [
        {
          title: post.title,
          url: `${siteUrl}/blog/${post.slug}`,
          date,
          description: pickDescription(post.excerpt),
          category: "Blog" as const,
        },
      ];
    }),
    ...bookmarks.flatMap((bookmark) => {
      const date = parseFeedDate(bookmark.dateBookmarked, `bookmark "${bookmark.id}"`);
      if (!date) return [];
      return [
        {
          title: bookmark.title,
          url: `${siteUrl}/bookmarks/${bookmark.slug}`,
          date,
          description: pickDescription(bookmark.description, bookmark.summary),
          category: "Bookmark" as const,
        },
      ];
    }),
  ];

  // Sort chronologically newest first
  feedItems.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Cap at 100 to prevent unbounded XML growth over time
  const latestItems = feedItems.slice(0, MAX_FEED_ITEMS);

  const rssItems = latestItems
    .map((item) => {
      // Prepending an indicator is an idiomatic pattern for combined feeds
      const titlePrefix = item.category === "Bookmark" ? "🔖 " : "📝 ";
      const descriptionNode = item.description
        ? `
      <description>${wrapCdata(item.description)}</description>`
        : "";

      return `
    <item>
      <title>${wrapCdata(`${titlePrefix}${item.title}`)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <pubDate>${item.date.toUTCString()}</pubDate>
      ${descriptionNode}
      <category>${escapeXml(item.category)}</category>
    </item>`;
    })
    .join("");

  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${wrapCdata(metadata.title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${wrapCdata(metadata.description)}</description>
    <language>en-us</language>
    <generator>WilliamCallahan.com</generator>
    <lastBuildDate>${generatedAt}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
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
