/**
 * Content Similarity Engine
 *
 * Core module for calculating similarity scores between different content types
 * using tag matching, text similarity, domain matching, and recency factors.
 */

import type { NormalizedContent, SimilarityWeights, RelatedContentType } from "@/types/related-content";
import { hasInvestmentContext } from "./keyword-extractor";
import { calculateSemanticTagSimilarity } from "./tag-ontology";

/**
 * Weights for comparing same content types
 */
export const SAME_TYPE_WEIGHTS: SimilarityWeights = {
  tagMatch: 0.4,
  textSimilarity: 0.3,
  domainMatch: 0.2,
  recency: 0.1,
};

/**
 * Weights for comparing different content types (cross-content)
 */
export const CROSS_TYPE_WEIGHTS: SimilarityWeights = {
  tagMatch: 0.25, // Reduced from 0.4
  textSimilarity: 0.45, // Increased from 0.3
  domainMatch: 0.05, // Reduced from 0.2 (rarely matches across types)
  recency: 0.1, // Same
  // Remaining 0.15 will be added as semantic bonus
};

/**
 * Default weights (same as SAME_TYPE for backward compatibility)
 */
export const DEFAULT_WEIGHTS = SAME_TYPE_WEIGHTS;

/**
 * Calculate Jaccard similarity coefficient for tag sets
 */
