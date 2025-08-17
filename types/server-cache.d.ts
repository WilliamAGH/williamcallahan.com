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

type FunctionKeys<T> = {
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
