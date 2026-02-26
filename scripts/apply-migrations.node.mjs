#!/usr/bin/env node
import postgres from "postgres";
import fs from "node:fs";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, connect_timeout: 10 });

const migrations = [
  "0014_drop-domain-embedding-columns.sql",
  "0015_investments-table.sql",
  "0016_projects-table.sql",
  "0017_books-individual-table.sql",
  "0018_blog-posts-table.sql",
];

for (const file of migrations) {
  console.log("Applying: " + file);
  const content = fs.readFileSync("drizzle/" + file, "utf8");
  const stmts = content
    .split("-->  statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of stmts) {
    const cleaned = stmt.replace(/^--.*$/gm, "").trim();
    if (cleaned.length === 0) continue;
    try {
      await sql.unsafe(stmt);
    } catch (e) {
      console.log("  Note: " + String(e.message || e).substring(0, 120));
    }
  }
  console.log("  Done.");
}

const tables =
  await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('embeddings', 'investments', 'projects', 'books', 'blog_posts') ORDER BY table_name`;
console.log("\nVerified tables:");
for (const t of tables) console.log("  " + t.table_name);

const embCols =
  await sql`SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'qwen_4b_fp16_embedding' ORDER BY table_name`;
console.log("\nTables still with qwen_4b_fp16_embedding:");
if (embCols.length === 0) console.log("  (none — all per-domain columns dropped)");
for (const c of embCols) console.log("  " + c.table_name);

await sql.end();
