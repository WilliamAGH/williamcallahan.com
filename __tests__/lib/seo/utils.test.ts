/**
 * SEO Utilities Tests
 * @jest-environment node
 */

import { ensureAbsoluteUrl, getImageTypeFromUrl, formatSeoDate, formatOpenGraphDate, validateSeoDate } from '../../../lib/seo/utils';
import { NEXT_PUBLIC_SITE_URL } from '../../../lib/constants';
import { isPacificDateString } from '../../../types/seo';
import { parsePacificDate } from '../../../lib/dateTime';
import { PACIFIC_TIMEZONE, PST_OFFSET, PDT_OFFSET } from '../setup/environment';

describe('SEO Utilities', () => {
  describe('ensureAbsoluteUrl', () => {
    it('should return the same URL if already absolute', () => {
      const url = 'https://example.com/image.jpg';
      expect(ensureAbsoluteUrl(url)).toBe(url);
    });

    it('should prepend site URL to relative paths', () => {
      const path = '/images/photo.jpg';
      expect(ensureAbsoluteUrl(path)).toBe(`${NEXT_PUBLIC_SITE_URL}${path}`);
    });

    it('should handle paths without leading slash', () => {
      const path = 'images/photo.jpg';
      expect(ensureAbsoluteUrl(path)).toBe(`${NEXT_PUBLIC_SITE_URL}/${path}`);
    });
  });

  describe('getImageTypeFromUrl', () => {
    it('should return correct MIME type for SVG', () => {
      expect(getImageTypeFromUrl('logo.svg')).toBe('image/svg+xml');
    });

    it('should return correct MIME type for JPEG', () => {
      expect(getImageTypeFromUrl('photo.jpg')).toBe('image/jpeg');
      expect(getImageTypeFromUrl('photo.jpeg')).toBe('image/jpeg');
    });

    it('should return correct MIME type for PNG', () => {
      expect(getImageTypeFromUrl('image.png')).toBe('image/png');
    });

    it('should handle URLs with query parameters', () => {
      expect(getImageTypeFromUrl('photo.jpg?width=100')).toBe('image/jpeg');
    });

    it('should handle URLs with fragments', () => {
      expect(getImageTypeFromUrl('photo.jpg#preview')).toBe('image/jpeg');
    });
  });

  describe('Date Formatting', () => {
    describe('formatSeoDate (Schema.org)', () => {
      it('should always output full ISO format with timezone during standard time', () => {
        // January 1st (PST)
        const date = parsePacificDate('2025-01-01T12:00:00');
        const formatted = formatSeoDate(date);
        expect(isPacificDateString(formatted)).toBe(true);
        expect(formatted).toBe(`2025-01-01T12:00:00${PST_OFFSET}`);
      });

      it('should always output full ISO format with timezone during daylight savings', () => {
        // July 1st (PDT)
        const date = parsePacificDate('2025-07-01T12:00:00');
        const formatted = formatSeoDate(date);
        expect(isPacificDateString(formatted)).toBe(true);
        expect(formatted).toBe(`2025-07-01T12:00:00${PDT_OFFSET}`);
      });

      it('should convert date-only strings to midnight in Pacific Time', () => {
        const dateStr = '2025-02-10';
        const formatted = formatSeoDate(dateStr);
        expect(isPacificDateString(formatted)).toBe(true);
        expect(formatted).toBe(`2025-02-10T00:00:00${PST_OFFSET}`);
      });

      it('should handle undefined by using current time', () => {
        const formatted = formatSeoDate(undefined);
        expect(isPacificDateString(formatted)).toBe(true);
      });
    });

    describe('formatOpenGraphDate', () => {
      it('should preserve date-only format for publish dates', () => {
        const dateStr = '2025-02-10';
        const formatted = formatOpenGraphDate(dateStr, 'published');
        expect(formatted).toBe('2025-02-10');
      });

      it('should use full ISO format for modified dates', () => {
        const date = parsePacificDate('2025-01-01T15:30:45');
        const formatted = formatOpenGraphDate(date, 'modified');
        expect(formatted).toBe(`2025-01-01T15:30:45${PST_OFFSET}`);
      });

      it('should use full ISO format for publish dates with time', () => {
        const dateStr = '2025-02-10T12:30:00';
        const formatted = formatOpenGraphDate(dateStr, 'published');
        expect(formatted).toBe(`2025-02-10T12:30:00${PST_OFFSET}`);
      });

      it('should handle undefined by using current time', () => {
        const formatted = formatOpenGraphDate(undefined, 'published');
        expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}$/);
      });
    });
  });

  describe('validateSeoDate', () => {
    it('should validate correct Pacific Time format during standard time', () => {
      expect(validateSeoDate(`2025-01-01T12:00:00${PST_OFFSET}`)).toBe(true);
    });

    it('should validate correct Pacific Time format during daylight savings', () => {
      expect(validateSeoDate(`2025-07-01T12:00:00${PDT_OFFSET}`)).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validateSeoDate('2025-01-01')).toBe(false);
      expect(validateSeoDate('2025-01-01T12:00:00Z')).toBe(false);
      expect(validateSeoDate('2025-01-01T12:00:00+00:00')).toBe(false);
    });

    it('should reject invalid timezone offsets', () => {
      expect(validateSeoDate('2025-01-01T12:00:00-05:00')).toBe(false);
      expect(validateSeoDate('2025-01-01T12:00:00-09:00')).toBe(false);
    });
  });
});
