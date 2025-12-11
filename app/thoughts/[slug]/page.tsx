/**
 * Individual Thought Page
 * @module app/thoughts/[slug]/page
 * @description
 * Displays a single thought with full content and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThoughtDetail } from "@/components/features/thoughts/thought-detail";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import { RelatedContent, RelatedContentFallback } from "@/components/features/related-content";
import type { ThoughtPageContext } from "@/types/features/thoughts";
import type { Thought } from "@/types/schemas/thought";

/**
 * Mock data lookup - replace with actual data source
 * TODO: Implement thought lookup in lib/thoughts/service.server.ts
 */
function getThoughtBySlug(slug: string): Thought | null {
  // Placeholder data for development
  const mockThoughts: Record<string, Thought> = {
    "subtests-in-pytest": {
      id: "550e8400-e29b-41d4-a716-446655440001",
      slug: "subtests-in-pytest",
      title: "Subtests in pytest 9.0.0+",
      content: `pytest 9.0.0 introduced native subtest support via the \`subtests\` fixture. This is a game-changer for parameterized testing.

## Why subtests matter

When running parameterized tests, a failure in one case traditionally stops the entire test. With subtests, all cases run to completion, giving you a full picture of what's broken.

## Usage

\`\`\`python
def test_even_numbers(subtests):
    numbers = [2, 4, 5, 8, 10]  # 5 is deliberately wrong
    for n in numbers:
        with subtests.test(msg=f"checking {n}"):
            assert n % 2 == 0
\`\`\`

The key insight: you get **all** failures at once, not just the first one. This dramatically speeds up debugging when multiple edge cases are broken.

## Pro tip

Combine with \`pytest-xdist\` for parallel execution of subtests across cores.`,
      createdAt: "2025-12-04T21:44:04-08:00",
      category: "python",
      tags: ["testing", "pytest"],
    },
    "css-has-selector": {
      id: "550e8400-e29b-41d4-a716-446655440002",
      slug: "css-has-selector",
      title: "CSS :has() is finally here",
      content: `The \`:has()\` selector is the "parent selector" we've wanted for over a decade. Now with full browser support, it changes how we approach CSS.

## The old way

\`\`\`javascript
// JavaScript was needed to style parents
document.querySelectorAll('.card img').forEach(img => {
  img.closest('.card').classList.add('has-image');
});
\`\`\`

## The new way

\`\`\`css
/* Pure CSS parent selection */
.card:has(img) {
  grid-template-rows: auto 1fr;
}

.card:not(:has(img)) {
  padding-top: 2rem;
}
\`\`\`

## Powerful patterns

- \`:has(> .active)\` - direct child state
- \`:has(+ .sibling)\` - adjacent sibling check
- \`form:has(:invalid)\` - form validation states

The browser support is now excellent—Safari led the way, and Chrome/Firefox followed.`,
      createdAt: "2025-12-03T14:30:00-08:00",
      category: "css",
      tags: ["css", "selectors", "frontend"],
    },
    "bun-test-improvements": {
      id: "550e8400-e29b-41d4-a716-446655440003",
      slug: "bun-test-improvements",
      title: "Bun test runner keeps getting better",
      content: `The latest Bun releases have significantly improved the test runner. Here's what's new.

## Speed improvements

Tests now run 2-3x faster in many scenarios thanks to:
- Smarter module caching
- Parallel test file execution
- Optimized assertion internals

## Better Jest compatibility

\`\`\`typescript
// These now work as expected
jest.useFakeTimers();
jest.spyOn(object, 'method');
expect.extend({ customMatcher });
\`\`\`

## Snapshot testing

Bun now supports snapshot testing with a cleaner syntax:

\`\`\`typescript
test('snapshot', () => {
  expect(render(<Component />)).toMatchSnapshot();
});
\`\`\`

The migration from Jest is now practically seamless for most projects.`,
      createdAt: "2025-12-01T10:15:00-08:00",
      category: "tooling",
      tags: ["bun", "testing", "javascript"],
    },
    "typescript-satisfies-operator": {
      id: "550e8400-e29b-41d4-a716-446655440004",
      slug: "typescript-satisfies-operator",
      title: "TypeScript satisfies is underrated",
      content: `The \`satisfies\` operator is one of TypeScript 4.9's best additions, yet many developers don't know when to use it.

## The problem with type annotations

\`\`\`typescript
// This loses the literal types
const config: Record<string, string> = {
  apiUrl: "https://api.example.com",
  env: "production"
};
// config.apiUrl is now just 'string', not the literal
\`\`\`

## satisfies to the rescue

\`\`\`typescript
const config = {
  apiUrl: "https://api.example.com",
  env: "production"
} satisfies Record<string, string>;
// config.apiUrl is "https://api.example.com" (literal)
// AND we get type checking!
\`\`\`

## Best use cases

1. **Configuration objects** - validate structure, keep literals
2. **Theme definitions** - ensure all colors exist, infer values
3. **Route maps** - type-safe routing with literal paths

The key insight: use \`:\` when you want to widen, use \`satisfies\` when you want to validate without widening.`,
      createdAt: "2025-11-28T16:20:00-08:00",
      category: "typescript",
      tags: ["typescript", "type-safety"],
    },
  };

  return mockThoughts[slug] || null;
}

/**
 * Generate metadata for the thought page
 */
export async function generateMetadata({ params }: ThoughtPageContext): Promise<Metadata> {
  const { slug } = await params;
  const path = `/thoughts/${slug}`;
  const thought = getThoughtBySlug(slug);

  if (!thought) {
    return {
      ...getStaticPageMetadata(path, "thoughts"),
      title: "Thought Not Found",
      description: "The requested thought could not be found.",
    };
  }

  const baseMetadata = getStaticPageMetadata(path, "thoughts");
  const customTitle = generateDynamicTitle(thought.title, "thoughts");

  // Generate excerpt from content for description
  const excerpt = thought.content.slice(0, 155).replace(/\n/g, " ").trim() + "...";

  return {
    ...baseMetadata,
    title: customTitle,
    description: excerpt,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: excerpt,
      type: "article",
      url: ensureAbsoluteUrl(path),
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: excerpt,
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

/**
 * Individual thought page component
 */
export default async function ThoughtPage({ params }: ThoughtPageContext) {
  const { slug } = await params;
  const thought = getThoughtBySlug(slug);

  if (!thought) {
    notFound();
  }

  // Generate JSON-LD schema for this thought
  const thoughtPath = `/thoughts/${slug}`;

  const schemaParams = {
    path: thoughtPath,
    title: thought.title,
    description: thought.content.slice(0, 155).replace(/\n/g, " ").trim(),
    datePublished: formatSeoDate(thought.createdAt),
    dateModified: formatSeoDate(thought.updatedAt || thought.createdAt),
    type: "article" as const,
    keywords: thought.tags,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/thoughts", name: "Thoughts" },
      { path: thoughtPath, name: thought.title },
    ],
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />

      {/* Main Thought Content */}
      <div className="max-w-4xl mx-auto">
        <ThoughtDetail thought={thought} />
      </div>

      {/* Related Content Section */}
      <div className="bg-gradient-to-b from-transparent to-zinc-50/50 dark:to-zinc-900/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <Suspense fallback={<RelatedContentFallback title="Related Thoughts" className="relative" cardCount={3} />}>
            <RelatedContent
              sourceType="thought"
              sourceId={thought.id}
              sectionTitle="Related Content"
              options={{
                maxPerType: 3,
                maxTotal: 9,
                excludeTypes: [],
              }}
              className="relative"
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}