function calculateTagSimilarity(tags1: string[], tags2: string[]): number {
  if (tags1.length === 0 || tags2.length === 0) return 0;

  const set1 = new Set(tags1.map(t => t.toLowerCase()));
  const set2 = new Set(tags2.map(t => t.toLowerCase()));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Calculate text similarity using token overlap
 * This is a simpler alternative to full fuzzy search for initial implementation
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  // Normalize and tokenize
  const SHORT_TOKENS = new Set(["ai", "ml", "vr", "ar"]);
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(token => token.length > 2 || SHORT_TOKENS.has(token));

  const tokens1 = new Set(normalize(text1));
  const tokens2 = new Set(normalize(text2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const smaller = Math.min(tokens1.size, tokens2.size);

  // Use smaller set as denominator for better results with different text lengths
  return intersection.size / smaller;
}

/**
 * Calculate domain similarity for bookmarks
 */
function calculateDomainSimilarity(domain1?: string, domain2?: string): number {
  if (!domain1 || !domain2) return 0;

  // Exact match
  if (domain1 === domain2) return 1;

  // Subdomain match (e.g., blog.example.com and www.example.com)
  const extractMainDomain = (domain: string) => {
    const parts = domain.split(".");
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return domain;
  };

  const main1 = extractMainDomain(domain1);
  const main2 = extractMainDomain(domain2);

  return main1 === main2 ? 0.7 : 0;
}

/**
 * Calculate recency score (newer content scores higher)
 */
function calculateRecencyScore(date?: Date): number {
  if (!date) return 0.5; // Neutral score for undated content

  const now = new Date();
  const ageInDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

  // Scoring curve: content from today = 1.0, older content gradually decreases
  if (ageInDays <= 0) return 1;
  if (ageInDays <= 7) return 0.95;
  if (ageInDays <= 30) return 0.85;
  if (ageInDays <= 90) return 0.7;
  if (ageInDays <= 180) return 0.5;
  if (ageInDays <= 365) return 0.3;
  return 0.1; // Very old content
}

/**
 * Calculate overall similarity score between two pieces of content
 */
export function calculateSimilarity(
  source: NormalizedContent,
  target: NormalizedContent,
  weights?: Partial<SimilarityWeights>,
): { total: number; breakdown: Record<keyof SimilarityWeights, number> } {
  // Don't compare content to itself
  if (source.type === target.type && source.id === target.id) {
    return {
      total: 0,
      breakdown: {
        tagMatch: 0,
        textSimilarity: 0,
        domainMatch: 0,
        recency: 0,
      },
    };
  }

  // Determine if this is cross-content comparison
  const isCrossContent = source.type !== target.type;

  // Use appropriate base weights and merge any overrides
  const base = isCrossContent ? CROSS_TYPE_WEIGHTS : SAME_TYPE_WEIGHTS;
  const activeWeights: SimilarityWeights = { ...base, ...(weights ?? {}) } as SimilarityWeights;

  // Calculate exact tag similarity
  const exactTagScore = calculateTagSimilarity(source.tags, target.tags);

  // Calculate semantic tag similarity (only for cross-content)
  const semanticTagScore = isCrossContent ? calculateSemanticTagSimilarity(source.tags, target.tags) : 0;

  // Use the better of exact or semantic matching
  const tagScore = Math.max(exactTagScore, semanticTagScore);

  // Calculate individual scores
  const scores = {
    tagMatch: tagScore,
    textSimilarity: calculateTextSimilarity(`${source.title} ${source.text}`, `${target.title} ${target.text}`),
    domainMatch: calculateDomainSimilarity(source.domain, target.domain),
    recency: calculateRecencyScore(target.date),
  };

  // Calculate base weighted total
  let total = Object.entries(scores).reduce(
    (sum, [key, score]) => sum + score * activeWeights[key as keyof SimilarityWeights],
    0,
  );

  // Add semantic bonus for cross-content with good matches
  if (isCrossContent) {
    // Add 15% bonus if we have semantic tag matches
    if (semanticTagScore > 0.3) {
      total += 0.15 * semanticTagScore;
    }

    // Add bonus for specific cross-content relationships
    if (
      (source.type === "blog" && target.type === "investment") ||
      (source.type === "investment" && target.type === "blog")
    ) {
      // Check for venture/investment context
      const sourceText = `${source.title} ${source.text}`.toLowerCase();
      const targetText = `${target.title} ${target.text}`.toLowerCase();

      const hasContext = hasInvestmentContext(sourceText) || hasInvestmentContext(targetText);
      if (hasContext) {
        total += 0.1;
      }
    }

    if (
      (source.type === "bookmark" && target.type === "project") ||
      (source.type === "project" && target.type === "bookmark")
    ) {
      // Boost for technical content matches
      if (scores.textSimilarity > 0.3) {
        total += 0.05;
      }
    }
  } else {
    // Same type comparison - apply small boost
    total *= 1.05;
  }

  // Ensure total is between 0 and 1
  const normalizedTotal = Math.min(1, Math.max(0, total));

  return {
    total: normalizedTotal,
    breakdown: scores,
  };
}

/**
 * Find the most similar content from a list
 */
export function findMostSimilar(
  source: NormalizedContent,
  candidates: NormalizedContent[],
  limit: number = 10,
  weights?: Partial<SimilarityWeights>,
): Array<NormalizedContent & { score: number; breakdown: Record<keyof SimilarityWeights, number> }> {
  // Calculate similarity for all candidates
  const scored = candidates
    .map(candidate => {
      // Determine if this is cross-type comparison
      const isCrossType = source.type !== candidate.type;
      // Use appropriate weights: custom weights if provided, otherwise cross-type or same-type defaults
      const baseWeights = isCrossType ? CROSS_TYPE_WEIGHTS : SAME_TYPE_WEIGHTS;
      const finalWeights = weights ? { ...baseWeights, ...weights } : baseWeights;

      const { total, breakdown } = calculateSimilarity(source, candidate, finalWeights);
      return {
        ...candidate,
        score: total,
        breakdown,
      };
    })
    .filter(item => item.score > 0) // Filter out zero scores
    .sort((a, b) => b.score - a.score) // Sort by score descending
    .slice(0, limit); // Limit results

  return scored;
}

/**
 * Group similar content by type
 */
export function groupByType<T extends NormalizedContent & { score: number }>(
  items: T[],
): Partial<Record<RelatedContentType, T[]>> {
  const grouped: Partial<Record<RelatedContentType, T[]>> = {};

  for (const item of items) {
    const type = item.type;
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(item);
  }

  return grouped;
}

/**
 * Limit scored items by per-type cap then global cap, preserving highest scores.
 * - Groups by `type`, sorts each group by `score` desc, slices to `maxPerType`
 * - Flattens, sorts globally by `score` desc, slices to `maxTotal`
 * - Optional `tiebreak` to provide stable ordering for equal scores (e.g., by id)
 */
export function limitByTypeAndTotal<T extends { type: RelatedContentType; score: number }>(
  items: readonly T[],
  maxPerType: number,
  maxTotal: number,
  tiebreak?: (a: T, b: T) => number,
): T[] {
  const safePerType = Math.max(0, maxPerType);
  const safeTotal = Math.max(0, maxTotal);

  const grouped = items.reduce(
    (acc, item) => {
      (acc[item.type] ||= []).push(item);
      return acc;
    },
    {} as Partial<Record<RelatedContentType, T[]>>,
  );

  const cmp = (a: T, b: T) => {
    const d = b.score - a.score;
    return d !== 0 ? d : tiebreak ? tiebreak(a, b) : 0;
  };

  const perTypeLimited = Object.values(grouped)
    .filter((arr): arr is T[] => Array.isArray(arr))
    .flatMap(typeItems => typeItems.sort(cmp).slice(0, safePerType));

  return perTypeLimited.sort(cmp).slice(0, safeTotal);
}
