import { NextRequest } from 'next/server';
import type { RequestInit as NextRequestInit } from 'next/dist/server/web/spec-extension/request';

// Create a constructor function for NextRequest
const createNextRequest = (input: string | URL, init?: RequestInit): NextRequest => {
  const url = typeof input === 'string' ? new URL(input) : input;
  const nextInit: NextRequestInit = {
    method: init?.method || 'GET',
    headers: init?.headers || {},
    signal: init?.signal === null ? undefined : init?.signal,
    cache: init?.cache,
    credentials: init?.credentials,
    integrity: init?.integrity,
    keepalive: init?.keepalive,
    mode: init?.mode,
    redirect: init?.redirect,
    referrer: init?.referrer,
    referrerPolicy: init?.referrerPolicy,
    window: null
  };

  const request = new NextRequest(url, nextInit);

  Object.defineProperty(request, 'nextUrl', {
    get: () => url,
    enumerable: true,
    configurable: true
  });

  return request;
};

// Create a constructor type that matches the global Request interface
interface RequestConstructor {
  new (input: string | URL, init?: RequestInit): NextRequest;
  prototype: NextRequest;
}

// Create the constructor function with the correct type
const Request = Object.assign(
  function(this: NextRequest, input: string | URL, init?: RequestInit) {
    return createNextRequest(input, init);
  },
  { prototype: NextRequest.prototype }
) as unknown as RequestConstructor;

// Mock global Request
// biome-ignore lint/suspicious/noExplicitAny: Required for test environment
(global as any).Request = Request;

// Export for use in tests
export { Request };
