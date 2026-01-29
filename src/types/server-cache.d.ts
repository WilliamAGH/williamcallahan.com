/**
 * @file types/server-cache.d.ts
 * @description Type declarations for extending the ServerCache class via mixins.
 * This uses declaration merging to add the domain-specific helper methods
 * to the ServerCache class type, providing full type safety and IntelliSense
 * for the singleton instance.
 */

import type * as bookmarkHelpers from "@/lib/server-cache/bookmarks";
import type * as githubHelpers from "@/lib/server-cache/github";
import type * as logoHelpers from "@/lib/server-cache/logo";
import type * as opengraphHelpers from "@/lib/server-cache/opengraph";
import type * as searchHelpers from "@/lib/server-cache/search";
import type * as aggregatedContentHelpers from "@/lib/server-cache/aggregated-content";

/**
 * Utility type to extract only function property keys from a type.
 *
 * Rationale:
 * - The previous implementation used `any` in the conditional type:
 *   `T[K] extends (...args: any[]) => any ? K : never`. That required a lengthy
 *   justification comment to satisfy strict linting rules. In this codebase,
 *   we avoid `any` entirely when a safer alternative exists.
 * - This version uses TypeScript's `infer` to capture parameter types and
 *   `unknown` for the return type: `(...args: infer _P) => unknown`. This
 *   matches "is callable" without broadening the surface to `any` and keeps
 *   the utility purely type-level with no runtime effect.
 *
 * Why `infer` + `unknown`:
 * - `infer` allows us to detect any function signature without committing to a
 *   specific parameter list, which is ideal for feature-detection patterns.
 * - `unknown` is preferred over `any` for return types because it maintains
 *   type safety—consumers must narrow or assert explicitly if they need to use
 *   a more specific type, aligning with repository standards.
 *
 * Integration points in this repo:
 * - This utility is consumed by the declaration merging for `ServerCache` in
 *   this file to pick only function members from helper modules, e.g.:
 *   `Pick<typeof bookmarkHelpers, FunctionKeys<typeof bookmarkHelpers>>`.
 * - At runtime (see `lib/server-cache.ts`), `attachHelpers` guards attachment
 *   with `typeof value === "function"` and narrows callables with
 *   `(...args: unknown[]) => unknown`. Together, the static and runtime layers
 *   ensure only callable members are attached, preventing prototype pollution
 *   and preserving type safety.
 *
 * Change history:
 * - 2025-08: Replaced `any`-based conditional with `infer _P` + `unknown` to
 *   eliminate `no-explicit-any` warnings while preserving behavior.
 *
 * Citations:
 * - TypeScript Handbook – Conditional Types
 *   https://www.typescriptlang.org/docs/handbook/2/conditional-types.html
 * - TypeScript Handbook – Generics (`infer`)
 *   https://www.typescriptlang.org/docs/handbook/2/generics.html#using-type-parameters-in-generic-constraints
 * - Declaration Merging
 *   https://www.typescriptlang.org/docs/handbook/declaration-merging.html
 */
type FunctionKeys<T> = {
  [K in keyof T]-?: T[K] extends (...args: infer _P) => unknown ? K : never;
}[keyof T];

/**
 * Utility type to remove the first argument from a function signature.
 * This is used to map the helper functions (which now take `cache: Cache` as first arg)
 * to instance methods (where `this` is implicit and not part of the call signature).
 */
type RemoveFirstArg<T> = T extends (first: any, ...args: infer A) => infer R
  ? (...args: A) => R
  : T;

/**
 * Transforms a module's exports into bound methods by removing the first argument.
 */
type BoundMethods<T> = {
  [K in FunctionKeys<T>]: RemoveFirstArg<T[K]>;
};

declare module "@/lib/server-cache" {
  interface ServerCache
    extends
      BoundMethods<typeof bookmarkHelpers>,
      BoundMethods<typeof githubHelpers>,
      BoundMethods<typeof logoHelpers>,
      BoundMethods<typeof opengraphHelpers>,
      BoundMethods<typeof aggregatedContentHelpers> {
    // Search helpers (generics preserved manually)
    getSearchResults<T = unknown>(
      dataType: string,
      query: string,
    ): import("@/types/cache").SearchCacheEntry<T> | undefined;
    setSearchResults<T>(dataType: string, query: string, results: T[]): void;
    shouldRefreshSearch(dataType: string, query: string): boolean;
    clearSearchCache(dataType?: string): void;
  }
}
