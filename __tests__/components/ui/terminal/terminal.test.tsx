/**
 * Terminal Component Tests
 *
 * @module __tests__/components/ui/terminal/terminal
 * @see {@link Terminal} - Component being tested
 * @see {@link docs/development/testing.md} - Critical testing guidelines
 *
 * CRITICAL TEST RULES:
 * 1. ALWAYS use real app data over mocks where possible
 * 2. ALL tests must be read-only
 * 3. NEVER use React hooks directly in test files
 * 4. Use TestTerminalProvider for consistent test environment
 *
 * Common Terminal Testing Mistakes to Avoid:
 * 1. Using React hooks in test files (they're for components, not tests)
 * 2. Creating unnecessary mock data (use TEST_POSTS from fixtures)
 * 3. Not cleaning up after tests (use beforeEach/afterEach)
 * 4. Not handling timezone edge cases (test both PST/PDT)
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Terminal } from '@/components/ui/terminal';
import { TestTerminalProvider } from '@/__tests__/lib/setup/terminal';
import { TEST_POSTS } from '@/__tests__/lib/fixtures/blogPosts';
import type { BlogPost } from '@/types/blog';
import type { SelectionItem } from '@/types/terminal';

describe.skip('Terminal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <TestTerminalProvider pathname="/">
      {children}
    </TestTerminalProvider>
  );

  /**
   * Real search function that uses actual blog posts
   * Returns properly typed SelectionItems
   */
  const searchBlogPosts = async (query: string, posts: BlogPost[]): Promise<SelectionItem[]> => {
    return posts
      .filter(post => post.title.toLowerCase().includes(query.toLowerCase()))
      .map(post => ({
        label: post.title,
        value: `blog-${post.slug}`,
        action: 'navigate' as const,
        path: `/blog/${post.slug}#content`
      }));
  };

  it('renders terminal interface', () => {
    render(<Terminal />, { wrapper: TestWrapper });

    // Terminal should be accessible
    const terminal = screen.getByRole('region', { name: /terminal interface/i });
    expect(terminal).toBeInTheDocument();

    // Input should be present
    const input = screen.getByRole('searchbox', { name: /enter command/i });
    expect(input).toBeInTheDocument();
  });

  it('accepts user input', () => {
    render(<Terminal />, { wrapper: TestWrapper });

    const input = screen.getByRole('searchbox', { name: /enter command/i });
    fireEvent.change(input, { target: { value: 'test' } });
    expect(input).toHaveValue('test');
  });

  it('shows command in history', async () => {
    render(<Terminal />, { wrapper: TestWrapper });

    const input = screen.getByRole('searchbox', { name: /enter command/i });
    const form = screen.getByRole('search');

    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(form);

    await waitFor(() => {
      const history = screen.getByRole('log', { name: /terminal command history/i });
      expect(history).toHaveTextContent('hello');
    });
  });

  it('clears history on clear command', async () => {
    render(<Terminal />, { wrapper: TestWrapper });

    const input = screen.getByRole('searchbox', { name: /enter command/i });
    const form = screen.getByRole('search');

    // Add some history
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.submit(form);

    await waitFor(() => {
      const history = screen.getByRole('log', { name: /terminal command history/i });
      expect(history).toHaveTextContent('test');
    });

    // Clear it
    fireEvent.change(input, { target: { value: 'clear' } });
    fireEvent.submit(form);

    await waitFor(() => {
      const history = screen.getByRole('log', { name: /terminal command history/i });
      expect(history).not.toHaveTextContent('test');
    });
  });

  describe('Search Functionality', () => {
    it('handles search commands with real blog posts', async () => {
      render(
        <Terminal
          searchFn={searchBlogPosts}
          posts={TEST_POSTS}
        />,
        { wrapper: TestWrapper }
      );

      const input = screen.getByRole('searchbox', { name: /enter command/i });
      const form = screen.getByRole('search');

      // Search for a known test post title
      fireEvent.change(input, { target: { value: 'search blog Test Post 1' } });
      fireEvent.submit(form);

      // Wait for and verify search results
      await waitFor(() => {
        const history = screen.getByRole('log', { name: /terminal command history/i });
        expect(history).toHaveTextContent(/blog search results/i);
      });

      // Verify selection list appears
      const results = await screen.findByRole('list', { name: /available options/i });
      expect(results).toBeInTheDocument();
      expect(results).toHaveTextContent('Test Post 1');
    });

    it('handles search with no results', async () => {
      render(
        <Terminal
          searchFn={searchBlogPosts}
          posts={TEST_POSTS}
        />,
        { wrapper: TestWrapper }
      );

      const input = screen.getByRole('searchbox', { name: /enter command/i });
      const form = screen.getByRole('search');

      fireEvent.change(input, { target: { value: 'search blog nonexistent' } });
      fireEvent.submit(form);

      // Verify empty results message
      await waitFor(() => {
        const history = screen.getByRole('log', { name: /terminal command history/i });
        expect(history).toHaveTextContent(/blog search results/i);
      });
    });
  });
});
