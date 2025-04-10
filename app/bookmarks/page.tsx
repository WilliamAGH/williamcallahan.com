/**
 * Bookmarks Page
 * @module app/bookmarks/page
 * @description
 * Displays curated collection of bookmarked resources.
 * Implements proper SEO with schema.org structured data.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */

import type { Metadata } from 'next';
import { BookmarksClient } from '../../components/features/bookmarks/bookmarks.client';
import { BookmarkCardClient } from '../../components/features/bookmarks/bookmark-card.client';
import type { Bookmark, BookmarkWithPreview } from '../../types/bookmark';
import { getStaticPageMetadata } from '../../lib/seo/metadata';
import { JsonLdScript } from "../../components/seo/json-ld";
import { PAGE_METADATA, SITE_NAME, metadata as siteMetadata } from "../../data/metadata";
import { formatSeoDate } from "../../lib/seo/utils";

/**
 * Mock bookmarks data for UI development
 * @type {Bookmark[]}
 */
const mockBookmarks: Bookmark[] = [
  {
    id: '1',
    url: 'https://console.groq.com/docs/overview',
    title: 'Groq API Documentation',
    description: 'Comprehensive documentation for the Groq API, covering LLM models like llama-3.3-70b-versatile and their capabilities for natural language processing tasks.',
    tags: ['AI', 'LLM', 'API', 'Documentation'],
    ogImage: 'https://console.groq.com/og-image.png',
    dateBookmarked: '2024-03-20T08:00:00Z',
    datePublished: '2024-01-15T00:00:00Z'
  },
  {
    id: '2',
    url: 'https://jina.ai/',
    title: 'Jina AI - Cloud Native Neural Search Framework',
    description: 'Jina AI is a cloud-native neural search framework that allows developers to build cross-modal and multi-modal applications powered by deep learning.',
    tags: ['AI', 'Search', 'Neural Networks', 'Cloud'],
    dateBookmarked: '2024-03-19T15:30:00Z',
    datePublished: '2023-12-01T00:00:00Z'
  },
  {
    id: '3',
    url: 'https://nextjs.org/blog/next-14',
    title: 'Next.js 14',
    description: 'Introducing Next.js 14: The latest version of the React Framework for the Web. Features improved performance, enhanced developer experience, and new data fetching patterns.',
    tags: ['Web Development', 'React', 'Next.js', 'Framework'],
    ogImage: 'https://nextjs.org/og.png',
    dateBookmarked: '2024-02-15T10:00:00Z',
    datePublished: '2023-10-26T00:00:00Z'
  },
  {
    id: '4',
    url: 'https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html',
    title: 'TypeScript 5.4 Release Notes',
    description: 'TypeScript 5.4 brings new features and improvements including better type inference, enhanced control flow analysis, and more precise narrowing behaviors.',
    tags: ['TypeScript', 'Programming', 'JavaScript', 'Release'],
    dateBookmarked: '2024-02-10T14:20:00Z',
    datePublished: '2024-02-09T00:00:00Z'
  },
  {
    id: '5',
    url: 'https://tailwindcss.com/blog/tailwindcss-v4-alpha',
    title: 'Tailwind CSS v4.0 Alpha',
    description: 'A first look at Tailwind CSS v4.0: Exploring the next generation of the utility-first CSS framework with improved performance and new features.',
    tags: ['CSS', 'Web Development', 'Tailwind', 'Frontend'],
    dateBookmarked: '2024-01-05T09:15:00Z',
    datePublished: '2024-01-04T00:00:00Z'
  }
];

/**
 * Generate metadata for the Bookmarks page
 */
export function generateMetadata(): Metadata {
  return getStaticPageMetadata('/bookmarks', 'bookmarks');
}

/**
 * ASCII Art for Coming Soon Page
 */
const asciiArt = `
       (\_/)
       (='.'=)
       (")_(")
`;

/**
 * Bookmarks Page Component
 * Conditionally renders a "Coming Soon" page in production.
 */
export default function BookmarksPage() {

  // Check if the environment is production
  /* REMOVED PRODUCTION CHECK
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
        <h1 className="text-4xl font-bold mb-4">Bookmarks Coming Soon!</h1>
        <p className="text-lg mb-8 text-muted-foreground">
          I&apos;m busy curating the best resources just for you. Check back later!
        </p>
        <pre className="text-sm text-primary font-mono whitespace-pre">
          {asciiArt}
        </pre>
        <p className="mt-8 text-sm text-muted-foreground">
          In the meantime, explore the rest of the site.
        </p>
      </div>
    );
  }
  */

  // --- Development/Preview Mode --- // /* REMOVED COMMENT */

  const pageMetadata = PAGE_METADATA.bookmarks;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": `${SITE_NAME}'s Bookmarked Resources`,
          "description": pageMetadata.description,
          "datePublished": formattedCreated,
          "dateModified": formattedModified,
          "author": {
            "@type": "Person",
            "name": SITE_NAME,
            "description": siteMetadata.shortDescription,
            "sameAs": siteMetadata.social.profiles
          },
          "isPartOf": {
            "@type": "WebSite",
            "name": SITE_NAME,
            "url": "https://williamcallahan.com"
          }
        }}
      />
      {/* Render the actual bookmarks client component */}
      <BookmarksClient bookmarks={mockBookmarks} />
    </>
  );
}
