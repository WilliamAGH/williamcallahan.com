import type { MetadataRoute } from "next";
import { io } from "next/cache";
import { NextResponse } from "next/server";
import { collectGraduatedBookmarksSitemapEntries } from "@/lib/sitemap/bookmark-collectors";
import { SITEMAP_RUNTIME_CACHE_TTL_MS } from "@/lib/sitemap/constants";
import { isTestEnvironment } from "@/lib/sitemap/date-utils";
import type { BookmarksSitemapXmlCacheEntry } from "@/types/seo/bookmark-graduation";

const HTTP_OK = 200;
let runtimeBookmarksSitemapCache: BookmarksSitemapXmlCacheEntry | null = null;
let inFlightBookmarksSitemapBuild: Promise<string> | null = null;

function escapeXml(rawValue: string): string {
  return rawValue
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function serializeSitemapXml(entries: MetadataRoute.Sitemap): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const entry of entries) {
    lines.push("<url>", `<loc>${escapeXml(entry.url)}</loc>`);
    if (entry.lastModified !== undefined) {
      const lastModified = new Date(entry.lastModified);
      if (!Number.isNaN(lastModified.getTime())) {
        lines.push(`<lastmod>${escapeXml(lastModified.toISOString())}</lastmod>`);
      }
    }
    if (entry.changeFrequency !== undefined) {
      lines.push(`<changefreq>${escapeXml(entry.changeFrequency)}</changefreq>`);
    }
    if (entry.priority !== undefined) {
      lines.push(`<priority>${escapeXml(String(entry.priority))}</priority>`);
    }
    lines.push("</url>");
  }
  lines.push("</urlset>\n");
  return lines.join("\n");
}

export async function GET(): Promise<NextResponse> {
  let xmlBody: string;
  if (isTestEnvironment()) {
    xmlBody = serializeSitemapXml(await collectGraduatedBookmarksSitemapEntries());
  } else {
    await io();
    if (
      runtimeBookmarksSitemapCache &&
      Date.now() - runtimeBookmarksSitemapCache.generatedAt < SITEMAP_RUNTIME_CACHE_TTL_MS
    ) {
      xmlBody = runtimeBookmarksSitemapCache.xml;
    } else {
      inFlightBookmarksSitemapBuild ??= collectGraduatedBookmarksSitemapEntries()
        .then((entries) => {
          const xml = serializeSitemapXml(entries);
          runtimeBookmarksSitemapCache = { generatedAt: Date.now(), xml };
          return xml;
        })
        .finally(() => {
          inFlightBookmarksSitemapBuild = null;
        });
      xmlBody = await inFlightBookmarksSitemapBuild;
    }
  }
  return new NextResponse(xmlBody, {
    status: HTTP_OK,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
