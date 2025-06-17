/**
 * JSON-LD Script Component
 * @module components/seo/json-ld
 * @description
 * Renders JSON-LD structured data as a script tag in the document head.
 * This component ensures proper embedding of schema.org metadata following best practices.
 *
 * @see {@link "https://developers.google.com/search/docs/advanced/structured-data/intro-structured-data"} - Google Structured Data Guidelines
 * @see {@link "https://schema.org/"} - Schema.org Documentation
 */

// eslint-disable react/no-danger
import React, { type JSX } from "react";

interface JsonLdScriptProps {
  data: object;
}

export function JsonLdScript({ data }: JsonLdScriptProps): JSX.Element {
  /**
   * JSON-LD must be embedded using dangerouslySetInnerHTML to avoid issues
   * with the HTML parser prematurely closing the <script> tag when the JSON
   * happens to contain the `</script>` sequence. We also guard against `<!--`
   * which would start an HTML comment and break execution in some browsers.
   */
  const json = JSON.stringify(
    data,
    null,
    process.env.NODE_ENV === "development" ? 2 : 0,
  )
    // Escape closing script tags and HTML comment openers
    .replace(/<\/(script)/giu, "<\\/$1")
    .replace(/<!--/g, "<\\!--");

  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
