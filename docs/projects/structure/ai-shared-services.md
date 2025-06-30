---
description: "AI Shared Services - Unified AI provider and web search integration with OpenAI, OpenRouter, Perplexity, Groq, and web search APIs"
alwaysApply: false
---

# AI Shared Services

This document defines the architecture and implementation of unified AI provider services and web search capabilities for the williamcallahan.com project.

## 🚨 CRITICAL IMPLEMENTATION RULES

### ABSOLUTE REQUIREMENTS - JUNE 2025

1. **NO LLM KNOWLEDGE**: Do NOT rely on any LLM training data about these APIs
2. **LIVE DOCUMENTATION ONLY**: ALL implementations MUST be based on current documentation fetched live
3. **BATTLE-TESTED CODE**: Use proven patterns, no experimental features
4. **VANILLA FIRST**: Prefer vanilla HTTP calls over SDKs unless SDK provides critical functionality
5. **EXACT DOCUMENTATION**: Follow provider documentation to the letter - no assumptions

### 🎯 VERCEL AI SDK v5 - STANDARDS COMPLIANCE POLICY

**ALLOWED**: We CAN use Vercel AI SDK v5 (June 2025) under these strict conditions:

1. **SELF-HOSTED ONLY**: We do NOT use Vercel hosting. All deployments are self-hosted.
2. **OPEN STANDARDS ONLY**: Only use features that implement open standards:
   - OpenAI-compatible API format (industry standard)
   - Server-Sent Events (W3C standard)
   - Web Streams API (WHATWG standard)
   - HTTP/REST (IETF standards)
3. **NO PROPRIETARY FEATURES**: Avoid Vercel-specific features:
   - ❌ Vercel KV, Vercel Postgres, Vercel Blob
   - ❌ Vercel-specific routing or middleware
   - ❌ Any feature that locks us to Vercel infrastructure
4. **OPEN SOURCE**: The AI SDK is open source (Apache 2.0 license)
5. **PROVIDER AGNOSTIC**: Use the SDK's unified interface that works with any provider

**Documentation References**:

- Getting Started: <https://ai-sdk.dev/docs/getting-started/nextjs-app-router>
- Introduction: <https://ai-sdk.dev/docs/introduction>
- Context7: <https://context7.com/context7/v5_ai-sdk_dev>

**Standards-Compliant Usage Example**:
```typescript
// ✅ ALLOWED: Uses open standards, provider-agnostic
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// Works with any OpenAI-compatible endpoint
const provider = createOpenAI({
  baseURL: 'https://any-openai-compatible-api.com/v1',
  apiKey: process.env.API_KEY,
});

// ❌ AVOID: Vercel-specific features
// import { useChat } from 'ai/react'; // Only if it uses standard fetch
```

### SDK vs Vanilla API Decision Matrix

| Provider | Implementation | Base Class | Reason |
|----------|---------------|------------|---------|
| **OpenAI**, **OpenRouter**, **Ollama**, **LM Studio** | SDK (`openai` v4.x) | `OpenAICompatibleProvider` | OpenAI-compatible standard |
| **Perplexity**, **Brave**, **Serper**, **DuckDuckGo** | Vanilla `fetch` | `BaseSearchProvider` (search only) | REST APIs, no SDK |
| **Groq** | SDK (`groq-sdk`) | None | Custom SDK (not OpenAI-compatible) |

### Documentation References - MUST CONSULT

**CRITICAL**: When implementing any provider, you MUST fetch and consult these exact documentation sources:

#### AI Providers

- **OpenAI**: GitHub: <https://github.com/openai/openai-node>, Context7: <https://context7.com/openai/openai-node>, Agents: <https://context7.com/openai/openai-agents-js>
- **OpenRouter**: Docs: <https://openrouter.ai/docs/quickstart>, Context7: <https://context7.com/llmstxt/openrouter_ai-docs-llms-full.txt>
- **Perplexity**: Docs: <https://docs.perplexity.ai/home>, Context7: <https://context7.com/context7/perplexity_ai>
- **Groq**: Context7: <https://context7.com/groq/groq-api-cookbook>
- **Ollama** (Local Models): GitHub: <https://github.com/ollama/ollama>, Releases: <https://github.com/ollama/ollama/releases>, JS SDK: <https://github.com/ollama/ollama-js>, Context7 SDK: <https://context7.com/ollama/ollama-js>, Context7 Docs: <https://context7.com/ollama/ollama>
- **LM Studio** (Local Models): Docs: <https://github.com/lmstudio-ai/docs>, Context7 Docs: <https://context7.com/lmstudio-ai/docs>, JS SDK: <https://github.com/lmstudio-ai/lmstudio-js>, Context7 SDK: <https://context7.com/lmstudio-ai/lmstudio-js>

#### Search Providers

- **Serper**: <https://context7.com/context7/serpapi_com-search-api>

#### Reference (if needed)

- **LangChain**: Docs: <https://js.langchain.com/docs/introduction/>, Context7: <https://context7.com/llmstxt/js_langchain_com-llms.txt>
- **TypeScript Best Practices**: Convex: <https://docs.convex.dev/understanding/best-practices/typescript>, Context7: <https://context7.com/get-convex/convex-js>

### Implementation Workflow

1. **FETCH DOCUMENTATION**: Use MCP tools to fetch current docs
   ```bash
   # For Context7 resources
   @mcp__context7__get-library-docs context7CompatibleLibraryID="[id]"
   
   # For direct URLs
   @mcp__jina-ai-mcp-server__read_webpage url="[documentation-url]"
   ```

2. **VERIFY API CHANGES**: Check for breaking changes, new features, deprecations

3. **IMPLEMENT EXACTLY**: Follow documentation precisely, no shortcuts

4. **TEST WITH REAL CALLS**: Verify against actual API responses

## Overview

The AI Shared Services module provides a clean, lightweight abstraction layer for:

- **AI Providers**: OpenAI, OpenRouter, Perplexity, Groq
- **Web Search APIs**: Brave Search, Perplexity Search, Serper, DuckDuckGo
- **Modern Features**: Streaming responses, tool calling, structured outputs
- **Rate Limiting**: Unified rate limiting across all providers
- **Caching**: Multi-tiered caching strategy

