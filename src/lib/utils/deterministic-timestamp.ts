/**
 * Deterministic timestamp helper
 * @module lib/utils/deterministic-timestamp
 *
 * Provides a monotonic, deterministic timestamp for use in cache expiration and
 * build-time safe date formatting. This must remain client-safe and MUST NOT
 * import server-only modules (e.g., lib/server-cache).
 */

import { FIXED_BUILD_TIMESTAMP, getMonotonicTime } from "@/lib/utils";

const isProductionBuildPhase = (): boolean => process.env.NEXT_PHASE === "phase-production-build";

// Capture once at module evaluation to keep build output deterministic.
const buildPhaseTimestamp = isProductionBuildPhase() ? getMonotonicTime() : undefined;

export const getDeterministicTimestamp = (): number => {
  if (isProductionBuildPhase()) {
    return buildPhaseTimestamp ?? FIXED_BUILD_TIMESTAMP;
  }
  return getMonotonicTime();
};
