/**
 * Blog Tag Page
 * @module app/blog/tags/[tag]/page
 * @description
 * Displays blog posts filtered by tag with proper SEO metadata.
 */

import { Blog } from "@/components/features/blog/blog";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { JsonLdScript } from "@/components/seo/json-ld";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import type { Metadata } from "next";

interface Props {
  params: {
    tag: string;
  };
}

/**
 * Generate metadata for the tag page
 */
export function generateMetadata({ params }: Props): Metadata {
  const tag = decodeURIComponent(params.tag);
  const title = `${tag} - Blog - William Callahan`;
  const description = `Articles tagged with ${tag} - Read about ${tag} and related topics.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  };
}

/**
 * Blog tag page component
 */
export default function BlogTagPage({ params }: Props) {
  const tag = decodeURIComponent(params.tag);
  const pageMetadata = PAGE_METADATA.blog;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": `${tag} - Blog Posts`,
          "description": `Articles tagged with ${tag}`,
          "datePublished": formattedCreated,
          "dateModified": formattedModified,
        }}
      />
      <Blog tag={tag} />
    </>
  );
}