## Architecture

### Core Principles

1. **Lightweight Footprint**: Minimal dependencies, no unnecessary abstractions
2. **Type Safety**: Full TypeScript types with Zod validation
3. **Modern APIs**: Support for June 2025 features including streaming and tool calling
4. **Provider Agnostic**: Unified interface across all providers
5. **Battle-tested**: Production-ready with proper error handling
6. **Documentation-Driven**: Every implementation based on current official docs

### File Structure

```
lib/
├── ai/
│   ├── providers/
│   │   ├── openai.ts          # OpenAI provider implementation
│   │   ├── openrouter.ts      # OpenRouter provider implementation
│   │   ├── perplexity.ts      # Perplexity provider implementation
│   │   └── groq.ts            # Groq provider implementation
│   ├── search/
│   │   ├── brave.ts           # Brave Search implementation
│   │   ├── perplexity.ts      # Perplexity Search implementation
│   │   ├── serper.ts          # Serper API implementation
│   │   └── duckduckgo.ts      # DuckDuckGo Search implementation
│   ├── unified-ai-service.ts  # Main AI service singleton
│   ├── unified-search-service.ts # Main search service singleton
│   └── types.ts               # Shared type definitions
├── constants.ts               # API configurations
└── rate-limiter.ts           # Existing rate limiting
```

## AI Provider Service

### Unified Interface

```typescript
// lib/ai/types.ts
import { z } from 'zod';

// Base message types compatible with all providers
export const AIMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('system'), content: z.string() }),
  z.object({ role: z.literal('user'), content: z.union([z.string(), z.array(z.any())]) }), // Support multimodal
  z.object({ role: z.literal('assistant'), content: z.string().nullable(), tool_calls: z.array(z.any()).optional() }),
  z.object({ role: z.literal('tool'), content: z.string(), tool_call_id: z.string() }),
]);

export const AIToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({ name: z.string(), description: z.string(), parameters: z.record(z.any()) }), // JSON Schema
});

export const AICompletionOptionsSchema = z.object({
  model: z.string(),
  messages: z.array(AIMessageSchema),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  stream: z.boolean().optional(),
  tools: z.array(AIToolSchema).optional(),
  tool_choice: z.union([
    z.literal('none'), z.literal('auto'), z.literal('required'),
    z.object({ type: z.literal('function'), function: z.object({ name: z.string() }) }),
  ]).optional(),
  response_format: z.object({
    type: z.enum(['text', 'json_object', 'json_schema']),
    json_schema: z.any().optional(),
  }).optional(),
});

export type AIMessage = z.infer<typeof AIMessageSchema>;
export type AITool = z.infer<typeof AIToolSchema>;
export type AICompletionOptions = z.infer<typeof AICompletionOptionsSchema>;
```

### HTTP Client Shared Functionality

Since many providers use vanilla fetch, we need a shared HTTP client:

```typescript
// lib/ai/http-client.ts
import { createCategorizedError } from '@/lib/utils/error-utils';

export interface StreamReader {
  read(): Promise<string | null>;
  close(): void;
}

export class SSEStreamReader implements StreamReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = '';
  private closed = false;

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.reader = reader;
  }

  async read(): Promise<string | null> {
    if (this.closed) return null;

    while (true) {
      const lineEnd = this.buffer.indexOf('\n');
      if (lineEnd !== -1) {
        const line = this.buffer.slice(0, lineEnd).trim();
        this.buffer = this.buffer.slice(lineEnd + 1);
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            this.closed = true;
            return null;
          }
          return data;
        }
        continue;
      }

      const { done, value } = await this.reader.read();
      if (done) {
        this.closed = true;
        return null;
      }

      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  close(): void {
    this.closed = true;
    this.reader.cancel();
  }
}

export async function createStreamFromResponse(response: Response): Promise<StreamReader> {
  if (!response.body) throw createCategorizedError(new Error('No response body for streaming'), 'ai');
  return new SSEStreamReader(response.body.getReader());
}
```

### Provider Implementations

#### OpenAI-Compatible Providers (Shared Base Class)

All OpenAI v4.x SDK compatible providers share a single base implementation:

```typescript
// lib/ai/providers/openai-compatible-base.ts
import OpenAI from 'openai'; // v4.x SDK
import { Agent } from 'agentkeepalive';
import { AIProvider, AICompletionOptions } from '../types';
import { assertServerOnly } from '@/lib/utils/server-only';
import { waitForPermit } from '@/lib/rate-limiter';
import { retryWithDomainConfig } from '@/lib/utils/retry';
import { createCategorizedError } from '@/lib/utils/error-utils';
import { AI_PROVIDER_TIMEOUTS } from '@/lib/constants';

// Shared connection pool for ALL OpenAI-compatible providers
const agent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 100,
  maxFreeSockets: 10,
});

export abstract class OpenAICompatibleProvider implements AIProvider {
  protected client: OpenAI;
  protected providerName: string;
  
  constructor(providerName: string, config: {
    apiKey?: string;
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
  }) {
    assertServerOnly();
    this.providerName = providerName;
    
    this.client = new OpenAI({
      apiKey: config.apiKey || 'not-needed',
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      httpAgent: agent, // Shared connection pool
      timeout: AI_PROVIDER_TIMEOUTS[providerName]?.default || 30000,
      maxRetries: 3,
    });
  }
  
  async complete(options: AICompletionOptions): Promise<OpenAI.ChatCompletion> {
    await waitForPermit(this.providerName);
    return retryWithDomainConfig(
      async () => this.client.chat.completions.create({ ...options, stream: false }),
      'AI_PROVIDERS'
    ) || Promise.reject(createCategorizedError(
      new Error(`${this.providerName} completion failed after retries`), 'ai'
    ));
  }
  
  async *stream(options: AICompletionOptions): AsyncGenerator<OpenAI.ChatCompletionChunk> {
    await waitForPermit(this.providerName);
    const stream = await this.client.chat.completions.create({ ...options, stream: true });
    for await (const chunk of stream) yield chunk;
  }
  
  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      return response.data.map(m => m.id);
    } catch {
      return []; // Graceful fallback for auth/network errors
    }
  }
}
```

