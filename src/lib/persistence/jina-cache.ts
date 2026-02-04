/**
 * Jina AI Cache Module
 *
 * Handles caching of Jina AI Reader responses (HTML and Markdown) to S3.
 * Extracted from s3-persistence.ts for SRP compliance.
 *
 * @module persistence/jina-cache
 */

import { getObject } from "@/lib/s3/objects";
import { debug } from "@/lib/utils/debug";
import { hashUrl, normalizeUrl } from "@/lib/utils/opengraph-utils";
import { OPENGRAPH_JINA_HTML_S3_DIR, OPENGRAPH_JSON_S3_PATHS } from "@/lib/constants";
import { OgError } from "@/types/opengraph";
import { S3NotFoundError } from "@/lib/s3/errors";
import { persistToS3 } from "./s3-persistence";

/**
 * Build S3 key for Jina HTML content
 */
function buildJinaHtmlKey(url: string): string {
  return `${OPENGRAPH_JINA_HTML_S3_DIR}/${hashUrl(normalizeUrl(url))}.html`;
}

/**
 * Build S3 key for Jina markdown content
 */
function buildJinaMarkdownKey(url: string): string {
  return `${OPENGRAPH_JSON_S3_PATHS.DIR}/jina-markdown/${hashUrl(normalizeUrl(url))}.md`;
}

/**
 * Generic fire-and-forget S3 persistence with error logging
 */
function persistJinaContentInBackground(
  url: string,
  content: string,
  config: {
    s3Key: string;
    contentType: string;
    logEmoji: string;
    logLabel: string;
    errorCode: string;
  },
): void {
  void (async () => {
    try {
      await persistToS3(config.s3Key, content, config.contentType);
      console.log(
        `[OpenGraph S3] ${config.logEmoji} Successfully persisted Jina ${config.logLabel} to S3: ${config.s3Key} (${content.length} bytes)`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(
        `Error persisting Jina ${config.logLabel} to S3 for ${url}`,
        config.errorCode,
        { originalError: error },
      );
      console.error(
        `[OpenGraph S3] ❌ Failed to persist Jina ${config.logLabel}: ${ogError.message}`,
      );
    }
  })();
}

/**
 * Generic S3 read with cache-miss handling and error propagation
 */
async function getCachedJinaContent(
  url: string,
  config: { s3Key: string; logLabel: string; errorCode: string },
): Promise<string | null> {
  try {
    const result = await getObject(config.s3Key);
    debug(`[DataAccess/OpenGraph] Found cached Jina ${config.logLabel} in S3: ${config.s3Key}`);
    return result.body.toString("utf-8");
  } catch (err) {
    // Cache miss is expected - return null
    if (err instanceof S3NotFoundError) {
      debug(`[DataAccess/OpenGraph] No cached Jina ${config.logLabel} found in S3 for ${url}`);
      return null;
    }
    // Real S3 errors (permissions, network) must propagate - do not mask
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(
      `[DataAccess/OpenGraph] S3 error reading Jina ${config.logLabel} for ${url}: ${error.message}`,
    );
    throw new OgError(
      `Error reading Jina ${config.logLabel} from S3 for ${url}`,
      config.errorCode,
      { originalError: error },
    );
  }
}

/**
 * Persist Jina AI HTML content to S3 in the background
 * Fire-and-forget pattern with error logging
 *
 * @param url - The original URL, used to create a consistent hash
 * @param html - The HTML content to store
 */
export function persistJinaHtmlInBackground(url: string, html: string): void {
  persistJinaContentInBackground(url, html, {
    s3Key: buildJinaHtmlKey(url),
    contentType: "text/html; charset=utf-8",
    logEmoji: "💾",
    logLabel: "HTML",
    errorCode: "s3-write-jina",
  });
}

/**
 * Persist Jina AI markdown content to S3 in the background
 * Fire-and-forget pattern with error logging
 *
 * @param url - URL of the page that was fetched
 * @param markdown - Markdown content to persist
 */
export function persistJinaMarkdownInBackground(url: string, markdown: string): void {
  persistJinaContentInBackground(url, markdown, {
    s3Key: buildJinaMarkdownKey(url),
    contentType: "text/markdown; charset=utf-8",
    logEmoji: "📝",
    logLabel: "markdown",
    errorCode: "s3-write-jina-markdown",
  });
}

/**
 * Retrieve cached Jina AI HTML from S3
 *
 * @param url - The original URL to look up
 * @returns The cached HTML content or null if not found
 * @throws OgError on real S3 failures (permissions, network, etc.)
 */
export async function getCachedJinaHtml(url: string): Promise<string | null> {
  return getCachedJinaContent(url, {
    s3Key: buildJinaHtmlKey(url),
    logLabel: "HTML",
    errorCode: "s3-read-jina",
  });
}

/**
 * Get cached Jina AI markdown from S3
 *
 * @param url - URL of the page to look up
 * @returns Markdown content if found, null otherwise
 * @throws OgError on real S3 failures (permissions, network, etc.)
 */
export async function getCachedJinaMarkdown(url: string): Promise<string | null> {
  return getCachedJinaContent(url, {
    s3Key: buildJinaMarkdownKey(url),
    logLabel: "markdown",
    errorCode: "s3-read-jina-markdown",
  });
}
