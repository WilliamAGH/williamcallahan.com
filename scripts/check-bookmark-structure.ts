#!/usr/bin/env bun

/**
 * Check the actual structure of bookmarks in S3 to understand what fields are available
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";

async function checkBookmarkStructure() {
  console.log("=== BOOKMARK STRUCTURE ANALYSIS ===");
  
  try {
    const bookmarks = await readJsonS3<any[]>(BOOKMARKS_S3_PATHS.FILE);
    
    if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
      console.log("❌ No bookmarks found");
      return;
    }

    console.log(`Found ${bookmarks.length} bookmarks\n`);
    
    // Analyze first bookmark structure
    console.log("FIRST BOOKMARK STRUCTURE:");
    const first = bookmarks[0];
    console.log(JSON.stringify(first, null, 2));
    
    // Check for date fields across all bookmarks
    console.log("\nDATE FIELD ANALYSIS:");
    let hasCreatedAt = 0;
    let hasUpdatedAt = 0;
    let hasArchivedAt = 0;
    let hasMetadataDate = 0;
    let hasAnyDate = 0;
    
    const sampleDates: any[] = [];
    
    bookmarks.forEach(b => {
      if (b.createdAt) {
        hasCreatedAt++;
        if (sampleDates.length < 3) sampleDates.push({ title: b.title, createdAt: b.createdAt });
      }
      if (b.updatedAt) hasUpdatedAt++;
      if (b.archivedAt) hasArchivedAt++;
      if (b.metadata?.datePublished || b.metadata?.dateModified) hasMetadataDate++;
      
      if (b.createdAt || b.updatedAt || b.archivedAt || b.metadata?.datePublished) {
        hasAnyDate++;
      }
    });
    
    console.log(`Bookmarks with createdAt: ${hasCreatedAt}/${bookmarks.length}`);
    console.log(`Bookmarks with updatedAt: ${hasUpdatedAt}/${bookmarks.length}`);
    console.log(`Bookmarks with archivedAt: ${hasArchivedAt}/${bookmarks.length}`);
    console.log(`Bookmarks with metadata dates: ${hasMetadataDate}/${bookmarks.length}`);
    console.log(`Bookmarks with ANY date field: ${hasAnyDate}/${bookmarks.length}`);
    
    if (sampleDates.length > 0) {
      console.log("\nSAMPLE DATES:");
      sampleDates.forEach(s => {
        console.log(`  "${s.title}": ${s.createdAt}`);
      });
    }
    
    // Check metadata structure
    console.log("\nMETADATA FIELDS FOUND:");
    const metadataFields = new Set<string>();
    bookmarks.forEach(b => {
      if (b.metadata && typeof b.metadata === 'object') {
        Object.keys(b.metadata).forEach(key => metadataFields.add(key));
      }
    });
    console.log(Array.from(metadataFields).sort().join(', '));
    
    // Look for any field that might indicate freshness
    console.log("\nALL TOP-LEVEL FIELDS:");
    const allFields = new Set<string>();
    bookmarks.forEach(b => {
      Object.keys(b).forEach(key => allFields.add(key));
    });
    console.log(Array.from(allFields).sort().join(', '));
    
  } catch (error) {
    console.error("ERROR:", error);
  }
}

checkBookmarkStructure().catch(console.error);