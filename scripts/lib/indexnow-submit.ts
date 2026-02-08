/**
 * IndexNow (Bing) submission helpers for sitemap submission scripts.
 * Handles key verification and URL batch submission via the IndexNow protocol.
 *
 * @see https://www.indexnow.org/documentation
 * @see https://www.bing.com/indexnow/getstarted
 */

import sitemap from "../../src/app/sitemap";

const LOG_PREFIX = "[IndexNow]";

async function verifyIndexNowKey(keyLocationUrl: string, expectedKey: string): Promise<boolean> {
  try {
    const keyRes = await fetch(keyLocationUrl, { method: "GET" });
    const body = await keyRes.text();

    if (!keyRes.ok) {
      console.error(
        `${LOG_PREFIX} keyLocation ${keyLocationUrl} returned HTTP ${keyRes.status}. Aborting submission.`,
      );
      return false;
    }

    if (body.trim() !== expectedKey) {
      console.error(
        `${LOG_PREFIX} keyLocation file content mismatch. Expected '${expectedKey}', got '${body.trim()}'. Aborting submission.`,
      );
      return false;
    }

    return true;
  } catch (error_) {
    console.error(`${LOG_PREFIX} Failed to verify keyLocation (${keyLocationUrl}):`, error_);
    return false;
  }
}

/**
 * Submits URLs to the IndexNow API.
 *
 * Requires the `INDEXNOW_KEY` environment variable. The corresponding
 * verification file must exist at `public/<key>.txt`.
 */
export async function submitToIndexNow(
  siteUrlCanonical: string,
  indexNowKeyEnv: string,
  indexNowKeyFile: string,
  isLocalhost: boolean,
  debugMode: boolean,
): Promise<void> {
  const INDEXNOW_KEY = indexNowKeyEnv;
  if (!INDEXNOW_KEY) {
    console.warn(`${LOG_PREFIX} Skipping submission – INDEXNOW_KEY env var is not set.`);
    return;
  }
  if (!/^[a-f0-9-]{32,}$/i.test(INDEXNOW_KEY)) {
    console.error(
      `${LOG_PREFIX} Invalid INDEXNOW_KEY format – must be a valid UUID or similar identifier.`,
    );
    return;
  }

  // Verify key file only when not running from localhost
  const keyLocationUrl = `${siteUrlCanonical}${indexNowKeyFile}`;
  if (!isLocalhost) {
    const keyValid = await verifyIndexNowKey(keyLocationUrl, INDEXNOW_KEY);
    if (!keyValid) return;
  }

  try {
    const sitemapData = await sitemap();
    const urlList = sitemapData.map((u) => u.url);

    // Build payload per IndexNow spec
    const payload: Record<string, unknown> = {
      host: new URL(siteUrlCanonical).host,
      key: INDEXNOW_KEY,
      urlList,
    };

    // Always include `keyLocation` – some providers require explicit path even when using root verification (empirical 403 fix)
    payload.keyLocation = keyLocationUrl;

    if (debugMode) {
      console.info(`${LOG_PREFIX} Submitting with payload:`, JSON.stringify(payload, null, 2));
    }

    const aggregatorEndpoint = "https://api.indexnow.org/indexnow";
    const bingEndpoint = "https://www.bing.com/indexnow";

    const attemptSubmit = async (endpoint: string): Promise<Response> => {
      return fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "williamcallahan.com-sitemap-script/1.0",
        },
        body: JSON.stringify(payload),
      });
    };

    let res = await attemptSubmit(aggregatorEndpoint);
    if (res.status === 403) {
      console.warn(`${LOG_PREFIX} Aggregator returned 403 – retrying via Bing endpoint.`);
      res = await attemptSubmit(bingEndpoint);
    }

    // Log response
    if (res.ok) {
      console.info(`${LOG_PREFIX} Payload accepted. Submitted ${urlList.length} URLs`);
    } else {
      const bodyText = await res.text().catch(() => "<body unavailable>");
      console.error(
        `${LOG_PREFIX} Submission failed. Status: ${res.status}. Response: ${bodyText}`,
      );
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error while submitting payload:`, err);
  }
}
