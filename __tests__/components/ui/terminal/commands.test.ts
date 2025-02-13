/**
 * Terminal Commands Tests
 *
 * Tests the command handling functionality including:
 * - Core commands (help, clear)
 * - Navigation commands
 * - Search commands
 * - Error handling
 *
 * @module __tests__/components/ui/terminal/commands
 * @see {@link navigationCommands} - Command implementation
 * @see {@link handleCommand} - Command processing function
 */

import { handleCommand } from '@/components/ui/terminal/navigationCommands';
import { experiences } from '@/data/experience';

describe('Terminal Commands', () => {
  const mockSearchFn = async (query: string) => {
    const searchTerms = query.toLowerCase().split(' ');
    const matchingExperiences = experiences.filter(exp => {
      const searchFields = [
        exp.company,
        exp.role,
        exp.period,
        exp.location
      ].map(field => field?.toLowerCase());

      return searchTerms.every(term =>
        searchFields.some(field => field?.includes(term))
      );
    });

    return matchingExperiences.map(exp => ({
      label: exp.company,
      value: `experience-${exp.id}`,
      action: 'navigate' as const,
      path: `/experience#${exp.id}`
    }));
  };

  const mockPosts = [
    {
      id: 'test-post',
      title: 'Test Post',
      excerpt: 'Test excerpt',
      content: { compiledSource: 'Test content', frontmatter: {}, scope: {} },
      author: { id: 'test-author', name: 'Test Author', avatar: '/test-avatar.jpg' },
      slug: 'test-post',
      publishedAt: '2024-01-01',
      updatedAt: '2024-01-02',
      readingTime: 5,
      tags: ['test']
    }
  ];

  describe('Core Commands', () => {
    it('shows help text', async () => {
      const result = await handleCommand('help', { search: mockSearchFn, posts: mockPosts });
      expect(result.results[0].output).toContain('Available commands');
    });

    it('clears terminal', async () => {
      const result = await handleCommand('clear', { search: mockSearchFn, posts: mockPosts });
      expect(result.results).toHaveLength(0);
    });
  });

  describe('Search Commands', () => {
    it('handles search command with no category', async () => {
      const result = await handleCommand('search', { search: mockSearchFn, posts: mockPosts });
      expect(result.results[0].output).toContain('Search requires a category');
    });

    it('handles search command with invalid category', async () => {
      const result = await handleCommand('search invalid test', { search: mockSearchFn, posts: mockPosts });
      expect(result.results[0].output).toContain('Invalid search category');
    });

    it('handles search command with no query', async () => {
      const result = await handleCommand('search blog', { search: mockSearchFn, posts: mockPosts });
      expect(result.results[0].output).toContain('Please provide a search query');
    });
  });

  describe('Navigation Commands', () => {
    it('handles home navigation', async () => {
      const result = await handleCommand('home', { search: mockSearchFn, posts: mockPosts });
      expect(result.navigation).toBe('/');
    });

    it('handles blog navigation', async () => {
      const result = await handleCommand('blog', { search: mockSearchFn, posts: mockPosts });
      expect(result.navigation).toBe('/blog');
    });

    it('handles experience navigation', async () => {
      const result = await handleCommand('experience', { search: mockSearchFn, posts: mockPosts });
      expect(result.navigation).toBe('/experience');
    });

    it('handles skills navigation', async () => {
      const result = await handleCommand('skills', { search: mockSearchFn, posts: mockPosts });
      expect(result.navigation).toBe('/skills');
    });
  });

  describe('Error Handling', () => {
    it('handles empty command', async () => {
      const result = await handleCommand('', { search: mockSearchFn, posts: mockPosts });
      expect(result.results[0].output).toMatch(/please enter a command/i);
    });

    it('handles unknown command by searching', async () => {
      const result = await handleCommand('unknown', { search: mockSearchFn, posts: mockPosts });
      expect(result.results[0].output).toMatch(/automatically searched for "unknown"/i);
    });

    it('handles search errors', async () => {
      const mockErrorSearchFn = async () => {
        throw new Error('Search failed');
      };

      const result = await handleCommand('unknown', { search: mockErrorSearchFn, posts: mockPosts });
      expect(result.results[0].output).toMatch(/error searching for "unknown"/i);
    });
  });
});
