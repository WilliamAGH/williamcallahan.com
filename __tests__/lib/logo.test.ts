import { describe, expect, it, jest } from '@jest/globals';
import * as ServerCacheModule from '../../lib/server-cache'; // Adjusted import
import { GET } from '../../app/api/logo/route';
import fs from 'fs/promises';
import path from 'path';
import { Request } from './setup/logo';
import type { LogoSource } from '../../types/logo';
import { NextResponse } from 'next/server'; // Import NextResponse

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
jest.mock('fs/promises', () => ({
  readFile: jest.fn(() => Promise.resolve(Buffer.from(mockPlaceholderSvg)))
}));

// Mock fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock ServerCache
jest.mock('../../lib/server-cache', () => ({
  __esModule: true,
  ...jest.requireActual('../../lib/server-cache'),
  getLogoFetch: jest.fn(),
  setLogoFetch: jest.fn(),
}));

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data: any, init?: any) => ({ data, ...init })),
  },
}));

describe('Logo API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return placeholder for direct logo URLs in production', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production'
    };

    const request = new Request('http://localhost:3000/api/logo?website=https://example.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe(mockPlaceholderSvg);
  });

  it('should return cached logo if available', async () => {
    const mockBuffer = Buffer.from('test');
    (ServerCacheModule.getLogoFetch as jest.Mock).mockReturnValue({
      url: null,
      buffer: mockBuffer,
      source: 'google' as LogoSource,
      timestamp: Date.now()
    });

    const request = new Request('http://localhost:3000/api/logo?website=https://example.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(ServerCacheModule.getLogoFetch).toHaveBeenCalledWith('example.com');

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer).toEqual(mockBuffer);
  });

  it('should handle fetch errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const request = new Request('http://localhost:3000/api/logo?website=https://example.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe(mockPlaceholderSvg);
  });

  it('should handle missing website/company parameters', async () => {
    const request = new Request('http://localhost:3000/api/logo');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = (response as any).data;
    expect(data.error).toBe('Website or company name required');
  });

  it('should handle successful logo fetches', async () => {
    const mockImageBuffer = Buffer.from('fake-image-data');
    const mockHeaders = new Headers();
    mockHeaders.set('Content-Type', 'image/png');
    mockHeaders.set('x-logo-source', 'test');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(mockImageBuffer.buffer.slice(
        mockImageBuffer.byteOffset,
        mockImageBuffer.byteOffset + mockImageBuffer.byteLength
      )),
      headers: mockHeaders,
      json: () => Promise.resolve({ isGlobeIcon: false })
    } as any);

    const request = new Request('http://localhost:3000/api/logo?website=https://example.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer).toEqual(mockImageBuffer);
    expect(response.headers.get('x-logo-source')).toBe('test');
  });

  it('should handle redirect responses as not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 307,
      statusText: 'Temporary Redirect',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Headers()
    } as any);

    const request = new Request('http://localhost:3000/api/logo?website=https://example.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe(mockPlaceholderSvg);
  });

  it('should handle cached errors', async () => {
    (ServerCacheModule.getLogoFetch as jest.Mock).mockReturnValue({
      url: null,
      source: null as LogoSource,
      error: 'Failed to fetch logo',
      timestamp: Date.now()
    });

    const request = new Request('http://localhost:3000/api/logo?website=https://example.com');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe(mockPlaceholderSvg);
  });

  it('should handle invalid website URLs', async () => {
    const request = new Request('http://localhost:3000/api/logo?website=invalid-url');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe(mockPlaceholderSvg);
  });
});
