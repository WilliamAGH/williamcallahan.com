#!/usr/bin/env bun

import { readJsonS3 } from "../lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS } from "../lib/constants";
import type { ContentGraphMetadata, TagGraph, RelatedContentEntry } from "@/types/related-content";

async function testContentGraph() {
  try {
    console.log("🔍 Checking content graph files in S3...");
    
    const relatedContent = await readJsonS3<Record<string, RelatedContentEntry[]>>(CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT);
    const tagGraph = await readJsonS3<TagGraph>(CONTENT_GRAPH_S3_PATHS.TAG_GRAPH);
    const metadata = await readJsonS3<ContentGraphMetadata>(CONTENT_GRAPH_S3_PATHS.METADATA);
    
    console.log("\n✅ Content graph files found:");
    
    if (relatedContent) {
      const keys = Object.keys(relatedContent);
      console.log(`\n📊 related-content.json:`);
      console.log(`  - Total items: ${keys.length}`);
      console.log(`  - Sample keys: ${keys.slice(0, 5).join(", ")}...`);
      
      const firstKey = keys[0];
      if (firstKey && relatedContent[firstKey]) {
        console.log(`  - Sample item (${firstKey}):`);
        console.log(`    - Related items: ${relatedContent[firstKey].length}`);
        if (relatedContent[firstKey][0]) {
          console.log(`    - First related:`, relatedContent[firstKey][0]);
        }
      }
    } else {
      console.log("❌ related-content.json not found");
    }
    
    if (tagGraph) {
      console.log(`\n🏷️ tag-graph.json:`);
      console.log(`  - Total tags: ${Object.keys(tagGraph.tags || {}).length}`);
      console.log(`  - Tag hierarchy entries: ${Object.keys(tagGraph.tagHierarchy || {}).length}`);
      const sampleTags = Object.keys(tagGraph.tags || {}).slice(0, 5);
      console.log(`  - Sample tags: ${sampleTags.join(", ")}...`);
    } else {
      console.log("❌ tag-graph.json not found");
    }
    
    if (metadata) {
      console.log(`\n📝 metadata.json:`, metadata);
    } else {
      console.log("❌ metadata.json not found");
    }
    
  } catch (error) {
    console.error("❌ Error reading content graph:", error);
  }
}

testContentGraph();