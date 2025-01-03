import { describe, expect, it, jest } from '@jest/globals';
import { GET } from '../../app/api/logo/route';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Request } from './setup/logo';
import type { LogoSource } from '../../types/logo';
import { ServerCacheInstance } from '../../lib/server-cache';
import { LOGO_SOURCES, GENERIC_GLOBE_PATTERNS } from '../../lib/constants';
import type { Metadata, Sharp, FormatEnum } from 'sharp';

interface LogoFetchResult {
  url: string | null;
  buffer?: Buffer;
  source?: LogoSource;
  error?: string;
  timestamp: number;
}

type SharpInstance = Sharp;

// Mock placeholder SVG content
const mockPlaceholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="circleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f8f9fa;stop-opacity:0.95"/>
      <stop offset="100%" style="stop-color:#e9ecef;stop-opacity:0.95"/>
    </linearGradient>
    <linearGradient id="buildingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#2b3137"/>
      <stop offset="100%" style="stop-color:#373d44"/>
    </linearGradient>
    <linearGradient id="windowGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#a8d8ff"/>
      <stop offset="100%" style="stop-color:#75b6ff"/>
    </linearGradient>
  </defs>

  <!-- Background circle -->
  <circle cx="50" cy="50" r="48" fill="url(#circleGradient)" stroke="#dee2e6" stroke-width="1.5"/>

  <!-- Building complex - properly centered -->
  <g transform="translate(27.5, 10)">
    <!-- Main tower -->
    <path d="M15 10 L35 10 L35 75 L15 75 Z" fill="url(#buildingGradient)"/>

    <!-- Secondary tower -->
    <path d="M0 22 L15 22 L15 75 L0 75 Z" fill="url(#buildingGradient)"/>

    <!-- Connecting section -->
    <path d="M35 30 L45 30 L45 75 L35 75 Z" fill="url(#buildingGradient)"/>

    <!-- Architectural details - Main tower -->
    <rect x="17" y="15" width="16" height="3" fill="#4a525a"/>
    <rect x="17" y="24" width="16" height="3" fill="#4a525a"/>
    <rect x="17" y="33" width="16" height="3" fill="#4a525a"/>
    <rect x="17" y="42" width="16" height="3" fill="#4a525a"/>
    <rect x="17" y="51" width="16" height="3" fill="#4a525a"/>
    <rect x="17" y="60" width="16" height="3" fill="#4a525a"/>

    <!-- Windows - Secondary tower -->
    <rect x="2" y="28" width="11" height="13" fill="url(#windowGradient)" opacity="0.9"/>
    <rect x="2" y="46" width="11" height="13" fill="url(#windowGradient)" opacity="0.9"/>

    <!-- Windows - Connecting section -->
    <rect x="37" y="35" width="6" height="10" fill="url(#windowGradient)" opacity="0.9"/>
    <rect x="37" y="50" width="6" height="10" fill="url(#windowGradient)" opacity="0.9"/>

    <!-- Rooftop details -->
    <path d="M15 10 L25 3 L35 10" fill="#2b3137"/>
    <rect x="24" y="5" width="2" height="5" fill="#4a525a"/>

    <!-- Ground floor details -->
    <path d="M0 75 L45 75 L43 79 L2 79 Z" fill="#232323"/>

    <!-- Entrance -->
    <rect x="22" y="65" width="6" height="10" fill="#4a525a"/>
    <rect x="23" y="66" width="4" height="9" fill="url(#windowGradient)" opacity="0.7"/>
  </g>
