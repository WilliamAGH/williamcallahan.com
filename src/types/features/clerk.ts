/**
 * Clerk Integration Types
 * @module types/features/clerk
 * @description Type definitions for safe Clerk integration that works
 * when Clerk is not configured.
 */

/**
 * SignOut options - subset of Clerk's SignOutOptions
 * @see node_modules/@clerk/shared/dist/types/index.d.ts line 8071
 */
export interface SignOutOptions {
  /** Redirect URL to navigate to after sign out */
  redirectUrl?: string;
  /** Specific session ID to sign out (for multi-session apps) */
  sessionId?: string;
}

/**
 * Minimal Clerk interface for safe hook usage.
 * Contains only the methods actually used by this codebase.
 * This allows components to work identically whether Clerk is configured or not.
 */
export interface ClerkSafeInterface {
  signOut: (options?: SignOutOptions) => Promise<void>;
}
