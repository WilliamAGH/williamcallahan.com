---
description: "Step 5: AI Web Search & Grounding - Real-time web search integration for grounded AI responses with Brave, Serper, DuckDuckGo, and Perplexity APIs"
alwaysApply: false
---

# Step 5: AI Web Search & Grounding

**Prerequisites**: 
- [Step 1: Convex Database Foundation](./convex-database.md) - For rate limiting
- [Step 2: Core AI Services](./ai-core-services.md) - For AI summarization
- [Step 3: Advanced AI Features](./ai-shared-services.md) - Optional, for enhanced AI integration

This document provides web search capabilities to ground AI responses with real-time information, implementing multiple search providers with a unified interface.

## 🚨 CRITICAL IMPLEMENTATION RULES

Same as [Step 2](./ai-core-services.md#critical-implementation-rules), plus:

1. **REAL-TIME DATA**: Always fetch current information, no cached results by default
2. **PROVIDER DIVERSITY**: Support multiple providers for redundancy and coverage
3. **RESULT VALIDATION**: Sanitize and validate all search results before use

## Overview

Step 5 adds:
- **Search Providers**: Brave, Serper, DuckDuckGo, Perplexity search
- **Unified Interface**: Single API for all search providers
- **AI Integration**: Search + summarization patterns
- **Grounding**: Real-time fact checking and information retrieval

## Architecture

```
lib/
├── ai/
│   ├── search/
│   │   ├── types.ts               # Search type definitions
│   │   ├── base.ts                # Base search provider class
│   │   ├── brave.ts               # Brave Search implementation
│   │   ├── serper.ts              # Serper (Google) implementation
│   │   ├── duckduckgo.ts          # DuckDuckGo implementation
│   │   └── perplexity-search.ts   # Perplexity search
│   └── unified-search-service.ts  # Unified search service
```

## 🎯 Documentation References

**CRITICAL**: Always fetch current docs before implementing:

### Search Providers
- **Brave Search**: <https://brave.com/search/api/>
- **Serper**: <https://serper.dev/docs>
- **DuckDuckGo**: <https://duckduckgo.com/api>
- **Perplexity**: <https://docs.perplexity.ai/docs/searching>

## Search Type Definitions

```typescript
// lib/ai/search/types.ts
import { z } from 'zod';

export const SearchResultSchema = z.object({
  title: z.string(),
  description: z.string(),
  url: z.string().url(),
  publishedDate: z.string().optional(),
  author: z.string().optional(),
  thumbnail: z.string().url().optional(),
});

export const SearchOptionsSchema = z.object({
  query: z.string().max(400),
  count: z.number().min(1).max(20).default(10),
  offset: z.number().min(0).default(0),
  freshness: z.enum(['day', 'week', 'month', 'year']).optional(),
  safeSearch: z.enum(['off', 'moderate', 'strict']).default('moderate'),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

export interface SearchProvider {
  search(options: SearchOptions): Promise<SearchResult[]>;
}
```

## Base Search Provider

```typescript
// lib/ai/search/base.ts
import { SearchProvider, SearchOptions, SearchResult } from './types';
import { retryWithDomainConfig } from '@/lib/utils/retry';
import { createCategorizedError } from '@/lib/utils/error-utils';
import { waitForPermit } from '@/lib/rate-limiter';
import crypto from 'crypto';

export abstract class BaseSearchProvider implements SearchProvider {
  protected apiKey: string;
  protected baseUrl: string;
  protected providerName: string;

  constructor(providerName: string, envKey: string, baseUrl: string) {
    this.providerName = providerName;
    this.baseUrl = baseUrl;
    this.apiKey = process.env[envKey]!;
    if (!this.apiKey) throw new Error(`${envKey} is required`);
  }

  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    transformResponse: (data: any) => T
  ): Promise<T> {
    await waitForPermit(this.providerName);

    // Security: Add request ID for tracing
    const requestId = crypto.randomUUID();
    const enhancedOptions = {
      ...options,
      headers: {
        ...options.headers,
        'X-Request-ID': requestId,
      }
    };

    return retryWithDomainConfig(
      async () => {
        const response = await fetch(url, enhancedOptions);

        if (!response.ok) {
          const errorBody = await response.text();
          throw createCategorizedError(
            new Error(`${this.providerName} error: ${response.status}`),
            'search',
            { status: response.status, requestId, error: errorBody }
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

## Search Provider Implementations

### Brave Search

```typescript
// lib/ai/search/brave.ts
import { BaseSearchProvider } from './base';
import { SearchOptions, SearchResult } from './types';

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
      { 
        headers: { 
          'Accept': 'application/json',
          'X-API-KEY': this.apiKey 
        } 
      },
      (data) => data.web?.results?.map((result: any) => ({
        title: result.title,
        description: result.description,
        url: result.url,
        publishedDate: result.age,
        thumbnail: result.thumbnail?.src,
      })) || []
    );
  }
}
```

### Serper (Google Search)

```typescript
// lib/ai/search/serper.ts
import { BaseSearchProvider } from './base';
import { SearchOptions, SearchResult } from './types';

