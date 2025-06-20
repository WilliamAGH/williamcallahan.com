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

declare module "@/lib/server-cache" {
  interface ServerCache
    extends Pick<typeof bookmarkHelpers, keyof typeof bookmarkHelpers>,
      Pick<typeof githubHelpers, keyof typeof githubHelpers>,
      Pick<typeof logoHelpers, keyof typeof logoHelpers>,
      Pick<typeof opengraphHelpers, keyof typeof opengraphHelpers>,
      Pick<typeof searchHelpers, keyof typeof searchHelpers> {}
}
