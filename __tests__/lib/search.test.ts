import { describe, it, expect, mock } from 'bun:test';
import { searchPosts, searchInvestments, searchExperience, searchEducation } from '../../lib/search';

// Mock the imported data modules using mock.module
void mock.module('../../data/blog/posts', () => ({
  posts: [
    {
      id: '1',
      title: 'Test Post 1',
      slug: 'test-post-1',
      excerpt: 'This is a test post about React',
      content: {} as any,
      publishedAt: '2024-01-01T00:00:00Z',
      author: { id: '1', name: 'John Doe' },
      tags: ['react', 'javascript']
    },
    {
      id: '2',
      title: 'Test Post 2',
      slug: 'test-post-2',
      excerpt: 'This is a test post about TypeScript',
      content: {} as any,
      publishedAt: '2024-01-02T00:00:00Z',
      author: { id: '1', name: 'John Doe' },
      tags: ['typescript', 'javascript']
    }
  ]
}));

void mock.module('../../data/investments', () => ({
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

void mock.module('../../data/experience', () => ({
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

void mock.module('../../data/education', () => ({
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
    it('should return all posts when query is empty', () => {
      const results = searchPosts('');
      expect(results).toHaveLength(2);
    });

    it('should find posts by title', () => {
      const results = searchPosts('Test Post 1');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.title).toBe('Test Post 1');
    });

    it('should find posts by content', () => {
      const results = searchPosts('react');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.excerpt).toContain('React');
    });

    it('should find posts by tags', () => {
      const results = searchPosts('javascript');
      expect(results).toHaveLength(2);
    });

    it('should find posts by author', () => {
      const results = searchPosts('John Doe');
      expect(results).toHaveLength(2);
    });

    it('should handle multi-word search', () => {
      const results = searchPosts('test typescript');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.title).toBe('Test Post 2');
    });

    it('should be case insensitive', () => {
      const results = searchPosts('REACT');
      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', () => {
      const results = searchPosts('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should sort by publishedAt in descending order', () => {
      const results = searchPosts('test');
      expect(results?.[0]?.publishedAt).toBe('2024-01-02T00:00:00Z');
      expect(results?.[1]?.publishedAt).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('searchInvestments', () => {
    it('should return all investments when query is empty', () => {
      const results = searchInvestments('');
      expect(results).toHaveLength(2);
    });

    it('should find investments by name', () => {
      const results = searchInvestments('fintech startup');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.label).toBe('Test Company 1');
    });

    it('should find exact investment matches', () => {
      const results = searchInvestments('Test Company 1 fintech');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.label).toBe('Test Company 1');

      const results2 = searchInvestments('Test Company 2 AI');
      expect(results2).toHaveLength(1);
      expect(results2?.[0]?.label).toBe('Test Company 2');
    });

    it('should find investments by description', () => {
      const results = searchInvestments('fintech');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.description).toContain('fintech');
    });

    it('should find investments by type and status', () => {
      const results = searchInvestments('Seed Active');
      expect(results).toHaveLength(1);
    });

    it('should include correct path in results', () => {
      const results = searchInvestments('Test Company 1');
      expect(results?.[0]?.path).toBe('/investments#1');
    });
  });

  describe('searchExperience', () => {
    it('should return all experiences when query is empty', () => {
      const results = searchExperience('');
      expect(results).toHaveLength(2);
    });

    it('should find experiences by company', () => {
      const results = searchExperience('Tech Corp');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.label).toBe('Tech Corp');
    });

    it('should find experiences by role', () => {
      const results = searchExperience('Senior Engineer');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.description).toBe('Senior Engineer');
    });

    it('should find experiences by period', () => {
      const results = searchExperience('2022');
      expect(results).toHaveLength(2);
    });

    it('should include correct path in results', () => {
      const results = searchExperience('Tech Corp');
      expect(results?.[0]?.path).toBe('/experience#1');
    });
  });

  describe('searchEducation', () => {
    it('should return all education items when query is empty', () => {
      const results = searchEducation('');
      expect(results).toHaveLength(2); // 1 education + 1 certification
    });

    it('should find education by institution', () => {
      const results = searchEducation('Test University');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.label).toBe('Test University');
    });

    it('should find education by degree', () => {
      const results = searchEducation('Computer Science');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.description).toBe('Computer Science');
    });

    it('should find certifications by name', () => {
      const results = searchEducation('Advanced Programming');
      expect(results).toHaveLength(1);
      expect(results?.[0]?.description).toBe('Advanced Programming');
    });

    it('should include correct path in results', () => {
      const results = searchEducation('Test University');
      expect(results?.[0]?.path).toBe('/education#1');
    });
  });
});
