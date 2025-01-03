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
      expect(metadata).toEqual(STATIC_PAGE_METADATA['/']);
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
          image: '/images/test.jpg',
          url: 'https://williamcallahan.com/blog/test-post',
        },
        twitter: {
          card: 'summary_large_image',
          site: '@williamcallahan',
          creator: '@williamcallahan',
          description: 'Test excerpt',
          image: 'https://williamcallahan.com/images/test.jpg',
          title: 'Test Post',
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

    it('should use publishedAt as dateModified if updatedAt is not provided', () => {
      const postWithoutUpdate = { ...mockPost, updatedAt: undefined };
      const metadata = getBlogPostMetadata(postWithoutUpdate);
      expect(metadata.dateModified).toBe(postWithoutUpdate.publishedAt);
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
