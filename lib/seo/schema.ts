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
  ProfilePageSchema,
  NewsArticleSchema,
  SoftwareApplicationSchema,
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
 * Creates a ProfilePage entity for personal profile pages
 */
function createProfilePageEntity(params: SchemaParams): ProfilePageSchema {
  // Get profile-specific metadata if available
  const profileMetadata = params.profileMetadata || {};

  // Process interaction statistics to ensure proper typing
  const interactionStats = profileMetadata.interactionStats;
  const interactionStatistics = interactionStats?.follows ? [
    {
      '@type': 'InteractionCounter' as const,
      interactionType: 'https://schema.org/FollowAction',
      userInteractionCount: interactionStats.follows
    },
    ...(interactionStats?.likes ? [{
      '@type': 'InteractionCounter' as const,
      interactionType: 'https://schema.org/LikeAction',
      userInteractionCount: interactionStats.likes
    }] : [])
  ] : undefined;

  // Create agent interaction statistic with proper typing
  const agentInteractionStatistic = interactionStats?.posts ? {
    '@type': 'InteractionCounter' as const,
    interactionType: 'https://schema.org/WriteAction',
    userInteractionCount: interactionStats.posts
  } : undefined;

  return {
    '@type': 'ProfilePage',
    '@id': createIdUrl(params.path, 'profile'),
    name: params.title,
    description: params.description,
    dateCreated: params.datePublished, // Using datePublished as dateCreated
    dateModified: params.dateModified,
    mainEntity: {
      '@type': 'Person',
      name: SITE_NAME,
      ...(profileMetadata.alternateName && { alternateName: profileMetadata.alternateName }),
      ...(profileMetadata.identifier && { identifier: profileMetadata.identifier }),
      description: profileMetadata.bio || metadata.shortDescription,
      sameAs: metadata.social.profiles,
      ...(profileMetadata.profileImage
          ? { image: ensureAbsoluteUrl(profileMetadata.profileImage) }
          : params.image && { image: ensureAbsoluteUrl(params.image.url) }),
      ...(interactionStatistics && { interactionStatistic: interactionStatistics }),
      ...(agentInteractionStatistic && { agentInteractionStatistic })
    }
  };
}

/**
 * Creates a NewsArticle entity for news-style blog posts
 */
function createNewsArticleEntity(params: SchemaParams): NewsArticleSchema {
  // Create array of images
  const images = params.images ||
    (params.image ? [params.image.url] : [ensureAbsoluteUrl(metadata.defaultImage.url)]);

  // Format author information
  const authorEntities = params.authors
    ? params.authors.map(author => ({
        '@type': 'Person' as const,
        name: author.name,
        ...(author.url && { url: author.url })
      }))
    : [{
        '@type': 'Person' as const,
        name: SITE_NAME,
        url: ensureAbsoluteUrl('/')
      }];

  return {
    '@type': 'NewsArticle',
    '@id': createIdUrl(params.path, 'newsarticle'),
    headline: params.title,
    image: images,
    datePublished: params.datePublished,
    dateModified: params.dateModified,
    author: authorEntities,
    description: params.description,
    ...(params.mainEntityOfPage && { mainEntityOfPage: params.mainEntityOfPage }),
    publisher: { '@id': createIdUrl('/', 'person') }
  };
}

/**
 * Creates a SoftwareApplication entity for software and extensions
 */
function createSoftwareApplicationEntity(params: SchemaParams): SoftwareApplicationSchema {
  if (!params.softwareMetadata) {
    throw new Error('Software metadata is required for SoftwareApplication schema');
  }

  const softwareMetadata = params.softwareMetadata;

  // Create base schema
  const schema: SoftwareApplicationSchema = {
    '@type': 'SoftwareApplication',
    '@id': createIdUrl(params.path, 'software'),
    name: softwareMetadata.name,
    description: params.description,
  };

  // Add operating system if provided
  if (softwareMetadata.operatingSystem) {
    schema.operatingSystem = softwareMetadata.operatingSystem;
  }

  // Add application category if provided
  if (softwareMetadata.applicationCategory) {
    schema.applicationCategory = softwareMetadata.applicationCategory;
  }

  // Add pricing information
  if (softwareMetadata.isFree) {
    schema.offers = {
      '@type': 'Offer',
      price: 0.00,
      priceCurrency: softwareMetadata.priceCurrency || 'USD',
      availability: 'https://schema.org/InStock'
    };
  } else if (softwareMetadata.price !== undefined) {
    schema.offers = {
      '@type': 'Offer',
      price: softwareMetadata.price,
      priceCurrency: softwareMetadata.priceCurrency || 'USD',
      availability: 'https://schema.org/InStock'
    };
  }

  // Add rating information if provided
  if (softwareMetadata.ratingValue !== undefined && softwareMetadata.ratingCount !== undefined) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: softwareMetadata.ratingValue,
      ratingCount: softwareMetadata.ratingCount,
      bestRating: 5,
      worstRating: 1
    };
  }

  // Add download URL if provided
  if (softwareMetadata.downloadUrl) {
    schema.downloadUrl = ensureAbsoluteUrl(softwareMetadata.downloadUrl);
  }

  // Add version if provided
  if (softwareMetadata.softwareVersion) {
    schema.softwareVersion = softwareMetadata.softwareVersion;
  }

  // Add screenshots if provided
  if (softwareMetadata.screenshot) {
    schema.screenshot = Array.isArray(softwareMetadata.screenshot)
      ? softwareMetadata.screenshot.map(url => ensureAbsoluteUrl(url))
      : ensureAbsoluteUrl(softwareMetadata.screenshot);
  }

  // Add author/publisher (default to the site owner)
  schema.author = params.authors
    ? {
        '@type': 'Person' as const,
        name: params.authors[0].name,
        ...(params.authors[0].url && { url: params.authors[0].url })
      }
    : { '@id': createIdUrl('/', 'person') };

  schema.publisher = { '@id': createIdUrl('/', 'person') };

  return schema;
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
    case 'profile':
      graph['@graph'].push(createProfilePageEntity(params));
      break;
    case 'newsarticle':
      graph['@graph'].push(createNewsArticleEntity(params));
      break;
    case 'article':
      graph['@graph'].push(createArticleEntity(params));
      break;
    case 'dataset':
      graph['@graph'].push(createDatasetEntity(params));
      break;
    case 'software':
      graph['@graph'].push(createSoftwareApplicationEntity(params));
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
