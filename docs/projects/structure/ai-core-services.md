---
description: "Step 2: Core AI Services - Minimal, battle-tested infrastructure for OpenAI-compatible AI services with MVP API route"
alwaysApply: false
---

# Step 2: Core AI Services

**Prerequisites**: [Step 1: Convex Database Foundation](./convex-database.md) must be deployed first.

This document provides the minimal, battle-tested core services needed to get AI functionality working. Focus on OpenAI compatibility, proven patterns, and a working MVP.

## 🚨 CRITICAL IMPLEMENTATION RULES

1. **NO LLM KNOWLEDGE**: Do NOT rely on any LLM training data about these APIs
2. **LIVE DOCUMENTATION ONLY**: ALL implementations MUST be based on current documentation fetched live
3. **BATTLE-TESTED CODE**: Use proven patterns, no experimental features
4. **VANILLA FIRST**: Prefer vanilla HTTP calls over SDKs unless SDK provides critical functionality
5. **EXACT DOCUMENTATION**: Follow provider documentation to the letter - no assumptions

## Core Architecture

### Minimal File Structure

```
lib/
├── ai/
│   ├── providers/
│   │   └── openai-compatible-base.ts  # Single base for all OpenAI-compatible
│   ├── types.ts                        # Core type definitions
│   └── unified-ai-service.ts           # Main service singleton
└── constants.ts                        # Shared configuration
```

## Core Type Definitions

```typescript
// lib/ai/types.ts
import { z } from 'zod';

// Security: Injection pattern detection
const INJECTION_PATTERNS = /(\bignore\s+previous\b|\bsystem\s+prompt\b|\bdisregard\s+instructions\b)/i;

// Minimal message types for OpenAI compatibility
export const AIMessageSchema = z.discriminatedUnion('role', [
  z.object({ 
    role: z.literal('system'), 
    content: z.string().max(2000).refine(
      (val) => !INJECTION_PATTERNS.test(val),
      { message: "Potential injection detected" }
    )
  }),
  z.object({ 
    role: z.literal('user'), 
    content: z.string().max(8192).refine(
      (val) => !INJECTION_PATTERNS.test(val),
      { message: "Potential injection detected" }
    )
  }),
  z.object({ 
    role: z.literal('assistant'), 
    content: z.string().nullable()
  }),
]);

export const AICompletionOptionsSchema = z.object({
  model: z.string(),
  messages: z.array(AIMessageSchema),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  stream: z.boolean().optional(),
});

export type AIMessage = z.infer<typeof AIMessageSchema>;
export type AICompletionOptions = z.infer<typeof AICompletionOptionsSchema>;
```

## OpenAI-Compatible Base Provider

```typescript
// lib/ai/providers/openai-compatible-base.ts
import OpenAI from 'openai'; // v4.x SDK
import { AICompletionOptions } from '../types';
import { assertServerOnly } from '@/lib/utils/server-only';

export class OpenAICompatibleProvider {
  protected client: OpenAI;
  protected providerName: string;
  
  constructor(providerName: string, config: {
    apiKey?: string;
    baseURL?: string;
  }) {
    assertServerOnly();
    this.providerName = providerName;
    
    // Security: Validate API key for cloud providers
    if (!config.apiKey && providerName !== 'ollama') {
      throw new Error(`${providerName.toUpperCase()}_API_KEY is required`);
    }
    
    this.client = new OpenAI({
      apiKey: config.apiKey || 'not-needed',
      baseURL: config.baseURL,
      timeout: 30000,
      maxRetries: 3,
    });
  }
  
  async complete(options: AICompletionOptions): Promise<OpenAI.ChatCompletion> {
    return this.client.chat.completions.create({ ...options, stream: false });
  }
  
  async *stream(options: AICompletionOptions): AsyncGenerator<OpenAI.ChatCompletionChunk> {
    const stream = await this.client.chat.completions.create({ ...options, stream: true });
    for await (const chunk of stream) yield chunk;
  }
}
```

## Unified AI Service

