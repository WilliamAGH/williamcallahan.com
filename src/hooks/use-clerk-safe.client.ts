/**
 * Safe Clerk Hook
 *
 * Provides a safe wrapper around useClerk that works when Clerk is not configured.
 * Returns no-op functions when Clerk is unavailable.
 */

"use client";

import { useClerk as useClerkOriginal } from "@clerk/nextjs";

/**
 * Check if Clerk is configured (publishable key available)
 */
const isClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * No-op Clerk interface for when Clerk is not configured.
 * Only includes methods actually used by the codebase.
 */
const noOpClerk = {
  signOut: () => {
    console.warn("[Clerk] signOut called but Clerk is not configured");
    return Promise.resolve();
  },
} as const;

/**
 * Safe version of useClerk that works when Clerk is not configured.
 * Returns no-op functions when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing.
 */
export function useClerkSafe() {
  // When Clerk is not configured, return no-op implementation
  // This avoids the "useClerk can only be used within ClerkProvider" error
  if (!isClerkConfigured) {
    return noOpClerk;
  }

  // Clerk is configured, use the real hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkOriginal();
}
