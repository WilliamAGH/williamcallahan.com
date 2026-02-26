import { eq } from "drizzle-orm";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { thoughts } from "@/lib/db/schema/thoughts";
import type { ThoughtInput } from "@/types/schemas/thought";

/**
 * Convert an ISO datetime string to epoch millis.
 * Returns the current time if the input is undefined.
 */
function isoToEpochMillis(iso: string | undefined): number {
  if (!iso) {
    return Date.now();
  }
  return new Date(iso).getTime();
}

/**
 * Convert an optional ISO datetime string to epoch millis or null.
 */
function isoToEpochMillisOptional(iso: string | undefined): number | null {
  if (!iso) {
    return null;
  }
  return new Date(iso).getTime();
}

/**
 * Generate a URL slug from a title string.
 * Lowercases, strips non-alphanumeric chars, and joins words with hyphens.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Insert or update a thought by slug. If a thought with the same slug exists,
 * the existing row is updated; otherwise a new row is inserted.
 *
 * Returns the id of the upserted thought.
 */
export async function upsertThought(input: ThoughtInput): Promise<string> {
  assertDatabaseWriteAllowed("upsertThought");

  const slug = input.slug ?? slugify(input.title);
  const id = input.id ?? crypto.randomUUID();
  const createdAt = isoToEpochMillis(input.createdAt);
  const updatedAt = isoToEpochMillisOptional(input.updatedAt);

  const values = {
    id,
    slug,
    title: input.title,
    content: input.content,
    createdAt,
    updatedAt,
    category: input.category ?? null,
    tags: input.tags ?? null,
    draft: input.draft ?? false,
    relatedThoughts: input.relatedThoughts ?? null,
  };

  const result = await db
    .insert(thoughts)
    .values(values)
    .onConflictDoUpdate({
      target: thoughts.slug,
      set: {
        title: values.title,
        content: values.content,
        updatedAt: Date.now(),
        category: values.category,
        tags: values.tags,
        draft: values.draft,
        relatedThoughts: values.relatedThoughts,
      },
    })
    .returning({ id: thoughts.id });

  const row = result[0];
  if (!row) {
    throw new Error(`upsertThought failed: no row returned for slug "${slug}"`);
  }

  return row.id;
}

/**
 * Delete a thought by its UUID.
 *
 * Returns true if a row was deleted, false if the id was not found.
 */
export async function deleteThought(id: string): Promise<boolean> {
  assertDatabaseWriteAllowed("deleteThought");

  const result = await db
    .delete(thoughts)
    .where(eq(thoughts.id, id))
    .returning({ id: thoughts.id });

  return result.length > 0;
}
