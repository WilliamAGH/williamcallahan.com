/**
 * Software Application Schema Component
 * @module components/features/blog/blog-article/software-schema
 * @description
 * A component that can be used in MDX blog posts to add SoftwareApplication schema.org metadata.
 * This helps with SEO for posts about software applications and extensions.
 *
 * @see {@link "https://schema.org/SoftwareApplication"} - Schema.org SoftwareApplication specification
 */

"use client";

import { kebabCase } from "@/lib/utils/formatters";
import { ensureAbsoluteUrl } from "../../../../lib/seo/utils";
import { JsonLdScript } from "../../../seo/json-ld";

import type { SoftwareScriptSchema, SoftwareSchemaProps } from "@/types/features/software";

/**
 * Component that renders Schema.org SoftwareApplication JSON-LD script
 * Can be used directly in MDX blog posts
 */
export function SoftwareSchema({
  name,
  description,
  operatingSystem = "Windows, macOS, Linux",
  applicationCategory = "DeveloperApplication",
  isFree = true,
  price,
  priceCurrency = "USD",
  ratingValue,
  ratingCount,
  downloadUrl,
  softwareVersion,
  screenshot,
  authorName,
  authorUrl,
  nonce,
}: SoftwareSchemaProps) {
  // Generate a suitable @id fragment
  const idFragment = kebabCase(name);

  const offers = isFree
    ? ({
        "@type": "Offer",
        price: 0.0,
        priceCurrency,
        availability: "https://schema.org/InStock",
      } as const)
    : price !== undefined
      ? ({
          "@type": "Offer",
          price,
          priceCurrency,
          availability: "https://schema.org/InStock",
        } as const)
      : undefined;

  const aggregateRating =
    ratingValue !== undefined && ratingCount !== undefined
      ? ({
          "@type": "AggregateRating",
          ratingValue,
          ratingCount,
          bestRating: 5,
          worstRating: 1,
        } as const)
      : undefined;

  const finalDownloadUrl = downloadUrl ? ensureAbsoluteUrl(downloadUrl) : undefined;

  const finalScreenshot = screenshot
    ? Array.isArray(screenshot)
      ? screenshot.map(url => ensureAbsoluteUrl(url))
      : ensureAbsoluteUrl(screenshot)
    : undefined;

  const author = authorName
    ? ({
        "@type": "Person",
        name: authorName,
        ...(authorUrl && { url: ensureAbsoluteUrl(authorUrl) }),
      } as const)
    : undefined;

  // Create base schema using the extended script type
  const schema: SoftwareScriptSchema = {
    "@context": "https://schema.org",
    "@id": `#${idFragment}`,
    "@type": "SoftwareApplication",
    name: name,
    description: description,
    ...(operatingSystem && { operatingSystem }),
    ...(applicationCategory && { applicationCategory }),
    ...(offers && { offers }),
    ...(aggregateRating && { aggregateRating }),
    ...(finalDownloadUrl && { downloadUrl: finalDownloadUrl }),
    ...(softwareVersion && { softwareVersion }),
    ...(finalScreenshot && { screenshot: finalScreenshot }),
    ...(author && { author }),
  };

  return <JsonLdScript data={schema} nonce={nonce} />;
}
