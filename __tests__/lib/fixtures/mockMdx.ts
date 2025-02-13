/**
 * Mock MDX Content
 *
 * Provides mock MDX content for testing blog-related components.
 * @module __tests__/lib/fixtures/mockMdx
 */

import { MDXRemoteSerializeResult } from 'next-mdx-remote';

/**
 * Creates a mock MDX serialization result
 * @param content - Raw content string to mock
 * @returns Mock MDX serialization result
 */
export function createMockMdx(content: string): MDXRemoteSerializeResult {
  return {
    compiledSource: `function MDXContent() { return ${JSON.stringify(content)}; }`,
    frontmatter: {},
    scope: {}
  };
}
