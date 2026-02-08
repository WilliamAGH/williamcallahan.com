/**
 * Mock for next/server module
 */

interface CookieOptions {
  name?: string;
  value?: string;
  maxAge?: number;
  path?: string;
  domain?: string;
  sameSite?: string;
  httpOnly?: boolean;
  secure?: boolean;
}

// Helper to create case-insensitive headers
function makeCaseInsensitiveHeaders(initHeaders?: Record<string, string>): Map<string, string> & {
  get: (name: string) => string | undefined;
  set: (name: string, value: string) => void;
} {
  const headers = new Map<string, string>();

  if (initHeaders) {
    Object.entries(initHeaders).forEach(([key, value]) => {
      headers.set(key.toLowerCase(), value);
    });
  }

  // Store original Map.get and Map.set methods
  const originalGet = headers.get.bind(headers);
  const originalSet = headers.set.bind(headers);

  // Override get method to be case-insensitive
  (headers as unknown as { get: (name: string) => string | undefined }).get = (name: string) =>
    originalGet(name.toLowerCase());
  // Override set method to normalize keys
  (headers as unknown as { set: (name: string, value: string) => void }).set = (
    name: string,
    value: string,
  ) => originalSet(String(name).toLowerCase(), value);

  return headers as Map<string, string> & {
    get: (name: string) => string | undefined;
    set: (name: string, value: string) => void;
  };
}

function serializeCookie(cookie: CookieOptions): string {
  if (!cookie || !cookie.name) {
    return "";
  }
  const parts = [`${cookie.name}=${cookie.value ?? ""}`];

  if (cookie.maxAge !== undefined) {
    parts.push(`Max-Age=${cookie.maxAge}`);
  }
  if (cookie.path) {
    parts.push(`Path=${cookie.path}`);
  }
  if (cookie.domain) {
    parts.push(`Domain=${cookie.domain}`);
  }
  if (cookie.sameSite) {
    parts.push(`SameSite=${cookie.sameSite}`);
  }
  if (cookie.httpOnly) {
    parts.push("HttpOnly");
  }
  if (cookie.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export class NextRequest {
  url: string;
  method: string;
  headers: ReturnType<typeof makeCaseInsensitiveHeaders>;

  constructor(url: string, init: { method?: string; headers?: Record<string, string> } = {}) {
    this.url = url;
    this.method = init.method || "GET";
    this.headers = makeCaseInsensitiveHeaders(init.headers);
  }

  clone(): NextRequest {
    return new NextRequest(this.url, {
      method: this.method,
      headers: Object.fromEntries(this.headers),
    });
  }
}

export class NextResponse {
  body: unknown;
  status: number;
  headers: ReturnType<typeof makeCaseInsensitiveHeaders>;
  cookies: { set: (cookie: CookieOptions) => void };
  json?: () => Promise<unknown>;

  constructor(body?: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = makeCaseInsensitiveHeaders(init.headers);
    this.cookies = {
      set: (cookie: CookieOptions) => {
        const serialized = serializeCookie(cookie);
        const existing = this.headers.get("set-cookie");
        if (existing) {
          this.headers.set("set-cookie", `${existing}, ${serialized}`);
        } else {
          this.headers.set("set-cookie", serialized);
        }
      },
    };
  }

  static json<T>(
    data: T,
    init: { status?: number; headers?: Record<string, string> } = {},
  ): NextResponse {
    const response = new NextResponse(JSON.stringify(data), init);
    response.headers.set("content-type", "application/json");
    response.json = () => Promise.resolve(data);
    return response;
  }

  static next(init?: { headers?: Record<string, string> }): NextResponse {
    return new NextResponse(null, { status: 200, headers: init?.headers });
  }
}

// Mock connection() - Next.js 16 function to ensure request-time execution
export async function connection(): Promise<void> {
  return Promise.resolve();
}
