/**
 * Google Search Console & Indexing API helpers for sitemap submission scripts.
 * Handles credential processing, auth client creation, and URL notification.
 */

import { JWT } from "google-auth-library";
import { GaxiosError } from "gaxios";
import type { GoogleIndexingUrlNotificationMetadata } from "@/types/lib";
import type { UrlNotification, IndexingApiResponse } from "@/types/api";

const LOG_PREFIX = "[Google]";

/**
 * Error thrown when Google credentials are missing or invalid.
 * Contains diagnostic information for debugging env var issues.
 */
export class GoogleCredentialError extends Error {
  constructor(
    message: string,
    public readonly diagnostics?: {
      rawLength?: number;
      hasBackslashN?: boolean;
      hasRealNewline?: boolean;
      previewCensored?: string;
      base64DecodeReason?: string;
    },
  ) {
    super(message);
    this.name = "GoogleCredentialError";
  }

  /** Format error with diagnostics for logging */
  formatWithDiagnostics(): string {
    if (!this.diagnostics) return this.message;
    const d = this.diagnostics;
    const lines = [this.message];
    if (d.previewCensored)
      lines.push(`  Received (first 60 chars, censored): "${d.previewCensored}"`);
    if (d.rawLength !== undefined) lines.push(`  Raw length: ${d.rawLength}`);
    if (d.hasBackslashN !== undefined)
      lines.push(String.raw`  Contains literal \n: ${d.hasBackslashN}`);
    if (d.hasRealNewline !== undefined) lines.push(`  Contains newlines: ${d.hasRealNewline}`);
    if (d.base64DecodeReason) lines.push(`  Base64 decode attempt: ${d.base64DecodeReason}`);
    lines.push(
      `  Hint: Ensure the key is either:`,
      String.raw`    1. PEM format with escaped \n (e.g., "-----BEGIN...\nMIIE...\n...")`,
      `    2. Base64-encoded PEM (encode the entire PEM including headers)`,
      `    3. Raw PEM with actual newlines (if your orchestrator supports multiline env vars)`,
    );
    return lines.join("\n");
  }
}

/**
 * Normalizes Google service-account private key from env.
 * Handles escaped newlines, base64, or multiline PEM formats.
 * @throws GoogleCredentialError if key is missing or invalid
 */
function processGooglePrivateKey(raw: string | undefined): string {
  if (!raw) {
    throw new GoogleCredentialError("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY env var is missing.");
  }

  let processed = raw.trim();

  const stripQuotePair = (value: string): string => {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  };

  processed = stripQuotePair(processed);
  // Handle literal \n sequences (common when env vars are passed through Docker/orchestrators)
  processed = processed.includes(String.raw`\n`)
    ? processed.replaceAll(String.raw`\n`, "\n")
    : processed;

  // Some shells double-escape quotes inside env values; remove redundant wrapping if still present
  processed = stripQuotePair(processed.trim());

  // Attempt base64 decoding if the value doesn't look like PEM
  let base64DecodeReason: string | undefined;
  if (!processed.startsWith("-----BEGIN")) {
    try {
      const decoded = Buffer.from(processed, "base64").toString("utf-8");
      if (decoded.startsWith("-----BEGIN")) {
        processed = decoded;
      } else {
        base64DecodeReason = "Decoded content does not start with PEM header";
      }
    } catch (err) {
      base64DecodeReason = `Base64 decode failed: ${err instanceof Error ? err.message : "Unknown error"}`;
    }
  }

  if (!processed.startsWith("-----BEGIN PRIVATE KEY-----")) {
    throw new GoogleCredentialError(
      "GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY is not a valid PEM formatted private key.",
      {
        rawLength: raw.length,
        hasBackslashN: raw.includes(String.raw`\n`),
        hasRealNewline: raw.includes("\n"),
        previewCensored: processed.slice(0, 60).replaceAll(/[A-Za-z0-9+/=]/g, "X"),
        base64DecodeReason,
      },
    );
  }

  return processed;
}

/**
 * Creates and validates a Google auth client.
 * @throws GoogleCredentialError if credentials are missing or invalid
 */
export function createAuthClient(): JWT {
  const email = process.env.GOOGLE_SEARCH_INDEXING_SA_EMAIL;
  if (!email) {
    throw new GoogleCredentialError("GOOGLE_SEARCH_INDEXING_SA_EMAIL env var is missing.");
  }

  const key = processGooglePrivateKey(process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY);

  return new JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/indexing",
      "https://www.googleapis.com/auth/webmasters", // required for Search Console sitemap submission
    ],
    subject: email,
  });
}

export async function notifyGoogle(
  client: JWT,
  url: string,
  type: "URL_UPDATED" | "URL_DELETED",
): Promise<GoogleIndexingUrlNotificationMetadata> {
  try {
    const response = await client.request<IndexingApiResponse>({
      url: "https://indexing.googleapis.com/v3/urlNotifications:publish",
      method: "POST",
      data: { url, type } as UrlNotification,
    });

    if (response.data?.urlNotificationMetadata) {
      return response.data.urlNotificationMetadata as GoogleIndexingUrlNotificationMetadata;
    }
    console.error(`${LOG_PREFIX} Unexpected response format for ${url}:`, response.data);
    throw new Error(`Unexpected response format from Google Indexing API for ${url}`);
  } catch (err: unknown) {
    if (err instanceof GaxiosError) {
      console.error(
        `${LOG_PREFIX} Error submitting ${url}: ${err.response?.status} ${err.response?.statusText}`,
      );
      console.error(`${LOG_PREFIX} Error details:`, err.response?.data);
    } else {
      console.error(`${LOG_PREFIX} Unexpected error for ${url}:`, err);
    }
    throw err;
  }
}

export async function submitGoogleSitemap(
  client: JWT,
  sitemapUrl: string,
  siteUrl: string,
): Promise<void> {
  try {
    const res = await client.request({
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
      method: "PUT",
    });

    if (res.status === 200 || res.status === 204) {
      console.info(
        `${LOG_PREFIX} Sitemap submitted successfully via Search Console API → ${sitemapUrl}`,
      );
    } else {
      throw new Error(`Sitemap submission returned unexpected status: ${res.status}`);
    }
  } catch (err: unknown) {
    console.error(`${LOG_PREFIX} Error while submitting sitemap:`, err);
    throw err;
  }
}