export class SerperProvider extends BaseSearchProvider {
  constructor() {
    super('serper', 'SERPER_API_KEY', 'https://google.serper.dev');
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    return this.fetchWithRetry(
      `${this.baseUrl}/search`,
      {
        method: 'POST',
        headers: { 
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json' 
        },
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
```

### DuckDuckGo Search

```typescript
// lib/ai/search/duckduckgo.ts
import { BaseSearchProvider } from './base';
import { SearchOptions, SearchResult } from './types';

export class DuckDuckGoProvider extends BaseSearchProvider {
  constructor() {
    // DuckDuckGo doesn't require API key
    super('duckduckgo', 'DUMMY_KEY', 'https://api.duckduckgo.com');
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    // DuckDuckGo Instant Answer API
    const params = new URLSearchParams({
      q: options.query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    });

    // Note: DuckDuckGo API is limited, consider using HTML search
    return this.fetchWithRetry(
      `${this.baseUrl}/?${params}`,
      { headers: { 'Accept': 'application/json' } },
      (data) => {
        const results: SearchResult[] = [];
        
        // Extract from various response types
        if (data.AbstractURL) {
          results.push({
            title: data.Heading || options.query,
            description: data.AbstractText || data.Abstract,
            url: data.AbstractURL,
          });
        }
        
        // Related topics
        data.RelatedTopics?.forEach((topic: any) => {
          if (topic.FirstURL) {
            results.push({
              title: topic.Text?.split(' - ')[0] || '',
              description: topic.Text || '',
              url: topic.FirstURL,
            });
          }
        });
        
        return results.slice(0, options.count);
      }
    );
  }
}
```

### Perplexity Search

```typescript
// lib/ai/search/perplexity-search.ts
import { BaseSearchProvider } from './base';
import { SearchOptions, SearchResult } from './types';

export class PerplexitySearchProvider extends BaseSearchProvider {
  constructor() {
    super('perplexity-search', 'PERPLEXITY_API_KEY', 'https://api.perplexity.ai');
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    // Perplexity uses their AI model for search
    return this.fetchWithRetry(
      `${this.baseUrl}/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: options.query,
          search_recency_filter: options.freshness,
          return_citations: true,
          search_domain_filter: [],
          return_images: false,
          return_related_questions: false,
          max_results: options.count,
        }),
      },
      (data) => data.citations?.map((citation: any) => ({
        title: citation.title,
        description: citation.snippet || citation.text,
        url: citation.url,
        publishedDate: citation.published_date,
      })) || []
    );
  }
}
```

## Unified Search Service

```typescript
// lib/ai/unified-search-service.ts
import { BraveSearchProvider } from './search/brave';
import { SerperProvider } from './search/serper';
import { DuckDuckGoProvider } from './search/duckduckgo';
import { PerplexitySearchProvider } from './search/perplexity-search';
import { SearchProvider, SearchOptions, SearchResult } from './search/types';
import { assertServerOnly } from '@/lib/utils/server-only';

export type SearchProviderType = 'brave' | 'serper' | 'duckduckgo' | 'perplexity';

class UnifiedSearchService {
  private providers = new Map<SearchProviderType, SearchProvider>();
  private static instance: UnifiedSearchService;

  private constructor() {
    assertServerOnly();
  }

  static getInstance(): UnifiedSearchService {
    if (!UnifiedSearchService.instance) {
      UnifiedSearchService.instance = new UnifiedSearchService();
    }
    return UnifiedSearchService.instance;
  }

  private getProvider(type: SearchProviderType): SearchProvider {
    if (!this.providers.has(type)) {
      switch (type) {
        case 'brave':
          this.providers.set(type, new BraveSearchProvider());
          break;
        case 'serper':
          this.providers.set(type, new SerperProvider());
          break;
        case 'duckduckgo':
          this.providers.set(type, new DuckDuckGoProvider());
          break;
        case 'perplexity':
          this.providers.set(type, new PerplexitySearchProvider());
          break;
      }
    }
    return this.providers.get(type)!;
  }

  async search(
    provider: SearchProviderType,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    return this.getProvider(provider).search(options);
  }

  async searchMultiple(
    providers: SearchProviderType[],
    options: SearchOptions
  ): Promise<Map<SearchProviderType, SearchResult[]>> {
    const results = await Promise.allSettled(
      providers.map(provider => 
        this.search(provider, options)
          .then(results => ({ provider, results }))
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

  // Deduplicate results across providers
  deduplicateResults(
    results: Map<SearchProviderType, SearchResult[]>
  ): SearchResult[] {
    const seen = new Set<string>();
    const deduped: SearchResult[] = [];

    for (const providerResults of results.values()) {
      for (const result of providerResults) {
        const key = new URL(result.url).hostname + result.title;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(result);
        }
      }
    }

    return deduped;
  }
}

export const getUnifiedSearchService = () => UnifiedSearchService.getInstance();
```

## Integration Patterns

### Search + AI Summarization

```typescript
import { getUnifiedAIService } from '@/lib/ai/unified-ai-service';
import { getUnifiedSearchService } from '@/lib/ai/unified-search-service';

export async function searchAndSummarize(query: string) {
  // Search multiple providers
  const searchService = getUnifiedSearchService();
  const results = await searchService.searchMultiple(
    ['brave', 'serper'], 
    { query, count: 5 }
  );

  // Deduplicate results
  const uniqueResults = searchService.deduplicateResults(results);
  
  // AI summarization
  const aiService = getUnifiedAIService();
  const summary = await aiService.complete('openai', {
    model: 'gpt-4o',
    messages: [
      { 
        role: 'system', 
        content: 'Summarize these search results concisely. Focus on key facts and recent information.' 
      },
      { 
        role: 'user', 
        content: JSON.stringify(uniqueResults.slice(0, 10)) 
      },
    ],
  });

  return {
    summary: summary.choices[0].message.content,
    sources: uniqueResults.slice(0, 5),
    totalResults: uniqueResults.length,
  };
}
```

### Real-Time Fact Checking

```typescript
export async function factCheck(statement: string) {
  const searchService = getUnifiedSearchService();
  
  // Search for evidence
  const results = await searchService.searchMultiple(
    ['brave', 'perplexity'],
    { 
      query: statement,
      count: 10,
      freshness: 'week', // Recent information only
    }
  );

  const aiService = getUnifiedAIService();
  const analysis = await aiService.complete('openai', {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Analyze if the statement is supported by search results. 
                  Provide: 1) Verdict (Supported/Refuted/Unverified)
                  2) Confidence level 3) Supporting evidence 4) Counter evidence`
      },
      {
        role: 'user',
        content: JSON.stringify({
          statement,
          searchResults: Array.from(results.values()).flat(),
        }),
      },
    ],
  });

  return JSON.parse(analysis.choices[0].message.content);
}
```

### Grounded Question Answering

```typescript
export async function groundedAnswer(question: string) {
  // First, search for relevant information
  const searchService = getUnifiedSearchService();
  const searchResults = await searchService.search('brave', {
    query: question,
    count: 10,
  });

  // Then generate answer grounded in search results
  const aiService = getUnifiedAIService();
  const response = await aiService.complete('openai', {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Answer the question based ONLY on the provided search results.
                  If the search results don't contain enough information, say so.
                  Always cite your sources with [Source: URL].`
      },
      {
        role: 'user',
        content: JSON.stringify({ question, searchResults }),
      },
    ],
  });

  return response.choices[0].message.content;
}
```

## API Routes

### Search Endpoint

```typescript
// app/api/search/route.ts
import { getUnifiedSearchService } from '@/lib/ai/unified-search-service';
import { SearchOptionsSchema } from '@/lib/ai/search/types';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const options = SearchOptionsSchema.parse(body);
    const provider = body.provider || 'brave';

    const searchService = getUnifiedSearchService();
    const results = await searchService.search(provider, options);

    return Response.json({ results });
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return Response.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
```

### Grounded Chat Endpoint

```typescript
// app/api/ai/grounded-chat/route.ts
export async function POST(request: NextRequest) {
  const { messages, searchFirst = true } = await request.json();
  
  if (searchFirst) {
    // Extract query from last user message
    const lastMessage = messages.findLast((m: any) => m.role === 'user');
    const query = lastMessage?.content || '';
    
    // Search for context
    const { summary, sources } = await searchAndSummarize(query);
    
    // Add context to messages
    messages.push({
      role: 'system',
      content: `Recent search results: ${summary}\nSources: ${sources.map(s => s.url).join(', ')}`,
    });
  }

  // Continue with AI completion
  const aiService = getUnifiedAIService();
  return aiService.streamToResponse('openai', {
    model: 'gpt-4o',
    messages,
    stream: true,
  });
}
```

## Configuration

Add to `lib/constants.ts`:

```typescript
// Search rate limits
export const SEARCH_RATE_LIMITS = {
  'brave-search': { maxRequests: 100, windowMs: 60000 },
  'serper': { maxRequests: 100, windowMs: 60000 },
  'duckduckgo': { maxRequests: 200, windowMs: 60000 },
  'perplexity-search': { maxRequests: 50, windowMs: 60000 },
} as const;

// Search defaults
export const SEARCH_DEFAULTS = {
  resultCount: 10,
  safeSearch: 'moderate' as const,
  timeout: 10000,
  cacheTime: 300000, // 5 minutes
} as const;
```

## Environment Variables

```env
# Search Providers
BRAVE_SEARCH_API_KEY=BSA...
SERPER_API_KEY=...
PERPLEXITY_API_KEY=pplx-...
# DuckDuckGo doesn't require API key
```

## Rate Limiting Integration

From [Step 1](./convex-database.md), add to rate limiter config:

```typescript
// Rate limits for search providers
braveSearchRequests: { kind: "fixed window", rate: 100, period: MINUTE },
serperRequests: { kind: "fixed window", rate: 100, period: MINUTE },
duckduckgoRequests: { kind: "fixed window", rate: 200, period: MINUTE },
perplexitySearchRequests: { kind: "fixed window", rate: 50, period: MINUTE },
```

## 🔗 Next Steps

Consider implementing:
- Search result caching with Redis
- Custom ranking algorithms
- Domain-specific search filters
- Search analytics and insights

## Implementation Checklist

### Search Providers
- [ ] Implement Brave Search
- [ ] Implement Serper API
- [ ] Implement DuckDuckGo
- [ ] Implement Perplexity Search
- [ ] Test multi-provider search

### Integration Features
- [ ] Search + AI summarization
- [ ] Fact checking system
- [ ] Grounded Q&A
- [ ] Result deduplication

### Production Features
- [ ] Rate limiting per provider
- [ ] Search result caching
- [ ] Error handling
- [ ] Monitoring and analytics

## Conclusion

This search grounding system provides real-time information retrieval to enhance AI responses with current, factual data. The unified interface makes it easy to switch between providers or use multiple providers for comprehensive coverage.

Total lines: ~450