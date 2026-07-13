#!/usr/bin/env node
/**
 * Seed blog_posts table from MDX files in data/blog/posts/.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). See CLAUDE.md [RT1].
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production node scripts/seed-blog-posts.node.mjs
 *
 * Flags:
 *   --dry-run   Show what would be seeded without writing
 */

import postgres from "postgres";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { blogFrontmatterSchema } from "../src/types/schemas/blog-frontmatter.ts";

const P = "[seed-blog-posts]";
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

/**
 * Strip MDX component syntax from body content to produce clean text for FTS.
 * Removes import statements, JSX tags, and code fences — keeping prose + inline code.
 */
function stripMdxSyntax(body) {
  return body
    .replace(/^import\s+.*$/gm, "") // import lines
    .replace(/<[A-Z][A-Za-z]*\b[^>]*\/>/g, "") // self-closing JSX <Component />
    .replace(/<[A-Z][A-Za-z]*\b[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, "") // JSX blocks
    .replace(/```[\s\S]*?```/g, "") // fenced code blocks
    .replace(/\n{3,}/g, "\n\n") // collapse excess blank lines
    .trim();
}

async function run() {
  const dry = hasFlag("--dry-run");
  if (!dry) assertProdWrite("seed-blog-posts");
  const dbUrl = readEnv("DATABASE_URL");
  const sql = postgres(dbUrl, { ssl: "require", max: 1, connect_timeout: 10 });

  try {
    const postsDir = path.join(process.cwd(), "data/blog/posts");
    const files = await fs.readdir(postsDir);
    const mdxFiles = files.filter((f) => f.endsWith(".mdx")).toSorted();

    console.log(`${P} Found ${mdxFiles.length} MDX files`);

    if (dry) {
      for (const file of mdxFiles) {
        const raw = await fs.readFile(path.join(postsDir, file), "utf8");
        const frontmatter = blogFrontmatterSchema.parse(matter(raw).data);
        console.log(`  ${frontmatter.slug}: ${frontmatter.title}`);
      }
      console.log(`${P} Dry run complete.`);
      return;
    }

    let upserted = 0;
    for (const file of mdxFiles) {
      const raw = await fs.readFile(path.join(postsDir, file), "utf8");
      const { data, content } = matter(raw);
      const frontmatter = blogFrontmatterSchema.parse(data);

      const entityId = `mdx-${frontmatter.slug}`;
      const excerpt = frontmatter.excerpt?.trim() ?? null;
      const publishedAt = String(frontmatter.publishedAt ?? "");
      const updatedAt = frontmatter.updatedAt ? String(frontmatter.updatedAt) : null;
      const rawContent = stripMdxSyntax(content);

      await sql`
        INSERT INTO blog_posts (
          id, title, slug, excerpt, author_name, tags,
          published_at, updated_at, cover_image, draft, raw_content
        ) VALUES (
          ${entityId}, ${frontmatter.title}, ${frontmatter.slug}, ${excerpt}, ${frontmatter.author},
          ${JSON.stringify(frontmatter.tags)}::jsonb,
          ${publishedAt}, ${updatedAt}, ${frontmatter.coverImage ?? null}, ${frontmatter.draft === true}, ${rawContent}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title, slug = EXCLUDED.slug, excerpt = EXCLUDED.excerpt,
          author_name = EXCLUDED.author_name, tags = EXCLUDED.tags,
          published_at = EXCLUDED.published_at, updated_at = EXCLUDED.updated_at,
          cover_image = EXCLUDED.cover_image, draft = EXCLUDED.draft,
          raw_content = EXCLUDED.raw_content`;
      upserted++;
    }
    console.log(`${P} Upserted ${upserted} blog posts`);

    const verify = await sql`SELECT count(*)::int as cnt FROM blog_posts`;
    console.log(`${P} Total in table: ${verify[0].cnt}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await run();
