/**
 * Duplicate-ID Checker 🛡️
 *
 * Scans the project's core datasets (investments, experiences, education, certifications, blog posts)
 * for duplicate `id`/`slug` values.  If any duplicates are found the script exits with a non-zero
 * status code so CI and local `dev`/`build` processes fail fast.
 *
 * Usage (package.json):
 *   "scripts": {
 *     "check:ids": "bun ts-node scripts/check-duplicate-ids.ts"
 *   }
 *
 * Run manually with:
 *   bun ts-node scripts/check-duplicate-ids.ts
 */
import { investments } from "../data/investments";
import { education, certifications } from "../data/education";
import { experiences } from "../data/experience";
import { posts } from "../data/blog/posts";

function assertUnique(label: string, ids: string[]): void {
  /**
   * Ensures all strings in `ids` are unique.
   * @param label - Human-readable dataset name for clearer error messages.
   * @param ids   - Array of identifier strings to validate.
   * @throws Error if a duplicate is encountered.
   */
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate id "${id}" detected in ${label}`);
    }
    seen.add(id);
  }
}

try {
  assertUnique(
    "investments",
    investments.map((i) => i.id)
  );

  assertUnique(
    "experiences",
    experiences.map((e) => e.id)
  );

  assertUnique(
    "education",
    education.map((e) => e.id)
  );

  assertUnique(
    "certifications",
    certifications.map((c) => c.id)
  );

  assertUnique(
    "blog posts",
    posts.map((p) => p.slug)
  );

  console.log("✅ Duplicate-ID check passed. All IDs are unique.");
} catch (err) {
  console.error("❌ Duplicate-ID check failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} 