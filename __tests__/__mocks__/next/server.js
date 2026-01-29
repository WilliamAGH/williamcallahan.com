/**
 * Mock for next/server module
 */

class NextRequest {
  constructor(url, init = {}) {
    this.url = url;
    this.method = init.method || "GET";
    this.headers = new Map();

    // Add headers from init
    if (init.headers) {
      Object.entries(init.headers).forEach(([key, value]) => {
        this.headers.set(key.toLowerCase(), value);
      });
    }

    // Store original Map.get and Map.set methods
    const originalGet = this.headers.get.bind(this.headers);
    const originalSet = this.headers.set.bind(this.headers);

    // Override get method to be case-insensitive
    this.headers.get = (name) => originalGet(name.toLowerCase());
    // Override set method to normalize keys
    this.headers.set = (name, value) => originalSet(String(name).toLowerCase(), value);
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
    this.headers = new Map();

    if (init.headers) {
      Object.entries(init.headers).forEach(([key, value]) => {
        this.headers.set(key.toLowerCase(), value);
      });
    }

    // Store original Map.get and Map.set methods
    const originalGet = this.headers.get.bind(this.headers);
    const originalSet = this.headers.set.bind(this.headers);

    // Override get method to be case-insensitive
    this.headers.get = (name) => originalGet(name.toLowerCase());
    // Override set method to normalize keys
    this.headers.set = (name, value) => originalSet(String(name).toLowerCase(), value);
  }

  static json(data, init = {}) {
    const response = new NextResponse(JSON.stringify(data), init);
    response.headers.set("content-type", "application/json");
    response.json = () => Promise.resolve(data);
    return response;
  }
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