</svg>`;

// Mock fs
const mockFs = {
  readFile: jest.fn((path: string) => Promise.resolve(Buffer.from(mockPlaceholderSvg))),
  access: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve())
};

jest.mock('fs/promises', () => mockFs);

// Mock fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock sharp
const createMockSharp = (metadata: Partial<Metadata> = {}, buffer: Buffer = Buffer.from('test-image')): SharpInstance => {
  const instance = {
    metadata: () => Promise.resolve({
      width: 256,
      height: 256,
      format: 'png',
      ...metadata,
    } as Metadata),
    png: () => ({
      toBuffer: () => Promise.resolve(buffer),
    }),
    toBuffer: () => Promise.resolve(buffer),
  } as SharpInstance;
  return instance;
};

const mockSharp = jest.fn((input?: Buffer) => createMockSharp(undefined, input || Buffer.from('test-image')));

jest.mock('sharp', () => ({
  __esModule: true,
  default: mockSharp,
}));

// Helper function to create mock responses with proper types
const createMockResponse = (body: BodyInit | null, init?: ResponseInit): Response => {
  // biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
  const ResponseConstructor = Response as any;
  const response = new ResponseConstructor(body, init);
  if (body instanceof Buffer) {
    Object.defineProperty(response, 'arrayBuffer', {
      value: () => Promise.resolve(body),
    });
  }
  return response;
};

describe('Logo API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock) = jest.fn();
    // Clear the cache before each test
    ServerCacheInstance.clear();
  });

  it('should return cached logo if available', async () => {
    const mockBuffer = Buffer.from('test-logo');
    // Mock the cache directly instead of using spy
    ServerCacheInstance.setLogoFetch('angellist.com', {
      url: null,
      buffer: mockBuffer,
      source: 'google',
      timestamp: Date.now(),
    });

    const request = new Request('http://localhost:3000/api/logo?website=https://angellist.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer).toEqual(mockBuffer);
    expect(response.headers.get('x-logo-source')).toBe('google');
  });

  it('should handle successful logo fetches from Google', async () => {
    const mockBuffer = Buffer.from('test-image');
    (global.fetch as jest.Mock).mockImplementation(async (url: unknown): Promise<Response> => {
      if (url instanceof URL || typeof url === 'string') {
        const urlStr = url.toString();
        if (urlStr === LOGO_SOURCES.google.hd('angellist.com')) {
          return createMockResponse(mockBuffer, {
            headers: {
              'Content-Type': 'image/png'
            }
          });
        }
        if (urlStr === '/api/validate-logo') {
          return createMockResponse(JSON.stringify({ isGlobeIcon: false }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return createMockResponse(null, { status: 404 });
    });

    const request = new Request('http://localhost:3000/api/logo?website=https://angellist.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(0);
    expect(response.headers.get('x-logo-source')).toBe('google');
  });

  it('should handle successful logo fetches from Clearbit when Google fails', async () => {
    const mockBuffer = Buffer.from('test-image');
    const mockMetadata = { width: 256, height: 256, format: 'png' as keyof FormatEnum };
    const mockSharpInstance = createMockSharp(mockMetadata, mockBuffer);
    const sharpMock = jest.requireMock('sharp') as { default: jest.Mock };
    sharpMock.default.mockImplementation(() => mockSharpInstance);

    // Mock fetch to fail for Google but succeed for Clearbit
    (global.fetch as jest.Mock).mockImplementation(async (url: unknown): Promise<Response> => {
      if (url instanceof URL || typeof url === 'string') {
        const urlStr = url.toString();
        if (urlStr === LOGO_SOURCES.google.hd('angellist.com') ||
            urlStr === LOGO_SOURCES.google.md('angellist.com')) {
          return createMockResponse(null, { status: 404 });
        }
        if (urlStr === LOGO_SOURCES.clearbit.hd('angellist.com')) {
          return createMockResponse(mockBuffer);
        }
        if (urlStr === '/api/validate-logo') {
          return createMockResponse(JSON.stringify({ isGlobeIcon: false }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return createMockResponse(null, { status: 404 });
    });

    const request = new Request('http://localhost:3000/api/logo?website=https://angellist.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(0);
    expect(response.headers.get('x-logo-source')).toBe('clearbit');
  });

  it('should handle generic globe icon detection', async () => {
    const mockBuffer = Buffer.from('test-image');
    const mockMetadata = { width: 256, height: 256, format: 'png' as keyof FormatEnum };
    const mockSharpInstance = createMockSharp(mockMetadata, mockBuffer);
    const sharpMock = jest.requireMock('sharp') as { default: jest.Mock };
    sharpMock.default.mockImplementation(() => mockSharpInstance);

    // Mock fetch to return images that are detected as globe icons
    (global.fetch as jest.Mock).mockImplementation(async (url: unknown): Promise<Response> => {
      if (url instanceof URL || typeof url === 'string') {
        const urlStr = url.toString();
        if ([
          LOGO_SOURCES.google.hd('angellist.com'),
          LOGO_SOURCES.google.md('angellist.com'),
          LOGO_SOURCES.clearbit.hd('angellist.com'),
          LOGO_SOURCES.clearbit.md('angellist.com'),
          LOGO_SOURCES.duckduckgo.hd('angellist.com')
        ].includes(urlStr)) {
          return createMockResponse(mockBuffer);
        }
        if (urlStr === '/api/validate-logo') {
          return createMockResponse(JSON.stringify({ isGlobeIcon: true }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return createMockResponse(null, { status: 404 });
    });

    const request = new Request('http://localhost:3000/api/logo?website=https://angellist.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer).toBeDefined();
    expect(response.headers.get('x-logo-source')).toBe('');
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('should handle invalid image sizes', async () => {
    const mockBuffer = Buffer.from('test-image');
    const mockMetadata = { width: 32, height: 32, format: 'png' as keyof FormatEnum };
    const mockSharpInstance = createMockSharp(mockMetadata, mockBuffer);
    const sharpMock = jest.requireMock('sharp') as { default: jest.Mock };
    sharpMock.default.mockImplementation(() => mockSharpInstance);

    // Mock fetch to return small images
    (global.fetch as jest.Mock).mockImplementation(async (url: unknown): Promise<Response> => {
      if (url instanceof URL || typeof url === 'string') {
        const urlStr = url.toString();
        if ([
          LOGO_SOURCES.google.hd('angellist.com'),
          LOGO_SOURCES.google.md('angellist.com'),
          LOGO_SOURCES.clearbit.hd('angellist.com'),
          LOGO_SOURCES.clearbit.md('angellist.com'),
          LOGO_SOURCES.duckduckgo.hd('angellist.com')
        ].includes(urlStr)) {
          return createMockResponse(mockBuffer);
        }
        if (urlStr === '/api/validate-logo') {
          return createMockResponse(JSON.stringify({ isGlobeIcon: false }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return createMockResponse(null, { status: 404 });
    });

    const request = new Request('http://localhost:3000/api/logo?website=https://angellist.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer).toBeDefined();
    expect(response.headers.get('x-logo-source')).toBe('');
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('should handle network timeouts', async () => {
    // Mock fetch to simulate timeout
    (global.fetch as jest.Mock).mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), 100);
    }));

    const request = new Request('http://localhost:3000/api/logo?website=https://example.com');
    const response = await GET(request);

    expect(response.status).toBe(404);
    expect(response.headers.get('x-logo-error')).toBe('Failed to fetch logo');
  }, 1000); // Increase timeout to 1 second

  it('should handle file system operations', async () => {
    const mockBuffer = Buffer.from('test-image');
    
    // Mock successful Google fetch
    (global.fetch as jest.Mock).mockImplementation(async (url: unknown): Promise<Response> => {
      if (url instanceof URL || typeof url === 'string') {
        const urlStr = url.toString();
        if (urlStr === LOGO_SOURCES.google.hd('example.com')) {
          return createMockResponse(mockBuffer, {
            headers: {
              'Content-Type': 'image/png'
            }
          });
        }
        if (urlStr === '/api/validate-logo') {
          return createMockResponse(JSON.stringify({ isGlobeIcon: false }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return createMockResponse(null, { status: 404 });
    });

    const request = new Request('http://localhost:3000/api/logo?website=https://example.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer).toEqual(mockBuffer);
    expect(response.headers.get('x-logo-source')).toBe('google');
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });
});
