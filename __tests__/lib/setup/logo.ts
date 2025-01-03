import { NextRequest } from 'next/server';
import type { RequestInit as NextRequestInit } from 'next/dist/server/web/spec-extension/request';

// Create a constructor function for NextRequest
const createNextRequest = function(input: string | URL, init?: RequestInit): NextRequest {
  const url = typeof input === 'string' ? new URL(input) : input;
  const nextInit: NextRequestInit = {
    method: init?.method || 'GET',
    headers: init?.headers || {},
    // Handle signal properly
    signal: init?.signal === null ? undefined : init?.signal,
    // Add other required properties
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

  // Add nextUrl property that matches the URL
  Object.defineProperty(request, 'nextUrl', {
    get: () => url,
    enumerable: true,
    configurable: true
  });

  return request;
};

// Create a constructor type
interface RequestConstructor {
  new (input: string | URL, init?: RequestInit): NextRequest;
  prototype: NextRequest;
}

// Create the constructor
const Request = createNextRequest as unknown as RequestConstructor;
Request.prototype = NextRequest.prototype;

// Mock global objects
(global as any).Request = Request;

// Export for use in tests
export { Request };
