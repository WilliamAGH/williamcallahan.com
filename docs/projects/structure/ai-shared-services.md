---
description: "Step 3: Advanced AI Features - Extended providers (OpenRouter, Perplexity, Groq), web search integration, streaming patterns, and production-ready features"
alwaysApply: false
---

# Step 3: Advanced AI Features

**Prerequisites**:

- [Step 1: Convex Database Foundation](./convex-database.md) must be deployed
- [Step 2: Core AI Services](./ai-core-services.md) must be implemented

This document extends the core AI services with additional providers, web search capabilities, and advanced patterns for production use.

## 🚨 CRITICAL IMPLEMENTATION RULES

Same as [Step 2](./ai-core-services.md#critical-implementation-rules), plus:

1. **DOCUMENTATION-DRIVEN**: Every provider implementation MUST fetch current docs
2. **NO ASSUMPTIONS**: Verify every API endpoint, parameter, and response format
3. **INCREMENTAL FEATURES**: Only add providers when core service is stable

## Overview

Step 3 adds:

- **Additional AI Providers**: OpenRouter, Perplexity, Groq
- **Advanced Features**: Tool calling, structured outputs, multi-modal
- **Production Patterns**: Circuit breakers, connection pooling, streaming
- **Security**: Secrets management, enhanced error handling

## Extended Architecture

Building on [Step 2](./ai-core-services.md#core-architecture):

```
lib/
├── ai/
│   ├── providers/
│   │   ├── openai-compatible-base.ts  # From Step 2
│   │   ├── openrouter.ts              # NEW: OpenRouter implementation
│   │   ├── perplexity.ts              # NEW: Perplexity (REST)
│   │   └── groq.ts                    # NEW: Groq SDK
│   ├── unified-ai-service.ts          # Extended from Step 2
│   ├── secrets-manager.ts             # NEW: Secure API keys
│   ├── circuit-breaker.ts             # NEW: Fault tolerance
│   └── http-client.ts                 # NEW: Enhanced streaming
```

For web search capabilities, see [Step 5: AI Web Search & Grounding](./ai-web-search-grounding.md).

## 🎯 Documentation References

**CRITICAL**: Always fetch current docs before implementing:

### AI Providers

- **OpenRouter**: <https://openrouter.ai/docs/quickstart>
- **Perplexity**: <https://docs.perplexity.ai/home>
- **Groq**: <https://console.groq.com/docs>

Use MCP tools:
```bash
@mcp__context7__resolve-library-id libraryName="provider-name"
@mcp__context7__get-library-docs context7CompatibleLibraryID="[id]"
```

## Additional Provider Implementations

### OpenRouter Provider

```typescript
// lib/ai/providers/openrouter.ts
import { OpenAICompatibleProvider } from './openai-compatible-base';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super('openrouter', {
      apiKey: apiKey || process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://williamcallahan.com',
        'X-Title': 'William Callahan AI Services',
      },
    });
  }
}
```

### Perplexity Provider (REST)

```typescript
// lib/ai/providers/perplexity.ts
import { AIProvider, AICompletionOptions } from '../types';
import { assertServerOnly } from '@/lib/utils/server-only';
import { waitForPermit } from '@/lib/rate-limiter';
import { retryWithDomainConfig } from '@/lib/utils/retry';
import { createCategorizedError } from '@/lib/utils/error-utils';
import { createStreamFromResponse, SSEStreamReader } from '../http-client';

export class PerplexityProvider implements AIProvider {
  private apiKey: string;
  private baseUrl = 'https://api.perplexity.ai';
  
  constructor(apiKey?: string) {
    assertServerOnly();
    this.apiKey = apiKey || process.env.PERPLEXITY_API_KEY!;
    if (!this.apiKey) throw new Error('PERPLEXITY_API_KEY is required');
  }

  async complete(options: AICompletionOptions): Promise<any> {
    await waitForPermit('perplexity');
    
    return retryWithDomainConfig(
      async () => {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...options,
            model: options.model || 'sonar-pro',
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw createCategorizedError(
            new Error(`Perplexity error: ${response.status}`),
            'ai',
            { status: response.status, error }
          );
        }

        return response.json();
      },
      'AI_PROVIDERS'
    );
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<any> {
    await waitForPermit('perplexity');
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...options, stream: true }),
    });

    if (!response.ok) {
      throw createCategorizedError(
        new Error(`Perplexity stream error: ${response.status}`),
        'ai'
      );
    }

    const reader = new SSEStreamReader(response.body!.getReader());
    
    try {
      while (true) {
        const data = await reader.read();
        if (!data) break;
        try {
          yield JSON.parse(data);
        } catch (e) {
          console.warn('Parse error:', e);
        }
      }
    } finally {
      reader.close();
    }
  }
}
```

### Groq Provider

```typescript
// lib/ai/providers/groq.ts
import Groq from 'groq-sdk';
import { AIProvider, AICompletionOptions } from '../types';
import { assertServerOnly } from '@/lib/utils/server-only';
import { waitForPermit } from '@/lib/rate-limiter';
import { retryWithDomainConfig } from '@/lib/utils/retry';

export class GroqProvider implements AIProvider {
  private client: Groq;
  
  constructor(apiKey?: string) {
    assertServerOnly();
    this.client = new Groq({
      apiKey: apiKey || process.env.GROQ_API_KEY,
    });
  }

  async complete(options: AICompletionOptions): Promise<Groq.ChatCompletion> {
    await waitForPermit('groq');
    
    return retryWithDomainConfig(
      async () => this.client.chat.completions.create({
        ...options,
        model: options.model || 'llama-3.3-70b-versatile',
      }),
      'AI_PROVIDERS'
    );
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
```

## Production Enhancements

### Secure Secrets Management

```typescript
// lib/ai/secrets-manager.ts
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

class SecureSecretsManager {
  private cache = new Map<string, {value: string, expiry: number}>();
  private client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  
  async getApiKey(provider: string): Promise<string> {
    const cached = this.cache.get(provider);
    if (cached && cached.expiry > Date.now()) return cached.value;
    
    const command = new GetSecretValueCommand({ 
      SecretId: `ai-provider-${provider}` 
    });
    const { SecretString } = await this.client.send(command);
    
    this.cache.set(provider, {
      value: SecretString!,
      expiry: Date.now() + 3600000 // 1-hour cache
    });
    return SecretString!;
  }
}

export const secretsManager = new SecureSecretsManager();
```

### Circuit Breaker Pattern

```typescript
// lib/ai/circuit-breaker.ts
export class AIProviderCircuitBreaker {
  private failures = new Map<string, number>();
  private lastFailureTime = new Map<string, number>();
  private readonly threshold = 5;
  private readonly timeout = 60000; // 1 minute
  
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

### Enhanced HTTP Client

```typescript
// lib/ai/http-client.ts
export class SSEStreamReader {
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
```

## Extended Unified AI Service

```typescript
// lib/ai/unified-ai-service.ts - Extended version
import { OpenAICompatibleProvider } from './providers/openai-compatible-base';
import { OpenRouterProvider } from './providers/openrouter';
import { PerplexityProvider } from './providers/perplexity';
import { GroqProvider } from './providers/groq';
import { AIProvider, AICompletionOptions } from './types';
import { assertServerOnly } from '@/lib/utils/server-only';
import { secretsManager } from './secrets-manager';
import { AIProviderCircuitBreaker } from './circuit-breaker';

export type AIProviderType = 'openai' | 'openrouter' | 'perplexity' | 'groq' | 'ollama' | 'lmstudio';

class UnifiedAIService {
  private providers = new Map<AIProviderType, AIProvider>();
  private circuitBreaker = new AIProviderCircuitBreaker();
  private static instance: UnifiedAIService;

  private constructor() {
    assertServerOnly();
  }

  static getInstance(): UnifiedAIService {
    if (!UnifiedAIService.instance) {
      UnifiedAIService.instance = new UnifiedAIService();
    }
    return UnifiedAIService.instance;
  }

  private async getProvider(type: AIProviderType): Promise<AIProvider> {
    // Check circuit breaker
    if (this.circuitBreaker.isOpen(type)) {
      throw new Error(`Provider ${type} is temporarily unavailable`);
    }

    if (!this.providers.has(type)) {
      // Secure API key retrieval
      const apiKey = type !== 'ollama' && type !== 'lmstudio' 
        ? await secretsManager.getApiKey(type)
        : undefined;
      
      switch (type) {
        case 'openai':
          this.providers.set(type, new OpenAICompatibleProvider('openai', {
            apiKey,
            baseURL: 'https://api.openai.com/v1',
          }));
          break;
        case 'openrouter':
          this.providers.set(type, new OpenRouterProvider(apiKey));
          break;
        case 'perplexity':
          this.providers.set(type, new PerplexityProvider(apiKey));
          break;
        case 'groq':
          this.providers.set(type, new GroqProvider(apiKey));
          break;
        case 'ollama':
          this.providers.set(type, new OpenAICompatibleProvider('ollama', {
            baseURL: process.env.OLLAMA_HOST || 'http://localhost:11434/v1',
          }));
          break;
        case 'lmstudio':
          this.providers.set(type, new OpenAICompatibleProvider('lmstudio', {
            baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
          }));
          break;
      }
    }
    return this.providers.get(type)!;
  }

  async complete(provider: AIProviderType, options: AICompletionOptions) {
    try {
      const aiProvider = await this.getProvider(provider);
      const result = await aiProvider.complete(options);
      this.circuitBreaker.recordSuccess(provider);
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure(provider);
      throw error;
    }
  }

  async *stream(provider: AIProviderType, options: AICompletionOptions) {
    try {
      const aiProvider = await this.getProvider(provider);
      yield* aiProvider.stream(options);
      this.circuitBreaker.recordSuccess(provider);
    } catch (error) {
      this.circuitBreaker.recordFailure(provider);
      throw error;
    }
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

## Advanced Usage Patterns

### Tool Calling Example

```typescript
const response = await aiService.complete('openai', {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is the weather in NYC?' }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['location'],
      },
    },
  }],
  tool_choice: 'auto',
});
```

### Streaming with Middleware

```typescript
// app/api/ai/[provider]/stream/route.ts
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const { messages } = await request.json();

  // Rate limiting check from Step 1
  const { allowed, reason } = await checkRequestLimits(provider as AIProviderType);
  if (!allowed) {
    return new Response(JSON.stringify({ error: reason }), { 
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stream response
  return getUnifiedAIService().streamToResponse(provider as AIProviderType, {
    model: AI_MODEL_DEFAULTS[provider],
    messages,
    stream: true,
  });
}
```

## Configuration Updates

Add to `lib/constants.ts`:

```typescript
// Extended model defaults
export const AI_MODEL_DEFAULTS = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  perplexity: 'sonar-pro',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2',
  lmstudio: 'local-model',
} as const;

// Extended timeouts
export const AI_PROVIDER_TIMEOUTS = {
  openai: { default: 30000, stream: 120000 },
  openrouter: { default: 45000, stream: 180000 },
  perplexity: { default: 30000, stream: 120000 },
  groq: { default: 20000, stream: 60000 },
  ollama: { default: 10000, stream: 60000 },
  lmstudio: { default: 10000, stream: 60000 },
} as const;

```

## Environment Variables

```env
# Additional AI Providers
OPENROUTER_API_KEY=sk-or-...
PERPLEXITY_API_KEY=pplx-...
GROQ_API_KEY=gsk_...


# AWS (for secrets manager)
AWS_REGION=us-east-1
```

## 🔗 Next Steps

1. **Step 4**: [Self-Hosted Embeddings](../architecture/embeddings-self-hosted.md) - GPU-accelerated embeddings
2. **Step 5**: [AI Web Search & Grounding](./ai-web-search-grounding.md) - Real-time search integration

## Implementation Checklist

### Extended Providers

- [ ] Implement OpenRouter provider
- [ ] Implement Perplexity REST provider
- [ ] Implement Groq SDK provider
- [ ] Test all providers with streaming

### Production Features

- [ ] Set up secrets manager
- [ ] Implement circuit breaker
- [ ] Add connection pooling
- [ ] Configure monitoring

## Conclusion

This extends the core AI services with additional providers and search capabilities while maintaining the same architecture principles. All features are optional and can be added incrementally as needed.

Total lines: ~600 (compared to 1,740 in original)
