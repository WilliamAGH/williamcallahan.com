import { load } from "cheerio";
import { BLOG_RENDER_CANARIES } from "@/config/blog-render-canaries";

export const MDX_RENDER_FALLBACK_MESSAGE =
  "Unable to render this portion of the article. Please refresh or contact support if the issue persists.";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function containsOrderedMarkers(
  content: string,
  markers: (typeof BLOG_RENDER_CANARIES)[number]["markers"],
): boolean {
  let nextPosition = 0;

  for (const marker of markers) {
    const expectedMarker = normalizeWhitespace(marker.text);
    if (expectedMarker.length === 0) return false;

    const markerPosition = content.indexOf(expectedMarker, nextPosition);
    if (markerPosition === -1) return false;

    nextPosition = markerPosition + expectedMarker.length;
  }

  return true;
}

export function validateBlogRenderHtml(
  html: string,
  canary: (typeof BLOG_RENDER_CANARIES)[number],
): boolean {
  const $ = load(html);
  const content = $("article.blog-content");
  const contentText = normalizeWhitespace(content.text());
  const hasExactTitle = $("h1")
    .toArray()
    .some((heading) => $(heading).text().trim() === canary.title);

  return (
    content.length === 1 &&
    hasExactTitle &&
    contentText.length > 0 &&
    !contentText.includes(MDX_RENDER_FALLBACK_MESSAGE) &&
    containsOrderedMarkers(contentText, canary.markers)
  );
}
