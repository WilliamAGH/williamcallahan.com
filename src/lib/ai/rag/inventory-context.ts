/**
 * RAG Inventory Context Builder
 *
 * Orchestrates static and dynamic inventory sections into
 * a single catalog for RAG prompt injection.
 *
 * @module lib/ai/rag/inventory-context
 */

import "server-only";

import { ServerCacheInstance } from "@/lib/server-cache";
import type { InventoryContextResult, InventorySectionName, InventoryStatus } from "@/types/rag";
import {
  buildSectionSummaries,
  formatInventoryText,
  resolveInventoryStatus,
  type SectionBuildResult,
} from "./inventory-format";
import { buildStaticInventorySections } from "./inventory-static";
import { buildDynamicInventorySections } from "./inventory-dynamic";

const INVENTORY_CACHE_KEY = "rag:inventory:catalog";
const INVENTORY_CACHE_TTL_SECONDS = 10 * 60;

type InventoryContextOptions = {
  maxTokens?: number;
  includeDynamic?: boolean;
  skipCache?: boolean;
};

const mergeFailedSections = (
  base: InventorySectionName[] | undefined,
  additions: InventorySectionName[],
): InventorySectionName[] | undefined => {
  const merged = new Set<InventorySectionName>(base ?? []);
  for (const item of additions) {
    merged.add(item);
  }
  return merged.size > 0 ? Array.from(merged) : undefined;
};

const collectSections = async (
  includeDynamic: boolean,
): Promise<{
  sections: SectionBuildResult[];
  failedSections: InventorySectionName[];
}> => {
  const {
    sections: staticSections,
    failedSections: staticFailures,
    blogPosts,
  } = await buildStaticInventorySections();

  const sections: SectionBuildResult[] = [...staticSections];
  let failedSections = [...staticFailures];

  if (includeDynamic) {
    const dynamic = await buildDynamicInventorySections({ blogPosts });
    sections.push(...dynamic.sections);
    failedSections = failedSections.concat(dynamic.failedSections);
  }

  return { sections, failedSections };
};

export async function buildInventoryContext(
  options: InventoryContextOptions = {},
): Promise<InventoryContextResult> {
  if (!options.skipCache) {
    const cached = ServerCacheInstance.get<InventoryContextResult>(INVENTORY_CACHE_KEY);
    if (cached) return cached;
  }

  const includeDynamic = options.includeDynamic ?? true;
  const { sections, failedSections } = await collectSections(includeDynamic);

  const { text, tokenEstimate, omittedSections } = formatInventoryText(sections, options.maxTokens);
  const status: InventoryStatus = resolveInventoryStatus(sections);

  const result: InventoryContextResult = {
    text,
    tokenEstimate,
    status,
    failedSections: failedSections.length > 0 ? failedSections : undefined,
    sections: buildSectionSummaries(sections),
  };

  if (omittedSections.length > 0) {
    result.failedSections = mergeFailedSections(result.failedSections, omittedSections);
  }

  if (!options.skipCache) {
    ServerCacheInstance.set(INVENTORY_CACHE_KEY, result, INVENTORY_CACHE_TTL_SECONDS);
  }

  return result;
}
