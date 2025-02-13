/**
 * Search Functions Tests
 *
 * Tests search functionality across different content types:
 * - Blog posts
 * - Investments
 * - Professional experience
 * - Education and certifications
 *
 * @module __tests__/lib/search
 * @see {@link searchPosts} - Blog post search
 * @see {@link searchInvestments} - Investment search
 * @see {@link searchExperience} - Experience search
 * @see {@link searchEducation} - Education search
 */

import { searchPosts, searchInvestments, searchExperience, searchEducation } from '../../lib/search';
import type { SelectionItem } from '../../types/terminal';
import type { SearchResult } from '../../types/search';
import { TEST_POSTS } from './fixtures/blogPosts';
import { posts } from '../../data/blog/posts';

// Mock data modules with test fixtures
jest.mock('../../data/blog/posts', () => ({
  posts: [
    {
      id: '1',
      title: 'Test Post 1',
      slug: 'test-post-1',
      excerpt: 'This is a test post about React',
      content: {} as any,
      publishedAt: '2024-01-01T00:00:00Z',
      author: { id: '1', name: 'John Doe' },
      tags: ['react', 'javascript'],
      readingTime: 5
    },
    {
      id: '2',
      title: 'Test Post 2',
      slug: 'test-post-2',
      excerpt: 'This is a test post about TypeScript',
      content: {} as any,
      publishedAt: '2024-01-02T00:00:00Z',
      author: { id: '1', name: 'John Doe' },
      tags: ['typescript', 'javascript'],
      readingTime: 5
    }
  ]
}));

jest.mock('../../data/investments', () => ({
  investments: [
    {
      id: '1',
      name: 'Test Company 1',
      description: 'A fintech startup',
      type: 'Seed',
      status: 'Active',
      founded_year: '2020',
      invested_year: '2021'
    },
    {
      id: '2',
      name: 'Test Company 2',
      description: 'An AI company',
      type: 'Series A',
      status: 'Acquired',
      founded_year: '2019',
      invested_year: '2020',
      acquired_year: '2023'
    }
  ]
}));

jest.mock('../../data/experience', () => ({
  experiences: [
    {
      id: '1',
      company: 'Tech Corp',
      role: 'Senior Engineer',
      period: '2020-2022'
    },
    {
      id: '2',
      company: 'Startup Inc',
      role: 'Lead Developer',
      period: '2022-Present'
    }
  ]
}));

jest.mock('../../data/education', () => ({
  education: [
    {
      id: 'creighton-mimfa',
      institution: 'Creighton University',
      degree: 'Master of Investment Management & Financial Analysis (MIMFA)',
      year: '2016',
      website: 'https://www.creighton.edu',
      location: 'Omaha, Nebraska'
    }
  ],
  certifications: [
    {
      id: 'cfa',
      institution: 'CFA Institute',
      name: 'Chartered Financial Analyst (CFA) Charterholder',
      logo: '/images/cfa_institute_logo.png',
      year: '2016',
      website: 'https://www.cfainstitute.org',
      location: 'Charlottesville, Virginia'
    }
  ],
  recentCourses: []
}));

/**
 * Search function test suite
 * Tests search functionality and result formatting
 */
describe('Search Functions', () => {
  /**
   * Blog post search tests
   * Tests searching through blog post content
   */
  describe('Blog Post Search', () => {
    it('should return all posts when query is empty', async () => {
      const results = await searchPosts('', posts);
      expect(results).toHaveLength(posts.length);
    });

    it('should find posts by title', async () => {
      const results = await searchPosts('Test Post 1', posts);
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Test Post 1');
    });

    it('should find posts by content', async () => {
      const results = await searchPosts('react', posts);
      expect(results).toHaveLength(1);
      expect(results[0].label).toContain('Test Post 1');
    });

    it('should find posts by tags', async () => {
      const results = await searchPosts('javascript', posts);
      expect(results).toHaveLength(2);
    });

    it('should find posts by author', async () => {
      const results = await searchPosts('John Doe', posts);
      expect(results).toHaveLength(2);
    });

    it('should handle multi-word search', async () => {
      const results = await searchPosts('test typescript', posts);
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Test Post 2');
    });

    it('should be case insensitive', async () => {
      const results = await searchPosts('REACT', posts);
      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', async () => {
      const results = await searchPosts('nonexistent', posts);
      expect(results).toHaveLength(0);
    });
  });

  /**
   * Investment search tests
   * Tests searching through investment records
   */
  describe('Investment Search', () => {
    it('should return all investments when query is empty', async () => {
      const results = await searchInvestments('');
      expect(results).toHaveLength(2);
    });

    it('should find investments by name', async () => {
      const results = await searchInvestments('fintech startup');
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Test Company 1');
    });

    it('should find investments by type and status', async () => {
      const results = await searchInvestments('Seed Active');
      expect(results).toHaveLength(1);
    });

    it('should include correct path in results', async () => {
      const results = await searchInvestments('Test Company 1');
      expect(results[0].path).toBe('/investments#1');
    });
  });

  /**
   * Experience search tests
   * Tests searching through professional experience
   */
  describe('Experience Search', () => {
    it('should return all experiences when query is empty', async () => {
      const results = await searchExperience('');
      expect(results).toHaveLength(2);
    });

    it('should find experiences by company', async () => {
      const results = await searchExperience('Tech Corp');
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Tech Corp');
    });

    it('should find experiences by role', async () => {
      const results = await searchExperience('Senior Engineer');
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Tech Corp');
    });

    it('should find experiences by period', async () => {
      const results = await searchExperience('2022');
      expect(results).toHaveLength(2);
    });

    it('should include correct path in results', async () => {
      const results = await searchExperience('Tech Corp');
      expect(results[0].path).toBe('/experience#1');
    });
  });

  /**
   * Education search tests
   * Tests searching through education and certifications
   */
  describe('Education Search', () => {
    it('should return all education items when query is empty', async () => {
      const results = await searchEducation('');
      expect(results).toHaveLength(2); // 1 education + 1 certification
    });

    it('should find education by institution', async () => {
      const results = await searchEducation('Creighton University');
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Creighton University');
    });

    it('should find education by degree', async () => {
      const results = await searchEducation('Investment Management');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        label: 'Creighton University',
        value: 'education-creighton-mimfa',
        action: 'navigate',
        path: '/education#creighton-mimfa'
      });
    });

    it('should find certifications by name', async () => {
      const results = await searchEducation('Chartered Financial Analyst');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        label: 'CFA Institute',
        value: 'certification-cfa',
        action: 'navigate',
        path: '/education#cfa'
      });
    });

    it('should find education by institution', async () => {
      const results = await searchEducation('Creighton');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        label: 'Creighton University',
        value: 'education-creighton-mimfa',
        action: 'navigate',
        path: '/education#creighton-mimfa'
      });
    });

    it('should return empty array for no matches', async () => {
      const results = await searchEducation('nonexistent');
      expect(results).toHaveLength(0);
    });
  });
});