**Provider Configurations:**

| Provider | Class | Config | Documentation |
|:---|:---|:---|:---|
| **OpenAI** | `OpenAIProvider` | `{ apiKey: OPENAI_API_KEY }` | [GitHub](https://github.com/openai/openai-node), [Context7](/openai/openai-node) |
| **OpenRouter** | `OpenRouterProvider` | See below | [Docs](https://openrouter.ai/docs/quickstart), [Context7](/llmstxt/openrouter_ai-docs-llms-full.txt) |
| **Ollama** | `OllamaProvider` | `{ apiKey: 'not-needed', baseURL: OLLAMA_HOST ? '${OLLAMA_HOST}/v1' : 'http://localhost:11434/v1' }` | [GitHub](https://github.com/ollama/ollama), [Context7](/ollama/ollama) |
| **LM Studio** | `LMStudioProvider` | `{ apiKey: 'lm-studio', baseURL: LMSTUDIO_BASE_URL or 'http://localhost:1234/v1' }` | [Docs](https://github.com/lmstudio-ai/docs), [Context7](/lmstudio-ai/docs) |

OpenRouter Config:
```json
{
  "apiKey": "OPENROUTER_API_KEY",
  "baseURL": "https://openrouter.ai/api/v1",
  "defaultHeaders": {
    "HTTP-Referer": "SITE_URL",
    "X-Title": "williamcallahan.com"
  }
}
```

```typescript
// lib/ai/providers/openai.ts
export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() { super('openai', { apiKey: process.env.OPENAI_API_KEY }); }
}

// lib/ai/providers/openrouter.ts
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super('openrouter', {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL, 'X-Title': 'williamcallahan.com' },
    });
  }
}

// lib/ai/providers/ollama.ts
export class OllamaProvider extends OpenAICompatibleProvider {
  constructor() {
    const baseURL = process.env.OLLAMA_HOST ? `${process.env.OLLAMA_HOST}/v1` : 'http://localhost:11434/v1';
    super('ollama', { apiKey: 'not-needed', baseURL });
  }
}

// lib/ai/providers/lmstudio.ts
export class LMStudioProvider extends OpenAICompatibleProvider {
  constructor() {
    super('lmstudio', {
      apiKey: 'lm-studio',
      baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
    });
  }
}

#### REST API Providers (Non-OpenAI Compatible)

##### Perplexity Provider - Vanilla Fetch

```typescript
// lib/ai/providers/perplexity.ts
import { AIProvider, AICompletionOptions } from '../types';
import { assertServerOnly } from '@/lib/utils/server-only';
import { waitForPermit } from '@/lib/rate-limiter';
import { retryWithDomainConfig } from '@/lib/utils/retry';
import { createCategorizedError, AppError } from '@/lib/utils/error-utils';
import { createStreamFromResponse } from '../http-client';

/**
 * Perplexity Provider using vanilla fetch (no official SDK)
 * Documentation: https://docs.perplexity.ai/home
 * 
 * CRITICAL: Before implementing, fetch latest docs:
 * @mcp__context7__resolve-library-id libraryName="perplexity"
 * @mcp__context7__get-library-docs context7CompatibleLibraryID="/context7/perplexity_ai"
 */
export class PerplexityProvider implements AIProvider {
  private apiKey: string;
  private baseUrl = 'https://api.perplexity.ai'; // VERIFY from docs
  
  constructor() {
    assertServerOnly();
    this.apiKey = process.env.PERPLEXITY_API_KEY!;
    if (!this.apiKey) throw new AppError('PERPLEXITY_API_KEY is required', 'CONFIG_ERROR');
  }

  async complete(options: AICompletionOptions): Promise<any> {
    await waitForPermit('perplexity');
    
    return retryWithDomainConfig(
      async () => {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(options),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw createCategorizedError(
            new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${errorBody}`),
            'ai', { status: response.status, body: errorBody }
          );
        }

        return response.json();
      },
      'AI_PROVIDERS'
    );
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<any> {
    await waitForPermit('perplexity');
    
    const response = await retryWithDomainConfig(
      async () => {
        const resp = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...options, stream: true }),
        });

        if (!resp.ok) {
          const errorBody = await resp.text();
          throw createCategorizedError(
            new Error(`Perplexity stream error: ${resp.status} ${resp.statusText} - ${errorBody}`),
            'ai', { status: resp.status, body: errorBody }
          );
        }

        return resp;
      },
      'AI_PROVIDERS'
    );

    if (!response) throw createCategorizedError(new Error('Perplexity stream failed after retries'), 'ai');

    const streamReader = await createStreamFromResponse(response);
    
    try {
      while (true) {
        const data = await streamReader.read();
        if (!data) break;
        
        try {
          yield JSON.parse(data);
        } catch (e) {
          console.warn('Perplexity stream parse error:', e);
        }
      }
    } finally {
      streamReader.close();
    }
  }
}
```

##### Groq Provider - SDK

```typescript
// lib/ai/providers/groq.ts
import Groq from 'groq-sdk'; // MUST verify groq-sdk in package.json
import { AIProvider, AICompletionOptions } from '../types';
import { assertServerOnly } from '@/lib/utils/server-only';
import { waitForPermit } from '@/lib/rate-limiter';
import { retryWithDomainConfig } from '@/lib/utils/retry';
import { createCategorizedError } from '@/lib/utils/error-utils';

/**
 * Groq Provider using official SDK
 * Documentation: https://console.groq.com/docs
 * 
 * CRITICAL: Before implementing, fetch latest docs:
 * @mcp__context7__get-library-docs context7CompatibleLibraryID="/groq/groq-api-cookbook"
 */
export class GroqProvider implements AIProvider {
  private client: Groq;
  
  constructor() {
    assertServerOnly();
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async complete(options: AICompletionOptions): Promise<Groq.ChatCompletion> {
    await waitForPermit('groq');
    
    return retryWithDomainConfig(
      async () => this.client.chat.completions.create({
        ...options,
        model: options.model || 'llama-3.3-70b-versatile',
        max_completion_tokens: options.max_tokens || 4096,
      }),
      'AI_PROVIDERS'
    ) || Promise.reject(createCategorizedError(new Error('Groq completion failed after retries'), 'ai'));
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<Groq.ChatCompletionChunk> {
    await waitForPermit('groq');
    
    const stream = await this.client.chat.completions.create({
      ...options,
      stream: true,
      model: options.model || 'llama-3.3-70b-versatile',
    });

    for await (const chunk of stream) yield chunk;
  }
}

### Unified AI Service

```typescript
// lib/ai/unified-ai-service.ts
import { OpenAIProvider } from './providers/openai';
import { OpenRouterProvider } from './providers/openrouter';
import { PerplexityProvider } from './providers/perplexity';
import { GroqProvider } from './providers/groq';
import { OllamaProvider } from './providers/ollama';
import { LMStudioProvider } from './providers/lmstudio';
import { AIProvider, AICompletionOptions } from './types';
import { assertServerOnly } from '@/lib/utils/server-only';

export type AIProviderType = 'openai' | 'openrouter' | 'perplexity' | 'groq' | 'ollama' | 'lmstudio';

class UnifiedAIService {
  private providers = new Map<AIProviderType, AIProvider>();
  private static instance: UnifiedAIService;

  private constructor() {
    assertServerOnly();
  }

  static getInstance(): UnifiedAIService {
    if (!UnifiedAIService.instance) UnifiedAIService.instance = new UnifiedAIService();
    return UnifiedAIService.instance;
  }

  private getProvider(type: AIProviderType): AIProvider {
    if (!this.providers.has(type)) {
      switch (type) {
        case 'openai': this.providers.set(type, new OpenAIProvider()); break;
        case 'openrouter': this.providers.set(type, new OpenRouterProvider()); break;
        case 'perplexity': this.providers.set(type, new PerplexityProvider()); break;
        case 'groq': this.providers.set(type, new GroqProvider()); break;
        case 'ollama': this.providers.set(type, new OllamaProvider()); break;
        case 'lmstudio': this.providers.set(type, new LMStudioProvider()); break;
      }
    }
    return this.providers.get(type)!;
  }

  async complete(provider: AIProviderType, options: AICompletionOptions) {
    return this.getProvider(provider).complete(options);
  }

  async *stream(provider: AIProviderType, options: AICompletionOptions) {
    yield* this.getProvider(provider).stream(options);
  }

  streamToResponse(provider: AIProviderType, options: AICompletionOptions): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of getInstance().stream(provider, options)) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
}

export const getUnifiedAIService = () => UnifiedAIService.getInstance();
```

## Web Search Service

### Search Interface

```typescript
// lib/ai/search/types.ts
import { z } from 'zod';

export const SearchResultSchema = z.object({
  title: z.string(),
  description: z.string(),
  url: z.string(),
  publishedDate: z.string().optional(),
  author: z.string().optional(),
  thumbnail: z.string().optional(),
});

export const SearchOptionsSchema = z.object({
  query: z.string(),
  count: z.number().min(1).max(20).default(10),
  offset: z.number().min(0).default(0),
  freshness: z.enum(['day', 'week', 'month', 'year']).optional(),
  safeSearch: z.enum(['off', 'moderate', 'strict']).default('moderate'),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
```

### Search Provider Implementations

#### Base Search Provider Utilities

```typescript
// lib/ai/search/base.ts
import { SearchProvider, SearchOptions, SearchResult } from './types';
import { retryWithDomainConfig } from '@/lib/utils/retry';
import { createCategorizedError, AppError } from '@/lib/utils/error-utils';
import { waitForPermit } from '@/lib/rate-limiter';

export abstract class BaseSearchProvider implements SearchProvider {
  protected apiKey: string;
  protected baseUrl: string;
  protected providerName: string;

  constructor(providerName: string, envKey: string, baseUrl: string) {
    this.providerName = providerName;
    this.baseUrl = baseUrl;
    this.apiKey = process.env[envKey]!;
    if (!this.apiKey) throw new AppError(`${envKey} is required`, 'CONFIG_ERROR');
  }

  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    transformResponse: (data: any) => T
  ): Promise<T> {
    await waitForPermit(this.providerName);

    return retryWithDomainConfig(
      async () => {
        const response = await fetch(url, options);

        if (!response.ok) {
          const errorBody = await response.text();
          throw createCategorizedError(
            new Error(`${this.providerName} error: ${response.status} ${response.statusText} - ${errorBody}`),
            'search', { status: response.status, body: errorBody }
          );
        }

        const data = await response.json();
        return transformResponse(data);
      },
      'SEARCH_PROVIDERS'
    ) || [] as T;
  }

  abstract search(options: SearchOptions): Promise<SearchResult[]>;
}
```

#### Search Provider Configurations

| Provider | API Style | Base URL | Auth Header | Documentation |
|----------|-----------|----------|-------------|---------------|
| **Brave** | GET + params | `https://api.search.brave.com/res/v1` | `X-API-KEY` | [API Docs](https://brave.com/search/api/) |
| **Serper** | POST + JSON | `https://google.serper.dev` | `X-API-KEY` | [Docs](https://serper.dev/docs) |

```typescript
// lib/ai/search/brave.ts
export class BraveSearchProvider extends BaseSearchProvider {
  constructor() {
    super('brave-search', 'BRAVE_SEARCH_API_KEY', 'https://api.search.brave.com/res/v1');
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: options.query,
      count: options.count.toString(),
      offset: options.offset.toString(),
      ...(options.freshness && { freshness: options.freshness }),
      safesearch: options.safeSearch,
    });

    return this.fetchWithRetry(
      `${this.baseUrl}/web/search?${params}`,
      { headers: { 'Accept': 'application/json', 'X-API-KEY': this.apiKey } },
      (data) => data.web?.results?.map((result: any) => ({
        title: result.title,
        description: result.description,
        url: result.url,
        publishedDate: result.age,
      })) || []
    );
  }
}

// lib/ai/search/serper.ts
export class SerperProvider extends BaseSearchProvider {
  constructor() {
    super('serper', 'SERPER_API_KEY', 'https://google.serper.dev');
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    return this.fetchWithRetry(
      `${this.baseUrl}/search`,
      {
        method: 'POST',
        headers: { 'X-API-KEY': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: options.query,
          num: options.count,
          start: options.offset,
          page: Math.floor(options.offset / options.count) + 1,
        }),
      },
      (data) => data.organic?.map((result: any) => ({
        title: result.title,
        description: result.snippet,
        url: result.link,
        publishedDate: result.date,
      })) || []
    );
  }
}

### Unified Search Service

```typescript
// lib/ai/unified-search-service.ts
import { BraveSearchProvider } from './search/brave';
import { PerplexitySearchProvider } from './search/perplexity';
import { SerperProvider } from './search/serper';
import { DuckDuckGoProvider } from './search/duckduckgo';
import { SearchProvider, SearchOptions, SearchResult } from './search/types';
import { assertServerOnly } from '@/lib/utils/server-only';

export type SearchProviderType = 'brave' | 'perplexity' | 'serper' | 'duckduckgo';

class UnifiedSearchService {
  private providers = new Map<SearchProviderType, SearchProvider>();
  private static instance: UnifiedSearchService;

  private constructor() {
    assertServerOnly();
  }

  static getInstance(): UnifiedSearchService {
    if (!UnifiedSearchService.instance) UnifiedSearchService.instance = new UnifiedSearchService();
    return UnifiedSearchService.instance;
  }

  private getProvider(type: SearchProviderType): SearchProvider {
    if (!this.providers.has(type)) {
      switch (type) {
        case 'brave': this.providers.set(type, new BraveSearchProvider()); break;
        case 'perplexity': this.providers.set(type, new PerplexitySearchProvider()); break;
        case 'serper': this.providers.set(type, new SerperProvider()); break;
        case 'duckduckgo': this.providers.set(type, new DuckDuckGoProvider()); break;
      }
    }
    return this.providers.get(type)!;
  }

  async search(provider: SearchProviderType, options: SearchOptions): Promise<SearchResult[]> {
    return this.getProvider(provider).search(options);
  }

  async searchMultiple(providers: SearchProviderType[], options: SearchOptions): Promise<Map<SearchProviderType, SearchResult[]>> {
    const results = await Promise.allSettled(
      providers.map(provider => 
        this.search(provider, options).then(results => ({ provider, results }))
      )
    );

    const resultMap = new Map<SearchProviderType, SearchResult[]>();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap.set(result.value.provider, result.value.results);
      }
    }
    return resultMap;
  }
}

export const getUnifiedSearchService = () => UnifiedSearchService.getInstance();
```

## Configuration Reference

### Required Environment Variables

```env
# AI Providers
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
PERPLEXITY_API_KEY=pplx-...
GROQ_API_KEY=gsk_...

# Local Models (Optional)
OLLAMA_HOST=http://localhost:11434
LMSTUDIO_BASE_URL=http://localhost:1234/v1

# Search Providers
BRAVE_SEARCH_API_KEY=BSA...
SERPER_API_KEY=...
```

### Configuration Constants

All rate limits, timeouts, and model defaults are defined in `lib/constants.ts`:

```typescript
// lib/constants.ts - Add these to existing file:
export const AI_RATE_LIMITS = {
  openai: { maxRequests: 500, windowMs: 60000 },
  openrouter: { maxRequests: 600, windowMs: 60000 },
  perplexity: { maxRequests: 100, windowMs: 60000 },
  groq: { maxRequests: 300, windowMs: 60000 },
  ollama: { maxRequests: 1000, windowMs: 60000 },
  lmstudio: { maxRequests: 1000, windowMs: 60000 },
} as const;

export const SEARCH_RATE_LIMITS = {
  'brave-search': { maxRequests: 100, windowMs: 60000 },
  'serper': { maxRequests: 100, windowMs: 60000 },
  'perplexity-search': { maxRequests: 100, windowMs: 60000 },
  'duckduckgo': { maxRequests: 100, windowMs: 60000 },
} as const;

export const AI_MODEL_DEFAULTS = {
  openai: 'gpt-4o',
  openrouter: 'openai/gpt-4o',
  perplexity: 'sonar-pro',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2',
  lmstudio: 'local-model',
} as const;

export const AI_PROVIDER_TIMEOUTS = {
  openai: { default: 30000, complex: 60000, stream: 120000 },
  openrouter: { default: 45000, complex: 90000, stream: 180000 },
  perplexity: { default: 30000, complex: 60000, stream: 120000 },
  groq: { default: 20000, complex: 40000, stream: 60000 },
  ollama: { default: 10000, complex: 30000, stream: 60000 },
  lmstudio: { default: 10000, complex: 30000, stream: 60000 },
} as const;
```

### Retry & Error Configuration

Add to `lib/utils/retry.ts`:
```typescript
AI_PROVIDERS: {
  maxRetries: 3,
  baseDelay: 2000,
  maxBackoff: 30000,
  jitter: true,
  isRetryable: (error: Error) => isRetryableError(error, "ai"),
  onRetry: (error: Error, attempt: number) => {
    debugLog(`AI provider retry attempt ${attempt}`, "warn", { error: error.message });
  },
} as RetryConfig,

SEARCH_PROVIDERS: {
  maxRetries: 3,
  baseDelay: 1000,
  maxBackoff: 10000,
  jitter: true,
  isRetryable: (error: Error) => isRetryableError(error, "search"),
  onRetry: (error: Error, attempt: number) => {
    debugLog(`Search provider retry attempt ${attempt}`, "warn", { error: error.message });
  },
} as RetryConfig,
```

Add to `lib/utils/error-utils.ts` categorizeError function:
```typescript
if (domain === "ai" && (message.includes("openai") || message.includes("anthropic") || 
    message.includes("perplexity") || message.includes("groq"))) {
  return ErrorCategory.AI_PROVIDER;
}
if (domain === "search" && (message.includes("brave") || message.includes("serper") || 
    message.includes("duckduckgo"))) {
  return ErrorCategory.SEARCH_PROVIDER;
}
```

## Usage Examples

### Core Patterns

```typescript
import { getUnifiedAIService } from '@/lib/ai/unified-ai-service';
import { getUnifiedSearchService } from '@/lib/ai/unified-search-service';

// Basic completion
const aiService = getUnifiedAIService();
const response = await aiService.complete('openai', {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.7,
  max_tokens: 1000,
});

// Streaming (in route handler)
export async function POST(request: Request) {
  const { messages, provider = 'openai' } = await request.json();
  return aiService.streamToResponse(provider, {
    model: AI_MODEL_DEFAULTS[provider],
    messages,
    stream: true,
  });
}

// Local models (Ollama/LM Studio)
const localResponse = await aiService.complete('ollama', {
  model: AI_MODEL_DEFAULTS.ollama,
  messages: [{ role: 'user', content: prompt }],
});

// Tool calling
const toolResponse = await aiService.complete('openai', {
  model: 'gpt-4o',
  messages,
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather for location',
      parameters: { /* JSON Schema */ },
    },
  }],
  tool_choice: 'auto',
});

// Search + AI summarization
const searchService = getUnifiedSearchService();
const results = await searchService.searchMultiple(['brave', 'serper'], { query, count: 5 });
const summary = await aiService.complete('openai', {
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'Summarize these search results.' },
    { role: 'user', content: JSON.stringify(Array.from(results.values()).flat()) },
  ],
});

## Error Handling

```typescript
try {
  const response = await aiService.complete('openai', options);
  return response;
} catch (error) {
  const categorized = createCategorizedError(error, 'ai', {
    provider: 'openai',
    model: options.model,
  });

  // Common error handling patterns
  if (categorized.category === ErrorCategory.RATE_LIMIT) {
    throw new AppError('Rate limit exceeded. Please try again later.', 'RATE_LIMIT_ERROR');
  }
  if (categorized.statusCode === 401) {
    throw new AppError('Invalid API credentials.', 'AUTH_ERROR');
  }
  
  throw categorized;
}

## Async Best Practices (June 2025)

### ⚠️ Next.js 15 Dynamic APIs - BREAKING CHANGE

**CRITICAL**: In Next.js 15, `params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()` are now **asynchronous**.

```diff
// Server Components & Route Handlers
- export default function Page({ params, searchParams }) {
-   const { slug } = params;
-   const query = searchParams.query;
+ export default async function Page({ params, searchParams }) {
+   const { slug } = await params;
+   const { query } = await searchParams;

// Client Components
  'use client';
+ import { use } from 'react';
  
  export function ClientComponent({ params }) {
-   const { id } = params;
+   const { id } = use(params);  // Unwrap Promise in Client Component
    return <div>ID: {id}</div>;
  }

// Headers/Cookies
  import { cookies, headers } from 'next/headers';
  
  export async function ServerComponent() {
-   const token = cookies().get('token');
-   const userAgent = headers().get('user-agent');
+   const cookieStore = await cookies();
+   const headersList = await headers();
+   const token = cookieStore.get('token');
+   const userAgent = headersList.get('user-agent');
  }
```

**Migration**: `npx @next/codemod@canary next-async-request-api .`

**Why**: Enables parallel data fetching, enhanced streaming SSR, and better performance.

### Connection Pooling & Performance

```typescript
// lib/ai/connection-pool.ts
import { Agent } from 'agentkeepalive';

// Shared agent for ALL OpenAI-compatible providers
export const httpsAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 100,
  maxFreeSockets: 10,
});

// Already integrated in OpenAICompatibleProvider base class:
// httpAgent: httpsAgent
// timeout: AI_PROVIDER_TIMEOUTS[providerName]?.default || 30000
// maxRetries: 3
```

**Timeout Configuration** (already in `lib/constants.ts`):

- **Fast providers** (Groq, Ollama, LM Studio): 10-20s default, 30-40s complex, 60s stream
- **Standard providers** (OpenAI, Perplexity): 30s default, 60s complex, 120s stream  
- **Slower providers** (OpenRouter): 45s default, 90s complex, 180s stream

### Stream Management & Memory Safety

CRITICAL: Always close streams to prevent memory leaks:

```typescript
// lib/ai/stream-utils.ts
export async function* safeAsyncGenerator<T>(
  generator: AsyncGenerator<T>,
  cleanup?: () => void
): AsyncGenerator<T> {
  try {
    for await (const chunk of generator) yield chunk;
  } finally {
    cleanup?.();
  }
}

// Example usage in provider
async *stream(options: AICompletionOptions): AsyncGenerator<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDER_TIMEOUTS.openai.stream);
  
  try {
    const stream = await this.client.chat.completions.create({
      ...options,
      stream: true,
      signal: controller.signal,
    });
    
    yield* safeAsyncGenerator(stream, () => {
      clearTimeout(timeoutId);
      controller.abort();
    });
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
```

## 🌐 Universal Compatibility & Standards

### OpenAI API Standard - Industry Compatibility

Our implementation prioritizes **broad compatibility** through adherence to the OpenAI API standard, which has become the de facto industry standard for AI APIs:

1. **Compatible with ANY OpenAI-compatible service**:
   - Ollama (via `/v1` endpoint)
   - LM Studio (native OpenAI compatibility)
   - LocalAI
   - Text Generation WebUI
   - llama.cpp server
   - Any future OpenAI-compatible service

2. **Single Implementation, Multiple Providers**:
   ```typescript
   // This same code works with ALL providers
   const response = await client.chat.completions.create({
     model: 'any-model',
     messages: [{ role: 'user', content: 'Hello' }],
     stream: true,
   });
   ```

3. **Zero Lock-In**:
   - Switch providers by changing only the `baseURL`
   - No code changes required
   - No proprietary APIs or formats

### Local Model Support Matrix

| Provider | OpenAI Compatible | Native Features | Use Case |
|----------|------------------|-----------------|----------|
| **Ollama** | ✅ Yes (`/v1`) | Model management, embeddings | Development, model testing |
| **LM Studio** | ✅ Yes (native) | GUI, model library | User-friendly local inference |
| **LocalAI** | ✅ Yes | Multiple backends | Production self-hosting |
| **llama.cpp** | ✅ Yes | Low-level control | Resource-constrained environments |

## 🎯 Next.js 15 Server/Client Hydration Patterns

### CRITICAL: Standards-Based Architecture

This implementation follows **Web Standards** and **Next.js 15 Best Practices**:

1. **Server Components by Default**: AI operations happen in Server Components
2. **Standard Web Streams**: Use Web Streams API for streaming responses
3. **Server-Sent Events (SSE)**: Standard protocol for unidirectional streaming
4. **Progressive Enhancement**: Works without JavaScript, enhances with it
5. **No Proprietary Protocols**: Compatible with any standard HTTP client

### Server Component Pattern (Recommended)

```typescript
// app/ai-demo/page.tsx - Server Component
import { getUnifiedAIService } from '@/lib/ai/unified-ai-service';

export default async function AIPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ prompt?: string }> // Note: Promise type in Next.js 15
}) {
  const params = await searchParams; // CRITICAL: Must await in Next.js 15
  
  if (params.prompt) {
    const aiService = getUnifiedAIService();
    const response = await aiService.complete('openai', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: params.prompt }],
    });
    
    return (
      <div>
        <h1>AI Response</h1>
        <p>{response.choices[0].message.content}</p>
      </div>
    );
  }
  
  return (
    <form>
      <input name="prompt" />
      <button type="submit">Generate</button>
    </form>
  );
}
```

### Server Actions Pattern (Form-Based)

```typescript
// app/ai-actions/page.tsx
import { generateAIResponse } from './actions';

