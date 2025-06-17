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

/**
 * Default logo path - uses the same image as the profile image
 */
const DEFAULT_LOGO_PATH = "/images/william-callahan-san-francisco.png";

interface OpenGraphLogoProps {
  /** Custom logo URL - defaults to profile image */
  logoUrl?: string;
}

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
  const logo = logoUrl || DEFAULT_LOGO_PATH;
  const absoluteLogoUrl = logo.startsWith("http") ? logo : `${baseUrl}${logo}`;

  return <meta property="og:logo" content={absoluteLogoUrl} />;
}