import { searchPosts, searchInvestments, searchExperience, searchEducation } from '../../lib/search';
import type { BlogPost } from '../../types/blog';
import type { SearchResult } from '../../types/search';

// Mock the imported data modules
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
      id: '1',
      institution: 'Test University',
      degree: 'Computer Science'
    }
  ],
  certifications: [
    {
      id: '2',
      institution: 'Tech Cert',
      name: 'Advanced Programming'
    }
  ]
}));

describe('search', () => {
  describe('searchPosts', () => {
    it('should return all posts when query is empty', async () => {
      const results = await searchPosts('');
      expect(results).toHaveLength(2);
    });

    it('should find posts by title', async () => {
      const results = await searchPosts('Test Post 1');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Post 1');
    });

    it('should find posts by content', async () => {
      const results = await searchPosts('react');
      expect(results).toHaveLength(1);
      expect(results[0].excerpt).toContain('React');
    });

    it('should find posts by tags', async () => {
      const results = await searchPosts('javascript');
      expect(results).toHaveLength(2);
    });

    it('should find posts by author', async () => {
      const results = await searchPosts('John Doe');
      expect(results).toHaveLength(2);
    });

    it('should handle multi-word search', async () => {
      const results = await searchPosts('test typescript');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Post 2');
    });

    it('should be case insensitive', async () => {
      const results = await searchPosts('REACT');
      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', async () => {
      const results = await searchPosts('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should sort by publishedAt in descending order', async () => {
      const results = await searchPosts('test');
      expect(results[0].publishedAt).toBe('2024-01-02T00:00:00Z');
      expect(results[1].publishedAt).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('searchInvestments', () => {
    it('should return all investments when query is empty', async () => {
      const results = await searchInvestments('');
      expect(results).toHaveLength(2);
    });

    it('should find investments by name', async () => {
      const results = await searchInvestments('fintech startup');
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Test Company 1');
    });

    it('should find exact investment matches', async () => {
      const results = await searchInvestments('Test Company 1 fintech');
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Test Company 1');

      const results2 = await searchInvestments('Test Company 2 AI');
      expect(results2).toHaveLength(1);
      expect(results2[0].label).toBe('Test Company 2');
    });

    it('should find investments by description', async () => {
      const results = await searchInvestments('fintech');
      expect(results).toHaveLength(1);
      expect(results[0].description).toContain('fintech');
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

  describe('searchExperience', () => {
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
      expect(results[0].description).toBe('Senior Engineer');
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

  describe('searchEducation', () => {
    it('should return all education items when query is empty', async () => {
      const results = await searchEducation('');
      expect(results).toHaveLength(2); // 1 education + 1 certification
    });

    it('should find education by institution', async () => {
      const results = await searchEducation('Test University');
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Test University');
    });

    it('should find education by degree', async () => {
      const results = await searchEducation('Computer Science');
      expect(results).toHaveLength(1);
      expect(results[0].description).toBe('Computer Science');
    });

    it('should find certifications by name', async () => {
      const results = await searchEducation('Advanced Programming');
      expect(results).toHaveLength(1);
      expect(results[0].description).toBe('Advanced Programming');
    });

    it('should include correct path in results', async () => {
      const results = await searchEducation('Test University');
      expect(results[0].path).toBe('/education#1');
    });
  });
});
