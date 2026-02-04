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
 * Persist Jina AI HTML content to S3 in the background
 * Fire-and-forget pattern with error logging
 *
 * @param url - The original URL, used to create a consistent hash
 * @param html - The HTML content to store
 */
export function persistJinaHtmlInBackground(url: string, html: string): void {
  const s3Key = `${OPENGRAPH_JINA_HTML_S3_DIR}/${hashUrl(normalizeUrl(url))}.html`;

  void (async () => {
    try {
      await persistToS3(s3Key, html, "text/html; charset=utf-8");
      console.log(
        `[OpenGraph S3] 💾 Successfully persisted Jina HTML to S3: ${s3Key} (${html.length} bytes)`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error persisting Jina HTML to S3 for ${url}`, "s3-write-jina", {
        originalError: error,
      });
      console.error(`[OpenGraph S3] ❌ Failed to persist Jina HTML: ${ogError.message}`);
    }
  })();
}

/**
 * Persist Jina AI markdown content to S3 in the background
 * Fire-and-forget pattern with error logging
 *
 * @param url - URL of the page that was fetched
 * @param markdown - Markdown content to persist
 */
export function persistJinaMarkdownInBackground(url: string, markdown: string): void {
  const s3Key = `${OPENGRAPH_JSON_S3_PATHS.DIR}/jina-markdown/${hashUrl(normalizeUrl(url))}.md`;

  void (async () => {
    try {
      await persistToS3(s3Key, markdown, "text/markdown; charset=utf-8");
      console.log(
        `[OpenGraph S3] 📝 Successfully persisted Jina markdown to S3: ${s3Key} (${markdown.length} bytes)`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(
        `Error persisting Jina markdown to S3 for ${url}`,
        "s3-write-jina-markdown",
        { originalError: error },
      );
      console.error(`[OpenGraph S3] ❌ Failed to persist Jina markdown: ${ogError.message}`);
    }
  })();
}

/**
 * Retrieve cached Jina AI HTML from S3
 *
 * @param url - The original URL to look up
 * @returns The cached HTML content or null if not found
 * @throws OgError on real S3 failures (permissions, network, etc.)
 */
export async function getCachedJinaHtml(url: string): Promise<string | null> {
  const s3Key = `${OPENGRAPH_JINA_HTML_S3_DIR}/${hashUrl(normalizeUrl(url))}.html`;

  try {
    const result = await getObject(s3Key);
    debug(`[DataAccess/OpenGraph] Found cached Jina HTML in S3: ${s3Key}`);
    return result.body.toString("utf-8");
  } catch (err) {
    // Cache miss is expected - return null
    if (err instanceof S3NotFoundError) {
      debug(`[DataAccess/OpenGraph] No cached Jina HTML found in S3 for ${url}`);
      return null;
    }
    // Real S3 errors (permissions, network) must propagate - do not mask
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[DataAccess/OpenGraph] S3 error reading Jina HTML for ${url}: ${error.message}`);
    throw new OgError(`Error reading Jina HTML from S3 for ${url}`, "s3-read-jina", {
      originalError: error,
    });
  }
}

/**
 * Get cached Jina AI markdown from S3
 *
 * @param url - URL of the page to look up
 * @returns Markdown content if found, null otherwise
 * @throws OgError on real S3 failures (permissions, network, etc.)
 */
export async function getCachedJinaMarkdown(url: string): Promise<string | null> {
  const s3Key = `${OPENGRAPH_JSON_S3_PATHS.DIR}/jina-markdown/${hashUrl(normalizeUrl(url))}.md`;

  try {
    const result = await getObject(s3Key);
    debug(`[DataAccess/OpenGraph] Found cached Jina markdown in S3: ${s3Key}`);
    return result.body.toString("utf-8");
  } catch (err) {
    // Cache miss is expected - return null
    if (err instanceof S3NotFoundError) {
      debug(`[DataAccess/OpenGraph] No cached Jina markdown found in S3 for ${url}`);
      return null;
    }
    // Real S3 errors (permissions, network) must propagate - do not mask
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(
      `[DataAccess/OpenGraph] S3 error reading Jina markdown for ${url}: ${error.message}`,
    );
    throw new OgError(`Error reading Jina markdown from S3 for ${url}`, "s3-read-jina-markdown", {
      originalError: error,
    });
  }
}
