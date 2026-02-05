/**
 * RAG Inventory Pagination State Management
 *
 * Handles stateful pagination for inventory sections across conversation turns.
 * Uses server cache keyed by conversationId for cursor navigation.
 *
 * @module lib/ai/rag/inventory-pagination
 */

import "server-only";

import { ServerCacheInstance } from "@/lib/server-cache";
import type {
  InventoryPaginationMeta,
  InventoryPaginationState,
  InventorySectionName,
  SectionPaginationData,
} from "@/types/rag";
import { SECTION_LABELS } from "./inventory-format";

const PAGINATION_CACHE_PREFIX = "rag:pagination:";
const PAGINATION_CACHE_TTL_SECONDS = 30 * 60; // 30 minutes

/** Default page size for inventory sections */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Create updated state with a section's pagination data merged in.
 * Centralizes the nested spread pattern for DRY compliance.
 */
const withSectionUpdate = (
  state: InventoryPaginationState,
  section: InventorySectionName,
  data: SectionPaginationData,
  lastRequested?: InventorySectionName,
): InventoryPaginationState => ({
  ...state,
  sections: { ...state.sections, [section]: data },
  lastRequestedSection: lastRequested ?? state.lastRequestedSection,
  updatedAt: Date.now(),
});

/**
 * Get pagination state for a conversation from cache.
 */
export function getPaginationState(conversationId: string): InventoryPaginationState | null {
  const key = `${PAGINATION_CACHE_PREFIX}${conversationId}`;
  return ServerCacheInstance.get<InventoryPaginationState>(key) ?? null;
}

/**
 * Save pagination state for a conversation to cache.
 */
export function setPaginationState(conversationId: string, state: InventoryPaginationState): void {
  const key = `${PAGINATION_CACHE_PREFIX}${conversationId}`;
  ServerCacheInstance.set(key, { ...state, updatedAt: Date.now() }, PAGINATION_CACHE_TTL_SECONDS);
}

/**
 * Initialize or get existing pagination state for a conversation.
 */
export function getOrCreatePaginationState(conversationId: string): InventoryPaginationState {
  const existing = getPaginationState(conversationId);
  if (existing) return existing;

  const initial: InventoryPaginationState = {
    sections: {},
    updatedAt: Date.now(),
  };
  setPaginationState(conversationId, initial);
  return initial;
}

/**
 * Calculate pagination metadata for a section.
 */
export function calculatePaginationMeta(
  section: InventorySectionName,
  totalItems: number,
  page: number,
  pageSize: number,
): InventoryPaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (clampedPage - 1) * pageSize;
  const itemsOnPage = Math.min(pageSize, totalItems - startIndex);

  return {
    section,
    page: clampedPage,
    totalPages,
    totalItems,
    itemsOnPage,
    hasMore: clampedPage < totalPages,
  };
}

/**
 * Advance pagination to the next page for a section.
 * Returns the new page number (clamped to totalPages).
 */
export function advanceToNextPage(
  state: InventoryPaginationState,
  section: InventorySectionName,
): number {
  const sectionState = state.sections[section];
  if (!sectionState) return 1;

  const nextPage = Math.min(sectionState.currentPage + 1, sectionState.totalPages);
  return nextPage;
}

/**
 * Update pagination state after displaying a section page.
 */
export function updateSectionPaginationState(
  state: InventoryPaginationState,
  meta: InventoryPaginationMeta,
): InventoryPaginationState {
  return withSectionUpdate(
    state,
    meta.section,
    { currentPage: meta.page, totalPages: meta.totalPages, totalItems: meta.totalItems },
    meta.section,
  );
}

/**
 * Generate a human-readable pagination hint for the AI.
 */
export function generatePaginationHint(metas: InventoryPaginationMeta[]): string {
  if (metas.length === 0) return "";

  const hints = metas
    .filter((meta) => meta.totalPages > 1)
    .map((meta) => {
      const label = SECTION_LABELS[meta.section];
      const pageInfo = `page ${meta.page} of ${meta.totalPages}`;
      const itemsInfo = `showing ${meta.itemsOnPage} of ${meta.totalItems} items`;
      const moreHint = meta.hasMore ? " - say 'next' or 'more' for next page" : " - last page";
      return `[${label}] ${pageInfo} (${itemsInfo})${moreHint}`;
    });

  if (hints.length === 0) return "";

  return `\n=== PAGINATION STATUS ===\n${hints.join("\n")}\n`;
}

/**
 * Slice rows for a specific page.
 */
export function paginateRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const startIndex = (page - 1) * pageSize;
  return rows.slice(startIndex, startIndex + pageSize);
}

/**
 * Detect if a user message is requesting pagination (next page).
 */
export function isPaginationKeyword(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase().trim();
  const keywords = ["next", "more", "continue", "next page", "show more", "keep going"];
  return keywords.some((kw) => normalized.includes(kw));
}
