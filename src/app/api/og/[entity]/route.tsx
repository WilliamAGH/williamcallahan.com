/**
 * Unified Dynamic OG Image Generator
 * @module app/api/og/[entity]/route
 * @description
 * Generates branded 1200×630 OG images for all entity types through a shared composition layer.
 * Uses @vercel/og (Satori) for server-side image generation.
 *
 * Supported entities: books, bookmarks, blog, projects, thoughts, collection
 *
 * @example GET /api/og/books?title=...&coverUrl=...&formats=audio,ebook
 * @example GET /api/og/blog?title=...&author=...&coverUrl=...&tags=AI,Next.js
 * @example GET /api/og/thoughts?title=...&subtitle=...
 *
 * @see docs/features/opengraph.md for architecture details
 */

import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

import {
  ogEntitySchema,
  ogBookParamsSchema,
  ogBookmarkParamsSchema,
  ogBlogParamsSchema,
  ogProjectParamsSchema,
  ogTextParamsSchema,
} from "@/types/schemas/og-image";
import type { OgEntity } from "@/types/schemas/og-image";
import { fetchImageAsDataUrl } from "@/lib/og-image/fetch-image";
import { OG_LAYOUT } from "@/lib/og-image/design-tokens";
import { renderBookLayout } from "@/lib/og-image/layouts/book-layout";
import { renderBookmarkLayout } from "@/lib/og-image/layouts/bookmark-layout";
import { renderBlogLayout } from "@/lib/og-image/layouts/blog-layout";
import { renderProjectLayout } from "@/lib/og-image/layouts/project-layout";
import { renderTextLayout } from "@/lib/og-image/layouts/text-layout";

/**
 * DO NOT ADD `export const runtime = "nodejs"` HERE - DO NOT REMOVE THIS COMMENT
 *
 * Next.js 16 guarantees Node.js runtime for all app/api/* routes by default.
 * Sharp's native bindings work correctly without an explicit runtime export.
 * Adding the runtime export breaks this project's build pipeline (tested empirically).
 *
 * @see docs/standards/nextjs-framework.md for framework runtime guarantees
 */

/** Parse search params into a plain object for Zod parsing */
function searchParamsToRecord(searchParams: URLSearchParams): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    record[key] = value;
  }
  return record;
}

/** Render the appropriate layout based on entity type */
async function renderEntity(
  entity: OgEntity,
  params: Record<string, string>,
  origin: string,
): Promise<React.ReactElement> {
  switch (entity) {
    case "books": {
      const parsed = ogBookParamsSchema.parse(params);
      const coverDataUrl = parsed.coverUrl
        ? await fetchImageAsDataUrl(parsed.coverUrl, origin)
        : null;
      return renderBookLayout({ ...parsed, coverDataUrl });
    }
    case "bookmarks": {
      const parsed = ogBookmarkParamsSchema.parse(params);
      const screenshotDataUrl = parsed.screenshotUrl
        ? await fetchImageAsDataUrl(parsed.screenshotUrl, origin)
        : null;
      return renderBookmarkLayout({ ...parsed, screenshotDataUrl });
    }
    case "blog": {
      const parsed = ogBlogParamsSchema.parse(params);
      const coverDataUrl = parsed.coverUrl
        ? await fetchImageAsDataUrl(parsed.coverUrl, origin)
        : null;
      return renderBlogLayout({ ...parsed, coverDataUrl });
    }
    case "projects": {
      const parsed = ogProjectParamsSchema.parse(params);
      const screenshotDataUrl = parsed.screenshotUrl
        ? await fetchImageAsDataUrl(parsed.screenshotUrl, origin)
        : null;
      return renderProjectLayout({ ...parsed, screenshotDataUrl });
    }
    case "thoughts":
    case "collection": {
      const parsed = ogTextParamsSchema.parse(params);
      return renderTextLayout(parsed);
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
): Promise<ImageResponse | Response> {
  const { entity: rawEntity } = await params;

  const entityResult = ogEntitySchema.safeParse(rawEntity);
  if (!entityResult.success) {
    return new Response(`Invalid entity type: ${rawEntity}`, { status: 400 });
  }

  const { searchParams, origin } = request.nextUrl;
  const queryParams = searchParamsToRecord(searchParams);

  try {
    const jsx = await renderEntity(entityResult.data, queryParams, origin);
    return new ImageResponse(jsx, {
      width: OG_LAYOUT.width,
      height: OG_LAYOUT.height,
    });
  } catch (error) {
    console.error(`[OG-Image] Error generating ${rawEntity} image:`, error);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
