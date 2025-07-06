/**
 * OpenGraph Logo Meta Tag Component
 * @module components/seo/opengraph-logo
 * @description
 * Adds the og:logo meta tag to pages. This is not natively supported by Next.js metadata API,
 * so we need to add it as a custom meta tag.
 *
 * The og:logo property is part of the OpenGraph protocol but not widely implemented.
 * It's meant to represent the logo of the entity described by the page.
 *
 * @see {@link "https://ogp.me"} - OpenGraph protocol specification
 */

import { metadata } from "@/data/metadata";
import { DEFAULT_IMAGES } from "@/lib/constants/client";
import type { OpenGraphLogoProps } from "@/types";

/**
 * OpenGraph Logo Component
 * Renders the og:logo meta tag with the appropriate URL
 *
 * @param {OpenGraphLogoProps} props - Component props
 * @returns {JSX.Element} Meta tag for og:logo
 */
export function OpenGraphLogo({ logoUrl }: OpenGraphLogoProps = {}) {
  // Ensure absolute URL
  const baseUrl = metadata.site.url;
  const logo = logoUrl || DEFAULT_IMAGES.OPENGRAPH_LOGO;
  const absoluteLogoUrl = logo?.startsWith("http") ? logo : `${baseUrl}${logo}`;

  return <meta property="og:logo" content={absoluteLogoUrl} />;
}
