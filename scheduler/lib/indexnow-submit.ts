/**
 * IndexNow (Bing) submission helpers for sitemap submission scripts.
 * Handles key verification and URL batch submission via the IndexNow protocol.
 *
 * @see https://www.indexnow.org/documentation
 * @see https://www.bing.com/indexnow/getstarted
 */

import sitemap from "../../src/app/sitemap";

const LOG_PREFIX = "[IndexNow]";

// IndexNow announces recently added or updated URLs; resubmitting unchanged URLs is discouraged
// (https://www.indexnow.org/faq). Submission runs once per scheduler start, which is once per
// deploy, so a URL modified within the last day is announced only by that day's deploys.
const RECENT_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export class IndexNowSubmissionError extends Error {
  override name = "IndexNowSubmissionError";
}

async function verifyIndexNowKey(keyLocationUrl: string, expectedKey: string): Promise<void> {
  const keyRes = await fetch(keyLocationUrl, { method: "GET" });
  if (!keyRes.ok) {
    throw new IndexNowSubmissionError(`IndexNow key verification returned HTTP ${keyRes.status}.`);
  }
  const keyText = await keyRes.text();
  if (keyText.trim() !== expectedKey) {
    throw new IndexNowSubmissionError("IndexNow key verification file content mismatch.");
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
  dryRun = false,
): Promise<void> {
  if (!dryRun && !indexNowKeyEnv) {
    console.warn(`${LOG_PREFIX} Skipping submission – INDEXNOW_KEY env var is not set.`);
    return;
  }
  const sitemapData = await sitemap();
  const changedSince = Date.now() - RECENT_CHANGE_WINDOW_MS;
  const urlList = sitemapData
    .filter(
      (entry) =>
        entry.lastModified !== undefined && new Date(entry.lastModified).getTime() >= changedSince,
    )
    .map((entry) => entry.url);
  const host = new URL(siteUrlCanonical).host;
  if (dryRun) {
    console.info(`${LOG_PREFIX} Dry run: selected ${urlList.length} URLs for ${host}.`);
    return;
  }
  const INDEXNOW_KEY = indexNowKeyEnv;
  if (!/^[a-f0-9-]{32,}$/i.test(INDEXNOW_KEY)) {
    throw new TypeError(
      "Invalid INDEXNOW_KEY format – must be a valid UUID or similar identifier.",
    );
  }

  // Verify key file only when not running from localhost
  const keyLocationUrl = `${siteUrlCanonical}${indexNowKeyFile}`;
  if (!isLocalhost) {
    await verifyIndexNowKey(keyLocationUrl, INDEXNOW_KEY);
  }

  if (urlList.length === 0) {
    console.info(`${LOG_PREFIX} No sitemap URL changed in the last day; nothing to submit.`);
    return;
  }

  const payload = { host, key: INDEXNOW_KEY, urlList, keyLocation: keyLocationUrl };
  if (debugMode) {
    console.info(`${LOG_PREFIX} Submitting ${urlList.length} URLs for ${host}.`);
  }

  const attemptSubmit = async (endpoint: string): Promise<Response> =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "williamcallahan.com-sitemap-script/1.0",
      },
      body: JSON.stringify(payload),
    });

  let res = await attemptSubmit("https://api.indexnow.org/indexnow");
  if (res.status === 403) {
    console.warn(`${LOG_PREFIX} Aggregator returned 403 – retrying via Bing endpoint.`);
    res = await attemptSubmit("https://www.bing.com/indexnow");
  }
  if (!res.ok) {
    throw new IndexNowSubmissionError(`IndexNow submission rejected with HTTP ${res.status}.`);
  }
  console.info(`${LOG_PREFIX} Payload accepted. Submitted ${urlList.length} URLs`);
}
