#!/usr/bin/env node
/**
 * Migrate S3 JSON data to PostgreSQL.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). Bun's TLS
 * implementation fails SSL negotiation with PostgreSQL. See CLAUDE.md [RT1].
 */
import { createHash } from "node:crypto";
import postgres from "postgres";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
const P = "[s3→pg]",
  PROD = "production";
const ANALYSIS_DOMAINS = new Set(["bookmarks", "books", "projects"]);
const readEnv = (n) =>
  process.env[n]?.trim()
    ? process.env[n].trim()
    : (() => {
        throw new Error(`${n} is required.`);
      })();
const optEnv = (n) => process.env[n]?.trim() || undefined;
const hasFlag = (f) => process.argv.slice(2).includes(f);
const flagVal = (f) =>
  ((i, a) => (i < 0 ? undefined : a[i + 1]))(
    process.argv.slice(2).indexOf(f),
    process.argv.slice(2),
  );
const nowMs = () => BigInt(Date.now());
const md5 = (x) => createHash("md5").update(x).digest("hex");
function assertProdWrite(op) {
  const raw = (process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || "").trim().toLowerCase();
  const env = raw === "prod" ? PROD : raw;
  if (env !== PROD) throw new Error(`[write-guard] Blocked "${op}": env="${env}".`);
}
function isNotFound(err) {
  const status = err?.$metadata?.httpStatusCode;
  const code = err?.name ?? err?.code ?? err?.Code;
  return status === 404 || code === "NotFound" || code === "NoSuchKey" || code === "NoSuchBucket";
}
async function bodyToString(body) {
  if (!body) return "";
  if (typeof body.transformToString === "function") return body.transformToString();
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf-8");
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}
async function fetchJson(cdn, key) {
  const res = await fetch(`${cdn}/${key}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${key}`);
  return {
    json: await res.json(),
    contentType: "application/json",
    eTag: null,
    contentLength: null,
    updatedAt: Date.now(),
    checksum: null,
  };
}
async function getS3JsonOptional(s3, bucket, key) {
  try {
    const res = await Promise.race([
      s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("S3GetTimeout")), 20_000),
      ),
    ]);
    const text = await Promise.race([
      bodyToString(res.Body),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("S3BodyTimeout")), 20_000),
      ),
    ]);
    return {
      json: JSON.parse(text),
      contentType: res.ContentType ?? "application/json",
      eTag: typeof res.ETag === "string" ? res.ETag.replaceAll('"', "") : null,
      contentLength: Buffer.byteLength(text, "utf-8"),
      updatedAt: res.LastModified ? res.LastModified.getTime() : Date.now(),
      checksum: md5(text),
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
const readJsonOptional = (cdn, s3, bucket, key) =>
  s3 && bucket ? getS3JsonOptional(s3, bucket, key) : fetchJson(cdn, key);
async function listS3Objects(s3, bucket, prefix) {
  const out = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      out.push({
        key: o.Key,
        size: o.Size ?? 0,
        eTag: typeof o.ETag === "string" ? o.ETag.replaceAll('"', "") : null,
        updatedAt: o.LastModified ? o.LastModified.getTime() : Date.now(),
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}
async function migrateContentGraph(sql, cdn, s3, bucket, dry) {
  const items = [
    ["related-content", "json/content-graph/related-content.json"],
    ["books-related", "json/content-graph/books-related.json"],
    ["tag-graph", "json/content-graph/tag-graph.json"],
    ["metadata", "json/content-graph/metadata.json"],
  ];
  let n = 0;
  for (const [t, k] of items) {
    const loaded = await readJsonOptional(cdn, s3, bucket, k);
    if (!loaded) continue;
    const generatedAt =
      loaded.json?.generatedAt ?? loaded.json?.generated ?? new Date().toISOString();
    if (!dry) {
      await sql`INSERT INTO content_graph_artifacts (artifact_type, payload, generated_at, updated_at)
        VALUES (${t}, ${sql.json(loaded.json)}, ${generatedAt}, ${nowMs()})
        ON CONFLICT (artifact_type) DO UPDATE SET payload=EXCLUDED.payload, generated_at=EXCLUDED.generated_at, updated_at=EXCLUDED.updated_at`;
    }
    n++;
  }
  console.log(`${P} content-graph: ${n}`);
}
async function migrateImageManifests(sql, cdn, s3, bucket, dry) {
  const items = [
    ["logos", "json/image-data/logos/manifest.json"],
    ["opengraph", "json/image-data/opengraph/manifest.json"],
    ["blog", "json/image-data/blog/manifest.json"],
    ["education", "json/image-data/education/manifest.json"],
    ["experience", "json/image-data/experience/manifest.json"],
    ["investments", "json/image-data/investments/manifest.json"],
    ["projects", "json/image-data/projects/manifest.json"],
  ];
  let n = 0;
  for (const [t, k] of items) {
    const loaded = await readJsonOptional(cdn, s3, bucket, k);
    if (!loaded) continue;
    if (!dry) {
      await sql`INSERT INTO image_manifests (manifest_type, payload, checksum, updated_at)
        VALUES (${t}, ${sql.json(loaded.json)}, ${loaded.checksum ?? md5(JSON.stringify(loaded.json))}, ${nowMs()})
        ON CONFLICT (manifest_type) DO UPDATE SET payload=EXCLUDED.payload, checksum=EXCLUDED.checksum, updated_at=EXCLUDED.updated_at`;
    }
    n++;
  }
  console.log(`${P} image-manifests: ${n}`);
}
async function migrateGitHub(sql, cdn, s3, bucket, dry) {
  const singles = [
    ["activity", "global", "json/github-activity/activity_data.json"],
    ["summary", "global", "json/github-activity/github_stats_summary.json"],
    ["summary", "all-time", "json/github-activity/github_stats_summary_all_time.json"],
    ["aggregated-weekly", "global", "json/github-activity/aggregated_weekly_activity.json"],
  ];
  let n = 0;
  const ts = nowMs();
  for (const [dt, q, k] of singles) {
    const loaded = await readJsonOptional(cdn, s3, bucket, k);
    if (!loaded) continue;
    if (!dry) {
      await sql`INSERT INTO github_activity_store (data_type, qualifier, payload, updated_at)
        VALUES (${dt}, ${q}, ${sql.json(loaded.json)}, ${ts})
        ON CONFLICT (data_type, qualifier) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at`;
    }
    n++;
  }
  if (s3 && bucket) {
    const prefix = "json/github-activity/repo_raw_weekly_stats/";
    for (const o of await listS3Objects(s3, bucket, prefix)) {
      if (o.key.endsWith(".json")) {
        const q = o.key.replace(prefix, "").replace(/\.json$/, "");
        if (!q.includes("/")) continue;
        const loaded = await getS3JsonOptional(s3, bucket, o.key);
        if (!loaded) continue;
        if (!dry) {
          await sql`INSERT INTO github_activity_store (data_type, qualifier, payload, updated_at)
            VALUES ('repo-weekly-stats', ${q}, ${sql.json(loaded.json)}, ${ts})
            ON CONFLICT (data_type, qualifier) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at`;
        }
        n++;
        continue;
      }
      if (!o.key.endsWith(".csv")) continue;
      const q = o.key.replace(prefix, "").replace(/\.csv$/, "");
      if (!q.includes("/")) continue;
      const csv = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: o.key }));
      const checksum = md5(await bodyToString(csv.Body));
      if (!dry) {
        await sql`INSERT INTO github_activity_store (data_type, qualifier, payload, checksum, updated_at)
          VALUES ('csv-checksum', ${q}, ${sql.json({ checksum })}, ${checksum}, ${ts})
          ON CONFLICT (data_type, qualifier) DO UPDATE SET payload=EXCLUDED.payload, checksum=EXCLUDED.checksum, updated_at=EXCLUDED.updated_at`;
      }
      n++;
    }
  }
  console.log(`${P} github: ${n}`);
}
async function migrateBooks(sql, cdn, s3, bucket, dry) {
  const latest = await readJsonOptional(cdn, s3, bucket, "json/books/latest.json");
  if (!latest) return console.log(`${P} books: latest.json not found`);
  const checksum =
    latest.json?.checksum ?? latest.json?.snapshotChecksum ?? latest.json?.snapshot_checksum;
  if (!checksum) return console.log(`${P} books: no checksum`);
  const key = (
    latest.json?.key ??
    latest.json?.snapshotKey ??
    latest.json?.snapshot_key ??
    `json/books/${checksum}.json`
  ).replace(/^\/+/, "");
  const snapshot = await readJsonOptional(cdn, s3, bucket, key);
  if (!snapshot) return console.log(`${P} books: snapshot not found at ${key}`);
  const bookCount = Array.isArray(snapshot.json?.books)
    ? snapshot.json.books.length
    : (snapshot.json?.bookCount ?? 0);
  const generatedAt =
    snapshot.json?.generatedAt ??
    snapshot.json?.generated ??
    snapshot.json?.metadata?.generatedAt ??
    new Date().toISOString();
  if (!dry) {
    const ts = nowMs();
    await sql`INSERT INTO books_snapshots (checksum, payload, book_count, generated_at, created_at)
      VALUES (${checksum}, ${sql.json(snapshot.json)}, ${bookCount}, ${generatedAt}, ${ts})
      ON CONFLICT (checksum) DO NOTHING`;
    await sql`INSERT INTO books_latest (id, snapshot_checksum, snapshot_key, updated_at)
      VALUES ('current', ${checksum}, ${key}, ${ts})
      ON CONFLICT (id) DO UPDATE SET snapshot_checksum=EXCLUDED.snapshot_checksum, snapshot_key=EXCLUDED.snapshot_key, updated_at=EXCLUDED.updated_at`;
  }
  console.log(`${P} books: ${bookCount} books`);
}
const restoreTimestamp = (x) => x.replace(/T(\d{2})-(\d{2})-(\d{2})(\.\d+)?Z$/, "T$1:$2:$3$4Z");
async function migrateOpenGraph(sql, cdn, s3, bucket, dry) {
  if (!s3 || !bucket) return console.log(`${P} opengraph: skipped (no S3 credentials)`);
  const ts = nowMs();
  let metadataCount = 0;
  let overridesCount = 0;
  const metadataObjects = await listS3Objects(s3, bucket, "json/opengraph/metadata/");
  for (const o of metadataObjects.filter((x) => x.key.endsWith(".json"))) {
    const urlHash = o.key.replace("json/opengraph/metadata/", "").replace(/\.json$/, "");
    const loaded = await readJsonOptional(cdn, s3, bucket, o.key);
    if (!loaded || !urlHash) continue;
    const url = loaded.json?.url || loaded.json?.finalUrl || "https://unknown.invalid";
    if (!dry) {
      await sql`INSERT INTO opengraph_metadata (url_hash, url, payload, updated_at)
        VALUES (${urlHash}, ${url}, ${sql.json(loaded.json)}, ${ts})
        ON CONFLICT (url_hash) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at`;
    }
    metadataCount++;
  }
  const overrideObjects = await listS3Objects(s3, bucket, "json/opengraph/overrides/");
  for (const o of overrideObjects.filter((x) => x.key.endsWith(".json"))) {
    const urlHash = o.key.replace("json/opengraph/overrides/", "").replace(/\.json$/, "");
    const loaded = await readJsonOptional(cdn, s3, bucket, o.key);
    if (!loaded || !urlHash) continue;
    const url = loaded.json?.url || loaded.json?.finalUrl || "https://unknown.invalid";
    if (!dry) {
      await sql`INSERT INTO opengraph_overrides (url_hash, url, payload, updated_at)
        VALUES (${urlHash}, ${url}, ${sql.json(loaded.json)}, ${ts})
        ON CONFLICT (url_hash) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at`;
    }
    overridesCount++;
  }
  console.log(`${P} opengraph: metadata=${metadataCount}, overrides=${overridesCount}`);
}
async function migrateAiAnalysis(sql, cdn, s3, bucket, dry) {
  if (!s3 || !bucket) return console.log(`${P} ai-analysis: skipped (no S3 credentials)`);
  const latestRe = /^json\/ai-analysis\/([^/]+)\/([^/]+)\/latest\.json$/;
  const versionRe = /^json\/ai-analysis\/([^/]+)\/([^/]+)\/versions\/([^/]+)\.json$/;
  let latest = 0;
  let versions = 0;
  let skipped = 0;
  const aiObjects = await listS3Objects(s3, bucket, "json/ai-analysis/");
  for (const o of aiObjects.filter((x) => x.key.endsWith(".json"))) {
    const latestMatch = o.key.match(latestRe);
    const versionMatch = o.key.match(versionRe);
    if (!latestMatch && !versionMatch) {
      skipped++;
      continue;
    }
    const [_, domain, entityId] = latestMatch ?? versionMatch;
    if (!ANALYSIS_DOMAINS.has(domain)) {
      skipped++;
      continue;
    }
    const loaded = await getS3JsonOptional(s3, bucket, o.key);
    if (!loaded || typeof loaded.json !== "object" || loaded.json === null) {
      skipped++;
      continue;
    }
    const metadata = loaded.json.metadata ?? {};
    const generatedAt =
      typeof metadata.generatedAt === "string"
        ? metadata.generatedAt
        : versionMatch
          ? restoreTimestamp(versionMatch[3])
          : new Date().toISOString();
    const modelVersion = typeof metadata.modelVersion === "string" ? metadata.modelVersion : "v1";
    const contentHash = typeof metadata.contentHash === "string" ? metadata.contentHash : null;
    if (latestMatch) {
      if (!dry) {
        await sql`INSERT INTO ai_analysis_latest (domain, entity_id, payload, generated_at, model_version, content_hash, updated_at)
          VALUES (${domain}, ${entityId}, ${sql.json(loaded.json)}, ${generatedAt}, ${modelVersion}, ${contentHash}, ${nowMs()})
          ON CONFLICT (domain, entity_id) DO UPDATE SET payload=EXCLUDED.payload, generated_at=EXCLUDED.generated_at, model_version=EXCLUDED.model_version, content_hash=EXCLUDED.content_hash, updated_at=EXCLUDED.updated_at`;
      }
      latest++;
      continue;
    }
    if (!dry) {
      const createdAt = Number.isFinite(Date.parse(generatedAt))
        ? Date.parse(generatedAt)
        : Date.now();
      await sql`INSERT INTO ai_analysis_versions (domain, entity_id, generated_at, payload, model_version, content_hash, created_at)
        VALUES (${domain}, ${entityId}, ${generatedAt}, ${sql.json(loaded.json)}, ${modelVersion}, ${contentHash}, ${createdAt})
        ON CONFLICT (domain, entity_id, generated_at) DO NOTHING`;
    }
    versions++;
  }
  console.log(`${P} ai-analysis: latest=${latest}, versions=${versions}, skipped=${skipped}`);
}
async function run() {
  const dry = hasFlag("--dry-run");
  const domain = flagVal("--domain");
  if (!dry) assertProdWrite("s3-to-pg-migration");
  const cdn = readEnv("NEXT_PUBLIC_S3_CDN_URL").replace(/\/+$/, "");
  const sql = postgres(readEnv("DATABASE_URL"), { ssl: "require", max: 10, connect_timeout: 15 });
  const bucket = optEnv("S3_BUCKET");
  const ep = optEnv("S3_SERVER_URL");
  const ak = optEnv("S3_ACCESS_KEY_ID");
  const sk = optEnv("S3_SECRET_ACCESS_KEY");
  const s3 =
    ep && ak && sk && bucket
      ? new S3Client({
          endpoint: ep,
          region: optEnv("S3_REGION") || "us-east-1",
          credentials: { accessKeyId: ak, secretAccessKey: sk },
          forcePathStyle: false,
        })
      : null;
  console.log(`${P} Starting (dry=${dry}, domain=${domain ?? "all"}, s3=${!!s3})`);
  const ok = (d) => !domain || domain === d;
  try {
    if (ok("content-graph")) await migrateContentGraph(sql, cdn, s3, bucket, dry);
    if (ok("image-manifests")) await migrateImageManifests(sql, cdn, s3, bucket, dry);
    if (ok("github")) await migrateGitHub(sql, cdn, s3, bucket, dry);
    if (ok("books")) await migrateBooks(sql, cdn, s3, bucket, dry);
    if (ok("opengraph")) await migrateOpenGraph(sql, cdn, s3, bucket, dry);
    if (ok("ai-analysis")) await migrateAiAnalysis(sql, cdn, s3, bucket, dry);
    const rows = await sql`
      SELECT 'ai_analysis_latest' as t, count(*)::int as c FROM ai_analysis_latest UNION ALL
      SELECT 'ai_analysis_versions', count(*)::int FROM ai_analysis_versions UNION ALL
      SELECT 'books_latest', count(*)::int FROM books_latest UNION ALL
      SELECT 'books_snapshots', count(*)::int FROM books_snapshots UNION ALL
      SELECT 'content_graph_artifacts', count(*)::int FROM content_graph_artifacts UNION ALL
      SELECT 'github_activity_store', count(*)::int FROM github_activity_store UNION ALL
      SELECT 'image_manifests', count(*)::int FROM image_manifests UNION ALL
      SELECT 'opengraph_metadata', count(*)::int FROM opengraph_metadata UNION ALL
      SELECT 'opengraph_overrides', count(*)::int FROM opengraph_overrides UNION ALL
      SELECT 'search_index_artifacts', count(*)::int FROM search_index_artifacts ORDER BY t`;
    console.log(`\n${P} Final row counts:`);
    for (const r of rows) console.log(`  ${r.t}: ${r.c}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
await run();
