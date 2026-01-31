/**
 * Mock for next/server module
 */

// Helper to create case-insensitive headers
function makeCaseInsensitiveHeaders(initHeaders) {
  const headers = new Map();

  if (initHeaders) {
    Object.entries(initHeaders).forEach(([key, value]) => {
      headers.set(key.toLowerCase(), value);
    });
  }

  // Store original Map.get and Map.set methods
  const originalGet = headers.get.bind(headers);
  const originalSet = headers.set.bind(headers);

  // Override get method to be case-insensitive
  headers.get = (name) => originalGet(name.toLowerCase());
  // Override set method to normalize keys
  headers.set = (name, value) => originalSet(String(name).toLowerCase(), value);

  return headers;
}

class NextRequest {
  constructor(url, init = {}) {
    this.url = url;
    this.method = init.method || "GET";
    this.headers = makeCaseInsensitiveHeaders(init.headers);
  }

  clone() {
    return new NextRequest(this.url, {
      method: this.method,
      headers: Object.fromEntries(this.headers),
    });
  }
}

class NextResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = makeCaseInsensitiveHeaders(init.headers);
    this.cookies = {
      set: (cookie) => {
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

  static json(data, init = {}) {
    const response = new NextResponse(JSON.stringify(data), init);
    response.headers.set("content-type", "application/json");
    response.json = () => Promise.resolve(data);
    return response;
  }
}

function serializeCookie(cookie) {
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

// Mock connection() - Next.js 16 function to ensure request-time execution
async function connection() {
  return Promise.resolve();
}

module.exports = {
  NextRequest,
  NextResponse,
  connection,
};
