import {
  DEFAULT_METADATA,
  STATIC_PAGE_METADATA,
  getCanonicalUrl,
  getStaticPageMetadata,
  getBlogPostMetadata,
  getImageMetadata,
  generateRobotsTxt,
  generateSitemap,
} from '../../lib/seo';
import type { BlogPost } from '../../types/blog';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';

// Mock the environment and constants
jest.mock('../../lib/constants', () => ({
  NEXT_PUBLIC_SITE_URL: 'https://williamcallahan.com'
}));

// Mock MDXRemoteSerializeResult
const mockMDXContent = {} as MDXRemoteSerializeResult;

describe('SEO Library', () => {
  describe('getCanonicalUrl', () => {
    it('should generate correct canonical URLs', () => {
      expect(getCanonicalUrl('/')).toBe('https://williamcallahan.com/');
      expect(getCanonicalUrl('/blog')).toBe('https://williamcallahan.com/blog');
      expect(getCanonicalUrl('/blog/post')).toBe('https://williamcallahan.com/blog/post');
    });
  });

  describe('getStaticPageMetadata', () => {
    it('should return correct metadata for home page', () => {
      const metadata = getStaticPageMetadata('/');
      const expected = {
        ...DEFAULT_METADATA,
        canonical: 'https://williamcallahan.com/',
        openGraph: metadata.openGraph && {
          ...DEFAULT_METADATA.openGraph,
          url: 'https://williamcallahan.com/',
        },
      };

      // Compare image properties separately
      if (metadata.openGraph?.image && expected.openGraph?.image) {
        const metadataImage = metadata.openGraph.image;
        const expectedImage = expected.openGraph.image;

        if (typeof metadataImage === 'string' && typeof expectedImage === 'string') {
          expect(metadataImage).toBe(expectedImage);
        } else if (typeof metadataImage === 'object' && typeof expectedImage === 'object') {
          expect(metadataImage.url).toBe(expectedImage.url);
          expect(metadataImage.width).toBe(expectedImage.width);
          expect(metadataImage.height).toBe(expectedImage.height);
          expect(metadataImage.alt).toBe(expectedImage.alt);
          expect(metadataImage.type).toBe(expectedImage.type);
        }
      }

      // Compare rest of metadata without images
      const { openGraph: metadataOg, ...metadataRest } = metadata;
      const { openGraph: expectedOg, ...expectedRest } = expected;

      const metadataOgWithoutImage = metadataOg && {
        ...metadataOg,
        image: undefined
      };
      const expectedOgWithoutImage = expectedOg && {
        ...expectedOg,
        image: undefined
      };

      expect(metadataRest).toEqual(expectedRest);
      expect(metadataOgWithoutImage).toEqual(expectedOgWithoutImage);
    });

    it('should return default metadata for unknown paths', () => {
      const metadata = getStaticPageMetadata('/unknown');
      expect(metadata.title).toBe(DEFAULT_METADATA.title);
      expect(metadata.canonical).toBe('https://williamcallahan.com/unknown');
      expect(metadata.openGraph?.url).toBe('https://williamcallahan.com/unknown');
    });

    it('should ensure all image URLs are absolute', () => {
      const metadata = getStaticPageMetadata('/');

      if (metadata.openGraph?.image) {
        const ogImage = metadata.openGraph.image;
        if (typeof ogImage === 'string') {
          expect(ogImage.startsWith('https://')).toBe(true);
        } else {
          expect(ogImage.url.startsWith('https://')).toBe(true);
        }
      }

      if (metadata.twitter?.image) {
        expect(metadata.twitter.image.startsWith('https://')).toBe(true);
      }
    });
  });

  describe('getBlogPostMetadata', () => {
    const mockPost: BlogPost = {
      id: '1',
      title: 'Test Post',
      slug: 'test-post',
      excerpt: 'Test excerpt',
      content: mockMDXContent,
      publishedAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      coverImage: '/images/test.jpg',
      author: {
        id: '1',
        name: 'William Callahan',
        avatar: '/images/william.jpeg',
        bio: 'Software Engineer',
      },
      tags: ['test'],
      readingTime: 5,
    };

    it('should generate correct blog post metadata', () => {
      const metadata = getBlogPostMetadata(mockPost);
      expect(metadata).toEqual({
        title: 'Test Post - William Callahan\'s Blog',
        description: 'Test excerpt',
        canonical: 'https://williamcallahan.com/blog/test-post',
        datePublished: '2024-01-01T00:00:00Z',
        dateModified: '2024-01-02T00:00:00Z',
        openGraph: {
          title: 'Test Post',
          description: 'Test excerpt',
          type: 'article',
          image: {
            url: 'https://williamcallahan.com/images/test.jpg',
            width: 1200,
            height: 630,
            alt: 'Test Post',
            type: 'image/jpeg',
          },
          url: 'https://williamcallahan.com/blog/test-post',
          locale: 'en_US',
          siteName: 'William Callahan',
          article: {
            publishedTime: '2024-01-01T00:00:00Z',
            modifiedTime: '2024-01-02T00:00:00Z',
            authors: ['William Callahan'],
            section: 'test',
            tags: ['test'],
          },
        },
        twitter: {
          card: 'summary_large_image',
          site: '@williamcallahan',
          creator: '@williamcallahan',
          title: 'Test Post',
          description: 'Test excerpt',
          image: 'https://williamcallahan.com/images/test.jpg',
          imageAlt: 'Test Post',
        },
        linkedin: {
          title: 'Test Post',
          description: 'Test excerpt',
          image: 'https://williamcallahan.com/images/test.jpg',
          type: 'article',
          'article:author': 'William Callahan',
          'article:published_time': '2024-01-01T00:00:00Z',
          'article:modified_time': '2024-01-02T00:00:00Z',
        },
      });
    });

    it('should use default image when coverImage is not provided', () => {
      const postWithoutImage = { ...mockPost, coverImage: undefined };
      const metadata = getBlogPostMetadata(postWithoutImage);
      expect(metadata.openGraph?.image).toEqual({
        url: 'https://williamcallahan.com/images/posts/npm_terminal.svg',
        width: 1200,
        height: 630,
        alt: 'Test Post',
        type: 'image/svg+xml',
      });
    });

    it('should use publishedAt as dateModified if updatedAt is not provided', () => {
      const postWithoutUpdate = { ...mockPost, updatedAt: undefined };
      const metadata = getBlogPostMetadata(postWithoutUpdate);
      expect(metadata.dateModified).toBe(postWithoutUpdate.publishedAt);
      expect(metadata.openGraph?.article?.modifiedTime).toBe(postWithoutUpdate.publishedAt);
      expect(metadata.linkedin?.['article:modified_time']).toBe(postWithoutUpdate.publishedAt);
    });

    it('should handle SVG images correctly', () => {
      const postWithSvg = { ...mockPost, coverImage: '/images/test.svg' };
      const metadata = getBlogPostMetadata(postWithSvg);
      expect(metadata.openGraph?.image).toEqual({
        url: 'https://williamcallahan.com/images/test.svg',
        width: 1200,
        height: 630,
        alt: 'Test Post',
        type: 'image/svg+xml',
      });
    });

    it('should use first tag as section and include all tags', () => {
      const postWithTags = { ...mockPost, tags: ['category1', 'category2'] };
      const metadata = getBlogPostMetadata(postWithTags);
      expect(metadata.openGraph?.article?.section).toBe('category1');
      expect(metadata.openGraph?.article?.tags).toEqual(['category1', 'category2']);
    });

    it('should use "Blog" as default section when no tags are provided', () => {
      const postWithoutTags = { ...mockPost, tags: [] };
      const metadata = getBlogPostMetadata(postWithoutTags);
      expect(metadata.openGraph?.article?.section).toBe('Blog');
      expect(metadata.openGraph?.article?.tags).toEqual([]);
    });
  });

  describe('getImageMetadata', () => {
    it('should generate correct metadata for relative image paths', () => {
      const metadata = getImageMetadata('/images/test.jpg', 'Test image', 'Test title');
      expect(metadata).toEqual({
        alt: 'Test image',
        title: 'Test title',
        url: 'https://williamcallahan.com/images/test.jpg',
      });
    });

    it('should preserve absolute URLs', () => {
      const metadata = getImageMetadata('https://example.com/image.jpg', 'Test image', 'Test title');
      expect(metadata).toEqual({
        alt: 'Test image',
        title: 'Test title',
        url: 'https://example.com/image.jpg',
      });
    });
  });

  describe('generateRobotsTxt', () => {
    it('should generate correct robots.txt content', () => {
      const robotsTxt = generateRobotsTxt();
      expect(robotsTxt).toBe(
        'User-agent: *\nAllow: /\n\nSitemap: https://williamcallahan.com/sitemap.xml'
      );
    });
  });

  describe('generateSitemap', () => {
    it('should generate correct sitemap XML', () => {
      const urls = [
        { path: '/', lastmod: '2024-01-01' },
        { path: '/blog', lastmod: '2024-01-02' },
        { path: '/experience' },
      ];

      const sitemap = generateSitemap(urls);
      expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(sitemap).toContain('<loc>https://williamcallahan.com/</loc>');
      expect(sitemap).toContain('<lastmod>2024-01-01</lastmod>');
      expect(sitemap).toContain('<loc>https://williamcallahan.com/blog</loc>');
      expect(sitemap).toContain('<lastmod>2024-01-02</lastmod>');
      expect(sitemap).toContain('<loc>https://williamcallahan.com/experience</loc>');
      expect(sitemap).toContain('<changefreq>weekly</changefreq>');
    });
  });
});
