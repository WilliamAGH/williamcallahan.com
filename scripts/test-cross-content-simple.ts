#!/usr/bin/env bun

/**
 * Simple test to verify cross-content matching improvements
 */

import { calculateSimilarity, SAME_TYPE_WEIGHTS, CROSS_TYPE_WEIGHTS } from "../lib/content-similarity";
import { calculateSemanticTagSimilarity } from "../lib/content-similarity/tag-ontology";
import { extractKeywords } from "../lib/content-similarity/keyword-extractor";
import type { NormalizedContent } from "@/types/related-content";

// Test content samples
const bookmark: NormalizedContent = {
  id: "test-bookmark",
  type: "bookmark",
  title: "GitHub - openai/whisper: AI speech recognition model",
  text: "Whisper is a general-purpose speech recognition model. It is trained on a large dataset of diverse audio and is also a multitasking model that can perform multilingual speech recognition.",
  tags: ["AI Development Tools", "Open Source Projects", "GitHub", "Speech Recognition"],
  url: "/bookmarks/test-bookmark",
  domain: "github.com",
  date: new Date("2024-01-15"),
  source: {} as any,
};

const investment: NormalizedContent = {
  id: "test-investment",
  type: "investment",
  title: "OpenAI",
  text: "Leading artificial intelligence research laboratory developing safe and beneficial AI systems including GPT models and DALL-E.",
  tags: ["AI / ML", "Series B+", "Active"],
  url: "/investments#openai",
  domain: "openai.com",
  date: new Date("2023-01-01"),
  source: {} as any,
};

const blogPost: NormalizedContent = {
  id: "test-blog",
  type: "blog",
  title: "Understanding Machine Learning in Production",
  text: "A deep dive into deploying machine learning models at scale, covering best practices for model serving, monitoring, and maintenance.",
  tags: ["machine-learning", "ai", "production", "deployment"],
  url: "/blog/ml-production",
  domain: undefined,
  date: new Date("2024-02-01"),
  source: {} as any,
};

const project: NormalizedContent = {
  id: "test-project",
  type: "project",
  title: "React Dashboard Framework",
  text: "A comprehensive dashboard framework built with React, TypeScript, and Tailwind CSS for building admin interfaces.",
  tags: ["React", "TypeScript", "Tailwind CSS", "Dashboard"],
  url: "/projects#dashboard",
  domain: undefined,
  date: undefined,
  source: {} as any,
};

function testPair(source: NormalizedContent, target: NormalizedContent, label: string) {
  console.log(`\n📊 ${label}`);
  console.log(`   Source: ${source.title} (${source.type})`);
  console.log(`   Target: ${target.title} (${target.type})`);
  
  // Test with appropriate weights
  const isCrossContent = source.type !== target.type;
  const weights = isCrossContent ? CROSS_TYPE_WEIGHTS : SAME_TYPE_WEIGHTS;
  const { total, breakdown } = calculateSimilarity(source, target, weights);
  
  console.log(`   Total Score: ${total.toFixed(3)}`);
  console.log(`   Breakdown:`);
  console.log(`     - Tag Match: ${breakdown.tagMatch.toFixed(3)}`);
  console.log(`     - Text Similarity: ${breakdown.textSimilarity.toFixed(3)}`);
  console.log(`     - Domain Match: ${breakdown.domainMatch.toFixed(3)}`);
  console.log(`     - Recency: ${breakdown.recency.toFixed(3)}`);
  
  // Test semantic tag similarity
  if (isCrossContent) {
    const semanticScore = calculateSemanticTagSimilarity(source.tags, target.tags);
    console.log(`     - Semantic Tag Score: ${semanticScore.toFixed(3)}`);
  }
}

function testKeywordExtraction() {
  console.log("\n🔑 Testing Keyword Extraction");
  
  const samples = [
    {
      title: "Building a Real-time Chat Application with WebSockets",
      description: "Learn how to build a scalable real-time chat application using WebSockets, Node.js, and React. We'll cover authentication, message persistence, and deployment.",
      existingTags: ["tutorial", "websockets"],
    },
    {
      title: "Series A Funding for AI Startups",
      description: "Analysis of recent Series A funding rounds in the AI startup ecosystem, focusing on venture capital trends and investment patterns.",
      existingTags: ["venture-capital"],
    },
  ];
  
  samples.forEach((sample, i) => {
    console.log(`\n   Sample ${i + 1}: ${sample.title.slice(0, 50)}...`);
    const keywords = extractKeywords(
      sample.title,
      sample.description,
      sample.existingTags,
      8
    );
    console.log(`   Extracted: ${keywords.join(", ")}`);
  });
}

function testSemanticMatching() {
  console.log("\n🧠 Testing Semantic Tag Matching");
  
  const testCases = [
    { tags1: ["AI Development Tools"], tags2: ["machine learning", "ai"], label: "AI terms" },
    { tags1: ["venture capital"], tags2: ["Series A", "funding"], label: "VC terms" },
    { tags1: ["React"], tags2: ["nextjs", "frontend"], label: "Web frameworks" },
    { tags1: ["Open Source Projects"], tags2: ["github", "repository"], label: "OSS terms" },
  ];
  
  testCases.forEach(({ tags1, tags2, label }) => {
    const score = calculateSemanticTagSimilarity(tags1, tags2);
    console.log(`   ${label}:`);
    console.log(`     Tags1: ${tags1.join(", ")}`);
    console.log(`     Tags2: ${tags2.join(", ")}`);
    console.log(`     Semantic Score: ${score.toFixed(3)}`);
  });
}

// Enhanced content with extracted keywords
function testWithEnhancedContent() {
  console.log("\n✨ Testing with Enhanced Content (Keywords Added)");
  
  // Enhance bookmark with keywords
  const enhancedBookmark = {
    ...bookmark,
    tags: [
      ...bookmark.tags,
      ...extractKeywords(bookmark.title, bookmark.text, bookmark.tags, 5),
    ],
  };
  
  // Enhance investment with keywords
  const enhancedInvestment = {
    ...investment,
    tags: [
      ...investment.tags,
      ...extractKeywords(investment.title, investment.text, investment.tags, 5),
    ],
  };
  
  console.log("\n   Enhanced Bookmark Tags:", enhancedBookmark.tags.join(", "));
  console.log("   Enhanced Investment Tags:", enhancedInvestment.tags.join(", "));
  
  const { total, breakdown } = calculateSimilarity(
    enhancedBookmark,
    enhancedInvestment,
    CROSS_TYPE_WEIGHTS
  );
  
  console.log("\n   Cross-Content Score: ", total.toFixed(3));
  console.log("   Breakdown:", Object.entries(breakdown).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", "));
}

// Run all tests
console.log("🚀 Cross-Content Matching Test Suite\n");
console.log("=" .repeat(60));

// Test different content pairs
testPair(bookmark, investment, "AI Bookmark vs AI Investment");
testPair(bookmark, blogPost, "AI Bookmark vs ML Blog Post");
testPair(bookmark, project, "AI Bookmark vs React Project");
testPair(blogPost, investment, "ML Blog vs AI Investment");

// Test keyword extraction
testKeywordExtraction();

// Test semantic matching
testSemanticMatching();

// Test with enhanced content
testWithEnhancedContent();

console.log("\n" + "=".repeat(60));
console.log("✅ Test Complete!");