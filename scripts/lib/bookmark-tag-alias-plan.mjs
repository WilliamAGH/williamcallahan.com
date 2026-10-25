import { z } from "zod/v4";
import { BOOKMARK_TAG_ALIAS_CTE } from "../../src/lib/db/bookmark-tag-aliases.mjs";

const aliasEdgesSchema = z.array(
  z.object({ source_tag_slug: z.string(), target_tag_slug: z.string() }),
);
const tagNamesSchema = z.array(z.object({ tag_slug: z.string(), tag_name: z.string() }));
const cycleRepairSchema = z.array(
  z.object({
    source_tag_slug: z.string(),
    target_tag_slug: z.string(),
    cycle_slugs: z.array(z.string()),
    canonical_name: z.string(),
    canonical_status: z.string(),
    canonical_member_count: z.number().int().nonnegative(),
    canonical_created_at: z.string(),
  }),
);

/** Called after acquiring the taxonomy writer lock, or in a read-only preview transaction. */
export async function normalizeAliasMappings(tx, mappings) {
  if (mappings.length === 0) return [];
  const edges = aliasEdgesSchema.parse(
    await tx`
    SELECT source_tag_slug, target_tag_slug FROM bookmarks_tags_links WHERE link_type = 'alias'
  `,
  );
  const tags = tagNamesSchema.parse(await tx`SELECT tag_slug, tag_name FROM bookmarks_tags`);
  const targets = new Map(edges.map((edge) => [edge.source_tag_slug, edge.target_tag_slug]));
  const names = new Map(tags.map((tag) => [tag.tag_slug, tag.tag_name]));
  for (const mapping of mappings) {
    targets.set(mapping.aliasSlug, mapping.canonicalSlug);
    if (!names.has(mapping.canonicalSlug)) names.set(mapping.canonicalSlug, mapping.canonical);
  }
  // Evaluate the entire proposal together: two individually safe edges can form a cycle.
  return mappings.map((mapping) => {
    const visited = new Set([mapping.aliasSlug]);
    let terminal = mapping.canonicalSlug;
    while (true) {
      if (visited.has(terminal)) {
        throw new Error(
          `Alias plan rejected: cycle reachable from ${mapping.aliasSlug} at ${terminal}. Correct the proposal; use scoped repair only for existing cycles.`,
        );
      }
      visited.add(terminal);
      const next = targets.get(terminal);
      if (!next) break;
      terminal = next;
    }
    const canonical = names.get(terminal);
    if (!canonical) throw new Error(`Alias target has no tag identity: ${terminal}`);
    return { ...mapping, canonicalSlug: terminal, canonical };
  });
}

export async function lockAliasWriters(tx) {
  // Same first lock as the refresh producer, avoiding inverted lock order.
  await tx`LOCK TABLE bookmarks IN SHARE ROW EXCLUSIVE MODE`;
  await tx`LOCK TABLE bookmarks_tags, bookmarks_tags_links IN SHARE ROW EXCLUSIVE MODE`;
}

/** Choose one explicit canonical member per cycle; default is a read-only preview. */
export async function repairAliasCycles(sqlClient, options) {
  await sqlClient.begin(
    options.dryRun ? "isolation level repeatable read read only" : "",
    async (tx) => {
      if (!options.dryRun) await lockAliasWriters(tx);
      const plan = cycleRepairSchema.parse(
        await tx`
      ${tx.unsafe(BOOKMARK_TAG_ALIAS_CTE)}
       SELECT mapping.source_tag_slug, tag.tag_slug AS target_tag_slug, mapping.cycle_slugs,
             tag.tag_name AS canonical_name, tag.tag_status AS canonical_status,
             usage.member_count::int AS canonical_member_count,
             tag.created_at::text AS canonical_created_at
      FROM canonical_tag_aliases AS mapping
       JOIN bookmarks_tags AS tag ON tag.tag_slug = ANY(mapping.cycle_slugs)
         AND tag.tag_slug = ANY(${tx.array(options.repairCycleSlugs)}::text[])
       JOIN cycle_usage AS usage ON usage.tag_slug = tag.tag_slug
       WHERE mapping.source_tag_slug = ANY(mapping.cycle_slugs)
       ORDER BY tag.tag_slug, mapping.source_tag_slug
    `,
      );
      if (
        plan.some(
          (row) =>
            row.cycle_slugs.filter((slug) => options.repairCycleSlugs.includes(slug)).length !== 1,
        )
      ) {
        throw new Error("Choose exactly one canonical tag slug per cycle; no repair applied.");
      }
      console.log(
        `[BookmarkTagRepair] ${options.dryRun ? "dry-run" : "apply"}: ${JSON.stringify(plan, null, 2)}`,
      );
      if (options.dryRun) return;
      const now = Date.now();
      for (const row of plan) {
        if (row.source_tag_slug === row.target_tag_slug) {
          // Only the representative's outgoing cycle edge is removed. Every tag,
          // incoming alias, native bookmark tag, and bookmark member link survives.
          await tx`DELETE FROM bookmarks_tags_links
          WHERE source_tag_slug = ${row.source_tag_slug} AND link_type = 'alias'`;
        } else {
          await tx`UPDATE bookmarks_tags_links
          SET target_tag_slug = ${row.target_tag_slug}, updated_at = ${now}
          WHERE source_tag_slug = ${row.source_tag_slug} AND link_type = 'alias'`;
        }
        await tx`UPDATE bookmarks_tags
        SET tag_status = ${row.source_tag_slug === row.target_tag_slug ? "primary" : "alias"}, updated_at = ${now}
        WHERE tag_slug = ${row.source_tag_slug}`;
      }
      const remaining = await tx`
      ${tx.unsafe(BOOKMARK_TAG_ALIAS_CTE)}
      SELECT source_tag_slug FROM canonical_tag_aliases
      WHERE cycle_slugs && ${tx.array(options.repairCycleSlugs)}::text[]
      LIMIT 1
    `;
      if (remaining.length > 0)
        throw new Error("Scoped alias repair left a cycle; transaction rolled back.");
    },
  );
}
