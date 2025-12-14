/**
 * Base SEO Type Definitions
 * @module types/seo/base
 * @description
 * Core base types used across SEO modules to avoid circular dependencies.
 */

import type { Metadata } from "next";

/**
 * Next.js metadata with script support
 * Extends the base Metadata type to include script field
 */
export interface ExtendedMetadata extends Metadata {
  script?: Array<{
    type: string;
    text: string;
  }>;
}
