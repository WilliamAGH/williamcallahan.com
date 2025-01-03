import { TextEncoder, TextDecoder } from 'util';
import { Headers, Request, Response } from 'node-fetch';

// Polyfill globals
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;
global.Headers = Headers as any;
global.Request = Request as any;
global.Response = Response as any;

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
