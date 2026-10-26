/**
 * API Route & Page Context Types
 *
 * SCOPE: Next.js API routes, page contexts, and route parameter types
 * USAGE: Use for API route handlers, page components, and dynamic route contexts
 * OVERLAP PREVENTION: Do NOT add general API response types here; use types/schemas/api.ts
 * DO NOT add business logic types - this is only for Next.js routing infrastructure
 *
 * @see types/schemas/api.ts for validated API response and request body contracts
 * @see types/[domain].ts for business logic types (bookmark, blog, etc.)
 */

// OpenGraph types are no longer needed for API context types

/**
 * Context for Twitter image dynamic routes ([...path])
 * @usage - API route handlers for twitter image generation
 * @route - /api/twitter-image/[...path]/route.ts
 */
export interface TwitterImageContext {
  params: Promise<{ path: string[] }>;
}

/**
 * Context for GitHub avatar API routes ([username])
 * @usage - API route handlers for GitHub avatar fetching
 * @route - /api/github-avatar/[username]/route.ts
 * @note - Params are Promise due to Next.js instrumentation
 */
export interface GitHubAvatarRouteParams {
  params: Promise<{ username: string }>;
}

/**
 * Context for individual bookmark page routes ([slug])
 * @usage - Page components for single bookmark display
 * @route - /bookmarks/[slug]/page.tsx
 * @note - Params are Promise due to Next.js instrumentation
 */
export interface BookmarkPageContext {
  params: Promise<{ slug: string }>;
}

/**
 * Context for domain-filtered bookmark redirect route ([domainSlug])
 * @usage - Route handler for domain-specific bookmark redirects
 * @route - /bookmarks/domain/[domainSlug]/route.ts
 * @note - Params are Promise due to Next.js instrumentation
 */
export interface DomainBookmarkContext {
  params: Promise<{ domainSlug: string }>;
}

/**
 * Context for the combined tag and paginated bookmarks page ([...slug])
 * @route - /bookmarks/tags/[...slug]/page.tsx
 * @note - The slug can contain the tag and pagination info
 */
export type BookmarkTagPageContext = {
  params: Promise<{
    slug: string[];
  }>;
};

/**
 * Error page props for Next.js error boundaries
 * @usage - Error page components (error.tsx files)
 * @scope - Next.js error boundary infrastructure only
 * @note - Contains Next.js-specific error digest for debugging
 */
export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Cache clear API is now simplified to only support cache clearing operations
