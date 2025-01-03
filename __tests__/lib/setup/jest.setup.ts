import { TextEncoder, TextDecoder } from 'node:util';
import fetch, { Headers, Request, Response } from 'node-fetch';
import type { Headers as NodeFetchHeaders, Request as NodeFetchRequest, Response as NodeFetchResponse } from 'node-fetch';

// Polyfill globals
global.TextEncoder = TextEncoder;
// @ts-expect-error: Different TextDecoder implementations
global.TextDecoder = TextDecoder;
// @ts-expect-error: Different Headers implementations
global.Headers = Headers;
// @ts-expect-error: Different Request implementations
global.Request = Request;
// @ts-expect-error: Different Response implementations
global.Response = Response;
// @ts-expect-error: Different fetch implementations
global.fetch = fetch;

// Mock Next.js modules
jest.mock('next/server', () => ({
  NextRequest: Request,
  NextResponse: Response,
}));

// Mock process.env
process.env = {
  ...process.env,
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
};
