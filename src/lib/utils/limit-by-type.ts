/**
 * Limit scored items by per-type cap then global cap, preserving highest scores.
 *
 * @module lib/utils/limit-by-type
 */

import type { RelatedContentType } from "@/types/related-content";

/**
 * Groups items by `type`, sorts each group by `score` desc, slices to `maxPerType`,
 * flattens, sorts globally by `score` desc, slices to `maxTotal`.
 * Optional `tiebreak` provides stable ordering for equal scores.
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
    .flatMap((typeItems) => typeItems.toSorted(cmp).slice(0, safePerType));

  return perTypeLimited.toSorted(cmp).slice(0, safeTotal);
}
