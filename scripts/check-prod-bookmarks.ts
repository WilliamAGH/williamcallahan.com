#!/usr/bin/env bun

/**
 * Check production bookmark data in S3
 */

import { readJsonS3 } from "@/lib/s3-utils";
import type { UnifiedBookmark } from "@/types/bookmark";

async function checkProdBookmarks() {
  console.log("=== PRODUCTION BOOKMARK CHECK ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  // Force production environment for this check
  const originalEnv = process.env.DEPLOYMENT_ENV;
  process.env.DEPLOYMENT_ENV = "production";

  try {
    // Check production bookmarks file
    const prodPath = "json/bookmarks/bookmarks.json"; // Production has no suffix
    console.log("1. CHECKING PRODUCTION BOOKMARKS:");
    console.log(`   Path: ${prodPath}`);
    
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(prodPath);
    
    if (!bookmarks || !Array.isArray(bookmarks)) {
      console.log("   ❌ No bookmarks found or invalid format");
      return;
    }

    console.log(`   ✅ Found ${bookmarks.length} bookmarks in production`);
    
    // Check dates
    const dates = bookmarks
      .map(b => b.dateBookmarked || b.dateCreated || b.modifiedAt)
      .filter((d): d is string => Boolean(d))
      .map(d => new Date(d))
      .sort((a, b) => b.getTime() - a.getTime());
    
    if (dates.length > 0) {
      const newestDate = dates[0];
      if (newestDate) {
        const now = new Date();
        const daysSinceNewest = (now.getTime() - newestDate.getTime()) / (1000 * 60 * 60 * 24);
        
        console.log(`   📅 Newest bookmark: ${newestDate.toISOString()} (${daysSinceNewest.toFixed(1)} days ago)`);
      
        // Check distribution
        const last24h = dates.filter(d => (now.getTime() - d.getTime()) < 24 * 60 * 60 * 1000).length;
        const last7d = dates.filter(d => (now.getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000).length;
        
        console.log(`   Last 24 hours: ${last24h} bookmarks`);
        console.log(`   Last 7 days: ${last7d} bookmarks`);
      }
    }

    // Check heartbeat
    console.log("");
    console.log("2. CHECKING PRODUCTION HEARTBEAT:");
    try {
      const heartbeat = await readJsonS3<{ timestamp: string; count: number }>("json/bookmarks/heartbeat.json");
      if (heartbeat?.timestamp) {
        const heartbeatDate = new Date(heartbeat.timestamp);
        const hoursSinceHeartbeat = (new Date().getTime() - heartbeatDate.getTime()) / (1000 * 60 * 60);
        console.log(`   📍 Last heartbeat: ${heartbeat.timestamp} (${hoursSinceHeartbeat.toFixed(1)} hours ago)`);
        console.log(`   📊 Bookmark count at heartbeat: ${heartbeat.count}`);
      }
    } catch {
      console.log(`   ❌ No heartbeat data`);
    }

    // Compare with dev
    console.log("");
    console.log("3. COMPARING WITH DEV:");
    process.env.DEPLOYMENT_ENV = "development";
    const devPath = "json/bookmarks/bookmarks-dev.json";
    try {
      const devBookmarks = await readJsonS3<UnifiedBookmark[]>(devPath);
      if (devBookmarks && Array.isArray(devBookmarks)) {
        console.log(`   Dev has ${devBookmarks.length} bookmarks`);
        console.log(`   Production has ${bookmarks.length} bookmarks`);
        const diff = devBookmarks.length - bookmarks.length;
        if (diff > 0) {
          console.log(`   ⚠️  Dev has ${diff} MORE bookmarks than production!`);
        } else if (diff < 0) {
          console.log(`   ⚠️  Production has ${Math.abs(diff)} MORE bookmarks than dev!`);
        } else {
          console.log(`   ✅ Both environments have the same count`);
        }
      }
    } catch (err) {
      console.log(`   Could not compare with dev: ${err}`);
    }

  } catch (error) {
    console.error("ERROR:", error);
  } finally {
    // Restore original environment
    if (originalEnv) {
      process.env.DEPLOYMENT_ENV = originalEnv;
    } else {
      delete process.env.DEPLOYMENT_ENV;
    }
  }

  console.log("");
  console.log("=== END PRODUCTION CHECK ===");
}

// Run the check
checkProdBookmarks().catch(console.error);