export default function AIActionsPage() {
  return (
    <form action={generateAIResponse}>
      <textarea name="prompt" />
      <button type="submit">Generate</button>
    </form>
  );
}

// app/ai-actions/actions.ts
'use server';

import { getUnifiedAIService } from '@/lib/ai/unified-ai-service';
import { revalidatePath } from 'next/cache';

export async function generateAIResponse(formData: FormData) {
  const prompt = formData.get('prompt') as string;
  
  const aiService = getUnifiedAIService();
  const response = await aiService.complete('openai', {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });
  
  await storeResponse(response);
  revalidatePath('/ai-actions');
}
```

### Standard Streaming Pattern (SSE)

```typescript
// app/api/ai/stream/route.ts - Standards-based streaming
import { getUnifiedAIService } from '@/lib/ai/unified-ai-service';

export async function POST(request: Request) {
  const { messages } = await request.json();
  
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  
  (async () => {
    try {
      const aiService = getUnifiedAIService();
      const chunks = aiService.stream(provider, {
        model: AI_MODEL_DEFAULTS[provider],
        messages,
      });
      
      for await (const chunk of chunks) {
        await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (error) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
    } finally {
      await writer.close();
    }
  })();
  
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Client-Side Consumption (Progressive Enhancement)

```typescript
// components/ai-chat-enhanced.tsx
'use client';

import { useEffect, useState } from 'react';

export function AIChatEnhanced({ fallbackContent }: { fallbackContent?: string }) {
  const [messages, setMessages] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const prompt = formData.get('prompt') as string;
    
    setIsStreaming(true);
    
    const eventSource = new EventSource(`/api/ai/stream?${new URLSearchParams({ prompt })}`);
    
    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close();
        setIsStreaming(false);
        return;
      }
      
      const chunk = JSON.parse(event.data);
      setMessages(prev => [...prev, chunk.content]);
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      setIsStreaming(false);
    };
  }
  
  return (
    <div>
      <noscript>
        <p>{fallbackContent || 'Enable JavaScript for streaming'}</p>
      </noscript>
      
      <form onSubmit={handleSubmit} method="POST" action="/api/ai/generate">
        <input name="prompt" required />
        <button type="submit" disabled={isStreaming}>
          {isStreaming ? 'Generating...' : 'Generate'}
        </button>
      </form>
      
      <div>
        {messages.map((msg, i) => <p key={i}>{msg}</p>)}
      </div>
    </div>
  );
}
```

### Next.js 15 Streaming Integration

Standards-compliant streaming with Vercel AI SDK:

```typescript
// app/api/ai/stream/route.ts
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export const runtime = 'edge';
export const maxDuration = 60;

const customOpenAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: async (url, options) => {
    return fetch(url, { ...options, keepalive: true });
  },
});

export async function POST(request: Request) {
  const { messages } = await request.json();
  
  try {
    const result = await streamText({
      model: customOpenAI('gpt-4-turbo'),
      messages,
      maxTokens: 1000,
      temperature: 0.7,
      maxRetries: 3,
      abortSignal: AbortSignal.timeout(30000),
    });
    
    return result.toDataStreamResponse({
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') return new Response('Request timeout', { status: 408 });
    if (error instanceof Error && error.message.includes('rate_limit')) return new Response('Rate limit exceeded', { status: 429 });
    return new Response('Internal server error', { status: 500 });
  }
}
```

### Error Handling for Async Operations

Enhanced error handling for async AI operations:

```typescript
// lib/ai/async-error-handler.ts
import { APIConnectionError, APIConnectionTimeoutError, RateLimitError, APIError } from 'openai';

export async function handleAIOperation<T>(
  operation: () => Promise<T>,
  context: { provider: string; operation: string }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError) {
      throw createCategorizedError(error, 'ai', { ...context, errorType: 'timeout' });
    }
    
    if (error instanceof RateLimitError) {
      const resetTime = error.headers?.['x-ratelimit-reset-requests'];
      throw createCategorizedError(error, 'ai', { ...context, errorType: 'rate_limit', resetTime });
    }
    
    if (error instanceof APIConnectionError) {
      throw createCategorizedError(error, 'ai', { ...context, errorType: 'connection' });
    }
    
    if (error instanceof APIError) {
      throw createCategorizedError(error, 'ai', { 
        ...context, errorType: 'api_error', status: error.status, code: error.code 
      });
    }
    
    throw createCategorizedError(error, 'ai', { ...context, errorType: 'unknown' });
  }
}
```

### Production Deployment Considerations

1. **Memory Monitoring**: Track heap usage for long-running streams
2. **Connection Limits**: Monitor and adjust `maxSockets` based on load
3. **Timeout Escalation**: Use shorter timeouts in development, longer in production
4. **Stream Cleanup**: Implement request cancellation on client disconnect
5. **Error Recovery**: Implement circuit breakers for provider failures

```typescript
// lib/ai/circuit-breaker.ts
export class AIProviderCircuitBreaker {
  private failures = new Map<string, number>();
  private lastFailureTime = new Map<string, number>();
  private readonly threshold = 5;
  private readonly timeout = 60000;
  
  isOpen(provider: string): boolean {
    const failures = this.failures.get(provider) || 0;
    const lastFailure = this.lastFailureTime.get(provider) || 0;
    
    if (Date.now() - lastFailure > this.timeout) {
      this.failures.delete(provider);
      this.lastFailureTime.delete(provider);
      return false;
    }
    
    return failures >= this.threshold;
  }
  
  recordSuccess(provider: string): void {
    this.failures.delete(provider);
    this.lastFailureTime.delete(provider);
  }
  
  recordFailure(provider: string): void {
    const current = this.failures.get(provider) || 0;
    this.failures.set(provider, current + 1);
    this.lastFailureTime.set(provider, Date.now());
  }
}
```

## Performance Considerations

1. **Connection Pooling**: HTTP Keep-Alive with agentkeepalive for 10x performance
2. **Rate Limiting**: Unified rate limiting prevents API abuse
3. **Streaming**: All providers support streaming with proper cleanup
4. **Caching**: Can integrate with existing ServerCache for responses
5. **Memory Management**: Strict stream cleanup and generator safety
6. **Timeout Strategy**: Provider-specific timeouts (30s default, 60s complex)
7. **Edge Runtime**: Use Next.js edge runtime for optimal streaming

## Security

1. **API Keys**: All keys stored in environment variables
2. **Server-Only**: All AI services run server-side only
3. **Input Validation**: Zod schemas validate all inputs
4. **Output Sanitization**: Response content sanitized before use
5. **Rate Limiting**: Prevents abuse and excessive costs

## Future Enhancements

1. **Response Caching**: Cache common queries with ServerCache
2. **Cost Tracking**: Monitor usage and costs per provider
3. **Fallback Routing**: Automatic fallback to alternative providers
4. **Custom Models**: Support for fine-tuned models
5. **Batch Processing**: Batch API support for Groq and others

## 📜 June 2025 Audit Updates & Clarifications

### Dependency baseline

- Add `openai@^4`, `groq-sdk`, `@ai-sdk/openai`, `p-limit`, `p-retry`, `agentkeepalive`, `zod@^4` to `package.json` alongside existing dev tooling.

### Flattened constants to merge into `lib/constants.ts`

The following objects must be appended (or merged if already present) to keep a single source of truth:

- `AI_RATE_LIMITS`
- `SEARCH_RATE_LIMITS`
- `AI_MODEL_DEFAULTS`
These SHOULD reuse any equivalent keys already exported from `lib/constants.ts`; only add what is missing to avoid duplication.

### Shared networking & streaming utilities

- Re-use the existing retry/timeout helpers found in `lib/opengraph/fetch.ts` and `lib/server/data-fetch-manager.ts` (`fetchWithTimeout`, `waitForPermit`, `retryWithThrow`).
- Introduce **one** `lib/ai/rest-json-client.ts` factory plus a `createSSEStream()` helper; every vanilla-fetch provider should import these instead of rolling custom loops.

### Zod v4 compliance

- Upgrade to Zod v4 and tighten schemas. For example, replace `z.array(z.any())` in multimodal `content` with a discriminated union that explicitly models `image_url` objects.

### Testing roadmap

1. Core smoke tests & e2e tests (Jest + Playwright) that hit each provider's /chat and /stream endpoints.
2. Gradually back-fill unit tests for edge-cases and error paths.

### Provider corrections (live docs 2025-06-30)

- **Brave Search** header is `X-API-KEY` (fixed above).
- **Serper** now uses `page` instead of `start` (fixed above).
- **Perplexity** has removed date/recency filters in June 2025 – filters deprecated
- **OpenRouter** calls must include standard `Authorization: Bearer <key>` header; the OpenAI SDK automatically injects this when `apiKey` is provided.

### DRYness & maintainability improvements

- Create a `RestJsonProvider` base for all REST providers to eliminate duplicate header/URL building.
- Consolidate streaming logic via the shared helper mentioned above.

### UI best practices for Next.js 15 canary & React 19

- Use **Server Actions** for chat-submit operations to avoid extra API routes.
- Stream with native `Response` + `TextEncoder` on the edge runtime; in the client, hydrate via `EventSource` with Suspense fallback.
- Provide optimistic UI rows and progressive enhancement hooks (`useOptimistic`, Transition API) for instant user feedback.
- Co-locate chat state in a `react-sync-external-store` compliant store so server and client share a single source of truth.

## Self-Hosted Embeddings Integration

For cost-effective, privacy-preserving embeddings generation, see the comprehensive architecture guide:
**[Self-Hosted Embeddings Architecture](/docs/projects/architecture/embeddings-self-hosted.md)**

Key benefits:

- **95%+ cost reduction** vs OpenAI embeddings
- **Full data privacy** - no data leaves your infrastructure
- **OpenAI-compatible API** - drop-in replacement
- **GPU acceleration** - 10-50ms latency
- **Coolify-ready** - Docker deployment configs included

> All updates above are normative and MUST be honored during implementation to remain ZERO-TEMPERATURE compliant.
