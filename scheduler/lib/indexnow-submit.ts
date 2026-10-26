/**
 * IndexNow (Bing) submission helpers for sitemap submission scripts.
 * Handles key verification and URL batch submission via the IndexNow protocol.
 *
 * @see https://www.indexnow.org/documentation
 * @see https://www.bing.com/indexnow/getstarted
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { indexNowLedgerSchema, type IndexNowLedger } from "@/types/schemas/indexnow-ledger";
import sitemap from "../../src/app/sitemap";

const LOG_PREFIX = "[IndexNow]";

// IndexNow announces recently added or updated URLs; resubmitting unchanged URLs is discouraged
// (https://www.indexnow.org/faq). Submission runs once per scheduler start, which is once per
// deploy. A date-only frontmatter value resolves to Pacific midnight and its deploy can trail it
// by days, so a URL modified within the last week is announced by that week's deploys.
const RECENT_CHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// The ledger maps each accepted URL to the lastModified it was announced with, so a later run
// inside the window re-announces only URLs whose lastModified moved. An entry older than twice the
// window can never be selected again and is pruned. Vitest runs with NODE_ENV=test, so suites stay
// free of shared ledger state unless a test passes its own path.
const LEDGER_RETENTION_MS = 2 * RECENT_CHANGE_WINDOW_MS;
const DEFAULT_LEDGER_FILE_PATH =
  process.env.NODE_ENV === "test"
    ? undefined
    : path.join(os.tmpdir(), "williamcallahan-indexnow-ledger.json");

export class IndexNowSubmissionError extends Error {
  override name = "IndexNowSubmissionError";
}

async function readAnnouncedLedger(ledgerFilePath: string): Promise<IndexNowLedger> {
  let serialized: string;
  try {
    serialized = await readFile(ledgerFilePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw new IndexNowSubmissionError(`IndexNow ledger ${ledgerFilePath} is unreadable.`, {
      cause: error,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new IndexNowSubmissionError(`IndexNow ledger ${ledgerFilePath} is not JSON.`, {
      cause: error,
    });
  }
  const ledger = indexNowLedgerSchema.safeParse(parsed);
  if (!ledger.success) {
    throw new IndexNowSubmissionError(`IndexNow ledger ${ledgerFilePath} has invalid entries.`, {
      cause: ledger.error,
    });
  }
  return ledger.data;
}

async function recordAnnouncedUrls(
  ledgerFilePath: string,
  announced: IndexNowLedger,
  accepted: IndexNowLedger,
): Promise<void> {
  const retainedSince = Date.now() - LEDGER_RETENTION_MS;
  const retained = Object.fromEntries(
    Object.entries({ ...announced, ...accepted }).filter(
      ([, lastModifiedIso]) => new Date(lastModifiedIso).getTime() >= retainedSince,
    ),
  );
  const stagingPath = `${ledgerFilePath}.${process.pid}.tmp`;
  await writeFile(stagingPath, JSON.stringify(retained), "utf8");
  await rename(stagingPath, ledgerFilePath);
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
 * verification file must exist at `public/<key>.txt`. A URL already accepted with
 * its current lastModified (per the ledger at `ledgerFilePath`) is not resubmitted.
 */
export async function submitToIndexNow(
  siteUrlCanonical: string,
  indexNowKeyEnv: string,
  indexNowKeyFile: string,
  isLocalhost: boolean,
  debugMode: boolean,
  dryRun = false,
  ledgerFilePath = DEFAULT_LEDGER_FILE_PATH,
): Promise<void> {
  if (!dryRun && !indexNowKeyEnv) {
    console.warn(`${LOG_PREFIX} Skipping submission – INDEXNOW_KEY env var is not set.`);
    return;
  }
  const sitemapData = await sitemap();
  const announced = ledgerFilePath ? await readAnnouncedLedger(ledgerFilePath) : {};
  const changedSince = Date.now() - RECENT_CHANGE_WINDOW_MS;
  const changed: Record<string, string> = {};
  for (const entry of sitemapData) {
    if (entry.lastModified === undefined) continue;
    const lastModified = new Date(entry.lastModified);
    const lastModifiedMs = lastModified.getTime();
    if (Number.isNaN(lastModifiedMs) || lastModifiedMs < changedSince) continue;
    const lastModifiedIso = lastModified.toISOString();
    if (announced[entry.url] !== lastModifiedIso) changed[entry.url] = lastModifiedIso;
  }
  const urlList = Object.keys(changed);
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

  if (urlList.length === 0) {
    console.info(`${LOG_PREFIX} No sitemap URL changed since its last announcement.`);
    return;
  }

  // Verify key file only when not running from localhost
  const keyLocationUrl = `${siteUrlCanonical}${indexNowKeyFile}`;
  if (!isLocalhost) {
    await verifyIndexNowKey(keyLocationUrl, INDEXNOW_KEY);
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
  if (ledgerFilePath) await recordAnnouncedUrls(ledgerFilePath, announced, changed);
}
