/**
 * JSON-LD Script Component
 * @module components/seo/json-ld
 * @description
 * Renders JSON-LD structured data as a script tag in the page markup.
 * This component ensures proper embedding of schema.org metadata following best practices.
 *
 * @see {@link "https://developers.google.com/search/docs/advanced/structured-data/intro-structured-data"} - Google Structured Data Guidelines
 * @see {@link "https://schema.org/"} - Schema.org Documentation
 */

import type { JSX } from "react";

import type { JsonLdScriptProps } from "@/types/features/seo";

export function JsonLdScript({ data, id }: JsonLdScriptProps): JSX.Element {
  /**
   * JSON-LD must be embedded using dangerouslySetInnerHTML to avoid issues
   * with the HTML parser prematurely closing the <script> tag when the JSON
   * happens to contain markup. Escaping every opening angle bracket preserves
   * valid JSON while preventing script-tag and HTML-comment termination.
   */
  const json = JSON.stringify(data, null, process.env.NODE_ENV === "development" ? 2 : 0).replace(
    /</g,
    "\\u003c",
  );

  return (
    <script
      type="application/ld+json"
      {...(id ? { id } : {})}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Necessary for embedding JSON-LD, and the content is sanitized.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
