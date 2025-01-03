import {
  formatMultiple,
  formatPercentage,
  formatDate,
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

describe('formatDate', () => {
  // Mock timezone to ensure consistent behavior
  const realDate = global.Date;
  beforeAll(() => {
    const constantDate = new Date('2024-03-14T12:00:00Z');
    global.Date = class extends realDate {
      constructor(date: any) {
        super(date || '2024-03-14T12:00:00Z');
      }
    } as DateConstructor;
  });

  afterAll(() => {
    global.Date = realDate;
  });

  it('formats dates correctly', () => {
    const date = new Date('2024-03-14T12:00:00Z');
    expect(formatDate(date.toISOString())).toBe('March 14, 2024');
  });

  it('handles different date formats', () => {
    expect(formatDate('2024-03-14T12:00:00Z')).toBe('March 14, 2024');
    expect(formatDate('2024-03-14')).toBe('March 14, 2024');
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
