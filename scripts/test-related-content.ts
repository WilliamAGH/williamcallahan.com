#!/usr/bin/env bun

/**
 * Test script to diagnose related content matching
 */

import { aggregateAllContent } from "../lib/content-similarity/aggregator";
import { calculateSimilarity, DEFAULT_WEIGHTS } from "../lib/content-similarity";

async function testRelatedContent(): Promise<void> {
  console.log("🔍 Testing Related Content Matching\n");

  // Get all content
  const allContent = await aggregateAllContent();

  // Count by type
  const counts = {
    bookmark: allContent.filter((c) => c.type === "bookmark").length,
    blog: allContent.filter((c) => c.type === "blog").length,
    investment: allContent.filter((c) => c.type === "investment").length,
    project: allContent.filter((c) => c.type === "project").length,
  };

  console.log("📊 Content Counts:");
  console.log(counts);
  console.log("");

  // Find a bookmark with tags
  const bookmark = allContent.find((c) => c.type === "bookmark" && c.tags.length > 0);

  if (!bookmark) {
    console.log("❌ No bookmarks with tags found");
    return;
  }

  console.log(`📖 Testing with bookmark: ${bookmark.title}`);
  console.log(`   Tags: ${bookmark.tags.join(", ")}`);
  console.log(`   Domain: ${bookmark.domain || "none"}`);
  console.log("");

  // Find best matches from each content type
  const types = ["blog", "investment", "project"] as const;

  for (const targetType of types) {
    console.log(`\n🎯 Best ${targetType} matches:`);

    const candidates = allContent.filter((c) => c.type === targetType);

    if (candidates.length === 0) {
      console.log(`   No ${targetType} content found`);
      continue;
    }

    // Calculate scores for all candidates
    const scored = candidates
      .map((candidate) => {
        const { total, breakdown } = calculateSimilarity(bookmark, candidate, DEFAULT_WEIGHTS);
        return {
          title: candidate.title,
          tags: candidate.tags,
          score: total,
          breakdown,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    scored.forEach((item, i) => {
      console.log(`   ${i + 1}. ${item.title}`);
      console.log(`      Score: ${item.score.toFixed(3)}`);
      console.log(`      Tags: ${item.tags.slice(0, 3).join(", ")}${item.tags.length > 3 ? "..." : ""}`);
      console.log(
        `      Breakdown: tag=${item.breakdown.tagMatch.toFixed(2)}, text=${item.breakdown.textSimilarity.toFixed(2)}, domain=${item.breakdown.domainMatch.toFixed(2)}, recency=${item.breakdown.recency.toFixed(2)}`,
      );
    });
  }

  // Test a specific case: blog post about venture capital
  console.log("\n\n🧪 Specific Test: VC Blog Post");
  const vcBlog = allContent.find((c) => c.type === "blog" && c.title.toLowerCase().includes("venture"));

  if (vcBlog) {
    console.log(`📝 Blog: ${vcBlog.title}`);
    console.log(`   Tags: ${vcBlog.tags.join(", ")}`);

    // Find matching investments
    const investments = allContent
      .filter((c) => c.type === "investment")
      .map((inv) => {
        const { total, breakdown } = calculateSimilarity(vcBlog, inv, DEFAULT_WEIGHTS);
        return {
          title: inv.title,
          tags: inv.tags,
          score: total,
          breakdown,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    console.log("\n   Top Investment Matches:");
    investments.forEach((item, i) => {
      console.log(`   ${i + 1}. ${item.title}`);
      console.log(`      Score: ${item.score.toFixed(3)}`);
      console.log(`      Tags: ${item.tags.join(", ")}`);
    });
  }
}

// Run the test
testRelatedContent().catch(console.error);
