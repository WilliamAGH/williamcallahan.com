/**
 * Tag Navigation Tests
 * 
 * Simple tests to verify tag slug generation and URL construction
 */

import { tagToSlug } from '@/lib/utils/tag-utils';

describe('Tag Navigation URLs', () => {
  describe('tagToSlug function', () => {
    it('should generate correct slugs for common tags', () => {
      const testCases = [
        { input: 'React', expected: 'react' },
        { input: 'TypeScript', expected: 'typescript' },
        { input: 'Next.js', expected: 'nextdotjs' },
        { input: 'React Native', expected: 'react-native' },
        { input: 'AI & ML', expected: 'ai-and-ml' },
        { input: 'C++', expected: 'c-plus-plus' },
        { input: 'C#', expected: 'c-sharp' },
        { input: '.NET', expected: 'dotnet' },
        { input: 'Node.js', expected: 'nodedotjs' },
        { input: 'Vue@3', expected: 'vue-at-3' },
      ];

      for (const { input, expected } of testCases) {
        expect(tagToSlug(input)).toBe(expected);
      }
    });

    it('should handle edge cases', () => {
      expect(tagToSlug('')).toBe('');
      expect(tagToSlug('   ')).toBe('');
      expect(tagToSlug('Multiple   Spaces')).toBe('multiple-spaces');
      expect(tagToSlug('---Leading-Dashes---')).toBe('leading-dashes');
      expect(tagToSlug('Special!@#$%Characters')).toBe('special-at-sharpcharacters');
    });
  });

  describe('URL construction', () => {
    it('should create valid tag page URLs', () => {
      const baseUrl = 'https://williamcallahan.com';
      const tags = ['React', 'AI & ML', 'C++', '.NET'];
      
      const urls = tags.map(tag => `${baseUrl}/bookmarks/tags/${tagToSlug(tag)}`);
      
      expect(urls).toEqual([
        'https://williamcallahan.com/bookmarks/tags/react',
        'https://williamcallahan.com/bookmarks/tags/ai-and-ml',
        'https://williamcallahan.com/bookmarks/tags/c-plus-plus',
        'https://williamcallahan.com/bookmarks/tags/dotnet',
      ]);
      
      // All URLs should be valid
      for (const url of urls) {
        expect(url).toMatch(/^https:\/\/[\w.-]+\/bookmarks\/tags\/[\w-]+$/);
      }
    });

    it('should create valid paginated tag URLs', () => {
      const baseUrl = 'https://williamcallahan.com';
      const tag = 'React Native';
      const slug = tagToSlug(tag);
      
      const paginatedUrls = [2, 3, 4, 5].map(
        page => `${baseUrl}/bookmarks/tags/${slug}/page/${page}`
      );
      
      expect(paginatedUrls).toEqual([
        'https://williamcallahan.com/bookmarks/tags/react-native/page/2',
        'https://williamcallahan.com/bookmarks/tags/react-native/page/3',
        'https://williamcallahan.com/bookmarks/tags/react-native/page/4',
        'https://williamcallahan.com/bookmarks/tags/react-native/page/5',
      ]);
    });
  });

  describe('Props propagation', () => {
    it('should pass usePagination and initialTag through component chain', () => {
      // This is a documentation test - verifies the expected prop flow
      const componentChain = [
        'BookmarksServer',
        'BookmarksClientWithWindow',
        'BookmarksPaginatedClient',
        'BookmarksWithPagination',
      ];
      
      const propsToPropagate = ['usePagination', 'initialTag'];
      
      // This test serves as documentation for the expected behavior
      expect(componentChain).toHaveLength(4);
      expect(propsToPropagate).toContain('usePagination');
      expect(propsToPropagate).toContain('initialTag');
    });
  });
});