import { htmlToPlainText } from "@/lib/utils/html";

const MAX_SCRAPED_CONTENT_TEXT_CHARS = 250_000;

function fallbackStripHtml(rawHtml: string): string {
  return rawHtml
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function truncateScrapedContent(value: string): string {
  if (value.length <= MAX_SCRAPED_CONTENT_TEXT_CHARS) {
    return value;
  }
  return value.slice(0, MAX_SCRAPED_CONTENT_TEXT_CHARS);
}

export function normalizeScrapedContentText(rawHtml: string | null | undefined): string | null {
  if (typeof rawHtml !== "string" || rawHtml.trim().length === 0) {
    return null;
  }

  let plainText = "";
  try {
    plainText = htmlToPlainText(rawHtml);
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    console.warn(
      `[bookmarks/scraped-content] Failed to parse HTML with htmlToPlainText; using regex fallback: ${normalizedError.message}`,
    );
    plainText = fallbackStripHtml(rawHtml);
  }

  if (plainText.length === 0) {
    return null;
  }

  return truncateScrapedContent(plainText);
}
