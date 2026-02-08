---
description: "AI Shared Services - OpenAI SDK-backed gateway with per-feature config, queueing, and abuse controls"
alwaysApply: false
---

# AI Shared Services

**Functionality:** `ai-shared-services`

## Core Objective

Provide a reusable, server-only AI client layer and Next.js Route Handlers that call OpenAI SDK APIs (`chat.completions` and `responses`) against OpenAI or OpenAI-compatible providers without exposing upstream credentials to the browser.

The chat gateway is SSE-first and SSE-only: browser clients always consume `text/event-stream`, and the server route no longer maintains a JSON fallback path.

This system is designed to support multiple AI-backed site features where each feature can use its own:

- `OPENAI_BASE_URL` equivalent
- API key
- model (`LLM_MODEL`)
- upstream concurrency (`MAX_PARALLEL`)

## What Was Implemented

### Shared client

- `src/lib/ai/openai-compatible/openai-compatible-client.ts` — Native `openai` npm SDK transport for both `chat.completions` and `responses`.
- `src/lib/ai/openai-compatible/feature-config.ts` — Per-feature env resolution + URL builder + shared upstream queue-key builder.
- `src/lib/ai/openai-compatible/browser-client.ts` — Minimal browser helper that mints `/api/ai/token` then calls `/api/ai/chat/[feature]`.
- `src/types/schemas/ai-openai-compatible.ts` — Zod schemas for API mode, chat payload validation, and normalized upstream response parsing.
- `src/types/schemas/ai-chat.ts` — Shared feature identifier schema and request validation for chat routes.
- `src/lib/ai/openai-compatible/upstream-request-queue.ts` — Per-upstream (model + URL) priority queue with configurable max parallelism.
- `src/app/api/ai/chat/[feature]/upstream-runner.ts` — Multi-turn upstream orchestration for tool calls, model fallback, and deterministic post-processing.
- `src/app/api/ai/chat/[feature]/analysis-output-config.ts` — Analysis feature schema/field metadata used by structured-output validation.
- `src/app/api/ai/chat/[feature]/analysis-output-validation.ts` — Structured analysis output parsing, normalization, prompt-leakage checks, and schema validation.

### Public API routes (App Router Route Handlers)

- `GET /api/ai/token`
  - Issues a short-lived signed token and sets an `HttpOnly` `SameSite=Strict` cookie to bind subsequent requests.
  - Rate limited per IP.
- `POST /api/ai/chat/[feature]`
  - Requires:
    - `Authorization: Bearer <token>` from `/api/ai/token`
    - `__Host-ai_gate_nonce` cookie set by `/api/ai/token`
  - Rate limited per IP + feature.
  - Queued per upstream model (see "Upstream Queuing" below).
  - Calls upstream via native OpenAI SDK:
    - default mode: `chat.completions` (maps to `/v1/chat/completions`)
    - optional mode: `responses` (maps to `/v1/responses`)
  - API mode selection:
    - request field `apiMode?: "chat_completions" | "responses"`
    - default is `chat_completions` for compatibility with provider SSE/chat semantics
  - Supports request-supplied generation controls:
    - `temperature?: number` (0–2). If omitted, the server applies a central default.
  - Supports request-supplied queuing controls:
    - `priority?: number` (integer -100..100). Higher values run sooner when multiple requests target the same upstream model.
  - SSE is mandatory (no JSON fallback response path).
  - Browser helper `aiChat()` always sends `Accept: text/event-stream`.
  - SSE forwards normalized model streaming events from upstream:
    - `message_start` with `{ id, model, apiMode }`
    - `message_delta` with `{ delta }`
    - `message_done` with `{ message }`
  - The existing terminal contract remains stable:
    - queue lifecycle: `queued`, `queue`, `started`
    - queue payloads do not expose internal upstream topology keys
    - final payload: `done` with `{ message, ragContext? }`

## Environment Variable Scheme (Per-Feature)

For a route param `feature`, the server resolves configuration with this precedence:

1. Feature-specific variables:
   - `AI_<FEATURE>_OPENAI_BASE_URL`
   - `AI_<FEATURE>_LLM_MODEL`
   - `AI_<FEATURE>_OPENAI_API_KEY` (optional)
   - `AI_<FEATURE>_MAX_PARALLEL` (optional; default: 1)
2. Default variables:
   - `AI_DEFAULT_OPENAI_BASE_URL`
   - `AI_DEFAULT_LLM_MODEL`
   - `AI_DEFAULT_OPENAI_API_KEY` (optional)
   - `AI_DEFAULT_MAX_PARALLEL` (optional; default: 1)
3. Built-in safe defaults (no secrets):
   - `baseUrl = https://popos-sf7.com`
   - `model = openai/gpt-oss-120b,openai/gpt-oss-20b`
   - `maxParallel = 1`
   - no API key

`<FEATURE>` is normalized server-side as: uppercase, non-alphanumerics replaced with `_`.

## OpenAI SDK Notes

