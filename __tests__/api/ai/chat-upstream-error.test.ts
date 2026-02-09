import {
  resolveErrorResponse,
  formatErrorMessage,
  isModelLoadFailure,
  isAbortError,
  isTimeoutError,
  MODEL_LOAD_FAILURE_PATTERN,
} from "@/app/api/ai/chat/[feature]/upstream-error";

describe("isModelLoadFailure", () => {
  it("returns true for Error with model load failure message", () => {
    expect(isModelLoadFailure(new Error("Failed to load model gpt-oss-120b"))).toBe(true);
  });

  it("returns true for plain string containing the pattern", () => {
    expect(isModelLoadFailure("Failed to load model")).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isModelLoadFailure(new Error("Connection refused"))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isModelLoadFailure(null)).toBe(false);
    expect(isModelLoadFailure(undefined)).toBe(false);
  });
});

describe("isAbortError", () => {
  it("returns true for DOMException with name AbortError", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("returns true for Error with name set to AbortError", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(isAbortError(error)).toBe(true);
  });

  it("returns false for generic errors", () => {
    expect(isAbortError(new Error("timeout"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("isTimeoutError", () => {
  it("returns true for APIConnectionTimeoutError by name", () => {
    const error = new Error("Request timed out");
    error.name = "APIConnectionTimeoutError";
    expect(isTimeoutError(error)).toBe(true);
  });

  it("returns true for error with 'timed out' in message", () => {
    expect(isTimeoutError(new Error("Connection timed out"))).toBe(true);
  });

  it("returns true for error with 'timeout' in message", () => {
    expect(isTimeoutError(new Error("Request timeout after 30s"))).toBe(true);
  });

  it("returns false for non-timeout errors", () => {
    expect(isTimeoutError(new Error("Connection refused"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isTimeoutError("timeout")).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});

describe("formatErrorMessage", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("sanitizes error details in production", () => {
    process.env.NODE_ENV = "production";
    const result = formatErrorMessage(new Error("secret upstream key invalid"));
    expect(result).toBe("Upstream AI service error");
    expect(result).not.toContain("secret");
  });

  it("includes error details in development", () => {
    process.env.NODE_ENV = "development";
    const result = formatErrorMessage(new Error("Connection refused"));
    expect(result).toBe("Upstream AI service error: Connection refused");
  });

  it("handles non-Error values", () => {
    process.env.NODE_ENV = "development";
    expect(formatErrorMessage("plain string")).toBe("Upstream AI service error: plain string");
    expect(formatErrorMessage(42)).toBe("Upstream AI service error: 42");
  });
});

describe("resolveErrorResponse", () => {
  it("maps timeout errors to 504 with kind 'timeout'", () => {
    const error = new Error("Request timed out");
    error.name = "APIConnectionTimeoutError";
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(504);
    expect(result.kind).toBe("timeout");
    expect(result.message).toContain("took too long");
    expect(result.message).toContain("try again");
  });

  it("maps 401 to 503 with kind 'auth'", () => {
    const error = Object.assign(new Error("Unauthorized"), { status: 401 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(503);
    expect(result.kind).toBe("auth");
    expect(result.message).toBe("AI upstream authentication failed");
  });

  it("maps 403 to 503 with kind 'auth'", () => {
    const error = Object.assign(new Error("Forbidden"), { status: 403 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(503);
    expect(result.kind).toBe("auth");
    expect(result.message).toBe("AI upstream authentication failed");
  });

  it("maps 429 to 503 with kind 'rate_limit'", () => {
    const error = Object.assign(new Error("Too Many Requests"), { status: 429 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(503);
    expect(result.kind).toBe("rate_limit");
    expect(result.message).toBe("AI upstream rate limit exceeded. Please try again shortly.");
  });

  it("maps 400 with model load failure to 503 with kind 'model_unavailable'", () => {
    const error = Object.assign(new Error(`${MODEL_LOAD_FAILURE_PATTERN} openai/gpt-oss-120b`), {
      status: 400,
    });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(503);
    expect(result.kind).toBe("model_unavailable");
    expect(result.message).toBe("AI upstream model is currently unavailable");
  });

  it("maps 400 without model load failure to 502 with kind 'upstream'", () => {
    const error = Object.assign(new Error("Bad Request"), { status: 400 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(502);
    expect(result.kind).toBe("upstream");
  });

  it("maps generic status codes to 502 with kind 'upstream'", () => {
    const error = Object.assign(new Error("Internal Server Error"), { status: 500 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(502);
    expect(result.kind).toBe("upstream");
  });

  it("maps errors without status property to 502 with kind 'upstream'", () => {
    const result = resolveErrorResponse(new Error("Something went wrong"));
    expect(result.status).toBe(502);
    expect(result.kind).toBe("upstream");
  });

  it("maps null/undefined errors to 502 with kind 'upstream'", () => {
    expect(resolveErrorResponse(null).kind).toBe("upstream");
    expect(resolveErrorResponse(undefined).kind).toBe("upstream");
  });

  it("maps non-object errors to 502 with kind 'upstream'", () => {
    expect(resolveErrorResponse("string error").kind).toBe("upstream");
    expect(resolveErrorResponse(42).kind).toBe("upstream");
  });

  it("never leaks 401/403/429 status codes to the client", () => {
    for (const status of [401, 403, 429]) {
      const error = Object.assign(new Error("upstream detail"), { status });
      const result = resolveErrorResponse(error);
      expect(result.status).not.toBe(status);
      expect(result.message).not.toContain("upstream detail");
    }
  });
});
