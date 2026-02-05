/**
 * Slug shard storage helpers
 *
 * Handles S3 read/write/delete for per-slug shard entries.
 *
 * @module lib/bookmarks/slug-shards
 */

import { normalizeString } from "@/lib/utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import { readJsonS3Optional, writeJsonS3 } from "@/lib/s3/json";
import { deleteFromS3 } from "@/lib/s3/objects";
import { S3NotFoundError } from "@/lib/s3/errors";
import type { BookmarkSlugEntry, BookmarkSlugMapping } from "@/types";
import { bookmarkSlugEntrySchema } from "@/types/bookmark";

const SLUG_SHARD_BATCH_SIZE = 50;
const SHARD_FALLBACK_CHAR = "_";

const normalizeShardChar = (char: string | undefined): string => {
  if (!char) return SHARD_FALLBACK_CHAR;
  const lower = char.toLowerCase();
  return /[a-z0-9]/.test(lower) ? lower : SHARD_FALLBACK_CHAR;
};

const getSlugShardBucket = (slug: string): string => {
  const normalized = normalizeString(slug);
  if (normalized.length === 0) {
    return `${SHARD_FALLBACK_CHAR}${SHARD_FALLBACK_CHAR}`;
  }
  const first = normalizeShardChar(normalized[0]);
  const second = normalizeShardChar(normalized[1]);
  return `${first}${second}`;
};

const encodeSlugForKey = (slug: string): string => encodeURIComponent(slug);

export const getSlugShardKey = (slug: string): string =>
  `${BOOKMARKS_S3_PATHS.SLUG_SHARD_PREFIX}${getSlugShardBucket(slug)}/${encodeSlugForKey(slug)}.json`;

const collectSlugs = (mapping: BookmarkSlugMapping | null): Set<string> => {
  const slugs = new Set<string>();
  if (!mapping) return slugs;
  if (mapping.reverseMap && Object.keys(mapping.reverseMap).length > 0) {
    for (const slug of Object.keys(mapping.reverseMap)) {
      slugs.add(slug);
    }
  } else {
    for (const entry of Object.values(mapping.slugs ?? {})) {
      if (entry?.slug) {
        slugs.add(entry.slug);
      }
    }
  }
  return slugs;
};

export async function persistSlugShards(
  mapping: BookmarkSlugMapping,
  previous: BookmarkSlugMapping | null,
): Promise<void> {
  const entries = Object.values(mapping.slugs ?? {});
  const previousSlugs = collectSlugs(previous);
  const currentSlugs = new Set(entries.map((entry) => entry.slug));
  const staleSlugs: string[] = [];

  if (previousSlugs.size > 0) {
    for (const slug of previousSlugs) {
      if (!currentSlugs.has(slug)) {
        staleSlugs.push(slug);
      }
    }
  }

  if (entries.length > 0) {
    for (let index = 0; index < entries.length; index += SLUG_SHARD_BATCH_SIZE) {
      const batch = entries.slice(index, index + SLUG_SHARD_BATCH_SIZE);
      await Promise.all(
        batch.map(async (entry) => {
          const shardKey = getSlugShardKey(entry.slug);
          await writeJsonS3(shardKey, entry);
        }),
      );
    }
    envLogger.log(
      "Persisted slug shards",
      { count: entries.length, checksum: mapping.checksum },
      { category: "SlugManager" },
    );
  }

  if (staleSlugs.length > 0) {
    for (let index = 0; index < staleSlugs.length; index += SLUG_SHARD_BATCH_SIZE) {
      const batch = staleSlugs.slice(index, index + SLUG_SHARD_BATCH_SIZE);
      await Promise.all(
        batch.map(async (slug) => {
          const shardKey = getSlugShardKey(slug);
          try {
            await deleteFromS3(shardKey);
          } catch (error) {
            if (!(error instanceof S3NotFoundError)) {
              envLogger.debug(
                "Failed to delete stale slug shard",
                { key: shardKey, error },
                { category: "SlugManager" },
              );
            }
          }
        }),
      );
    }
    envLogger.log(
      "Removed stale slug shards",
      { count: staleSlugs.length },
      { category: "SlugManager" },
    );
  }
}

export async function readSlugShard(slug: string): Promise<BookmarkSlugEntry | null> {
  const shardKey = getSlugShardKey(slug);
  try {
    const entry = await readJsonS3Optional<BookmarkSlugEntry>(shardKey, bookmarkSlugEntrySchema);
    if (entry?.slug === slug) {
      return entry;
    }
    return null;
  } catch (error) {
    if (!(error instanceof S3NotFoundError)) {
      envLogger.debug(
        "Failed to read slug shard from S3",
        { key: shardKey, error },
        { category: "SlugManager" },
      );
    }
    return null;
  }
}
