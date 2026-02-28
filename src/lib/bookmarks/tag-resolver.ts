import { formatTagDisplay, tagToSlug } from "@/lib/utils/tag-utils";
import type { TagTaxonomyMaps, BookmarkForDiscovery } from "@/types/features/discovery";

export type { BookmarkForDiscovery } from "@/types/features/discovery";

export function extractTagNames(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  const names: string[] = [];
  for (const rawTag of rawTags) {
    if (typeof rawTag === "string") {
      const trimmed = rawTag.trim();
      if (trimmed.length > 0) names.push(trimmed);
      continue;
    }
    if (typeof rawTag !== "object" || rawTag === null) continue;
    const maybeName = Reflect.get(rawTag, "name");
    if (typeof maybeName !== "string") continue;
    const trimmed = maybeName.trim();
    if (trimmed.length > 0) names.push(trimmed);
  }
  return names;
}

export function resolvePrimaryTag(
  bookmark: BookmarkForDiscovery,
  taxonomy: TagTaxonomyMaps | null,
): { slug: string; name: string } | null {
  const tags = extractTagNames(bookmark.tags);
  if (tags.length === 0) return null;

  if (taxonomy) {
    for (const rawTag of tags) {
      const slug = tagToSlug(rawTag);
      if (!slug) continue;
      const canonicalSlug = taxonomy.aliasToCanonical.get(slug) ?? slug;
      const canonicalName = taxonomy.primaryBySlug.get(canonicalSlug);
      if (!canonicalName) continue;
      return { slug: canonicalSlug, name: canonicalName };
    }
  }

  const first = tags[0];
  if (!first) return null;
  const fallbackSlug = tagToSlug(first);
  if (!fallbackSlug) return null;
  return { slug: fallbackSlug, name: formatTagDisplay(first) };
}
