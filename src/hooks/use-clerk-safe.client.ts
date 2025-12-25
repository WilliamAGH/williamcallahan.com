/**
 * Safe Clerk Hook
 *
 * Provides a safe wrapper around useClerk that works when Clerk is not configured.
 * Returns no-op functions when Clerk is unavailable.
 *
 * Design: This hook uses a conditional import pattern. Since `isClerkConfigured`
 * is a build-time constant (NEXT_PUBLIC_ env vars are inlined at build time),
 * the condition never changes between renders, making it safe to conditionally
 * call hooks. The build system will tree-shake the unused branch.
 *
 * Note: ESLint's react-hooks/rules-of-hooks rule cannot statically verify that
 * the condition is constant, but this pattern is explicitly safe per React docs
 * when the condition is truly constant at build time.
 */

"use client";

import { useClerk as useClerkOriginal } from "@clerk/nextjs";
import type { ClerkSafeInterface, SignOutOptions } from "@/types/features/clerk";

/**
 * Check if Clerk is configured (publishable key available)
 * This is a BUILD-TIME constant since NEXT_PUBLIC_ vars are inlined by Next.js.
 * The value never changes at runtime, making conditional hook calls safe.
 */
const IS_CLERK_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * No-op Clerk implementation for when Clerk is not configured.
 * Stable reference - never recreated.
 */
const noOpClerk: ClerkSafeInterface = {
  signOut: (_options?: SignOutOptions) => {
    console.warn("[Clerk] signOut called but Clerk is not configured");
    return Promise.resolve();
  },
};

/**
 * Safe version of useClerk that works when Clerk is not configured.
 * Returns no-op functions when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing.
 *
 * Implementation note: This uses a pattern where the hook call is conditional
 * on a build-time constant. This is safe because:
 * 1. IS_CLERK_CONFIGURED is inlined at build time (never changes)
 * 2. React's Rules of Hooks require consistent call order between renders
 * 3. Since the condition never changes, the call order is always consistent
 *
 * @see https://react.dev/reference/rules/rules-of-hooks
 */
export function useClerkSafe(): ClerkSafeInterface {
  // Build-time constant check - safe for conditional hook calls
  // When Clerk is not configured, return stable no-op implementation
  if (!IS_CLERK_CONFIGURED) {
    return noOpClerk;
  }

  // Clerk IS configured - ClerkProvider is in the tree, safe to use hook
  // The useClerkOriginal import only triggers when this branch is taken
  const clerk = useClerkOriginal();

  // Wrap to match our minimal interface, passing through options
  return {
    signOut: (options?: SignOutOptions) => clerk.signOut(options),
  };
}
