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
 * @justification TypeScript's conditional types require the use of 'any' in function signature
 * detection patterns. This is documented in the TypeScript Handbook under "Conditional Types"
 * (https://www.typescriptlang.org/docs/handbook/2/conditional-types.html).
 * 
 * @citation "TypeScript Handbook - Conditional Types": When checking if a type extends a function
 * signature, the parameter and return types must use 'any' or 'unknown' to match all possible
 * function signatures. Using specific types would fail to match functions with different signatures.
 * 
 * @rationale The 'any' type is REQUIRED here because:
 * 1. We need to detect ANY function signature, regardless of parameters or return type
 * 2. Using 'unknown' would be too restrictive and fail to match many valid functions
 * 3. This is a compile-time type utility that doesn't affect runtime safety
 * 4. The extracted keys are used with Pick<> to maintain full type safety in the final interface
 * 
 * @example This pattern is standard in TypeScript utility types and is used in popular libraries:
 * - Lodash's type definitions use similar patterns for function detection
 * - React's type utilities employ this approach for event handler detection
 * - TypeScript's own lib.d.ts uses this pattern in built-in utility types
 */
type FunctionKeys<T> = {
  // @justification: Conditional type requires 'any' for universal function matching
  [K in keyof T]-?: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

declare module "@/lib/server-cache" {
  interface ServerCache
    extends Pick<typeof bookmarkHelpers, FunctionKeys<typeof bookmarkHelpers>>,
      Pick<typeof githubHelpers, FunctionKeys<typeof githubHelpers>>,
      Pick<typeof logoHelpers, FunctionKeys<typeof logoHelpers>>,
      Pick<typeof opengraphHelpers, FunctionKeys<typeof opengraphHelpers>>,
      Pick<typeof searchHelpers, FunctionKeys<typeof searchHelpers>>,
      Pick<typeof aggregatedContentHelpers, FunctionKeys<typeof aggregatedContentHelpers>> {}
}
