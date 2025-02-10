/**
 * SEO Metadata Tests
 * @jest-environment node
 */

import { createArticleMetadata, getStaticPageMetadata } from '../../../lib/seo/metadata';
import { SEO_DATE_FIELDS } from '../../../lib/seo/constants';
import { metadata as siteMetadata, SITE_NAME } from '../../../data/metadata';
import { isPacificDateString } from '../../../types/seo';
import type { Metadata } from 'next';


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

      // Verify OpenGraph dates
      expect(metadata.openGraph?.article?.publishedTime).toBeDefined();
      expect(metadata.openGraph?.article?.modifiedTime).toBeDefined();
      expect(isPacificDateString(metadata.openGraph?.article?.publishedTime as string)).toBe(true);
      expect(isPacificDateString(metadata.openGraph?.article?.modifiedTime as string)).toBe(true);

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

      // Verify all published dates match
      expect(dates.og.published).toBe(dates.meta.published);

      // Verify all modified dates match
      expect(dates.og.modified).toBe(dates.meta.modified);
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
    it('should include last-modified date', () => {
      const metadata = getStaticPageMetadata('/test');
      const modifiedDate = metadata.other?.[SEO_DATE_FIELDS.meta.modified];

      expect(modifiedDate).toBeDefined();
      expect(typeof modifiedDate === 'string' && isPacificDateString(modifiedDate)).toBe(true);
    });

    it('should merge additional metadata', () => {
      const additionalMetadata: Metadata = {
        title: 'Test Page',
        description: 'Test Description',
        openGraph: {
          title: 'OG Test Page',
          description: 'OG Test Description',
        },
      };

      const metadata = getStaticPageMetadata('/test', additionalMetadata);

      expect(metadata.title).toBe(additionalMetadata.title);
      expect(metadata.description).toBe(additionalMetadata.description);
      expect(metadata.openGraph?.title).toBe(additionalMetadata.openGraph?.title);
      expect(metadata.openGraph?.description).toBe(additionalMetadata.openGraph?.description);
    });

    it('should set canonical URL to production URL', () => {
      const metadata = getStaticPageMetadata('/test');
      expect(metadata.alternates?.canonical).toBe('https://williamcallahan.com/test');
    });
  });
});
