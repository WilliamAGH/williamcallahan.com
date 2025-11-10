/**
 * @file mdx-content.tsx - Server component wrapper for MDX content rendering.
 * This component reads the CSP nonce from request headers and passes it to the client component.
 */

import type { JSX } from "react";
import { headers } from "next/headers";
import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import { MDXContent as MDXContentClient } from "./mdx-content.client";
import type { MDXContentProps } from "@/types/features/blog";

const shouldReadCspNonce =
  process.env.NODE_ENV === "production" ||
  process.env.DEBUG_CSP === "true" ||
  process.env.DEBUG === "true" ||
  process.env.VERBOSE === "true";

const shouldLogCspWarnings =
  process.env.DEBUG_CSP === "true" || process.env.DEBUG === "true" || process.env.VERBOSE === "true";

/**
 * Server component wrapper that provides CSP nonce to the client MDX renderer.
 * This component must be a Server Component to access headers().
 *
 * @param props - MDXContentProps without nonce (nonce is injected server-side)
 * @returns JSX.Element - The client MDX content with nonce prop
 */
export async function MDXContent({ content }: Omit<MDXContentProps, "nonce">): Promise<JSX.Element> {
  // Read CSP nonce from middleware-injected header
  let nonce: string | undefined;
  if (shouldReadCspNonce) {
    try {
      const headersList: ReadonlyHeaders = await headers();
      const nonceValue: unknown = headersList.get("x-nonce");
      if (typeof nonceValue === "string") {
        nonce = nonceValue;
      }
    } catch (error: unknown) {
      if (shouldLogCspWarnings) {
        const warningMessage = error instanceof Error ? error.message : String(error);
        console.warn("Failed to read headers for CSP nonce:", warningMessage);
      }
      nonce = undefined;
    }
  }

  return <MDXContentClient content={content} nonce={nonce} />;
}

export default MDXContent;
