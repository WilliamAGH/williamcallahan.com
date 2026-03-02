#!/usr/bin/env node
/**
 * Deploy Cloudflare Cache Rules from declarative config
 *
 * Reads infra/cloudflare/cache-rules.json and deploys via the Cloudflare
 * Rulesets API (PUT to the http_request_cache_settings phase entrypoint).
 *
 * Usage:
 *   node scripts/deploy-cf-cache-rules.node.mjs           # deploy
 *   node scripts/deploy-cf-cache-rules.node.mjs --dry-run  # preview only
 *
 * Required env vars:
 *   CF_ZONE_ID     — Cloudflare Zone ID (from CF dashboard > Overview)
 *   CF_API_TOKEN   — Scoped API Token with Cache Rules edit permission (recommended)
 *   — OR —
 *   CLOUDFLARE_API_KEY   — Global API Key (requires CLOUDFLARE_EMAIL too)
 *
 * @see https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/
 * @see https://developers.cloudflare.com/ruleset-engine/rulesets-api/update/
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const CF_API_TIMEOUT_MS = 30_000; // 30s timeout for CF API calls
const PHASE = "http_request_cache_settings";

// ---------------------------------------------------------------------------
// Config & env
// ---------------------------------------------------------------------------

function loadConfig() {
  const configPath = resolve(__dirname, "../infra/cloudflare/cache-rules.json");
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw);
}

function getEnv() {
  const zoneId = process.env.CF_ZONE_ID;
  // Prefer scoped API Token; fall back to Global API Key + email
  const apiToken = process.env.CF_API_TOKEN;
  const globalKey = process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL;

  if (!zoneId) {
    console.error("ERROR: CF_ZONE_ID environment variable is required.");
    console.error("  Find it in Cloudflare dashboard > Overview > Zone ID (right sidebar).");
    process.exit(1);
  }
  if (!apiToken && !globalKey) {
    console.error("ERROR: CF_API_TOKEN or CLOUDFLARE_API_KEY environment variable is required.");
    console.error("  Option 1: CF_API_TOKEN — scoped API Token (recommended)");
    console.error("    Create at https://dash.cloudflare.com/profile/api-tokens");
    console.error("    Required permissions: Zone > Cache Rules > Edit");
    console.error("  Option 2: CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL — Global API Key");
    process.exit(1);
  }
  if (globalKey && !apiToken && !email) {
    console.error(
      "ERROR: CLOUDFLARE_EMAIL is required when using CLOUDFLARE_API_KEY (Global API Key).",
    );
    console.error("  Set CLOUDFLARE_EMAIL to your Cloudflare account email.");
    console.error("  Or use CF_API_TOKEN instead (scoped API Token, no email needed).");
    process.exit(1);
  }

  return { zoneId, apiToken, globalKey, email };
}

// ---------------------------------------------------------------------------
// Cloudflare API helpers
// ---------------------------------------------------------------------------

async function cfFetch(path, { method = "GET", body } = {}) {
  const { zoneId, apiToken, globalKey, email } = getEnv();
  const url = `${CF_API_BASE}/zones/${zoneId}${path}`;

  const headers = { "Content-Type": "application/json" };
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  } else {
    headers["X-Auth-Key"] = globalKey;
    headers["X-Auth-Email"] = email;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CF_API_TIMEOUT_MS);

  const opts = { method, headers, signal: controller.signal };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } finally {
    clearTimeout(timeoutId);
  }
  const json = await res.json();

  if (!json.success) {
    const msg = json.errors?.map((e) => e.message).join("; ") ?? "Unknown CF API error";
    throw new Error(`CF API error (${method} ${path}): ${msg}`);
  }

  return json.result;
}

async function getCurrentRules() {
  try {
    return await cfFetch(`/rulesets/phases/${PHASE}/entrypoint`);
  } catch (error) {
    // Only treat "not found" as empty — re-throw auth/rate-limit/network errors
    if (error instanceof Error && /not.found|could not find/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

async function deployRules(rules) {
  return cfFetch(`/rulesets/phases/${PHASE}/entrypoint`, {
    method: "PUT",
    body: { rules },
  });
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function formatTtl(seconds) {
  if (seconds >= 86400) return `${seconds / 86400}d`;
  if (seconds >= 3600) return `${seconds / 3600}h`;
  return `${seconds}s`;
}

function printRule(rule, index) {
  const edge = rule.action_parameters?.edge_ttl;
  const edgeStr = edge
    ? `${edge.mode}${edge.default ? ` (${formatTtl(edge.default)})` : ""}`
    : "default";

  const status = rule.enabled ? "ON" : "OFF";
  console.log(`  ${index + 1}. [${status}] ${rule.description}`);
  console.log(`     Expression: ${rule.expression}`);
  console.log(`     Edge TTL: ${edgeStr}`);
}

function printRuleset(label, rules) {
  console.log(`\n${label} (${rules.length} rule${rules.length !== 1 ? "s" : ""}):`);
  rules.forEach(printRule);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const config = loadConfig();
  const desiredRules = config.rules;

  console.log("=== Cloudflare Cache Rules Deployment ===");
  if (isDryRun) console.log("  (DRY RUN — no changes will be made)\n");

  // Fetch current state
  console.log("Fetching current cache rules...");
  const current = await getCurrentRules();
  const currentRules = current?.rules ?? [];

  if (currentRules.length > 0) {
    printRuleset("Current rules", currentRules);
  } else {
    console.log("\nNo existing cache rules found.");
  }

  printRuleset("Desired rules", desiredRules);

  // Compare desired vs current by description (identity) and content (equality)
  const currentByDesc = new Map(currentRules.map((r) => [r.description, r]));
  const desiredDescriptions = new Set(desiredRules.map((r) => r.description));

  const toAdd = desiredRules.filter((r) => !currentByDesc.has(r.description));
  const toRemove = currentRules.filter((r) => !desiredDescriptions.has(r.description));
  const toUpdate = desiredRules.filter((desired) => {
    const current = currentByDesc.get(desired.description);
    if (!current) return false;
    // Compare only the fields present in the desired config
    return Object.entries(desired).some(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key]),
    );
  });

  console.log(`\nChanges:`);
  if (toAdd.length) console.log(`  + Add: ${toAdd.map((r) => r.description).join(", ")}`);
  if (toRemove.length) console.log(`  - Remove: ${toRemove.map((r) => r.description).join(", ")}`);
  if (toUpdate.length) console.log(`  ~ Update: ${toUpdate.map((r) => r.description).join(", ")}`);
  const hasChanges = toAdd.length > 0 || toRemove.length > 0 || toUpdate.length > 0;
  if (!hasChanges) {
    console.log("  (no changes detected)");
  }

  if (isDryRun) {
    console.log("\nDry run complete. Use without --dry-run to deploy.");
    return;
  }

  if (!hasChanges) {
    console.log("\nNo changes to deploy. Skipping CF API call.");
    return;
  }

  // Deploy
  console.log("\nDeploying cache rules...");
  const result = await deployRules(desiredRules);
  console.log(`Deployed ${result.rules?.length ?? 0} cache rules successfully.`);
  console.log(`Ruleset ID: ${result.id}`);
  console.log(`Version: ${result.version}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
