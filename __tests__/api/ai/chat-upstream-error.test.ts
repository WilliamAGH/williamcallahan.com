import {
  resolveErrorResponse,
  formatErrorMessage,
  isModelLoadFailure,
  isAbortError,
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
  it("maps 401 to 503 to prevent topology leakage", () => {
    const error = Object.assign(new Error("Unauthorized"), { status: 401 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(503);
    expect(result.message).toBe("AI upstream authentication failed");
  });

  it("maps 403 to 503 to prevent topology leakage", () => {
    const error = Object.assign(new Error("Forbidden"), { status: 403 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(503);
    expect(result.message).toBe("AI upstream authentication failed");
  });

  it("maps 429 to 503 to prevent topology leakage", () => {
    const error = Object.assign(new Error("Too Many Requests"), { status: 429 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(503);
    expect(result.message).toBe("AI upstream rate limit exceeded");
  });

  it("maps 400 with model load failure to 503", () => {
    const error = Object.assign(new Error(`${MODEL_LOAD_FAILURE_PATTERN} openai/gpt-oss-120b`), {
      status: 400,
    });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(503);
    expect(result.message).toBe("AI upstream model is currently unavailable");
  });

  it("maps 400 without model load failure to 502", () => {
    const error = Object.assign(new Error("Bad Request"), { status: 400 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(502);
  });

  it("maps generic status codes to 502", () => {
    const error = Object.assign(new Error("Internal Server Error"), { status: 500 });
    const result = resolveErrorResponse(error);
    expect(result.status).toBe(502);
  });

  it("maps errors without status property to 502", () => {
    const result = resolveErrorResponse(new Error("Something went wrong"));
    expect(result.status).toBe(502);
  });

  it("maps null/undefined errors to 502", () => {
    expect(resolveErrorResponse(null).status).toBe(502);
    expect(resolveErrorResponse(undefined).status).toBe(502);
  });

  it("maps non-object errors to 502", () => {
    expect(resolveErrorResponse("string error").status).toBe(502);
    expect(resolveErrorResponse(42).status).toBe(502);
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
