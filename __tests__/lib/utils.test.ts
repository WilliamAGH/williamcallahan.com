/**
 * Utils Tests
 * 
 * Tests utility functions used across the application:
 * 1. Date Formatting
 *    - Conversion of various date formats to human-readable strings
 *    - Consistent timezone handling (UTC)
 *    - Error handling for invalid dates
 * 
 * Test Environment:
 * - Uses mocked DateTimeFormat to ensure consistent timezone behavior
 * - Tests multiple date string formats
 * - Includes error cases
 */

import { formatDate } from '@/lib/utils';

describe('formatDate', () => {
  /**
   * Mock timezone to UTC for consistent testing
   */
  const originalDateTimeFormat = Intl.DateTimeFormat;

  beforeAll(() => {
    /**
     * Mock the DateTimeFormat to always use en-US and UTC
     */
    const DateTimeFormatMock = (
      _locales?: string | string[], 
      options?: Intl.DateTimeFormatOptions
    ) => new originalDateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
    
    DateTimeFormatMock.supportedLocalesOf = originalDateTimeFormat.supportedLocalesOf;
    global.Intl.DateTimeFormat = DateTimeFormatMock as typeof Intl.DateTimeFormat;
  });

  afterAll(() => {
    global.Intl.DateTimeFormat = originalDateTimeFormat;
  });

  /**
   * Test: Basic Date Formatting
   * 
   * Verifies:
   * 1. Correct conversion of ISO date string
   * 2. Proper month, day, and year formatting
   * 3. Consistent UTC timezone handling
   * 
   * Expected Behavior:
   * - Converts "2024-03-14T12:00:00Z" to "March 14, 2024"
   * - Uses English month names
   * - Maintains date accuracy across timezones
   */
  it('formats dates correctly', () => {
    const date = '2024-03-14T12:00:00Z';
    const formatted = formatDate(date);
    expect(formatted).toBe('March 14, 2024');
  });

  /**
   * Test: Multiple Date Format Support
   * 
   * Verifies:
   * 1. Handling of different ISO 8601 formats
   * 2. Consistent output regardless of input format
   * 3. Time component handling
   * 
   * Expected Behavior:
   * - All input formats produce same output
   * - Time components don't affect date display
   * - Timezone information is properly handled
   */
  it('handles different date formats', () => {
    const dates = [
      '2024-03-14',
      '2024-03-14T12:00:00Z',
      '2024-03-14T12:00:00.000Z'
    ];

    for (const date of dates) {
      const formatted = formatDate(date);
      expect(formatted).toBe('March 14, 2024');
    }
  });

  /**
   * Test: Invalid Date Handling
   * 
   * Verifies:
   * 1. Proper error handling for invalid input
   * 2. Consistent error message
   * 
   * Expected Behavior:
   * - Returns "Invalid Date" for non-date strings
   * - Doesn't throw errors for invalid input
   */
  it('handles invalid dates', () => {
    const date = 'not-a-date';
    const formatted = formatDate(date);
    expect(formatted).toBe('Invalid Date');
  });
});