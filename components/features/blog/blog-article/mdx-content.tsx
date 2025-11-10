/**
 * @file mdx-content.tsx - Server component wrapper for MDX content rendering.
 */

import type { JSX } from "react";
import { MDXContent as MDXContentClient } from "./mdx-content.client";
import type { MDXContentProps } from "@/types/features/blog";

/**
 * Passes serialized MDX content to the client renderer.
 *
 * @param props - MDXContentProps
 * @returns JSX.Element - The client MDX content
 */
export function MDXContent({ content }: MDXContentProps): JSX.Element {
  return <MDXContentClient content={content} />;
}

export default MDXContent;
