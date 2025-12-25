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
 * No-op Clerk interface for when Clerk is not configured
 */
const noOpClerk = {
  signOut: async () => {
    console.warn("[Clerk] signOut called but Clerk is not configured");
  },
  openSignIn: () => {
    console.warn("[Clerk] openSignIn called but Clerk is not configured");
  },
  openSignUp: () => {
    console.warn("[Clerk] openSignUp called but Clerk is not configured");
  },
  openUserProfile: () => {
    console.warn("[Clerk] openUserProfile called but Clerk is not configured");
  },
  session: null,
  user: null,
  loaded: true,
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
