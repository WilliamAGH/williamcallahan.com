/**
 * OpenGraph Metadata Tests
 * @jest-environment node
 */

import { createArticleOgMetadata, BASE_OG_METADATA } from '../../../lib/seo/opengraph';
import { metadata as siteMetadata } from '../../../data/metadata';
import { isPacificDateString, type OpenGraphImage } from '../../../types/seo';
import { ensureAbsoluteUrl } from '../../../lib/seo/utils';
import type { OpenGraph } from 'next/dist/lib/metadata/types/opengraph-types';
import { describe, it, expect } from 'bun:test';

// Mock process.env for tests
process.env.NEXT_PUBLIC_SITE_URL = 'https://williamcallahan.com';

describe('OpenGraph Metadata', () => {
  describe('BASE_OG_METADATA', () => {
    it('should have required base fields', () => {
      const metadata = BASE_OG_METADATA as OpenGraph & { type: string };
      expect(metadata.type).toBe('website');
      expect(metadata.url).toBe(siteMetadata.openGraph.url);
      expect(metadata.locale).toBe(siteMetadata.openGraph.locale);
      expect(metadata.siteName).toBe(siteMetadata.openGraph.siteName);
    });

    it('should have properly formatted default image', () => {
      const images = BASE_OG_METADATA.images as OpenGraphImage[];
      const defaultImage = images?.[0];
      expect(defaultImage).toBeDefined();
      expect(defaultImage?.url).toBe(ensureAbsoluteUrl(siteMetadata.defaultImage.url));
      expect(defaultImage?.width).toBe(siteMetadata.defaultImage.width);
      expect(defaultImage?.height).toBe(siteMetadata.defaultImage.height);
      expect(defaultImage?.type).toBe(siteMetadata.defaultImage.type);
    });
  });

  describe('createArticleOgMetadata', () => {
    const mockArticleParams = {
      title: 'Test Article',
      description: 'Test Description',
      url: 'https://williamcallahan.com/blog/test-article',
      datePublished: '2025-01-01T12:00:00',
      dateModified: '2025-01-02T15:30:00',
      tags: ['test', 'article'],
    };

    it('should generate proper article metadata structure', () => {
      const metadata = createArticleOgMetadata(mockArticleParams);

      expect(metadata.type).toBe('article');
      expect(metadata.title).toBe(mockArticleParams.title);
      expect(metadata.description).toBe(mockArticleParams.description);
      expect(metadata.url).toBe(mockArticleParams.url);
    });

    it('should format dates in Pacific Time with proper offset', () => {
      const metadata = createArticleOgMetadata(mockArticleParams);

      // Verify date formats
      expect(metadata.article?.publishedTime).toBeDefined();
      expect(metadata.article?.modifiedTime).toBeDefined();
      expect(isPacificDateString(metadata.article?.publishedTime)).toBe(true);
      expect(isPacificDateString(metadata.article?.modifiedTime)).toBe(true);

      // January = PST (-08:00)
      expect(metadata.article?.publishedTime).toMatch(/-08:00$/);
    });

    it('should handle daylight savings dates', () => {
      const summerArticle = {
        ...mockArticleParams,
        datePublished: '2025-07-01T12:00:00', // July = PDT
        dateModified: '2025-07-02T15:30:00',
      };

      const metadata = createArticleOgMetadata(summerArticle);

      // July = PDT (-07:00)
      expect(metadata.article?.publishedTime).toMatch(/-07:00$/);
      expect(metadata.article?.modifiedTime).toMatch(/-07:00$/);
    });

    it('should handle custom article image', () => {
      const articleWithImage = {
        ...mockArticleParams,
        image: '/images/custom-image.jpg',
      };

      const metadata = createArticleOgMetadata(articleWithImage);
      const images = metadata.images as OpenGraphImage[];
      const image = images?.[0];

      expect(image).toBeDefined();
      expect(image?.url).toBe(ensureAbsoluteUrl('/images/custom-image.jpg'));
      expect(image?.alt).toBe(articleWithImage.title);
      expect(typeof image?.url).toBe('string');
      expect(typeof image?.alt).toBe('string');
    });

    it('should use default image when no custom image provided', () => {
      const metadata = createArticleOgMetadata(mockArticleParams);
      const images = metadata.images as OpenGraphImage[];
      const image = images?.[0];

      expect(image).toBeDefined();
      expect(image?.url).toBe(ensureAbsoluteUrl(siteMetadata.defaultImage.url));
      expect(image?.width).toBe(siteMetadata.defaultImage.width);
      expect(image?.height).toBe(siteMetadata.defaultImage.height);
      expect(image?.type).toBe(siteMetadata.defaultImage.type);
    });

    it('should include article section and tags', () => {
      const metadata = createArticleOgMetadata(mockArticleParams);

      expect(metadata.article?.section).toBe(siteMetadata.article.section);
      expect(metadata.article?.tags).toEqual(mockArticleParams.tags);
      expect(Array.isArray(metadata.article?.tags)).toBe(true);
      metadata.article?.tags?.forEach(tag => {
        expect(typeof tag).toBe('string');
        expect(tag).toBeTruthy();
      });
    });

    it('should handle missing tags', () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
      const { tags: _tags, ...articleWithoutTags } = mockArticleParams;
      const metadata = createArticleOgMetadata(articleWithoutTags);

      expect(metadata.article?.tags).toEqual([]);
      expect(Array.isArray(metadata.article?.tags)).toBe(true);
    });

    it('should preserve base metadata fields', () => {
      const metadata = createArticleOgMetadata(mockArticleParams);

      expect(metadata.locale).toBe(siteMetadata.openGraph.locale);
      expect(metadata.siteName).toBe(siteMetadata.openGraph.siteName);
      expect(typeof metadata.locale).toBe('string');
      expect(typeof metadata.siteName).toBe('string');
    });
  });
});
