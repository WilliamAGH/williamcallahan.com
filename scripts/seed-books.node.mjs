#!/usr/bin/env node
/**
 * Seed books table from existing books_snapshots JSONB data.
 *
 * Reads the current snapshot via books_latest pointer, then normalizes
 * each book into an individual row in the "books" table.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). See CLAUDE.md [RT1].
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production node scripts/seed-books.node.mjs
 *
 * Flags:
 *   --dry-run   Show what would be seeded without writing
 */

import postgres from "postgres";

const P = "[seed-books]";
const PRODUCTION = "production";

function readEnv(n) {
  const v = process.env[n]?.trim();
  if (!v) throw new Error(`${n} is required.`);
  return v;
}
function hasFlag(f) {
  return process.argv.slice(2).includes(f);
}
function assertProdWrite(op) {
  const raw = (process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || "").trim().toLowerCase();
  if ((raw === "prod" ? PRODUCTION : raw) !== PRODUCTION)
    throw new Error(`[write-guard] Blocked "${op}": env="${raw}".`);
}

function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function run() {
  const dry = hasFlag("--dry-run");
  if (!dry) assertProdWrite("seed-books");
  const dbUrl = readEnv("DATABASE_URL");
  const sql = postgres(dbUrl, { ssl: "require", max: 1, connect_timeout: 10 });

  try {
    const latestRows =
      await sql`SELECT snapshot_checksum FROM books_latest WHERE id = 'current' LIMIT 1`;
    if (latestRows.length === 0) {
      console.log(`${P} No books_latest pointer found. Run generate-books first.`);
      return;
    }
    const checksum = latestRows[0].snapshot_checksum;
    console.log(`${P} Using snapshot checksum: ${checksum}`);

    const snapshotRows =
      await sql`SELECT payload FROM books_snapshots WHERE checksum = ${checksum} LIMIT 1`;
    if (snapshotRows.length === 0) {
      console.log(`${P} Snapshot not found for checksum: ${checksum}`);
      return;
    }

    const dataset = snapshotRows[0].payload;
    const books = dataset.books;
    if (!Array.isArray(books) || books.length === 0) {
      console.log(`${P} No books in snapshot payload.`);
      return;
    }

    console.log(`${P} Found ${books.length} books in snapshot`);
    if (dry) {
      for (const book of books) {
        const authors = Array.isArray(book.authors) ? book.authors.join(", ") : "";
        console.log(`  ${book.id}: ${book.title} (${authors})`);
      }
      console.log(`${P} Dry run complete.`);
      return;
    }

    let upserted = 0;
    for (const book of books) {
      await sql`
        INSERT INTO books (
          id, title, slug, subtitle, authors, publisher, published_year,
          genres, description, formats, isbn10, isbn13, asin,
          audio_narrators, audio_duration_seconds, audio_chapter_count,
          cover_url, cover_blur_data_url,
          find_my_book_url, publisher_url, amazon_url, audible_url, bookshop_url,
          ai_summary, thoughts
        ) VALUES (
          ${book.id}, ${book.title}, ${toSlug(book.title)},
          ${book.subtitle ?? null},
          ${book.authors ? JSON.stringify(book.authors) : null}::jsonb,
          ${book.publisher ?? null}, ${book.publishedYear ?? null},
          ${book.genres ? JSON.stringify(book.genres) : null}::jsonb,
          ${book.description ?? null},
          ${JSON.stringify(book.formats ?? ["ebook"])}::jsonb,
          ${book.isbn10 ?? null}, ${book.isbn13 ?? null}, ${book.asin ?? null},
          ${book.audioNarrators ? JSON.stringify(book.audioNarrators) : null}::jsonb,
          ${book.audioDurationSeconds ?? null}, ${book.audioChapterCount ?? null},
          ${book.coverUrl ?? null}, ${book.coverBlurDataURL ?? null},
          ${book.findMyBookUrl ?? null}, ${book.publisherUrl ?? null},
          ${book.amazonUrl ?? null}, ${book.audibleUrl ?? null}, ${book.bookshopUrl ?? null},
          ${book.aiSummary ?? null}, ${book.thoughts ?? null}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title, slug = EXCLUDED.slug, subtitle = EXCLUDED.subtitle,
          authors = EXCLUDED.authors, publisher = EXCLUDED.publisher,
          published_year = EXCLUDED.published_year, genres = EXCLUDED.genres,
          description = EXCLUDED.description, formats = EXCLUDED.formats,
          isbn10 = EXCLUDED.isbn10, isbn13 = EXCLUDED.isbn13, asin = EXCLUDED.asin,
          audio_narrators = EXCLUDED.audio_narrators,
          audio_duration_seconds = EXCLUDED.audio_duration_seconds,
          audio_chapter_count = EXCLUDED.audio_chapter_count,
          cover_url = EXCLUDED.cover_url, cover_blur_data_url = EXCLUDED.cover_blur_data_url,
          find_my_book_url = EXCLUDED.find_my_book_url, publisher_url = EXCLUDED.publisher_url,
          amazon_url = EXCLUDED.amazon_url, audible_url = EXCLUDED.audible_url,
          bookshop_url = EXCLUDED.bookshop_url,
          ai_summary = EXCLUDED.ai_summary, thoughts = EXCLUDED.thoughts`;
      upserted++;
    }
    console.log(`${P} Upserted ${upserted} books`);

    const verify = await sql`SELECT count(*)::int as cnt FROM books`;
    console.log(`${P} Total in table: ${verify[0].cnt}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await run();
