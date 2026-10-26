# Bookmark SEO Graduation

**Functionality:** `bookmark-seo`

## Indexing model

Raw saved links are useful navigation, not automatically original search results.
Bookmark details default to `noindex, follow`: crawlers can follow resource links
without indexing a page that only repeats publisher metadata. Thin topic hubs,
aliases, and paginated tag pages retain the same exclusion.

Graduation admits two kinds of substantive pages:

| Page                            | Required gates                                                                                                                                         | Search presentation                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Practitioner-annotated bookmark | Trimmed note has at least 100 characters and 15 words; combined note, summary, and description have at least 250 characters; source is not unavailable | `index, follow`, a Field Notes title, and a note-led description of at most 160 characters            |
| Canonical topic hub             | Canonical tag, page one, and at least 12 resources                                                                                                     | `index, follow`, resource and annotation counts, leading domains, and server-rendered topic synthesis |

A long summary or publisher description cannot compensate for a missing or short
practitioner note. A blocked recapture without a retrieved source body does not
graduate merely because an annotation remains. Source availability uses the
existing bookmark availability predicate, not a new request-time network probe.

`BookmarkTopicHubOverview` renders topic synthesis and a resource-comparison
`<table>` on the server. These give canonical page-one hubs useful comparative
content before hydration. Later pages remain crawlable navigation, not separate
indexable topic overviews, regardless of the tag's total resource count.

## Ownership and data boundaries

- `src/lib/seo/bookmark-seo-policy.ts` owns graduation thresholds, decisions,
  robots directives, and graduated metadata copy ([SS0a]). Page metadata and
  sitemap selection must agree with this policy rather than invent local gates.
- `src/lib/db/queries/bookmark-seo.ts` owns PostgreSQL selection of eligible
  bookmarks and canonical topic hubs ([DB0a]); no legacy JSON or S3 inventory
  substitutes for the database.
- `src/types/schemas/bookmark-seo.ts` validates boundary data with Zod ([TS1c]);
  `src/types/seo/bookmark-graduation.ts` owns the graduation type contracts.
- `src/components/features/bookmarks/bookmark-topic-hub-overview.tsx` owns the
  crawler-visible synthesis and comparison table, not the client bookmark grid.

## Segmented sitemap

`src/lib/sitemap/bookmark-collectors.ts` collects eligible canonical tag and
bookmark URLs for `/bookmarks-sitemap.xml`. Tag hubs use weekly change frequency;
bookmark details use monthly frequency. Content dates become sitemap `lastmod`
values; pagination URLs are not emitted.

The core `/sitemap.xml` remains separate. The bookmark Route Handler at
`src/app/bookmarks-sitemap.xml/route.ts` returns XML 1.0 in the sitemap namespace,
escapes XML values, and sends:

- `Content-Type: application/xml; charset=utf-8`
- `X-Robots-Tag: noindex`
- `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`

The header excludes the sitemap document itself, not its graduated URL entries.
Production collection failures propagate rather than publishing an empty
successful sitemap and hiding a database outage.

## Discovery and submission

Production `src/app/robots.ts` advertises both `/sitemap.xml` and
`/bookmarks-sitemap.xml`. Non-production robots rules disallow `/` and omit sitemap
discovery.

`scheduler/submit-sitemap.ts` submits both sitemap documents to Google Search
Console and supplies the graduated collector to IndexNow through
`submitToIndexNow`'s optional eighth argument, `extraSitemapEntriesLoader`.
IndexNow merges those entries with the core sitemap before applying its existing
recent-change window and announcement ledger. It submits changed page URLs, not
the sitemap document URLs. See [SEO architecture](seo.md) for scheduler timing
and ledger durability.

## Boundary coverage

- `__tests__/seo/bookmark-seo-policy.test.ts`: independent graduation gates and
  metadata copy returned by the policy.
- `__tests__/app/bookmarks-sitemap.test.ts`: canonical collector output, parsed XML,
  response headers, escaping, and production error propagation.
- `__tests__/app/metadata.integration.test.tsx`: bookmark metadata graduation and
  environment-specific robots discovery.
- `__tests__/scheduler/indexnow-submit.test.ts`: extra graduated URLs in the
  IndexNow POST payload alongside core sitemap URLs.
