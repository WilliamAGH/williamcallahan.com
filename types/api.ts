/**
 * API Route & Page Context Types
 *
 * SCOPE: Next.js API routes, page contexts, and route parameter types
 * USAGE: Use for API route handlers, page components, and dynamic route contexts
 * OVERLAP PREVENTION: Do NOT add general API response types here - use response-types.ts
 * DO NOT add business logic types - this is only for Next.js routing infrastructure
 *
 * @see types/response-types.ts for API response/request body types
 * @see types/[domain].ts for business logic types (bookmark, blog, etc.)
 */

// OpenGraph types are no longer needed for API context types

/**
 * Context for Twitter image dynamic routes ([...path])
 * @usage - API route handlers for twitter image generation
 * @route - /api/twitter-image/[...path]/route.ts
 */
export interface TwitterImageContext {
  params: { path: string[] };
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
 * Context for domain-filtered bookmark routes ([domainSlug])
 * @usage - Page components for domain-specific bookmark listings
 * @route - /bookmarks/domain/[domainSlug]/page.tsx
 * @note - Params are Promise due to Next.js instrumentation
 */
export interface DomainBookmarkContext {
  params: Promise<{ domainSlug: string }>;
}

/**
 * Context for paginated bookmark routes ([pageNumber])
 * @usage - Page components for bookmark pagination
 * @route - /bookmarks/page/[pageNumber]/page.tsx
 * @note - Params are Promise due to Next.js instrumentation
 */
export interface PaginatedBookmarkContext {
  params: Promise<{ pageNumber: string }>;
}

/**
 * Context for the combined tag and paginated bookmarks page ([...slug])
 * @route - /bookmarks/tags/[...slug]/page.tsx
 * @note - The slug can contain the tag and pagination info
 */
export type BookmarkTagPageContext = {
  params: {
    slug: string[];
  };
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

/**
 * Domain page redirector props with search params
 * @usage - Domain bookmark redirector page that handles search params
 * @route - /bookmarks/domain/[domainSlug]/page.tsx
 * @note - Extends domain context with additional search functionality
 */
export interface DomainPageRedirectorProps extends DomainBookmarkContext {
  searchParams: { id?: string | string[] };
}

/**
 * API error response structure
 * @usage - Standard error response from API endpoints
 */
export interface ErrorResponse {
  error: string | null;
}

/**
 * Refresh operation result
 * @usage - Response from refresh API endpoints
 */
export interface RefreshResult {
  status: string;
  message?: string;
}

/**
 * Google Indexing API URL notification payload
 * @usage - Request payload for Google Indexing API submissions
 */
export interface UrlNotification {
  url: string;
  type: "URL_UPDATED" | "URL_DELETED";
}

/**
 * Google Indexing API response structure
 * @usage - Response from Google Indexing API endpoint
 */
export interface IndexingApiResponse {
  urlNotificationMetadata?: {
    url: string;
    latestUpdate: {
      type: "URL_UPDATED" | "URL_DELETED";
      notifyTime: string;
    };
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// Cache clear API is now simplified to only support cache clearing operations
