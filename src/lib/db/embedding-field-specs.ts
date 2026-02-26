/**
 * Per-domain embedding field specifications.
 *
 * Each constant defines the ordered list of fields sent to the embedding model.
 * Labels are chosen to be unambiguous (see embedding-input-contracts.ts header).
 *
 * Verified against actual type definitions:
 *   bookmark  → src/types/schemas/bookmark.ts (UnifiedBookmark + BookmarkContent)
 *   thought   → src/types/schemas/thought.ts (thoughtSchema)
 *   investment→ src/types/investment.ts (Investment interface)
 *   project   → src/types/project.ts (Project interface)
 *   book      → src/types/schemas/book.ts (bookSchema)
 *   blog      → src/types/blog.ts (BlogPost + BlogPageFrontmatter)
 *   ai_analysis → src/lib/db/schema/ai-analysis.ts (aiAnalysisLatest)
 *   opengraph → src/lib/db/schema/opengraph.ts (opengraphMetadata)
 *
 * @module lib/db/embedding-field-specs
 */

import type { EmbeddingFieldSpec } from "@/lib/db/embedding-input-contracts";

/** Source: `bookmarks` table. Entity ID: `bookmarks.id`. */
export const BOOKMARK_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "title",
    label: "Page Title",
    meaning: "og:title of the bookmarked web page",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "description",
    label: "Page Description",
    meaning: "Meta description of the bookmarked web page",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "summary",
    label: "Content Summary",
    meaning: "AI-generated or human-written summary of page content",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "note",
    label: "Personal Annotation",
    meaning: "Freeform note added by the person who saved this bookmark",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "domain",
    label: "Website Hostname",
    meaning: "Internet hostname of the URL (e.g. 'github.com'), NOT a business sector",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "tags",
    label: "Topic Tags",
    meaning: "Classification keywords assigned by human or AI tagging system",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "content.title",
    label: "Crawled Page Title",
    meaning: "Title extracted by web crawler; included only when it differs from Page Title",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "content.description",
    label: "Crawled Page Description",
    meaning: "Description from web crawler; included only when it differs from Page Description",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "content.author",
    label: "Page Author",
    meaning: "Byline author of the bookmarked article",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "content.publisher",
    label: "Publisher Name",
    meaning: "Organization that published the bookmarked page",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "url",
    label: "Bookmarked URL",
    meaning: "Full URL of the bookmarked web page",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "scrapedContentText",
    label: "Scraped Page Text",
    meaning: "Full visible text body scraped from the page; truncation-safe (placed last)",
    required: false,
    verboseField: true,
  },
];

/** Source: `thoughts` table. Entity ID: `thoughts.id` (UUID). */
export const THOUGHT_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "title",
    label: "Thought Title",
    meaning: "Headline of a short-form TIL entry",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "content",
    label: "Thought Full Text",
    meaning: "Complete body text of the thought (typically 1-3 paragraphs)",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "category",
    label: "Topic Category",
    meaning: "Single broad classification (e.g. 'programming'); NOT an internet domain",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "tags",
    label: "Topic Tags",
    meaning: "Keyword labels for classification and filtering",
    required: false,
    verboseField: false,
  },
];

/**
 * Source: `data/investments.ts` → `investments` table.
 * Entity ID: `investments.id` (slug-style string).
 * Verified against `src/types/investment.ts`.
 */
export const INVESTMENT_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "name",
    label: "Company Name",
    meaning: "Legal or trade name of the portfolio company",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "description",
    label: "Company Description",
    meaning: "What the company does, its product, and target market",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "category",
    label: "Business Sector",
    meaning: "Industry vertical (e.g. 'AI / ML', 'Fintech'); NOT a product category",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "stage",
    label: "Funding Round at Entry",
    meaning: "VC funding round at time of investment (e.g. 'Seed+', 'Series A')",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "status",
    label: "Investment Outcome",
    meaning: "'Active' = currently held; 'Realized' = fully exited",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "operating_status",
    label: "Company Operating State",
    meaning: "'Operating', 'Shut Down', 'Acquired', or 'Inactive'",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "location",
    label: "Company Headquarters",
    meaning: "City and state of primary office (e.g. 'New York, NY')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "type",
    label: "Investment Vehicle",
    meaning: "'Direct' = equity purchase; may also be fund-of-fund or SPV",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "invested_year",
    label: "Year of Investment",
    meaning: "Calendar year the capital was deployed (e.g. '2022')",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "accelerator.program",
    label: "Startup Accelerator Program",
    meaning: "Accelerator name if applicable (e.g. 'techstars', 'ycombinator')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "accelerator.batch",
    label: "Accelerator Cohort",
    meaning: "Specific batch or cohort within the accelerator",
    required: false,
    verboseField: false,
  },
];

