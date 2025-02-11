import {
  formatMultiple,
  formatPercentage,
  parsePacificDate,
  formatPacificDate,
  formatISOPacific,
  isValidUrl,
  extractDomain,
  truncateText,
  randomString
} from '../../lib/utils';

describe('formatMultiple', () => {
  it('formats numbers correctly', () => {
    expect(formatMultiple(2.5)).toBe('2.5x');
    expect(formatMultiple(0)).toBe('0x');
    expect(formatMultiple(1.0)).toBe('1.0x');
  });

  it('handles undefined/null', () => {
    expect(formatMultiple(undefined as any)).toBe('N/A');
    expect(formatMultiple(null as any)).toBe('N/A');
  });
});

describe('formatPercentage', () => {
  it('formats numbers correctly', () => {
    expect(formatPercentage(25.5)).toBe('25.5%');
    expect(formatPercentage(0)).toBe('0%');
    expect(formatPercentage(100)).toBe('100.0%');
  });

  it('handles undefined/null', () => {
    expect(formatPercentage(undefined as any)).toBe('N/A');
    expect(formatPercentage(null as any)).toBe('N/A');
  });
});

describe('Date Functions', () => {
  // Mock timezone to ensure consistent behavior
  const realDate = global.Date;
  const realIntl = global.Intl;

  beforeAll(() => {
    // Mock Date for consistent testing
    const constantDate = new Date('2024-03-14T20:00:00Z'); // 8PM UTC = noon Pacific
    global.Date = class extends realDate {
      constructor(date: any) {
        super(date || '2024-03-14T20:00:00Z');
      }
    } as DateConstructor;

    // Mock Intl.DateTimeFormat
    const MockDateTimeFormat = function(this: any, locale: string, options?: Intl.DateTimeFormatOptions) {
      return {
        format: (date?: Date | number) => {
          // Parse input date
          const inputDate = date instanceof Date ? date :
            typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ?
              new Date(`${date}T00:00:00`) :
              new Date(date || '2024-03-14T12:00:00');

          // Handle timezone formats
          if (options?.timeZoneName === 'short') return 'GMT -8';
          if (options?.timeZoneName === 'long') return 'GMT -08:00';
          if (options?.month === 'long') return 'March 14, 2024';

          // Build date parts
          const parts = [];
          if (options?.year) parts.push('2024');
          if (options?.month) parts.push('03');
          if (options?.day) parts.push('14');

          // Add time parts if needed
          if (options?.hour) {
            // Get time from input date
            const hours = inputDate.getHours();
            const minutes = inputDate.getMinutes();
            const seconds = inputDate.getSeconds();

            // Always use 00:00:00 for date-only strings
            if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
              return `${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`;
            }

            // Otherwise use actual time, ensuring midnight is 00:00:00
            const formattedHours = hours === 24 ? '00' : hours.toString().padStart(2, '0');
            const formattedMinutes = minutes.toString().padStart(2, '0');
            const formattedSeconds = seconds.toString().padStart(2, '0');

            return `${parts[0]}-${parts[1]}-${parts[2]}T${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
          }

          return parts.join('-');
        },
        resolvedOptions: () => ({ timeZone: 'America/Los_Angeles', ...options })
      };
    };
    global.Intl = {
      ...realIntl,
      DateTimeFormat: MockDateTimeFormat as unknown as typeof Intl.DateTimeFormat
    };
  });

  afterAll(() => {
    global.Date = realDate;
    global.Intl = realIntl;
  });

  describe('parsePacificDate', () => {
    it('parses date strings correctly', () => {
      const result = parsePacificDate('2024-03-14T12:00:00');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(2); // March is 2 (0-based)
      expect(result.getDate()).toBe(14);
    });

    it('handles Date objects', () => {
      const input = new Date('2024-03-14T12:00:00');
      const result = parsePacificDate(input);
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
    });
  });

  describe('formatPacificDate', () => {
    it('formats dates with timezone', () => {
      const result = formatPacificDate('2024-03-14T12:00:00');
      expect(result).toBe('March 14, 2024 (GMT-8)');
    });

    it('handles Date objects', () => {
      const input = new Date('2024-03-14T12:00:00');
      const result = formatPacificDate(input);
      expect(result).toBe('March 14, 2024 (GMT-8)');
    });
  });

  describe('formatISOPacific', () => {
    it('formats dates in ISO format with offset', () => {
      const result = formatISOPacific('2024-03-14T12:00:00');
      expect(result).toBe('2024-03-14T12:00:00-08:00');
    });

    it('handles Date objects', () => {
      const input = new Date('2024-03-14T12:00:00');
      const result = formatISOPacific(input);
      expect(result).toBe('2024-03-14T12:00:00-08:00');
    });
  });
});

describe('isValidUrl', () => {
  it('validates URLs correctly', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('extractDomain', () => {
  it('extracts domains from URLs', () => {
    expect(extractDomain('https://www.example.com')).toBe('example.com');
    expect(extractDomain('http://sub.example.com')).toBe('sub.example.com');
  });

  it('handles company names', () => {
    expect(extractDomain('Example Company')).toBe('examplecompany');
    expect(extractDomain('Company Name LLC')).toBe('companynamellc');
  });
});

describe('truncateText', () => {
  it('truncates long text', () => {
    expect(truncateText('This is a long text', 7)).toBe('This is...');
    expect(truncateText('Short', 10)).toBe('Short');
  });

  it('handles empty strings', () => {
    expect(truncateText('', 5)).toBe('');
  });
});

describe('randomString', () => {
  it('generates strings of correct length', () => {
    expect(randomString(5).length).toBe(5);
    expect(randomString(10).length).toBe(10);
  });

  it('generates different strings', () => {
    const str1 = randomString(5);
    const str2 = randomString(5);
    expect(str1).not.toBe(str2);
  });
});
