import { getStaticPageMetadata, createArticleMetadata } from '@/lib/seo/metadata';
import { PAGE_METADATA, SITE_NAME } from '@/data/metadata';

describe('SEO Utilities', () => {
  describe('getStaticPageMetadata', () => {
    it('returns basic metadata for a static page', () => {
      const metadata = getStaticPageMetadata('/', 'home');

      expect(metadata.title).toBe(PAGE_METADATA.home.title);
      expect(metadata.description).toBe(PAGE_METADATA.home.description);
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.twitter).toBeDefined();
      expect(metadata.script).toBeDefined();
      expect(metadata.script?.[0]?.type).toBe('application/ld+json');
    });

    it('handles metadata overrides', () => {
      const overrides = {
        title: 'Custom Title',
        description: 'Custom Description'
      };

      const metadata = getStaticPageMetadata('/', 'home', overrides);

      expect(metadata.title).toBe(overrides.title);
      expect(metadata.description).toBe(overrides.description);
      expect(metadata.openGraph?.title).toBe(overrides.title);
      expect(metadata.twitter?.title).toBe(overrides.title);
    });

    it('includes breadcrumbs for non-root pages', () => {
      const metadata = getStaticPageMetadata('/blog', 'blog');
      const schema = JSON.parse(metadata.script?.[0]?.text as string);

      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@graph']).toBeDefined();

      const webPage = schema['@graph'].find((node: any) => node['@type'] === 'WebPage');
      expect(webPage).toBeDefined();

      const breadcrumb = schema['@graph'].find((node: any) => node['@type'] === 'BreadcrumbList');
      expect(breadcrumb).toBeDefined();
      expect(breadcrumb.itemListElement).toHaveLength(2);
      expect(breadcrumb.itemListElement[0].item.name).toBe('Home');
      expect(breadcrumb.itemListElement[1].item.name).toBe(PAGE_METADATA.blog.title);
    });
  });

  describe('createArticleMetadata', () => {
    it('returns article metadata', () => {
      const articleParams = {
        title: 'Test Article',
        description: 'Test Description',
        url: 'https://example.com/article',
        datePublished: '2024-01-01T00:00:00',
        dateModified: '2024-01-02T00:00:00',
        tags: ['test'],
        articleBody: 'Test content'
      };

      const metadata = createArticleMetadata(articleParams);

      expect(metadata.title).toBe(`${articleParams.title} - ${SITE_NAME}'s Blog`);
      expect(metadata.description).toBe(articleParams.description);
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.twitter).toBeDefined();
      expect(metadata.script).toBeDefined();

      // Verify schema
      const schema = JSON.parse(metadata.script?.[0]?.text as string);
      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe('Article');

      expect(schema.headline).toBe(articleParams.title);
      expect(schema.articleBody).toBe(articleParams.articleBody);
      expect(schema.keywords).toEqual(articleParams.tags);
    });

    it('handles dates correctly', () => {
      const articleParams = {
        title: 'Test Article',
        description: 'Test Description',
        url: 'https://example.com/article',
        datePublished: '2024-01-01T08:00:00.000Z',
        dateModified: '2024-01-02T08:00:00.000Z',
        tags: ['test']
      };

      const metadata = createArticleMetadata(articleParams);

      expect(metadata.openGraph?.article?.publishedTime).toBe('2024-01-01T00:00:00-08:00');
      expect(metadata.openGraph?.article?.modifiedTime).toBe('2024-01-02T00:00:00-08:00');

      const schema = JSON.parse(metadata.script?.[0]?.text as string);
      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe('Article');  // Schema should be direct Article type
      expect(schema.datePublished).toBe('2024-01-01T00:00:00-08:00');
      expect(schema.dateModified).toBe('2024-01-02T00:00:00-08:00');
    });
  });
});
