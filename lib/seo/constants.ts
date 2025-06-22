/**
 * SEO Constants
 * @module lib/seo/constants
 * @description
 * Centralized constants for SEO-related functionality.
 */

/**
 * SEO date field constants following current web standards
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article dates
 * @see {@link "https://schema.org/ProfilePage"} - Schema.org ProfilePage
 * @see {@link "https://schema.org/Article"} - Schema.org Article
 * @see {@link "https://developers.google.com/search/docs/appearance/publication-dates"} - Schema.org Person
 */
export const SEO_DATE_FIELDS = {
  // OpenGraph article dates (primary standard for social sharing)
  openGraph: {
    published: "article:published_time",
    modified: "article:modified_time",
  },
  // Standard HTML meta dates
  meta: {
    published: "date",
    modified: "last-modified",
  },
  // Schema.org dates for JSON-LD structured data
  jsonLd: {
    context: "https://schema.org",
    dateFields: {
      created: "dateCreated",
      published: "datePublished",
      modified: "dateModified",
    },
    types: {
      profile: "ProfilePage",
      article: "Article",
      person: "Person",
      collection: "CollectionPage",
    },
  },
  // Optional Dublin Core dates (legacy support)
  dublinCore: {
    created: "DC.date.created",
    modified: "DC.date.modified",
    issued: "DC.date.issued",
  },
} as const;
