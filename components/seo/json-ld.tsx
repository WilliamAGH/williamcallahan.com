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

import React from 'react';

interface JsonLdScriptProps {
  data: object;
}

export function JsonLdScript({ data }: JsonLdScriptProps): JSX.Element {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data, null, process.env.NODE_ENV === 'development' ? 2 : 0)
      }}
    />
  );
}
