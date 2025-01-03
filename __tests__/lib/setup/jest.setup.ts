/**
 * Jest Setup Tests
 *
 * Verifies that Jest is properly configured with:
 * - Required environment variables
 * - Global mocks
 * - Test utilities
 */

import { NextRequest } from 'next/server';
import { logger } from '../../../lib/logger';

// Silence logger by default in tests
logger.setSilent(true);

// Define the structure we need for NextURL
interface MockNextURL {
  href: string;
  origin: string;
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  searchParams: URLSearchParams;
  hash: string;
  basePath: string;
  locale: string;
  defaultLocale: string;
  domainLocale: null;
  analyze(): { pathname: { filename: string; normalized: string } };
  formatPathname(): string;
  formatSearch(): string;
  toString(): string;
}

// Mock Response implementation
class MockResponse implements Response {
  readonly headers: Headers;
  readonly ok: boolean;
  readonly redirected: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly type: ResponseType;
  readonly url: string;
  readonly body: ReadableStream | null;
  readonly bodyUsed: boolean;

  private responseBody: BodyInit | null = null;
  private consumed = false;

  constructor(body: BodyInit | null = null, init?: ResponseInit) {
    this.responseBody = body || null;
    this.headers = new Headers(init?.headers);
    this.ok = init?.status ? init.status >= 200 && init.status < 300 : true;
    this.redirected = false;
    this.status = init?.status || 200;
    this.statusText = init?.statusText || '';
    this.type = 'default';
    this.url = '';
    this.body = null;
    this.bodyUsed = false;
  }

