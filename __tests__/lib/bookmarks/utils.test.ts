import { performance } from 'perf_hooks';
import {
  validateBookmarkUrl,
  sanitizeBookmarkTitle,
  parseBookmarkData,
  formatBookmarkDate,
  sortBookmarksByDate,
  groupBookmarksByCategory,
  searchBookmarks,
  exportBookmarksToJson,
  importBookmarksFromJson,
  generateBookmarkId,
  validateBookmarkSchema
} from '../../../lib/bookmarks/utils';

describe('Bookmarks Utils', () => {
  // Test setup and shared data
  const mockBookmark = {
    id: 'test-id-123',
    title: 'Test Bookmark',
    url: 'https://example.com',
    category: 'Development',
    tags: ['web', 'development'],
    dateAdded: new Date('2023-01-01'),
    description: 'A test bookmark'
  };

  const mockBookmarks = [
    mockBookmark,
    {
      id: 'test-id-456',
      title: 'Another Bookmark',
      url: 'https://another-example.com',
      category: 'Design',
      tags: ['design', 'ui'],
      dateAdded: new Date('2023-01-02'),
      description: 'Another test bookmark'
    }
  ];

  describe('validateBookmarkUrl', () => {
    describe('valid URLs', () => {
      it('should validate standard HTTP URLs', () => {
        expect(validateBookmarkUrl('http://example.com')).toBe(true);
        expect(validateBookmarkUrl('https://example.com')).toBe(true);
      });

      it('should validate URLs with paths and query parameters', () => {
        expect(validateBookmarkUrl('https://example.com/path?param=value')).toBe(true);
        expect(validateBookmarkUrl('https://subdomain.example.com/path/to/resource')).toBe(true);
      });

      it('should validate URLs with ports', () => {
        expect(validateBookmarkUrl('https://example.com:8080')).toBe(true);
        expect(validateBookmarkUrl('http://localhost:3000')).toBe(true);
      });
    });

    describe('invalid URLs', () => {
      it('should reject invalid URL formats', () => {
        expect(validateBookmarkUrl('not-a-url')).toBe(false);
        expect(validateBookmarkUrl('ftp://example.com')).toBe(false);
        expect(validateBookmarkUrl('')).toBe(false);
      });

      it('should reject null and undefined inputs', () => {
        expect(validateBookmarkUrl(null as any)).toBe(false);
        expect(validateBookmarkUrl(undefined as any)).toBe(false);
      });

      it('should reject malformed URLs', () => {
        expect(validateBookmarkUrl('https://')).toBe(false);
        expect(validateBookmarkUrl('https://.')).toBe(false);
        expect(validateBookmarkUrl('https:// example.com')).toBe(false);
      });
    });
  });

  describe('sanitizeBookmarkTitle', () => {
    describe('normal sanitization', () => {
      it('should trim whitespace from titles', () => {
        expect(sanitizeBookmarkTitle('  Test Title  ')).toBe('Test Title');
        expect(sanitizeBookmarkTitle('\n\tTest Title\n\t')).toBe('Test Title');
      });

      it('should remove HTML tags from titles', () => {
        expect(sanitizeBookmarkTitle('<script>alert("xss")</script>Clean Title')).toBe('Clean Title');
        expect(sanitizeBookmarkTitle('<div>Title with <strong>formatting</strong></div>')).toBe('Title with formatting');
      });

      it('should handle special characters appropriately', () => {
        expect(sanitizeBookmarkTitle('Title & Description')).toBe('Title & Description');
        expect(sanitizeBookmarkTitle('Title "with quotes"')).toBe('Title "with quotes"');
      });
    });

    describe('edge cases', () => {
      it('should handle empty and null inputs', () => {
        expect(sanitizeBookmarkTitle('')).toBe('');
        expect(sanitizeBookmarkTitle(null as any)).toBe('');
        expect(sanitizeBookmarkTitle(undefined as any)).toBe('');
      });

      it('should handle very long titles', () => {
        const longTitle = 'a'.repeat(1000);
        const sanitized = sanitizeBookmarkTitle(longTitle);
        expect(sanitized.length).toBeLessThanOrEqual(255);
      });

      it('should handle non-string inputs gracefully', () => {
        expect(sanitizeBookmarkTitle(123 as any)).toBe('123');
        expect(sanitizeBookmarkTitle(true as any)).toBe('true');
      });
    });
  });

  describe('parseBookmarkData', () => {
    describe('valid bookmark data', () => {
      it('should parse complete bookmark objects correctly', () => {
        const result = parseBookmarkData(mockBookmark);
        expect(result).toEqual(expect.objectContaining({
          id: 'test-id-123',
          title: 'Test Bookmark',
          url: 'https://example.com',
          category: 'Development'
        }));
      });

      it('should handle partial bookmark data with defaults', () => {
        const partialData = { title: 'Partial', url: 'https://example.com' };
        const result = parseBookmarkData(partialData as any);
        expect(result.id).toBeDefined();
        expect(result.dateAdded).toBeInstanceOf(Date);
        expect(result.category).toBe('Uncategorized');
      });
    });

    describe('invalid bookmark data', () => {
      it('should throw error for missing required fields', () => {
        expect(() => parseBookmarkData({} as any)).toThrow('Missing required field: title');
        expect(() => parseBookmarkData({ title: 'Test' } as any)).toThrow('Missing required field: url');
      });

      it('should throw error for invalid URL in data', () => {
        const invalidData = { title: 'Test', url: 'invalid-url' };
        expect(() => parseBookmarkData(invalidData as any)).toThrow('Invalid URL format');
      });
    });
  });

  describe('validateBookmarkSchema', () => {
    it('should validate complete bookmark schema', () => {
      expect(validateBookmarkSchema(mockBookmark)).toBe(true);
    });

    it('should reject bookmarks with missing required fields', () => {
      const incomplete = { title: 'Test' };
      expect(validateBookmarkSchema(incomplete as any)).toBe(false);
    });

    it('should reject bookmarks with invalid field types', () => {
      const invalid = { ...mockBookmark, dateAdded: 'not-a-date' };
      expect(validateBookmarkSchema(invalid as any)).toBe(false);
    });
  });

  describe('formatBookmarkDate', () => {
    it('should format dates in standard format', () => {
      const date = new Date('2023-01-15T10:30:00Z');
      expect(formatBookmarkDate(date)).toBe('2023-01-15');
    });

    it('should handle different date input formats', () => {
      expect(formatBookmarkDate('2023-01-15')).toBe('2023-01-15');
      expect(formatBookmarkDate(1673785800000)).toBe('2023-01-15');
    });

    it('should handle invalid dates gracefully', () => {
      expect(formatBookmarkDate('invalid-date' as any)).toBe('Invalid Date');
      expect(formatBookmarkDate(null as any)).toBe('Invalid Date');
    });
  });

  describe('sortBookmarksByDate', () => {
    it('should sort bookmarks by date ascending', () => {
      const result = sortBookmarksByDate(mockBookmarks, 'asc');
      expect(result[0].dateAdded.getTime()).toBeLessThan(result[1].dateAdded.getTime());
    });

    it('should sort bookmarks by date descending', () => {
      const result = sortBookmarksByDate(mockBookmarks, 'desc');
      expect(result[0].dateAdded.getTime()).toBeGreaterThan(result[1].dateAdded.getTime());
    });

    it('should handle empty arrays', () => {
      expect(sortBookmarksByDate([], 'asc')).toEqual([]);
    });

    it('should not mutate original array', () => {
      const original = [...mockBookmarks];
      sortBookmarksByDate(mockBookmarks, 'desc');
      expect(mockBookmarks).toEqual(original);
    });
  });

  describe('groupBookmarksByCategory', () => {
    it('should group bookmarks by category correctly', () => {
      const result = groupBookmarksByCategory(mockBookmarks);
      expect(result.Development).toHaveLength(1);
      expect(result.Design).toHaveLength(1);
      expect(result.Development[0].title).toBe('Test Bookmark');
    });

    it('should handle bookmarks without categories', () => {
      const bookmarksWithoutCategory = [{ ...mockBookmark, category: undefined }];
      const result = groupBookmarksByCategory(bookmarksWithoutCategory as any);
      expect(result.Uncategorized).toHaveLength(1);
    });

    it('should handle empty bookmark arrays', () => {
      expect(groupBookmarksByCategory([])).toEqual({});
    });
  });

  describe('searchBookmarks', () => {
    describe('search functionality', () => {
      it('should search by title', () => {
        const result = searchBookmarks(mockBookmarks, 'Test');
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Test Bookmark');
      });

      it('should search by URL', () => {
        const result = searchBookmarks(mockBookmarks, 'example.com');
        expect(result).toHaveLength(1);
      });

      it('should search by tags', () => {
        const result = searchBookmarks(mockBookmarks, 'development');
        expect(result).toHaveLength(1);
      });

      it('should be case insensitive', () => {
        const result = searchBookmarks(mockBookmarks, 'TEST');
        expect(result).toHaveLength(1);
      });
    });

    describe('edge cases', () => {
      it('should handle empty search queries', () => {
        expect(searchBookmarks(mockBookmarks, '')).toEqual(mockBookmarks);
      });

      it('should handle queries with no matches', () => {
        expect(searchBookmarks(mockBookmarks, 'nonexistent')).toEqual([]);
      });

      it('should handle null and undefined queries', () => {
        expect(searchBookmarks(mockBookmarks, null as any)).toEqual(mockBookmarks);
        expect(searchBookmarks(mockBookmarks, undefined as any)).toEqual(mockBookmarks);
      });
    });
  });

  describe('exportBookmarksToJson', () => {
    it('should export bookmarks to valid JSON string', () => {
      const result = exportBookmarksToJson(mockBookmarks);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
    });

    it('should handle empty bookmark arrays', () => {
      const result = exportBookmarksToJson([]);
      expect(JSON.parse(result)).toEqual([]);
    });

    it('should preserve all bookmark properties', () => {
      const result = exportBookmarksToJson([mockBookmark]);
      const parsed = JSON.parse(result);
      expect(parsed[0]).toEqual(expect.objectContaining({
        id: mockBookmark.id,
        title: mockBookmark.title,
        url: mockBookmark.url,
        category: mockBookmark.category
      }));
    });
  });

  describe('importBookmarksFromJson', () => {
    const validJsonString = JSON.stringify(mockBookmarks);

    it('should import bookmarks from valid JSON string', () => {
      const result = importBookmarksFromJson(validJsonString);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Test Bookmark');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => importBookmarksFromJson('invalid json')).toThrow('Invalid JSON format');
    });

    it('should validate imported bookmark schema', () => {
      const invalidBookmarks = JSON.stringify([{ title: 'Missing URL' }]);
      expect(() => importBookmarksFromJson(invalidBookmarks)).toThrow('Invalid bookmark schema');
    });

    it('should handle empty JSON arrays', () => {
      const result = importBookmarksFromJson('[]');
      expect(result).toEqual([]);
    });
  });

  describe('generateBookmarkId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateBookmarkId();
      const id2 = generateBookmarkId();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs of consistent format', () => {
      const id = generateBookmarkId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      // Assuming UUID-like format
      expect(id).toMatch(/^[a-f0-9-]+$/);
    });

    it('should generate IDs that are URL-safe', () => {
      const id = generateBookmarkId();
      expect(encodeURIComponent(id)).toBe(id);
    });
  });

  describe('performance tests', () => {
    it('should handle large arrays efficiently', () => {
      const largeBookmarkArray = Array.from({ length: 10000 }, (_, i) => ({
        ...mockBookmark,
        id: `test-${i}`,
        title: `Bookmark ${i}`
      }));

      const start = performance.now();
      searchBookmarks(largeBookmarkArray, 'Bookmark 5000');
      const end = performance.now();
      expect(end - start).toBeLessThan(100);
    });

    it('should handle sorting large arrays efficiently', () => {
      const largeBookmarkArray = Array.from({ length: 1000 }, (_, i) => ({
        ...mockBookmark,
        id: `test-${i}`,
        dateAdded: new Date(Date.now() - Math.random() * 1000000000)
      }));

      const start = performance.now();
      sortBookmarksByDate(largeBookmarkArray, 'desc');
      const end = performance.now();
      expect(end - start).toBeLessThan(50);
    });
  });
});