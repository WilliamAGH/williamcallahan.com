/**
 * OpenGraph cache context guards
 * @module data-access/opengraph-cache-context
 */

import { cacheContextGuards, isCliLikeCacheContext } from "@/lib/cache";

export const safeCacheLife = (...args: Parameters<typeof cacheContextGuards.cacheLife>): void => {
  cacheContextGuards.cacheLife(...args);
};

export const safeCacheTag = (...args: Parameters<typeof cacheContextGuards.cacheTag>): void => {
  cacheContextGuards.cacheTag(...args);
};

export const safeRevalidateTag = (
  ...args: Parameters<typeof cacheContextGuards.revalidateTag>
): void => {
  cacheContextGuards.revalidateTag(...args);
};

export const isCliLikeContext = isCliLikeCacheContext;
