import { getBookmarks } from "@/lib/bookmarks/service.server";
import { closeDatabaseConnection } from "@/lib/db/connection";
import { upsertUnifiedBookmarks } from "@/lib/db/mutations/bookmarks";
import { getBookmarksCount } from "@/lib/db/queries/bookmarks";
import { unifiedBookmarksArraySchema } from "@/types/schemas/bookmark";

async function migrateBookmarksFromS3ToPostgres(): Promise<void> {
  console.log("[migrate-s3-to-postgres] Reading bookmarks from unified bookmark service...");
  const bookmarkData = await getBookmarks({
    includeImageData: true,
    skipExternalFetch: true,
    force: false,
  });
  const bookmarks = unifiedBookmarksArraySchema.parse(bookmarkData);

  if (!bookmarks || bookmarks.length === 0) {
    throw new Error("No bookmarks found in bookmark dataset.");
  }

  console.log(
    `[migrate-s3-to-postgres] Found ${bookmarks.length} bookmarks. Syncing into PostgreSQL...`,
  );
  await upsertUnifiedBookmarks(bookmarks);

  const totalRows = await getBookmarksCount();
  console.log(
    `[migrate-s3-to-postgres] Migration complete. ${bookmarks.length} rows processed; table now has ${totalRows} rows.`,
  );
}

try {
  await migrateBookmarksFromS3ToPostgres();
} finally {
  await closeDatabaseConnection();
}
