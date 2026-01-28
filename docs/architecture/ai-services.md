---
description: "AI Shared Services - OpenAI-compatible chat gateway with per-feature env configuration, rate limiting, and browser-oriented abuse controls"
alwaysApply: false
---

# AI Shared Services

**Functionality:** `ai-shared-services`

## Core Objective

Provide a reusable, server-only AI client layer and Next.js Route Handlers that can call **OpenAI-compatible** `/v1/chat/completions` endpoints without exposing upstream API keys or base URLs to the browser.

This system is designed to support multiple AI-backed site features where each feature can use its own:

- `OPENAI_BASE_URL` equivalent
- API key
- model (`LLM_MODEL`)
- upstream concurrency (`MAX_PARALLEL`)

## What Was Implemented

### Shared client

- `src/lib/ai/openai-compatible/openai-compatible-client.ts` — Minimal fetch-based client for OpenAI-compatible chat completions.
- `src/lib/ai/openai-compatible/feature-config.ts` — Per-feature env resolution + URL builder.
- `src/lib/ai/openai-compatible/browser-client.ts` — Minimal browser helper that mints `/api/ai/token` then calls `/api/ai/chat/[feature]`.
- `src/types/schemas/ai-openai-compatible.ts` — Zod schemas for chat messages and upstream response validation.
- `src/lib/ai/openai-compatible/upstream-request-queue.ts` — Per-upstream (model + URL) priority queue with configurable max parallelism.

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
  - Calls upstream `POST {baseUrl}/v1/chat/completions` using server-only env config.
  - Supports request-supplied generation controls:
    - `temperature?: number` (0–2). If omitted, the server applies a central default in `src/lib/ai/openai-compatible/openai-compatible-client.ts`.
  - Supports request-supplied queuing controls:
    - `priority?: number` (integer -100..100). Higher values run sooner when multiple requests target the same upstream model.
  - Supports real-time queue position updates when the client sets `Accept: text/event-stream`.

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
   - `model = openai/gpt-oss-120b`
   - `maxParallel = 1`
   - no API key

`<FEATURE>` is normalized server-side as: uppercase, non-alphanumerics replaced with `_`.

## Abuse Controls (Anonymous Visitors)

Because the endpoints are available to anonymous visitors, they are still callable by determined scripts. The goal here is to make abuse harder without adding third-party dependencies:

- Same-origin oriented checks using `Origin` / `Referer` host allowlist (`williamcallahan.com` and `*.williamcallahan.com`).
- Token + cookie binding step (`/api/ai/token` → `/api/ai/chat/[feature]`).
- Per-IP rate limiting using `src/lib/rate-limiter.ts`.
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

## Upstream Queuing

All requests to `POST /api/ai/chat/[feature]` are queued by upstream target so we do not exceed provider concurrency limits.

- **Queue key:** `{chatCompletionsUrl}::${model}` (so different base URLs do not block each other even if the model name matches).
- **Max parallelism:** `AI_<FEATURE>_MAX_PARALLEL` (or `AI_DEFAULT_MAX_PARALLEL`), defaulting to `1`.
- **Priority:** request body `priority` (higher runs sooner). We use this to keep interactive terminal chat responsive while allowing background analyses to wait their turn.
- **UI feedback:** when the client sends `Accept: text/event-stream`, the route emits `queued` / `queue` / `started` / `done` events so clients can display queue position while waiting.
