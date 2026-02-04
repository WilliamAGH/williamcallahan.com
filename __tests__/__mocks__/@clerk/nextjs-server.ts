/**
 * Mock for @clerk/nextjs/server
 * Provides stub implementations for Clerk server-side auth utilities
 *
 * This is separate from the client mock (@clerk/nextjs.ts) because server
 * imports need middleware and route matcher utilities that don't exist
 * in the client bundle.
 */
import { vi } from "vitest";

interface RequestLike {
  nextUrl?: { pathname?: string };
  url?: string;
}

// Mock clerkMiddleware - returns a pass-through middleware
export const clerkMiddleware = vi.fn(() => {
  // Return a middleware function that just calls next()
  return vi.fn((_request: unknown) => {
    // In tests, we simulate the middleware passing through
    return { status: 200 };
  });
});

// Mock createRouteMatcher - returns a function that matches routes
export const createRouteMatcher = vi.fn((patterns: string[]) => {
  // Return a matcher function that checks if a path matches the patterns
  return vi.fn((request: RequestLike) => {
    const path = request?.nextUrl?.pathname || request?.url || "";
    if (!Array.isArray(patterns)) return false;
    return patterns.some((pattern) => {
      if (typeof pattern === "string") {
        // Simple string matching (supports basic patterns)
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        return regex.test(path);
      }
      return false;
    });
  });
});

// Mock auth() - returns auth state for server components
export const auth = vi.fn(() => ({
  userId: null,
  sessionId: null,
  sessionClaims: null,
  getToken: vi.fn().mockResolvedValue(null),
  protect: vi.fn(),
}));

// Mock currentUser() - returns null (no user in tests by default)
export const currentUser = vi.fn().mockResolvedValue(null);

// Default export for CommonJS compatibility
export default {
  clerkMiddleware,
  createRouteMatcher,
  auth,
  currentUser,
};