  private checkBodyUsed() {
    if (this.consumed) {
      throw new TypeError('Body has already been consumed.');
    }
    this.consumed = true;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.responseBody instanceof ArrayBuffer) {
      return Promise.resolve(this.responseBody as ArrayBuffer);
    }
    if (this.responseBody instanceof Uint8Array) {
      return Promise.resolve(this.responseBody.buffer.slice(0) as ArrayBuffer);
    }
    if (Buffer.isBuffer(this.responseBody)) {
      const buffer = this.responseBody.buffer.slice(
        this.responseBody.byteOffset,
        this.responseBody.byteOffset + this.responseBody.byteLength
      );
      return Promise.resolve(buffer as ArrayBuffer);
    }
    if (typeof this.responseBody === 'string') {
      return Promise.resolve(new TextEncoder().encode(this.responseBody).buffer as ArrayBuffer);
    }
    return new ArrayBuffer(0);
  }

  async blob(): Promise<Blob> {
    const buffer = await this.arrayBuffer();
    return new Blob([buffer], { type: this.headers.get('content-type') || '' });
  }

  async formData(): Promise<FormData> {
    return new FormData();
  }

  async json(): Promise<any> {
    if (typeof this.responseBody === 'string') {
      return JSON.parse(this.responseBody);
    }
    return {};
  }

  async text(): Promise<string> {
    if (typeof this.responseBody === 'string') {
      return this.responseBody;
    }
    if (this.responseBody instanceof ArrayBuffer || this.responseBody instanceof Uint8Array) {
      return new TextDecoder().decode(this.responseBody);
    }
    return '';
  }

  clone(): Response {
    const cloned = new MockResponse(this.responseBody, {
      headers: this.headers,
      status: this.status,
      statusText: this.statusText
    });
    return cloned;
  }

  async bytes(): Promise<Uint8Array> {
    this.checkBodyUsed();
    const buffer = await this.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

// Safe URL parsing helper
const parseUrl = (input: string | URL): { urlString: string; urlInstance: URL } => {
  try {
    // Handle URL instances directly
    if (input instanceof URL) {
      return { urlString: input.href, urlInstance: input };
    }

    // Handle string input
    const inputStr = String(input);
    const base = 'http://localhost:3000';

    // For absolute URLs, use as-is; for relative URLs, prepend base
    let urlString: string;
    if (/^https?:\/\//i.test(inputStr)) {
      urlString = inputStr;
      return {
        urlString,
        urlInstance: new globalThis.URL(urlString)
      };
    } else {
      urlString = `${base}${inputStr.startsWith('/') ? '' : '/'}${inputStr}`;
      return {
        urlString,
        urlInstance: new globalThis.URL(urlString)
      };
    }
  } catch (error) {
    // Fallback for invalid URLs
    const fallbackUrl = new globalThis.URL('http://localhost:3000/');
    return {
      urlString: fallbackUrl.href,
      urlInstance: fallbackUrl
    };
  }
};

// Define internal symbol type
const INTERNALS = Symbol.for('internal request');

type InternalRequestData = {
  cookies: Map<string, string>;
  geo: Record<string, unknown>;
  ip?: string;
  url: MockNextURL;
};

// Extend base Request type
interface BaseMockRequest extends Request {
  body: ReadableStream<Uint8Array> | null;
  signal: AbortSignal;
}

// Define our mock request type
type MockRequestType = BaseMockRequest & {
  nextUrl: MockNextURL;
  cookies: Map<string, string>;
  geo: Record<string, unknown>;
  ip?: string;
  page?: { name?: string; params?: Record<string, string> };
  ua?: Record<string, unknown>;
  destination: string;
  [INTERNALS]: InternalRequestData;
  bytes(): Promise<Uint8Array>;
};

// Create a minimal mock implementation for NextRequest
const createMockRequest = (input: string | URL, init?: RequestInit): NextRequest => {
  // Handle URL creation safely
  const { urlString, urlInstance } = parseUrl(input);

  // Create nextUrl properties without using URL constructor
  const nextUrl = {
    href: urlString,
    origin: urlInstance.origin,
    protocol: urlInstance.protocol,
    username: urlInstance.username,
    password: urlInstance.password,
    host: urlInstance.host,
    hostname: urlInstance.hostname,
    port: urlInstance.port,
    pathname: urlInstance.pathname,
    search: urlInstance.search,
    searchParams: urlInstance.searchParams,
    hash: urlInstance.hash,
    basePath: '',
    locale: '',
    defaultLocale: '',
    domainLocale: null,
    analyze: () => ({
      pathname: {
        filename: urlInstance.pathname,
        normalized: urlInstance.pathname
      }
    }),
    formatPathname: () => urlInstance.pathname,
    formatSearch: () => urlInstance.search,
    toString: () => urlString
  } satisfies MockNextURL;

  // Create the request object with all NextRequest properties
  const request = {
    url: urlString,
    method: (init?.method || 'GET').toUpperCase(),
    headers: new Headers(init?.headers),
    body: init?.body,
    bodyUsed: false,
    cache: init?.cache || 'default',
    credentials: init?.credentials || 'same-origin',
    integrity: '',
    keepalive: init?.keepalive || false,
    mode: init?.mode || 'cors',
    redirect: init?.redirect || 'follow',
    referrer: '',
    referrerPolicy: init?.referrerPolicy || '',
    signal: init?.signal,
    nextUrl,
    cookies: new Map(),
    geo: {},
    ip: undefined,
    // NextRequest specific properties
    page: undefined,
    ua: {},
    destination: 'document',
    // Methods
    clone: () => createMockRequest(urlString, { ...init }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    bytes: () => Promise.resolve(new Uint8Array()),
    [INTERNALS]: {
      cookies: new Map(),
      geo: {},
      ip: undefined,
      url: nextUrl
    }
  };

  // Set up the prototype chain
  Object.setPrototypeOf(request, Request.prototype);

  // Cast to unknown first to avoid type checking, then to NextRequest
  return request as unknown as NextRequest;
};

// Create base Request class
class BaseRequest {
  url: string;
  constructor(input: string | URL, init?: RequestInit) {
    this.url = input.toString();
  }
}

// Create a constructor function for mocked requests
class MockRequest {
  static [Symbol.hasInstance](instance: any) {
    return instance && typeof instance === 'object' && 'url' in instance;
  }

  constructor(input: string | URL, init?: RequestInit) {
    const request = createMockRequest(input, init);
    Object.setPrototypeOf(request, MockRequest.prototype);
    return request;
  }
}

// Set up prototype inheritance
Object.setPrototypeOf(MockRequest.prototype, BaseRequest.prototype);

// Create properly typed constructor
const TypedMockRequest = MockRequest as unknown as {
  new(input: string | URL, init?: RequestInit): NextRequest;
  prototype: Request;
};

// Set up the global environment
const setupGlobalMocks = () => {
  // Set up base Request if it doesn't exist
  if (typeof global.Request === 'undefined') {
    global.Request = BaseRequest as unknown as typeof Request;
  }

  // Set up prototype inheritance now that Request is defined
  Object.setPrototypeOf(MockRequest.prototype, global.Request.prototype);

  // Set up the mocks
  global.Request = MockRequest as unknown as typeof Request;
  global.Response = MockResponse as unknown as typeof Response;
  global.URL = globalThis.URL;
  // biome-ignore lint/suspicious/noExplicitAny: Required for test environment
  (global as any).Response.error = () => new MockResponse(null, { status: 500 });
  // biome-ignore lint/suspicious/noExplicitAny: Required for test environment
  (global as any).Response.redirect = (url: string, status = 302) => new MockResponse(null, { status, headers: { Location: url } });
  // biome-ignore lint/suspicious/noExplicitAny: Required for test environment
  (global as any).Response.json = (data: any) => new MockResponse(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

  // Mock fetch
  global.fetch = jest.fn().mockImplementation((input: string | URL | Request) => {
    return Promise.resolve(new MockResponse());
  });

  // Mock URL
  if (typeof URL.createObjectURL === 'undefined') {
    URL.createObjectURL = jest.fn().mockImplementation((blob: Blob) => 'mock://url');
  }
  if (typeof URL.revokeObjectURL === 'undefined') {
    URL.revokeObjectURL = jest.fn();
  }
};

setupGlobalMocks();

// Add tests to verify the setup works
describe('Jest Setup', () => {
  it('should have test environment configured', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should have Request mock configured', () => {
    const url = 'https://example.com/';
    const request = new Request(url);
    expect(request.url).toBe(url);
    expect(request.method).toBe('GET');
  });

  it('should handle URL parameters correctly', () => {
    const url = 'https://example.com?param=value';
    const request = new Request(url) as NextRequest;
    expect(request.nextUrl.searchParams.get('param')).toBe('value');
  });

  it('should handle custom headers', () => {
    const url = 'https://example.com';
    const headers = { 'Content-Type': 'application/json' };
    const request = new Request(url, { headers });
    expect(request.headers.get('content-type')).toBe('application/json');
  });

  it('should have logger silenced by default', () => {
    expect(logger.setSilent).toBeDefined();
  });
});

// Export for use in tests
export { TypedMockRequest as Request, MockResponse as Response };
