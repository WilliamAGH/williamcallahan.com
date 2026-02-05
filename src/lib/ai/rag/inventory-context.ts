/**
 * RAG Inventory Context Builder
 *
 * Orchestrates static and dynamic inventory sections into
 * a single catalog for RAG prompt injection. Supports server-side
 * pagination for large sections like investments.
 *
 * @module lib/ai/rag/inventory-context
 */

import "server-only";

import { ServerCacheInstance } from "@/lib/server-cache";
import type {
  BuildInventoryContextOptions,
  InventoryContextResult,
  InventoryPaginationMeta,
  InventoryPaginationState,
  InventorySectionBuildResult,
  InventorySectionName,
} from "@/types/rag";
import {
  buildSectionSummaries,
  formatInventoryText,
  resolveInventoryStatus,
} from "./inventory-format";
import { buildPaginatedInvestmentsSection, buildStaticInventorySections } from "./inventory-static";
import { buildDynamicInventorySections } from "./inventory-dynamic";
import {
  advanceToNextPage,
  DEFAULT_PAGE_SIZE,
  generatePaginationHint,
  getOrCreatePaginationState,
  setPaginationState,
  updateSectionPaginationState,
} from "./inventory-pagination";

const INVENTORY_CACHE_KEY = "rag:inventory:catalog";
const INVENTORY_CACHE_TTL_SECONDS = 10 * 60;

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
  sections: InventorySectionBuildResult[];
  failedSections: InventorySectionName[];
}> => {
  const {
    sections: staticSections,
    failedSections: staticFailures,
    blogPosts,
  } = await buildStaticInventorySections();

  const sections: InventorySectionBuildResult[] = [...staticSections];
  let failedSections = [...staticFailures];

  if (includeDynamic) {
    const dynamic = await buildDynamicInventorySections({ blogPosts });
    sections.push(...dynamic.sections);
    failedSections = failedSections.concat(dynamic.failedSections);
  }

  return { sections, failedSections };
};

/** Check if pagination should be enabled (explicit conversationId check per SM7) */
const shouldUsePagination = (conversationId: string | undefined): conversationId is string =>
  typeof conversationId === "string" && conversationId.length > 0;

/** Determine which page to show for investments based on state and request */
const resolveInvestmentsPage = (
  options: BuildInventoryContextOptions,
  paginationState: InventoryPaginationState,
  isPaginationRequest: boolean,
): number => {
  const explicitPage = options.pagination?.page;
  if (explicitPage !== undefined) return explicitPage;

  if (isPaginationRequest && paginationState.lastRequestedSection === "investments") {
    return advanceToNextPage(paginationState, "investments");
  }

  return paginationState.sections.investments?.currentPage ?? 1;
};

/** Build sections with paginated investments replacement */
const buildPaginatedSections = async (
  investmentsSection: InventorySectionBuildResult,
  includeDynamic: boolean,
): Promise<{ sections: InventorySectionBuildResult[]; failedSections: InventorySectionName[] }> => {
  const {
    sections: staticSections,
    failedSections: staticFailures,
    blogPosts,
  } = await buildStaticInventorySections();

  const sections = staticSections.map((s) => (s.name === "investments" ? investmentsSection : s));
  let failedSections = [...staticFailures];

  if (includeDynamic) {
    const dynamic = await buildDynamicInventorySections({ blogPosts });
    sections.push(...dynamic.sections);
    failedSections = failedSections.concat(dynamic.failedSections);
  }

  return { sections, failedSections };
};

/** Format sections into final result with pagination metadata */
const formatPaginatedResult = (
  sections: InventorySectionBuildResult[],
  failedSections: InventorySectionName[],
  paginationMeta: InventoryPaginationMeta,
  maxTokens: number | undefined,
): InventoryContextResult => {
  const paginationMetas = [paginationMeta];
  const paginationHint = generatePaginationHint(paginationMetas);
  const {
    text: baseText,
    tokenEstimate,
    omittedSections,
  } = formatInventoryText(sections, maxTokens);

  const result: InventoryContextResult = {
    text: baseText + paginationHint,
    tokenEstimate: tokenEstimate + Math.ceil(paginationHint.length / 4),
    status: resolveInventoryStatus(sections),
    failedSections: failedSections.length > 0 ? failedSections : undefined,
    sections: buildSectionSummaries(sections),
    pagination: paginationMetas,
    paginationHint,
  };

  if (omittedSections.length > 0) {
    result.failedSections = mergeFailedSections(result.failedSections, omittedSections);
  }

  return result;
};

/**
 * Build inventory context with optional pagination support.
 * When conversationId is provided, enables stateful pagination.
 */
export async function buildInventoryContext(
  options: BuildInventoryContextOptions = {},
): Promise<InventoryContextResult> {
  const { conversationId, isPaginationRequest } = options;

  if (shouldUsePagination(conversationId)) {
    return buildPaginatedInventoryContext(options, conversationId, isPaginationRequest ?? false);
  }

  return buildNonPaginatedInventoryContext(options);
}

/** Non-paginated inventory context (backward compatible) */
async function buildNonPaginatedInventoryContext(
  options: BuildInventoryContextOptions,
): Promise<InventoryContextResult> {
  if (!options.skipCache) {
    const cached = ServerCacheInstance.get<InventoryContextResult>(INVENTORY_CACHE_KEY);
    if (cached) return cached;
  }

  const { sections, failedSections } = await collectSections(options.includeDynamic ?? true);
  const { text, tokenEstimate, omittedSections } = formatInventoryText(sections, options.maxTokens);

  const result: InventoryContextResult = {
    text,
    tokenEstimate,
    status: resolveInventoryStatus(sections),
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

/** Paginated inventory context for conversation-based navigation */
async function buildPaginatedInventoryContext(
  options: BuildInventoryContextOptions,
  conversationId: string,
  isPaginationRequest: boolean,
): Promise<InventoryContextResult> {
  const pageSize = options.pagination?.pageSize ?? DEFAULT_PAGE_SIZE;
  let paginationState = getOrCreatePaginationState(conversationId);

  const investmentsPage = resolveInvestmentsPage(options, paginationState, isPaginationRequest);
  const { section, meta } = buildPaginatedInvestmentsSection({ page: investmentsPage, pageSize });

  paginationState = updateSectionPaginationState(paginationState, meta);
  setPaginationState(conversationId, paginationState);

  const { sections, failedSections } = await buildPaginatedSections(
    section,
    options.includeDynamic ?? true,
  );

  return formatPaginatedResult(sections, failedSections, meta, options.maxTokens);
}
