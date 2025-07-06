/**
 * Edge Runtime Polyfill for OpenTelemetry
 *
 * Provides minimal no-op implementations of OpenTelemetry APIs
 * to prevent runtime errors in Edge environments where native
 * modules are not available.
 */

// Create a mock span context
const createSpanContext = () => ({
  traceId: "00000000000000000000000000000001",
  spanId: "0000000000000001",
  traceFlags: 0,
  traceState: undefined,
});

// Create a proper span object
const createSpan = () => {
  const spanContext = createSpanContext();
  return {
    end: () => {},
    setAttribute: () => {},
    setAttributes: () => {},
    addEvent: () => {},
    setStatus: () => {},
    updateName: () => {},
    isRecording: () => false,
    recordException: () => {},
    spanContext: () => spanContext,
    getSpanContext: () => spanContext, // This is what Sentry expects
  };
};

// Minimal trace API implementation
export const trace = {
  getTracer: () => ({
    startSpan: () => createSpan(),
    startActiveSpan: <T>(name: string, ...rest: unknown[]): T | undefined => {
      void name; // Explicitly mark as unused per project convention
      const maybeCallback = rest[rest.length - 1];
      if (typeof maybeCallback === "function") {
        const span = createSpan();
        // Cast is safe because we just checked typeof
        return (maybeCallback as (span: unknown) => T)(span);
      }
      // No callback supplied – return undefined to avoid throwing.
      return undefined;
    },
  }),
  getActiveSpan: () => createSpan(),
  setSpan: () => ({ setValue: () => {}, deleteValue: () => {} }),
  deleteSpan: () => ({ setValue: () => {}, deleteValue: () => {} }),
  getSpan: () => createSpan(),
  /**
   * OpenTelemetry helper that returns a span context for the provided span.
   * Some libraries (e.g. Sentry) call this to enrich events with tracing data.
   * We provide a safe fallback implementation that never throws and always
   * returns a valid (albeit dummy) context in Edge-compatible environments.
   */
  getSpanContext: (span?: unknown) => {
    if (
      span &&
      typeof span === "object" &&
      "spanContext" in span &&
      typeof (span as { spanContext?: () => ReturnType<typeof createSpanContext> }).spanContext === "function"
    ) {
      return (span as { spanContext: () => ReturnType<typeof createSpanContext> }).spanContext();
    }
    return createSpanContext();
  },
  setSpanContext: () => {},
};

// Root context constant
export const ROOT_CONTEXT = Symbol("OpenTelemetry Context Key ACTIVE_SPAN");

// Minimal context API implementation
export const context = {
  active: () => ({}),
  with: <T>(ctx: unknown, fn: () => T): T => {
    void ctx; // Explicitly mark as unused per project convention
    return fn();
  },
  bind: <T extends (...args: unknown[]) => unknown>(ctx: unknown, fn: T): T => {
    void ctx; // Explicitly mark as unused per project convention
    return fn;
  },
  disable: () => {},
  enable: () => {},
};

// Minimal propagation API implementation
export const propagation = {
  inject: () => {},
  extract: () => ({}),
  createBaggage: () => ({}),
  getBaggage: () => null,
  getActiveBaggage: () => null,
  setBaggage: () => ({}),
  deleteBaggage: () => ({}),
};

// Span kind enum
export const SpanKind = {
  INTERNAL: 0,
  SERVER: 1,
  CLIENT: 2,
  PRODUCER: 3,
  CONSUMER: 4,
};

// Span status code enum
export const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};

// TraceFlags enum
export const TraceFlags = {
  NONE: 0x00,
  SAMPLED: 0x01,
};

// isSpanContextValid function
export const isSpanContextValid = (spanContext: unknown): boolean => {
  if (!spanContext || typeof spanContext !== "object") return false;
  const ctx = spanContext as { traceId?: string; spanId?: string };
  return (
    typeof ctx.traceId === "string" && typeof ctx.spanId === "string" && ctx.traceId.length > 0 && ctx.spanId.length > 0
  );
};

// Trace ID validation
export const INVALID_TRACEID = "00000000000000000000000000000000";
export const INVALID_SPANID = "0000000000000000";

export const isValidTraceId = (traceId: string): boolean => {
  return traceId !== INVALID_TRACEID && /^[0-9a-f]{32}$/.test(traceId);
};

// Invalid span context
export const INVALID_SPAN_CONTEXT = {
  traceId: INVALID_TRACEID,
  spanId: INVALID_SPANID,
  traceFlags: TraceFlags.NONE,
};

// Sampling decision enum
export const SamplingDecision = {
  NOT_RECORD: 0,
  RECORD: 1,
  RECORD_AND_SAMPLED: 2,
};

// Missing exports that Sentry v9.31.0 expects
export const createContextKey = (name: string) => Symbol(name);

export const baggageEntryMetadataFromString = (str: string) => ({
  toString: () => str,
});

// DiagLogLevel enum that Sentry expects
export const DiagLogLevel = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  VERBOSE: 5,
  ALL: Number.MAX_VALUE,
};

// Diag API for diagnostic logging
export const diag = {
  setLogger: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  verbose: () => {},
};

// Also provide a default export for compatibility
const opentelemetryApi = {
  trace,
  context,
  ROOT_CONTEXT,
  propagation,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  isSpanContextValid,
  isValidTraceId,
  INVALID_TRACEID,
  INVALID_SPANID,
  INVALID_SPAN_CONTEXT,
  SamplingDecision,
  createContextKey,
  baggageEntryMetadataFromString,
  DiagLogLevel,
  diag,
};

export default opentelemetryApi;

// For @opentelemetry/instrumentation compatibility
export const registerInstrumentations = () => {};
export const InstrumentationBase = class {
  enable() {}
  disable() {}
  setTracerProvider() {}
  setMeterProvider() {}
  setLoggerProvider() {}
  getTracer() {
    return trace.getTracer();
  }
};
