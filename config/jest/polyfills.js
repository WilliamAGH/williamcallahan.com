/**
 * @file Jest polyfills for missing web APIs
 * @description Provides polyfills for web APIs not present in the Node.js test environment
 */

import { TextDecoder, TextEncoder } from 'node:util';

/**
 * Polyfills TextEncoder and TextDecoder if unavailable
 */
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

/**
 * Polyfills Web Streams (ReadableStream, etc.) if unavailable
 * Required by libraries like undici
 */
if (typeof globalThis.ReadableStream === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const webStreams = require('node:stream/web');
  globalThis.ReadableStream = webStreams.ReadableStream;
  globalThis.WritableStream = webStreams.WritableStream;
  globalThis.TransformStream = webStreams.TransformStream;
}

/**
 * Polyfills fetch API and related classes using undici (preferred) or node-fetch as a fallback
 */
if (typeof globalThis.fetch === 'undefined') {
  let fetchImpl;
  let HeadersImpl;
  let RequestImpl;
  let ResponseImpl;

  try {
    // Prefer Undici because the project depends on it and it fully matches the WHATWG spec
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const undici = require('undici');
    fetchImpl = undici.fetch;
    ({ Headers: HeadersImpl, Request: RequestImpl, Response: ResponseImpl } = undici);
  } catch (undiciErr) {
    // Fall back to node-fetch (common in Jest environments). Handle both ESM and CJS interop
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fetchPkg = require('node-fetch');
    // In CJS, `require('node-fetch')` returns an object with a `default` property that is the fetch fn.
    fetchImpl = fetchPkg.default || fetchPkg;
    HeadersImpl = fetchPkg.Headers || fetchPkg.default?.Headers;
    RequestImpl = fetchPkg.Request || fetchPkg.default?.Request;
    ResponseImpl = fetchPkg.Response || fetchPkg.default?.Response;
  }

  // Ensure we at least have a functional fetch implementation
  if (typeof fetchImpl !== 'function') {
    throw new Error('Failed to polyfill global fetch – implementation is not a function');
  }

  globalThis.fetch = fetchImpl;
  if (HeadersImpl) globalThis.Headers = HeadersImpl;
  if (RequestImpl) globalThis.Request = RequestImpl;
  if (ResponseImpl) globalThis.Response = ResponseImpl;

  // Provide minimal stubs if classes are still missing (edge-case safety)
  if (typeof globalThis.Request === 'undefined') {
    globalThis.Request = class RequestStub {};
  }
  if (typeof globalThis.Headers === 'undefined') {
    globalThis.Headers = class HeadersStub {};
  }
  if (typeof globalThis.Response === 'undefined') {
    globalThis.Response = class ResponseStub {};
  }
}

// Ensure a static Response.json helper exists (used by Next.js internals)
if (
  typeof globalThis.Response === 'function' &&
  typeof (globalThis.Response).json !== 'function'
) {
  // eslint-disable-next-line no-extend-native
  globalThis.Response.json = (data, init = {}) => {
    const headers = new globalThis.Headers(init.headers || {});
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return new globalThis.Response(JSON.stringify(data), {
      ...init,
      headers,
    });
  };
}
