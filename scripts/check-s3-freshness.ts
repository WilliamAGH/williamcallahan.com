#!/usr/bin/env bun

/**
 * Diagnostic script to check the actual freshness of bookmark data in S3
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types/bookmark";

async function checkS3Freshness() {
  console.log("=== S3 BOOKMARK DATA FRESHNESS CHECK ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  try {
    // Check main bookmarks file
    console.log("1. CHECKING MAIN BOOKMARKS FILE:");
    console.log(`   Path: ${BOOKMARKS_S3_PATHS.FILE}`);

    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);

    if (!bookmarks || !Array.isArray(bookmarks)) {
      console.log("   ❌ No bookmarks found or invalid format");
      return;
    }

    console.log(`   ✅ Found ${bookmarks.length} bookmarks`);

    // Analyze bookmark dates - use dateBookmarked or dateCreated
    const dates = bookmarks
      .map((b) => b.dateBookmarked || b.dateCreated || b.modifiedAt)
      .filter((d): d is string => Boolean(d))
      .map((d) => {
        const parsed = new Date(d);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      })
      .filter((d): d is Date => d !== null)
      .toSorted((a, b) => b.getTime() - a.getTime());

    if (dates.length > 0) {
      const now = new Date();
      const newestDate = dates[0];
      const oldestDate = dates[dates.length - 1];

      if (newestDate && oldestDate) {
        const daysSinceNewest = (now.getTime() - newestDate.getTime()) / (1000 * 60 * 60 * 24);

        console.log(
          `   📅 Newest bookmark: ${newestDate.toISOString()} (${daysSinceNewest.toFixed(1)} days ago)`,
        );
        console.log(`   📅 Oldest bookmark: ${oldestDate.toISOString()}`);
      }

      // Check distribution
      const last24h = dates.filter((d) => now.getTime() - d.getTime() < 24 * 60 * 60 * 1000).length;
      const last7d = dates.filter(
        (d) => now.getTime() - d.getTime() < 7 * 24 * 60 * 60 * 1000,
      ).length;
      const last30d = dates.filter(
        (d) => now.getTime() - d.getTime() < 30 * 24 * 60 * 60 * 1000,
      ).length;

      console.log("");
      console.log("2. BOOKMARK AGE DISTRIBUTION:");
      console.log(`   Last 24 hours: ${last24h} bookmarks`);
      console.log(`   Last 7 days: ${last7d} bookmarks`);
      console.log(`   Last 30 days: ${last30d} bookmarks`);
      console.log(`   Older: ${bookmarks.length - last30d} bookmarks`);
    }

    // Check heartbeat
    console.log("");
    console.log("3. CHECKING HEARTBEAT FILE:");
    try {
      const heartbeat = await readJsonS3<{ timestamp: string; count: number }>(
        BOOKMARKS_S3_PATHS.HEARTBEAT,
      );
      if (heartbeat?.timestamp) {
        const heartbeatDate = new Date(heartbeat.timestamp);
        if (Number.isNaN(heartbeatDate.getTime())) {
          console.log(`   ❌ Invalid heartbeat timestamp: ${heartbeat.timestamp}`);
        } else {
          const minsSinceHeartbeat = (Date.now() - heartbeatDate.getTime()) / (1000 * 60);
          console.log(
            `   📍 Last heartbeat: ${heartbeat.timestamp} (${minsSinceHeartbeat.toFixed(1)} minutes ago)`,
          );
          console.log(`   📊 Bookmark count at heartbeat: ${heartbeat.count}`);

          if (minsSinceHeartbeat > 120) {
            console.log(
              "   ⚠️  WARNING: Heartbeat is older than 2 hours - scheduler may not be running!",
            );
          }
        }
      } else {
        console.log("   ❌ No heartbeat data found");
      }
    } catch (err) {
      console.log(`   ❌ Could not read heartbeat: ${err}`);
    }

    // Check lock status
    console.log("");
    console.log("4. CHECKING REFRESH LOCK:");
    try {
      const lock = await readJsonS3<{ timestamp: string; ttl: number }>(BOOKMARKS_S3_PATHS.LOCK);
      if (lock?.timestamp) {
        const lockDate = new Date(lock.timestamp);
        if (Number.isNaN(lockDate.getTime())) {
          console.log(`   ❌ Invalid lock timestamp: ${lock.timestamp}`);
        } else {
          const minsSinceLock = (Date.now() - lockDate.getTime()) / (1000 * 60);
          console.log(
            `   🔒 Lock timestamp: ${lock.timestamp} (${minsSinceLock.toFixed(1)} minutes ago)`,
          );

          if (minsSinceLock < 5) {
            console.log("   ⚠️  WARNING: Active lock - refresh might be in progress");
          } else if (minsSinceLock < 60) {
            console.log("   ℹ️  Lock is stale but recent - refresh may have completed recently");
          }
        }
      } else {
        console.log("   ✅ No active lock");
      }
    } catch {
      console.log("   ✅ No lock file (normal state)");
    }

    // Sample a few bookmarks to check OpenGraph data freshness
    console.log("");
    console.log("5. SAMPLE BOOKMARK DETAILS (first 3):");
    bookmarks.slice(0, 3).forEach((b, i) => {
      console.log(`   [${i + 1}] ${b.title || "Untitled"}`);
      console.log(`       Bookmarked: ${b.dateBookmarked || b.dateCreated || "Unknown"}`);
      console.log(`       URL: ${b.url}`);
      if (b.ogImage || b.content?.imageUrl) {
        console.log(`       Has image: ✅`);
      } else {
        console.log(`       Has image: ❌`);
      }
    });
  } catch (error) {
    console.error("ERROR:", error);
  }

  console.log("");
  console.log("=== END FRESHNESS CHECK ===");
}

// Run the check
checkS3Freshness().catch(console.error);
