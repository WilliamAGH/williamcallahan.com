/**
 * Not-Found Entity Metadata
 * @module lib/seo/not-found-metadata
 * @description
 * Canonical metadata for dynamic routes whose entity lookup failed. Emits no
 * canonical URL (a nonexistent path must never self-canonicalize) and an
 * explicit noindex, reinforcing the `noindex` meta Next.js injects when
 * `notFound()` fires after the streamed shell has been sent.
 */

import type { Metadata } from "next";

export function getNotFoundMetadata(entityLabel: string): Metadata {
  return {
    title: `${entityLabel} Not Found`,
    description: `The requested ${entityLabel.toLowerCase()} could not be found.`,
    robots: { index: false, follow: false },
  };
}
