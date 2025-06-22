/**
 * Types for Jina AI related services.
 *
 * @module types/jina
 */

export interface JinaLimiterState {
  count: number;
  windowStartTimestamp: number;
}

export function isJinaLimiterState(value: unknown): value is JinaLimiterState {
  return (
    typeof value === "object" &&
    value !== null &&
    "count" in value &&
    typeof value.count === "number" &&
    "windowStartTimestamp" in value &&
    typeof value.windowStartTimestamp === "number"
  );
}