```typescript
// lib/ai/unified-ai-service.ts
import { OpenAICompatibleProvider } from './providers/openai-compatible-base';
import { AICompletionOptions } from './types';
import { assertServerOnly } from '@/lib/utils/server-only';

export type CoreAIProviderType = 'openai' | 'ollama';

class UnifiedAIService {
  private providers = new Map<CoreAIProviderType, OpenAICompatibleProvider>();
  private static instance: UnifiedAIService;

  private constructor() {
    assertServerOnly();
  }

  static getInstance(): UnifiedAIService {
    if (!UnifiedAIService.instance) UnifiedAIService.instance = new UnifiedAIService();
    return UnifiedAIService.instance;
  }

  private getProvider(type: CoreAIProviderType): OpenAICompatibleProvider {
    if (!this.providers.has(type)) {
      switch (type) {
        case 'openai':
          this.providers.set(type, new OpenAICompatibleProvider('openai', {
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: 'https://api.openai.com/v1',
          }));
          break;
        case 'ollama':
          this.providers.set(type, new OpenAICompatibleProvider('ollama', {
            baseURL: process.env.OLLAMA_HOST || 'http://localhost:11434/v1',
          }));
          break;
      }
    }
    return this.providers.get(type)!;
  }

  async complete(provider: CoreAIProviderType, options: AICompletionOptions) {
    return this.getProvider(provider).complete(options);
  }

  async *stream(provider: CoreAIProviderType, options: AICompletionOptions) {
    yield* this.getProvider(provider).stream(options);
  }

  streamToResponse(provider: CoreAIProviderType, options: AICompletionOptions): Response {
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

## MVP API Route

```typescript
// app/api/ai/chat/route.ts
import { getUnifiedAIService } from '@/lib/ai/unified-ai-service';
import { AICompletionOptionsSchema } from '@/lib/ai/types';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const options = AICompletionOptionsSchema.parse({
      model: body.model || 'gpt-4o-mini',
      messages: body.messages,
      temperature: body.temperature || 0.7,
      max_tokens: body.max_tokens || 1000,
      stream: body.stream || false,
    });
    
    const provider = body.provider || 'openai';
    const aiService = getUnifiedAIService();
    
    // Streaming response
    if (options.stream) {
      return aiService.streamToResponse(provider, options);
    }
    
    // Non-streaming response
    const completion = await aiService.complete(provider, options);
    return Response.json(completion);
    
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(
        { error: error.message },
        { status: error.message.includes('API_KEY') ? 401 : 400 }
      );
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Configuration Constants

```typescript
// lib/constants.ts - Add to existing file:
export const AI_MODEL_DEFAULTS = {
  openai: 'gpt-4o-mini',
  ollama: 'llama3.2',
} as const;

export const AI_PROVIDER_TIMEOUTS = {
  openai: { default: 30000, stream: 120000 },
  ollama: { default: 10000, stream: 60000 },
} as const;
```

## Environment Variables

```env
# Required for OpenAI
OPENAI_API_KEY=sk-...

# Optional for local models
OLLAMA_HOST=http://localhost:11434
```

## Testing Your MVP

### 1. Non-Streaming Request

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "provider": "openai"
  }'
```

### 2. Streaming Request

```typescript
// components/ai-chat.tsx
'use client';

export function AIChat() {
  const [response, setResponse] = useState('');
  
  async function sendMessage() {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello!' }],
        stream: true,
      }),
    });
    
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            setResponse(prev => prev + (parsed.choices[0]?.delta?.content || ''));
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    }
  }
  
  return (
    <div>
      <button onClick={sendMessage}>Send Message</button>
      <div>{response}</div>
    </div>
  );
}
```

## Rate Limiting Integration

See [Step 1: Convex Database](./convex-database.md#rate-limiting-check) for the complete rate limiting implementation. Basic integration:

```typescript
// Add to API route before processing
import { checkRequestLimits } from '@/lib/ai/rate-limiter-convex';

const { allowed, reason } = await checkRequestLimits('openai', userId);
if (!allowed) {
  return Response.json({ error: reason }, { status: 429 });
}
```

## 🔗 Next Steps

1. **Step 3**: [Advanced AI Features](./ai-shared-services.md) - Add more providers and production features
2. **Step 4**: [Self-Hosted Embeddings](../architecture/embeddings-self-hosted.md) - GPU-accelerated embeddings
3. **Step 5**: [AI Web Search & Grounding](./ai-web-search-grounding.md) - Real-time search integration

## Conclusion

This core implementation provides a working AI service with:

- ✅ OpenAI compatibility
- ✅ Local model support (Ollama)
- ✅ Streaming and non-streaming
- ✅ Type safety with Zod
- ✅ Security built-in
- ✅ Ready for production

Total lines: ~300 (compared to 1,740 in the full document)