- Dependency: `openai@6.18.0` from npm.
- SDK base URL is normalized to include `/v1`, so both OpenAI and OpenAI-compatible providers (including LM Studio) can be configured with or without a trailing `/v1`.
- If no API key is configured, the server uses a compatibility fallback token for SDK initialization (required by the SDK constructor) and logs a warning.
- Streaming adapter:
  - Uses SDK stream helpers (`chat.completions.stream(...)` and `responses.stream(...)`) and finalizes each turn via `finalChatCompletion()` / `finalResponse()`.
  - Forwards real upstream token deltas through `onDelta` callbacks.
  - Uses synthesized `message_delta` only as a compatibility fallback when an upstream stream yields final text without deltas.
  - Keeps explicit tool-turn orchestration (instead of `runTools`) to preserve deterministic bookmark-link allowlisting and parity across `chat.completions` and `responses`.
- Orchestration concerns are split across `upstream-pipeline.ts` (assembly), `upstream-runner.ts` (turn loop), `upstream-turn.ts` (single-turn executors), and `analysis-output-validation.ts` (analysis JSON validation) so each module remains focused and under the 350-line ceiling.

## Structured Output Contract

- Analysis flows now use OpenAI-compatible structured output primitives (`response_format: { type: "json_schema", ... }`) in `chat_completions` mode.
- `response_format` is validated in request schemas and rejected for `responses` mode to avoid silent no-op behavior.
- Server-side analysis validation applies layered parsing (`JSON.parse` first, then `jsonrepair`) before schema validation retries; client-side analysis parsing still relies on standard `JSON.parse` after token stripping.

## Abuse Controls (Anonymous Visitors)

Because the endpoints are available to anonymous visitors, they are still callable by determined scripts. The goal here is to make abuse harder without adding third-party dependencies:

- Same-origin checks using `Origin` / `Referer` host allowlist (`williamcallahan.com` and `*.williamcallahan.com`).
- Token + cookie binding step (`/api/ai/token` → `/api/ai/chat/[feature]`).
- Per-IP rate limiting using `src/lib/rate-limiter.ts`.
- Route-level memory pressure shedding via `memoryPressureMiddleware(...)` in `chat-helpers.ts` (covers `/api/ai/chat/[feature]` even when proxy matcher bypasses this path).
- Server-side logging via `src/lib/utils/logger.ts`.

## Required Secret

- `AI_TOKEN_SIGNING_SECRET` (required for token issuance and verification)

Without this secret, the AI token/chat endpoints return a `503` configuration error.

## Terminal Chat Integration

The terminal UI uses the shared gateway via:

- Feature key: `terminal_chat` (maps to env overrides like `AI_TERMINAL_CHAT_OPENAI_BASE_URL`)
- Browser entrypoint: `src/lib/ai/openai-compatible/browser-client.ts` (`aiChat(feature, request)`)
- Server routes: `GET /api/ai/token` and `POST /api/ai/chat/[feature]`

If no per-feature variables are set for `terminal_chat`, it falls back to `AI_DEFAULT_*` and then safe built-in defaults (see `src/lib/ai/openai-compatible/feature-config.ts`).

## RAG Inventory Catalog

Terminal chat injects a full inventory catalog of repo-local and dynamic content so list questions can be answered from real data.

- `src/lib/ai/rag/inventory-context.ts` orchestrates inventory assembly.
- `src/lib/ai/rag/inventory-static.ts` builds sections from `data/*` and MDX metadata.
- `src/lib/ai/rag/inventory-dynamic.ts` builds sections from bookmarks, books, tags, AI analysis, and thoughts.
- `src/lib/ai/rag/inventory-format.ts` formats and token-bounds the catalog with explicit truncation markers.

## Upstream Queuing

All requests to `POST /api/ai/chat/[feature]` are queued by upstream target so we do not exceed provider concurrency limits.

- **Queue key:** `{upstreamUrl}::${primaryModel}` built by `buildUpstreamQueueKey(...)`, where `upstreamUrl` is mode-specific and `primaryModel` is the first model in the configured model list.
- **Max parallelism:** `AI_<FEATURE>_MAX_PARALLEL` (or `AI_DEFAULT_MAX_PARALLEL`), defaulting to `1`.
- **Priority:** request body `priority` (higher runs sooner). We use this to keep interactive terminal chat responsive while allowing background analyses to wait their turn.
- **UI feedback:** the route emits queue lifecycle events (`queued` / `queue` / `started`) plus model stream events (`message_start` / `message_delta` / `message_done`) and final `done`.

## Test Coverage

- `__tests__/api/ai/chat-rag-helpers.test.ts` covers retrieval query shaping, abort classification, and chat-route memory-pressure shedding.
- `__tests__/api/ai/upstream-pipeline-test-harness.ts` centralizes upstream-pipeline mock wiring and fixture builders for DRY test setup.
- `__tests__/api/ai/chat-upstream-pipeline-streaming.test.ts` checks queue mode selection and normalized stream events.
- `__tests__/api/ai/chat-upstream-pipeline-tools.test.ts` asserts tool-call rounds and deterministic search fallback behavior.
- `__tests__/api/ai/chat-upstream-pipeline-analysis-validation.test.ts` verifies JSON/schema retry paths, coercion, and fallback normalization for bookmark analysis.
- `__tests__/components/ui/terminal/commands.test.ts` confirms terminal one-shot flow against the SSE-only contract.
- `__tests__/lib/ai-openai-compatible.test.ts` exercises browser SSE parsing and OpenAI-compatible transport behavior.
