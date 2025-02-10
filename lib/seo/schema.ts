/**
 * Schema.org JSON-LD Generation
 * @module lib/seo/schema
 * @description
 * Generates Schema.org JSON-LD structured data for all page types.
 * Uses the @graph pattern to establish proper entity relationships.
 */

import { SITE_NAME, metadata } from '../../data/metadata';
import { ensureAbsoluteUrl } from './utils';
import type {
  SchemaGraph,
  SchemaParams,
  PersonSchema,
  WebSiteSchema,
  ImageObjectSchema,
  WebPageBase,
  ArticleSchema,
  DatasetSchema,
  CollectionPageSchema,
  BreadcrumbListSchema,
} from '../../types/seo/schema';

/**
 * Creates the base URL for schema.org @id references
 */
function createIdUrl(path: string, fragment?: string): string {
  const url = ensureAbsoluteUrl(path);
  return fragment ? `${url}#${fragment}` : url;
}

/**
 * Creates the Person entity representing the website owner
 */
function createPersonEntity(): PersonSchema {
  return {
    '@type': 'Person',
    '@id': createIdUrl('/', 'person'),
    name: SITE_NAME,
    description: metadata.shortDescription,
    url: ensureAbsoluteUrl('/'),
    sameAs: metadata.social.profiles,
    image: {
      '@id': createIdUrl('/', 'personlogo'),
    },
  };
}

/**
 * Creates the Website entity
 */
function createWebSiteEntity(): WebSiteSchema {
  return {
    '@type': 'WebSite',
    '@id': createIdUrl('/', 'website'),
    url: ensureAbsoluteUrl('/'),
    name: SITE_NAME,
    description: metadata.description,
    publisher: {
      '@id': createIdUrl('/', 'person'),
    },
  };
}

/**
 * Creates an ImageObject entity
 */
function createImageEntity(
  path: string,
  imageUrl: string,
  caption: string,
  width?: number,
  height?: number
): ImageObjectSchema {
  const absoluteUrl = ensureAbsoluteUrl(imageUrl);
  return {
    '@type': 'ImageObject',
    '@id': createIdUrl(path, 'primaryimage'),
    url: absoluteUrl,
    contentUrl: absoluteUrl,
    caption,
    ...(width && { width }),
    ...(height && { height }),
  };
}

/**
 * Creates a BreadcrumbList entity
 */
function createBreadcrumbListEntity(
  path: string,
  breadcrumbs: Array<{ path: string; name: string }>
): BreadcrumbListSchema {
  return {
    '@type': 'BreadcrumbList',
    '@id': createIdUrl(path, 'breadcrumb'),
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@id': ensureAbsoluteUrl(crumb.path),
        name: crumb.name,
      },
    })),
  };
}

/**
 * Creates the base WebPage entity
 */
function createWebPageEntity(params: SchemaParams): WebPageBase {
  const entity: WebPageBase = {
    '@type': 'WebPage',
    '@id': createIdUrl(params.path),
    isPartOf: { '@id': createIdUrl('/', 'website') },
    url: ensureAbsoluteUrl(params.path),
    name: params.title,
    description: params.description,
    datePublished: params.datePublished,
    dateModified: params.dateModified,
  };

  if (params.breadcrumbs) {
    entity.breadcrumb = { '@id': createIdUrl(params.path, 'breadcrumb') };
  }

  if (params.image) {
    entity.primaryImageOfPage = { '@id': createIdUrl(params.path, 'primaryimage') };
  }

  if (params.type === 'profile') {
    entity.about = { '@id': createIdUrl('/', 'person') };
  }

  return entity;
}

/**
 * Creates an Article entity for blog posts
 */
function createArticleEntity(params: SchemaParams): ArticleSchema {
  if (!params.articleBody) {
    throw new Error('Article body is required for article schema');
  }

  return {
    '@type': 'Article',
    '@id': createIdUrl(params.path, 'article'),
    isPartOf: { '@id': createIdUrl(params.path) },
    author: { '@id': createIdUrl('/', 'person') },
    headline: params.title,
    datePublished: params.datePublished,
    dateModified: params.dateModified,
    mainEntityOfPage: { '@id': createIdUrl(params.path) },
    publisher: { '@id': createIdUrl('/', 'person') },
    ...(params.image && { image: { '@id': createIdUrl(params.path, 'primaryimage') } }),
    articleSection: metadata.article.section,
    inLanguage: 'en-US',
    articleBody: params.articleBody,
    keywords: params.keywords || [],
  };
}

/**
 * Creates a Dataset entity for investment data
 */
function createDatasetEntity(params: SchemaParams): DatasetSchema {
  return {
    '@type': 'Dataset',
    '@id': createIdUrl(params.path, 'dataset'),
    name: params.title,
    description: params.description,
    creator: { '@id': createIdUrl('/', 'person') },
    dateCreated: params.datePublished,
    dateModified: params.dateModified,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    includedInDataCatalog: {
      '@type': 'DataCatalog',
      name: `${SITE_NAME}'s Public Investment Records`,
    },
  };
}

/**
 * Creates a CollectionPage entity for listings
 */
function createCollectionPageEntity(
  params: SchemaParams,
  items: Array<{ url: string; position: number }>
): CollectionPageSchema {
  return {
    '@type': 'CollectionPage',
    '@id': createIdUrl(params.path, 'collection'),
    isPartOf: { '@id': createIdUrl(params.path) },
    name: params.title,
    description: params.description,
    creator: { '@id': createIdUrl('/', 'person') },
    datePublished: params.datePublished,
    dateModified: params.dateModified,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map(item => ({
        '@type': 'ListItem',
        position: item.position,
        url: ensureAbsoluteUrl(item.url),
      })),
    },
  };
}

/**
 * Generates complete schema graph for a page
 */
export function generateSchemaGraph(params: SchemaParams): SchemaGraph {
  const graph: SchemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      createWebPageEntity(params),
      createPersonEntity(),
      createWebSiteEntity(),
    ],
  };

  // Add breadcrumbs if provided
  if (params.breadcrumbs) {
    graph['@graph'].push(createBreadcrumbListEntity(params.path, params.breadcrumbs));
  }

  // Add image if provided
  if (params.image) {
    graph['@graph'].push(
      createImageEntity(
        params.path,
        params.image.url,
        params.title,
        params.image.width,
        params.image.height
      )
    );
  }

  // Add type-specific entities
  switch (params.type) {
    case 'article':
      graph['@graph'].push(createArticleEntity(params));
      break;
    case 'dataset':
      graph['@graph'].push(createDatasetEntity(params));
      break;
    case 'collection':
      if (!params.breadcrumbs) {
        throw new Error('Breadcrumbs are required for collection pages');
      }
      graph['@graph'].push(
        createCollectionPageEntity(params, params.breadcrumbs.map((crumb, i) => ({
          url: crumb.path,
          position: i + 1,
        })))
      );
      break;
  }

  return graph;
}
