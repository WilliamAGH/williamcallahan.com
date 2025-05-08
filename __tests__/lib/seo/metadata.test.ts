/**
 * SEO Metadata Tests
 * @jest-environment node
 */

import { createArticleMetadata, getStaticPageMetadata } from '../../../lib/seo/metadata';
import { SEO_DATE_FIELDS } from '../../../lib/seo/constants';
// Remove unused imports - commented out rather than deleted to maintain line numbers
// import { metadata as siteMetadata, SITE_NAME, PAGE_METADATA } from '../../../data/metadata';
import { isPacificDateString, type ArticleOpenGraph, type ProfileOpenGraph } from '../../../types/seo';
// import type { Metadata } from 'next';
import { describe, it, expect } from 'bun:test';

// Mock process.env for tests
process.env.NEXT_PUBLIC_SITE_URL = 'https://williamcallahan.com';

describe('SEO Metadata', () => {
  describe('createArticleMetadata', () => {
    const mockArticleParams = {
      title: 'Test Article',
      description: 'Test Description',
      url: 'https://williamcallahan.com/blog/test-article',
      datePublished: '2025-01-01T12:00:00',
      dateModified: '2025-01-02T15:30:00',
      tags: ['test', 'article'],
    };

    it('should generate complete article metadata with proper date formats', () => {
      const metadata = createArticleMetadata(mockArticleParams);

      // Verify OpenGraph dates (article type should have these)
      expect(metadata.openGraph?.article?.publishedTime).toBeDefined();
      expect(metadata.openGraph?.article?.modifiedTime).toBeDefined();
      expect(isPacificDateString(metadata.openGraph?.article?.publishedTime)).toBe(true);
      expect(isPacificDateString(metadata.openGraph?.article?.modifiedTime)).toBe(true);

      // Verify HTML meta dates
      const publishedDate = metadata.other?.[SEO_DATE_FIELDS.meta.published];
      const modifiedDate = metadata.other?.[SEO_DATE_FIELDS.meta.modified];
      expect(publishedDate).toBeDefined();
      expect(modifiedDate).toBeDefined();
      expect(typeof publishedDate === 'string' && isPacificDateString(publishedDate)).toBe(true);
      expect(typeof modifiedDate === 'string' && isPacificDateString(modifiedDate)).toBe(true);
    });

    it('should maintain consistent dates across all formats', () => {
      const metadata = createArticleMetadata(mockArticleParams);

      // Get all date representations
      const dates = {
        og: {
          published: metadata.openGraph?.article?.publishedTime,
          modified: metadata.openGraph?.article?.modifiedTime,
        },
        meta: {
          published: metadata.other?.[SEO_DATE_FIELDS.meta.published],
          modified: metadata.other?.[SEO_DATE_FIELDS.meta.modified],
        },
      };

      // Verify all published dates match and are consistent
      expect(dates.og.published).toBeDefined();
      expect(dates.meta.published).toBeDefined();
      if (dates.og.published && dates.meta.published) {
        expect(dates.og.published).toBe(dates.meta.published);
      }

      // Verify all modified dates match and are consistent
      expect(dates.og.modified).toBeDefined();
      expect(dates.meta.modified).toBeDefined();
      if (dates.og.modified && dates.meta.modified) {
        expect(dates.og.modified).toBe(dates.meta.modified);
      }
    });

    it('should handle standard time dates (PST)', () => {
      const metadata = createArticleMetadata({
        ...mockArticleParams,
        datePublished: '2025-01-01T12:00:00', // January = PST
      });

      // Check all date fields end with -08:00
      expect(metadata.openGraph?.article?.publishedTime).toMatch(/-08:00$/);
      const publishedDate = metadata.other?.[SEO_DATE_FIELDS.meta.published];
      expect(typeof publishedDate === 'string' && publishedDate).toMatch(/-08:00$/);
    });

    it('should handle daylight savings dates (PDT)', () => {
      const metadata = createArticleMetadata({
        ...mockArticleParams,
        datePublished: '2025-07-01T12:00:00', // July = PDT
      });

      // Check all date fields end with -07:00
      expect(metadata.openGraph?.article?.publishedTime).toMatch(/-07:00$/);
      const publishedDate = metadata.other?.[SEO_DATE_FIELDS.meta.published];
      expect(typeof publishedDate === 'string' && publishedDate).toMatch(/-07:00$/);
    });

    it('should include required article metadata fields', () => {
      const metadata = createArticleMetadata(mockArticleParams);

      // Verify OpenGraph article fields exist
      expect(metadata.openGraph?.type).toBe('article');
      expect(metadata.openGraph?.article?.section).toBeDefined();
      expect(typeof metadata.openGraph?.article?.section).toBe('string');

      // Verify title exists
      expect(metadata.title).toBeDefined();
      expect(typeof metadata.title).toBe('string');

      // Verify description exists
      expect(metadata.description).toBeDefined();
      expect(typeof metadata.description).toBe('string');

      // Verify tags are present
      expect(metadata.openGraph?.article?.tags).toBeDefined();
      expect(Array.isArray(metadata.openGraph?.article?.tags)).toBe(true);
      metadata.openGraph?.article?.tags?.forEach(tag => {
        expect(typeof tag).toBe('string');
        expect(tag).toBeTruthy();
      });
    });

    it('should handle missing optional fields and provide defaults', () => {
      const minimalParams = {
        title: 'Test Article',
        description: 'Test Description',
        url: 'https://williamcallahan.com/blog/test-article',
        datePublished: '2025-01-01T12:00:00',
        dateModified: '2025-01-02T15:30:00',
      };

      const metadata = createArticleMetadata(minimalParams);

      // Verify default values
      expect(metadata.openGraph?.article?.tags).toEqual([]);
      expect(metadata.openGraph?.images).toBeDefined();
      expect(metadata.openGraph?.images?.[0]?.alt).toBeDefined();
      expect(metadata.openGraph?.images?.[0]?.url).toBeDefined();
      expect(typeof metadata.openGraph?.images?.[0]?.alt).toBe('string');
      expect(typeof metadata.openGraph?.images?.[0]?.url).toBe('string');
    });
  });

  describe('getStaticPageMetadata', () => {
    it('should include all required date formats', () => {
      const metadata = getStaticPageMetadata('/experience', 'experience');
      const dates = metadata.other || {};

      // Standard HTML meta dates
      expect(dates[SEO_DATE_FIELDS.meta.published]).toBeDefined();
      expect(dates[SEO_DATE_FIELDS.meta.modified]).toBeDefined();

      // Dublin Core dates
      expect(dates[SEO_DATE_FIELDS.dublinCore.created]).toBeDefined();
      expect(dates[SEO_DATE_FIELDS.dublinCore.modified]).toBeDefined();
      expect(dates[SEO_DATE_FIELDS.dublinCore.issued]).toBeDefined();

      // Verify all dates are in Pacific Time format
      Object.values(dates).forEach(date => {
        if (typeof date === 'string') {
          expect(isPacificDateString(date)).toBe(true);
        }
      });

      // Verify dates are consistent across formats
      const created = dates[SEO_DATE_FIELDS.meta.published];
      const modified = dates[SEO_DATE_FIELDS.meta.modified];

      if (created) {
        expect(dates[SEO_DATE_FIELDS.dublinCore.created]).toBe(created);
      }

      if (modified) {
        expect(dates[SEO_DATE_FIELDS.dublinCore.modified]).toBe(modified);
      }

      if (created) {
        expect(dates[SEO_DATE_FIELDS.dublinCore.issued]).toBe(created);
      }

      // Verify JSON-LD dates
      const jsonLd = JSON.parse(metadata.script?.[0]?.text || '{}');
      const webPage = jsonLd['@graph']?.find((entity: any) => entity['@type'] === 'WebPage');
      expect(webPage).toBeDefined();
      expect(webPage.datePublished).toBe(created);
      expect(webPage.dateModified).toBe(modified);
    });

    it('should include JSON-LD structured data with correct type', () => {
      // Test ProfilePage type
      const experienceMetadata = getStaticPageMetadata('/experience', 'experience');
      expect(experienceMetadata.script).toBeDefined();
      expect(experienceMetadata.script?.[0]?.type).toBe('application/ld+json');
      const parsedExperienceJsonLd = JSON.parse(experienceMetadata.script?.[0]?.text || '{}');
      const webPage = parsedExperienceJsonLd['@graph']?.find((entity: any) => entity['@type'] === 'WebPage');
      expect(webPage).toBeDefined();
      expect(webPage.datePublished).toBeDefined();
      expect(webPage.dateModified).toBeDefined();

      // Test CollectionPage type
      const blogMetadata = getStaticPageMetadata('/blog', 'blog');
      expect(blogMetadata.script).toBeDefined();
      expect(blogMetadata.script?.[0]?.type).toBe('application/ld+json');
      const parsedBlogJsonLd = JSON.parse(blogMetadata.script?.[0]?.text || '{}');
      const collectionPage = parsedBlogJsonLd['@graph']?.find((entity: any) => entity['@type'] === 'CollectionPage');
      expect(collectionPage).toBeDefined();
      expect(collectionPage.datePublished).toBeDefined();
      expect(collectionPage.dateModified).toBeDefined();
    });

    it('should output all date formats correctly for profile pages', () => {
      const metadata = getStaticPageMetadata('/experience', 'experience');
      const dates = metadata.other || {};
      const jsonLd = JSON.parse(metadata.script?.[0]?.text || '{}');
      const webPage = jsonLd['@graph']?.find((entity: any) => entity['@type'] === 'WebPage');
      expect(webPage).toBeDefined();

      // Verify all dates are in Pacific Time format
      Object.values(dates).forEach(date => {
        if (typeof date === 'string') {
          expect(isPacificDateString(date)).toBe(true);
        }
      });

      // Verify JSON-LD dates
      expect(isPacificDateString(webPage.datePublished)).toBe(true);
      expect(isPacificDateString(webPage.dateModified)).toBe(true);

      // Verify Dublin Core dates
      expect(isPacificDateString(dates[SEO_DATE_FIELDS.dublinCore.created] as string)).toBe(true);
      expect(isPacificDateString(dates[SEO_DATE_FIELDS.dublinCore.modified] as string)).toBe(true);
      expect(isPacificDateString(dates[SEO_DATE_FIELDS.dublinCore.issued] as string)).toBe(true);

      // Verify dates are consistent
      const created = dates[SEO_DATE_FIELDS.meta.published];
      const modified = dates[SEO_DATE_FIELDS.meta.modified];

      expect(webPage.datePublished).toBe(created);
      expect(webPage.dateModified).toBe(modified);

      if (created) {
        expect(dates[SEO_DATE_FIELDS.dublinCore.created]).toBe(created);
      }

      if (modified) {
        expect(dates[SEO_DATE_FIELDS.dublinCore.modified]).toBe(modified);
      }

      if (created) {
        expect(dates[SEO_DATE_FIELDS.dublinCore.issued]).toBe(created);
      }
    });

    it('should include OpenGraph metadata with correct type', () => {
      // Test profile type
      const experienceMetadata = getStaticPageMetadata('/experience', 'experience');
      const experienceOg = experienceMetadata.openGraph as ProfileOpenGraph;
      expect(experienceOg.type).toBe('profile');
      expect(experienceOg.firstName).toBeDefined();
      expect(experienceOg.lastName).toBeDefined();
      expect(experienceOg.username).toBeDefined();

      // Test article type for collection pages
      const blogMetadata = getStaticPageMetadata('/blog', 'blog');
      const blogOg = blogMetadata.openGraph as ArticleOpenGraph;
      expect(blogOg.type).toBe('article');
      expect(blogOg.article).toBeDefined();
      expect(blogOg.article.publishedTime).toBeDefined();
      expect(blogOg.article.modifiedTime).toBeDefined();
    });
  });
});
