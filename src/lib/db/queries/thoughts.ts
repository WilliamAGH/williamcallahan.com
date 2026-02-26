import { desc, eq, sql, and } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { thoughts } from "@/lib/db/schema/thoughts";
import type { Thought, ThoughtListItem, ThoughtCategory } from "@/types/schemas/thought";

const EXCERPT_MAX_LENGTH = 160;

/**
 * Convert epoch millis to ISO datetime string.
 * Returns undefined for null/undefined input.
 */
function epochMillisToIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function epochMillisToIsoOptional(epochMs: number | null): string | undefined {
  if (epochMs === null) {
    return undefined;
  }
  return new Date(epochMs).toISOString();
}

/**
 * Map a raw database row to a Thought domain object.
 * Converts epoch millis timestamps to ISO datetime strings.
 */
function mapRowToThought(row: typeof thoughts.$inferSelect): Thought {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    createdAt: epochMillisToIso(row.createdAt),
    updatedAt: epochMillisToIsoOptional(row.updatedAt),
    category: row.category ?? undefined,
    tags: row.tags ?? undefined,
    draft: row.draft ?? undefined,
    relatedThoughts: row.relatedThoughts ?? undefined,
  };
}

/**
 * Generate a plain-text excerpt from markdown content by stripping formatting.
 */
function generateExcerpt(content: string, maxLength: number = EXCERPT_MAX_LENGTH): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength).trim()}...`;
}

/**
 * Map a raw database row to a ThoughtListItem (no content, with excerpt).
 */
function mapRowToListItem(row: typeof thoughts.$inferSelect): ThoughtListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: generateExcerpt(row.content),
    createdAt: epochMillisToIso(row.createdAt),
    updatedAt: epochMillisToIsoOptional(row.updatedAt),
    category: row.category ?? undefined,
    tags: row.tags ?? undefined,
    draft: row.draft ?? undefined,
  };
}

/**
 * Read all non-draft thoughts ordered by created_at DESC.
 */
export async function readAllThoughts(): Promise<Thought[]> {
  const rows = await db
    .select()
    .from(thoughts)
    .where(eq(thoughts.draft, false))
    .orderBy(desc(thoughts.createdAt));

  return rows.map(mapRowToThought);
}

/**
 * Read a single thought by its unique slug, or null if not found.
 */
export async function readThoughtBySlug(slug: string): Promise<Thought | null> {
  const rows = await db
    .select()
    .from(thoughts)
    .where(and(eq(thoughts.slug, slug), eq(thoughts.draft, false)))
    .limit(1);

  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }
  return mapRowToThought(firstRow);
}

/**
 * Read a single thought by its UUID, or null if not found.
 */
export async function readThoughtById(id: string): Promise<Thought | null> {
  const rows = await db.select().from(thoughts).where(eq(thoughts.id, id)).limit(1);

  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }
  return mapRowToThought(firstRow);
}

/**
 * Read all distinct categories with their thought counts.
 * Only counts non-draft thoughts that have a category.
 */
export async function readThoughtCategories(): Promise<ThoughtCategory[]> {
  const rows = await db
    .select({
      name: thoughts.category,
      count: sql<number>`count(*)::int`,
    })
    .from(thoughts)
    .where(and(eq(thoughts.draft, false), sql`${thoughts.category} IS NOT NULL`))
    .groupBy(thoughts.category)
    .orderBy(thoughts.category);

  return rows.map((row) => ({
    id: (row.name ?? "").toLowerCase(),
    name: row.name ?? "",
    count: row.count,
  }));
}

/**
 * Read all non-draft thoughts as list items (excerpt instead of full content).
 */
export async function readThoughtListItems(): Promise<ThoughtListItem[]> {
  const rows = await db
    .select()
    .from(thoughts)
    .where(eq(thoughts.draft, false))
    .orderBy(desc(thoughts.createdAt));

  return rows.map(mapRowToListItem);
}