/**
 * Source: `data/projects.ts` → `projects` table.
 * Entity ID: `projects.id` (slug-style string).
 * Verified against `src/types/project.ts`.
 */
export const PROJECT_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "name",
    label: "Project Name",
    meaning: "Display name of the software project",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "shortSummary",
    label: "Project Summary",
    meaning: "One-line purpose statement for card/list display",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "description",
    label: "Project Description",
    meaning: "Multi-sentence explanation of the project's architecture and features",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "tags",
    label: "Topic Tags",
    meaning: "Domain classification labels (e.g. 'Analytics', 'AI', 'Web Application')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "techStack",
    label: "Technology Stack",
    meaning: "Frameworks, languages, and infrastructure (e.g. 'Next.js', 'PostgreSQL')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "note",
    label: "Author Annotation",
    meaning: "Optional disclaimer or contextual note about the project",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "url",
    label: "Project Website URL",
    meaning: "Primary public URL for the project",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "githubUrl",
    label: "Source Code Repository URL",
    meaning: "GitHub or other host URL for source code, if public",
    required: false,
    verboseField: false,
  },
];

/**
 * Source: `books_snapshots.payload` JSONB → `books` table.
 * Entity ID: AudioBookShelf item UUID.
 * Verified against `src/types/schemas/book.ts`.
 */
export const BOOK_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "title",
    label: "Book Title",
    meaning: "Full title as it appears on the cover",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "subtitle",
    label: "Book Subtitle",
    meaning: "Secondary title line, if any",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "authors",
    label: "Authors",
    meaning: "People who wrote the book, comma-separated",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "genres",
    label: "Literary Genres",
    meaning: "Genre classifications (e.g. 'Science Fiction', 'Business')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "publisher",
    label: "Publisher Name",
    meaning: "Publishing house that released the book",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "description",
    label: "Book Description",
    meaning: "Back-cover or catalog description (HTML-stripped from ABS API)",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "aiSummary",
    label: "AI-Generated Summary",
    meaning: "LLM-generated summary of content, themes, and takeaways",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "thoughts",
    label: "Personal Reading Notes",
    meaning: "Reader's personal annotations and reflections (subjective, first-person)",
    required: false,
    verboseField: true,
  },
];

/**
 * Source: MDX files in `data/blog/posts/*.mdx` → `blog_posts` table.
 * Entity ID: `"mdx-{slug}"`.
 * Verified against `src/types/blog.ts`.
 */
export const BLOG_POST_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "title",
    label: "Article Title",
    meaning: "Headline of the blog post",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "excerpt",
    label: "Article Summary",
    meaning: "Purpose-written SEO/social preview description (not first paragraph)",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "tags",
    label: "Topic Tags",
    meaning: "Subject matter keywords (e.g. 'ai', 'typescript', 'devops')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "author.name",
    label: "Article Author",
    meaning: "Display name of the person who wrote the article",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "rawContent",
    label: "Article Full Text",
    meaning: "Complete MDX body text with markup stripped; truncation-safe (placed last)",
    required: false,
    verboseField: true,
  },
];

/** Source: `ai_analysis_latest` table. Entity ID: `"{source_domain}:{entity_id}"`. */
export const AI_ANALYSIS_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "payload.analysis.summary",
    label: "AI Analysis Summary",
    meaning: "Machine-generated analytical summary of the source entity",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "payload.analysis.highlights",
    label: "AI Analysis Key Points",
    meaning: "Most important findings from the AI analysis",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "payload.analysis.themes",
    label: "AI Analysis Themes",
    meaning: "High-level thematic categories identified by the analysis",
    required: false,
    verboseField: false,
  },
];

/** Source: `opengraph_metadata` table. Entity ID: `url_hash` (SHA-256 hex). */
export const OPENGRAPH_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "payload.title",
    label: "OpenGraph Page Title",
    meaning: "og:title meta tag value from the web page",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "payload.description",
    label: "OpenGraph Page Description",
    meaning: "og:description meta tag value from the web page",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "url",
    label: "Page URL",
    meaning: "Full URL whose OpenGraph metadata was fetched",
    required: true,
    verboseField: false,
  },
];
