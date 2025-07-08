/**
 * @file mdx-content.tsx - Server component wrapper for MDX content rendering.
 * This component reads the CSP nonce from request headers and passes it to the client component.
 */

import type { JSX } from "react";
import { headers } from "next/headers";
import { MDXContent as MDXContentClient } from "./mdx-content.client";
import type { MDXContentProps } from "@/types/features/blog";

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
  try {
    const headersList = await headers();
    const nonceValue: unknown = headersList.get("x-nonce");
    if (typeof nonceValue === "string") {
      nonce = nonceValue;
    }
  } catch (error: unknown) {
    // headers() may fail in certain contexts (e.g., static generation)
    console.warn("Failed to read headers for CSP nonce:", error instanceof Error ? error.message : String(error));
    nonce = undefined;
  }

  return <MDXContentClient content={content} nonce={nonce} />;
}

export default MDXContent;
