/**
 * Mock for @clerk/nextjs/server
 * Provides stub implementations for Clerk server-side auth utilities
 *
 * This is separate from the client mock (@clerk/nextjs.js) because server
 * imports need middleware and route matcher utilities that don't exist
 * in the client bundle.
 */

// Mock clerkMiddleware - returns a pass-through middleware
const clerkMiddleware = jest.fn(() => {
  // Return a middleware function that just calls next()
  return jest.fn((_request) => {
    // In tests, we simulate the middleware passing through
    return { status: 200 };
  });
});

// Mock createRouteMatcher - returns a function that matches routes
const createRouteMatcher = jest.fn((patterns) => {
  // Return a matcher function that checks if a path matches the patterns
  return jest.fn((request) => {
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
const auth = jest.fn(() => ({
  userId: null,
  sessionId: null,
  sessionClaims: null,
  getToken: jest.fn().mockResolvedValue(null),
  protect: jest.fn(),
}));

// Mock currentUser() - returns null (no user in tests by default)
const currentUser = jest.fn().mockResolvedValue(null);

module.exports = {
  clerkMiddleware,
  createRouteMatcher,
  auth,
  currentUser,
};
