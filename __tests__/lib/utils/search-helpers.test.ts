/**
 * Tests for search helper utilities
 */

import { dedupeDocuments, prepareDocumentsForIndexing } from '@/lib/utils/search-helpers';

describe('Search Helpers', () => {
  describe('dedupeDocuments', () => {
    it('should remove duplicate documents by id', () => {
      const documents = [
        { id: '1', title: 'First' },
        { id: '2', title: 'Second' },
        { id: '1', title: 'Duplicate' },
        { id: '3', title: 'Third' },
        { id: '2', title: 'Another Duplicate' }
      ];

      const result = dedupeDocuments(documents);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: '1', title: 'First' });
      expect(result[1]).toEqual({ id: '2', title: 'Second' });
      expect(result[2]).toEqual({ id: '3', title: 'Third' });
    });

    it('should handle numeric ids', () => {
      const documents = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 1, name: 'Duplicate Item 1' }
      ];

      const result = dedupeDocuments(documents);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, name: 'Item 1' });
      expect(result[1]).toEqual({ id: 2, name: 'Item 2' });
    });

    it('should use custom id extractor', () => {
      const documents = [
        { slug: 'post-1', title: 'First Post' },
        { slug: 'post-2', title: 'Second Post' },
        { slug: 'post-1', title: 'Duplicate Post' },
        { slug: 'post-3', title: 'Third Post' }
      ];

      const result = dedupeDocuments(documents, (doc) => doc.slug);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ slug: 'post-1', title: 'First Post' });
      expect(result[1]).toEqual({ slug: 'post-2', title: 'Second Post' });
      expect(result[2]).toEqual({ slug: 'post-3', title: 'Third Post' });
    });

    it('should handle empty arrays', () => {
      const result = dedupeDocuments([]);
      expect(result).toEqual([]);
    });

    it('should handle documents without duplicates', () => {
      const documents = [
        { id: '1', value: 'a' },
        { id: '2', value: 'b' },
        { id: '3', value: 'c' }
      ];

      const result = dedupeDocuments(documents);
      expect(result).toEqual(documents);
    });

    it('should skip documents with missing ids', () => {
      const documents = [
        { id: '1', title: 'First' },
        { title: 'No ID' } as any,
        { id: '', title: 'Empty ID' },
        { id: '2', title: 'Second' }
      ];

      const result = dedupeDocuments(documents);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', title: 'First' });
      expect(result[1]).toEqual({ id: '2', title: 'Second' });
    });

    it('should log warning for duplicates', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      const documents = [
        { id: '1', name: 'First' },
        { id: '1', name: 'Duplicate' },
        { id: '2', name: 'Second' },
        { id: '2', name: 'Another Duplicate' }
      ];

      dedupeDocuments(documents);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Search] 2 duplicate ID(s) detected and skipped:'),
        expect.any(String),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('prepareDocumentsForIndexing', () => {
    it('should deduplicate and log statistics', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      const documents = [
        { id: '1', name: 'First' },
        { id: '2', name: 'Second' },
        { id: '1', name: 'Duplicate' }
      ];

      const result = prepareDocumentsForIndexing(documents, 'Test Source');

      expect(result).toHaveLength(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Search] Test Source: Deduplicated 3 documents to 2 (removed 1 duplicates)'
      );

      consoleSpy.mockRestore();
    });

    it('should not log when no duplicates found', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      const documents = [
        { id: '1', name: 'First' },
        { id: '2', name: 'Second' }
      ];

      const result = prepareDocumentsForIndexing(documents, 'Test Source');

      expect(result).toHaveLength(2);
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should use custom id extractor', () => {
      const documents = [
        { code: 'ABC', value: 100 },
        { code: 'DEF', value: 200 },
        { code: 'ABC', value: 300 }
      ];

      const result = prepareDocumentsForIndexing(
        documents, 
        'Custom ID Test',
        (doc) => doc.code
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ code: 'ABC', value: 100 });
      expect(result[1]).toEqual({ code: 'DEF', value: 200 });
    });
  });
});