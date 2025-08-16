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

    // Store original Map.get method
    const originalGet = this.headers.get.bind(this.headers);

    // Override get method to be case-insensitive
    this.headers.get = (name) => originalGet(name.toLowerCase());
  }
}

class NextResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = new Map();

    if (init.headers) {
      Object.entries(init.headers).forEach(([key, value]) => {
        this.headers.set(key, value);
      });
    }
  }

  static json(data, init = {}) {
    const response = new NextResponse(JSON.stringify(data), init);
    response.headers.set("content-type", "application/json");
    response.json = () => Promise.resolve(data);
    return response;
  }
}

module.exports = {
  NextRequest,
  NextResponse,
};
