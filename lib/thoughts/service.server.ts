/**
 * Thoughts Data Service (Server)
 * @module lib/thoughts/service.server
 * @description
 * Server-side data access for thoughts (TIL-style short-form content).
 * Currently uses mock data; replace with actual data source when ready.
 *
 * TODO: Implement actual data persistence (database, MDX files, or CMS)
 */

import type { Thought, ThoughtListItem } from "@/types/schemas/thought";

/**
 * Mock thoughts data for development
 * This should be replaced with actual data fetching from your data source
 */
const mockThoughts: Thought[] = [
  {
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
  {
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
  {
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
  {
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
];

/**
 * Generate excerpt from content
 */
function generateExcerpt(content: string, maxLength = 160): string {
  // Remove markdown formatting for clean excerpt
  const cleaned = content
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/`[^`]+`/g, "") // Remove inline code
    .replace(/#{1,6}\s+/g, "") // Remove headings
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
    .replace(/\*([^*]+)\*/g, "$1") // Remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links
    .replace(/\n+/g, " ") // Replace newlines with spaces
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trim()}...`;
}

/**
 * Get all thoughts
 */
export function getThoughts(): Promise<Thought[]> {
  // TODO: Replace with actual data fetching
  // Using Promise.resolve for future async data source compatibility
  return Promise.resolve(mockThoughts);
}

/**
 * Get all thoughts as list items (with excerpts, no full content)
 */
export async function getThoughtListItems(): Promise<ThoughtListItem[]> {
  const thoughts = await getThoughts();
  return thoughts.map(thought => ({
    id: thought.id,
    slug: thought.slug,
    title: thought.title,
    excerpt: generateExcerpt(thought.content),
    createdAt: thought.createdAt,
    updatedAt: thought.updatedAt,
    category: thought.category,
    tags: thought.tags,
    draft: thought.draft,
  }));
}

/**
 * Get a thought by slug
 */
export async function getThoughtBySlug(slug: string): Promise<Thought | null> {
  const thoughts = await getThoughts();
  return thoughts.find(t => t.slug === slug) ?? null;
}

/**
 * Get a thought by ID
 */
export async function getThoughtById(id: string): Promise<Thought | null> {
  const thoughts = await getThoughts();
  return thoughts.find(t => t.id === id) ?? null;
}

/**
 * Get all unique categories with counts
 */
export async function getThoughtCategories(): Promise<Array<{ id: string; name: string; count: number }>> {
  const thoughts = await getThoughts();
  const categoryCounts = new Map<string, number>();

  for (const thought of thoughts) {
    if (thought.category) {
      const current = categoryCounts.get(thought.category) ?? 0;
      categoryCounts.set(thought.category, current + 1);
    }
  }

  return Array.from(categoryCounts.entries()).map(([name, count]) => ({
    id: name.toLowerCase(),
    name,
    count,
  }));
}
