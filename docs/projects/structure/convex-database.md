---
description: "Step 1: Convex Database Foundation - Self-hosted reactive database with rate limiting, real-time subscriptions, and type-safe schema management for AI services"
alwaysApply: false
---

> **External Documentation & Aggregators**  
> • Convex Self-Hosting Guide: <https://docs.convex.dev/self-hosting>  
> • Convex Open-Source Backend (GitHub): <https://github.com/get-convex/convex-backend>  
> • Context7 aggregated Convex docs: <https://context7.com/context7/convex_dev>

# <!-- ENV OVERVIEW START -->

## Environment Variables Overview

Below variables are derived from Convex self-hosting docs and mirrored in ([Context7](https://context7.com/context7/convex_dev/llms.txt?topic=environment+variable)).

### Required (backend + CLI must have these)

| Key | Purpose |
|-----|---------|
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Authenticates CLI and dashboard. Generate via `./generate_admin_key.sh`. |
| `CONVEX_CLOUD_ORIGIN` | Public WebSocket/data plane URL — exported to the backend image & referenced as `process.env.CONVEX_CLOUD_URL`. |
| `CONVEX_SITE_ORIGIN`  | Public HTTP-actions plane URL — exported to the backend image & referenced as `process.env.CONVEX_SITE_URL`. |

### Recommended (typical for Next.js 15 / React 19 + CI/CD)

| Key | Typical value | Why |
|-----|---------------|-----|
| `CONVEX_SELF_HOSTED_URL` | `${CONVEX_CLOUD_ORIGIN}` | Lets `npx convex dev / deploy` know which deployment to target. |
| `CONVEX_DEPLOYMENT_NAME` | `local` / `staging` / `production` | Appears in dashboard & log streams. |
| `NEXT_PUBLIC_CONVEX_URL` | `${CONVEX_CLOUD_ORIGIN}` | Exposes the backend URL to the browser for React/Next.js clients. |

### Optional (project-specific)

| Key | Notes |
|-----|------|
| `DATABASE_URL` | Switch backend persistence from SQLite → external Postgres. |
| `RATE_LIMIT_GLOBAL_REQUESTS`, `RATE_LIMIT_WINDOW_HOURS`, `RATE_LIMIT_SHARDS` | Feed the custom AI rate-limiter included in this repo. |

> **Convention check**: All *Required* + *Recommended* keys are documented in the Convex self-hosting guide and Context7 mirror — we haven't invented proprietary names.

**Why two origin variables?**

Convex exposes **two public endpoints** out of one process:

1. `CONVEX_CLOUD_ORIGIN` → WebSocket / data plane (default `:3210`). The value is surfaced to functions as `process.env.CONVEX_CLOUD_URL` and is baked into generated Convex clients.
2. `CONVEX_SITE_ORIGIN`  → HTTP-actions plane (default `:3211/http`).  This host is used by `action()` fetch URLs and any third-party web-hooks.

The backend refuses to boot if either is missing.  Our `docker-compose.yml` injects sensible localhost defaults, but **override them when you run behind a reverse-proxy or on Fly.io** (see [Stack article "Self-hosting setup"](https://stack.convex.dev/self-hosted-develop-and-deploy)).

`NEXT_PUBLIC_CONVEX_URL` is only needed if browser code uses `ConvexReactClient`.  All server-only code paths can omit it.

# Step 1: Convex Database Foundation

**Prerequisites**: None - This is the foundational infrastructure required before any AI services.

This document provides the complete database foundation for all AI services, including schemas, rate limiting, and real-time data management. All subsequent AI services depend on this infrastructure.

## 🚨 CRITICAL IMPLEMENTATION RULES

### ABSOLUTE REQUIREMENTS - JUNE 2025

1. **SELF-HOSTED DEPLOYMENT**: All Convex instances MUST be self-hosted
2. **TYPE SAFETY**: Full TypeScript integration with generated types
3. **SCHEMA VALIDATION**: Strict schema enforcement for all tables
4. **RATE LIMITING**: Application-layer rate limiting for all AI services
5. **REAL-TIME SYNC**: WebSocket connections for live updates

## Overview

Convex serves as the reactive database backend for:

- **AI Service Rate Limiting**: Managing API request limits across providers
- **Embeddings Analytics**: Tracking self-hosted embedding service usage
- **Bot Detection**: Storing patterns and blocking malicious traffic
- **API Key Management**: Secure storage and validation of service credentials
- **Request Logging**: Comprehensive audit trails for all AI operations

## Architecture

### Core Components

```
convex/
├── schema.ts                    # Master schema definition
├── convex.config.ts            # Component configuration
├── ai/
│   ├── analytics.ts            # AI request logging functions
│   └── rateLimiting.ts         # Rate limit checks
├── embeddings/
│   ├── rateLimiting.ts         # Embeddings-specific limits
│   └── analytics.ts            # Usage tracking
└── _generated/
    ├── api.d.ts                # Auto-generated types
    └── server.d.ts             # Server function types
```

## 📊 Master Database Schema

### Combined Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // RATE LIMITER COMPONENT TABLES
  // ============================================
  // Auto-generated by @convex-dev/rate-limiter
  // DO NOT MODIFY DIRECTLY
  
  // ============================================
  // AI SERVICES TABLES
  // ============================================
  
  // AI request logs for analytics
  aiRequestLogs: defineTable({
    timestamp: v.number(),
    provider: v.string(),
    model: v.string(),
    userId: v.optional(v.id("users")), // Reference to users table
    fingerprint: v.string(),
    ip: v.string(),
    success: v.boolean(),
    error: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
    latencyMs: v.number(),
    cost: v.optional(v.number()),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_provider", ["provider", "timestamp"])
    .index("by_fingerprint", ["fingerprint", "timestamp"]),
  
  // Bot detection events
  botDetectionEvents: defineTable({
    timestamp: v.number(),
    fingerprint: v.string(),
    ip: v.string(),
    userAgent: v.string(),
    detectionType: v.union(
      v.literal("bot_useragent"),
      v.literal("ai_scraper"),
      v.literal("suspicious_pattern"),
      v.literal("rate_limit")
    ),
    action: v.union(
      v.literal("blocked"),
      v.literal("challenged"),
      v.literal("allowed")
    ),
    metadata: v.optional(v.any()),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_fingerprint", ["fingerprint", "timestamp"]),
  
  // API key management (self-hosted)
  apiKeys: defineTable({
    key: v.string(), // Hashed
    name: v.string(),
    userId: v.string(),
    scopes: v.array(v.string()),
    rateLimit: v.optional(v.object({
      requests: v.number(),
      period: v.number(), // in seconds
    })),
    lastUsed: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    active: v.boolean(),
  })
    .index("by_key", ["key"])
    .index("by_user", ["userId"]),
  
  // ============================================
  // EMBEDDINGS SERVICE TABLES
  // ============================================
  
  // API key management for embeddings service
  embeddingApiKeys: defineTable({
    keyHash: v.string(), // SHA-256 hash
    name: v.string(),
    createdAt: v.number(),
    lastUsed: v.optional(v.number()),
    requestCount: v.number(),
    active: v.boolean(),
    rateLimit: v.object({
      requests: v.number(),
      windowSeconds: v.number(),
    }),
  })
    .index("by_key_hash", ["keyHash"]),
  
  // Request logs for embeddings
  embeddingRequests: defineTable({
    requestId: v.string(),
    apiKeyHash: v.string(),
    timestamp: v.number(),
    batchSize: v.number(),
    latencyMs: v.number(),
    tokensUsed: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
    model: v.string(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_api_key", ["apiKeyHash", "timestamp"]),
  
  // Auth failure tracking
  embeddingAuthFailures: defineTable({
    keyHash: v.string(),
    timestamp: v.number(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index("by_key", ["keyHash", "timestamp"]),
});
```

## 🚀 Component Configuration

### Rate Limiter Setup

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp();
app.use(rateLimiter);

export default app;
```

### Rate Limiter Implementation

```typescript
// lib/ai/rate-limiter-convex.ts
import { RateLimiter, MINUTE, HOUR, SECOND } from "@convex-dev/rate-limiter";
import { api, components } from "@/convex/_generated/api";
import { ConvexClient } from "convex/browser";

// Initialize Convex client for self-hosted instance
const convex = new ConvexClient(process.env.CONVEX_URL!);

// Configure rate limiter - sharding only added when load testing proves necessary
export const aiRateLimiter = new RateLimiter(components.rateLimiter, {
  // Global API limits
  globalAIRequests: { kind: "fixed window", rate: 10000, period: HOUR },
  
  // Per-provider limits - capacity equals rate for predictable burst behavior
  openaiRequests: { kind: "token bucket", rate: 500, period: MINUTE, capacity: 500 },
  openrouterRequests: { kind: "token bucket", rate: 600, period: MINUTE, capacity: 600 },
  groqRequests: { kind: "token bucket", rate: 300, period: MINUTE, capacity: 300 },
  perplexityRequests: { kind: "token bucket", rate: 100, period: MINUTE, capacity: 100 },
  
  // Self-hosted services (higher limits)
  ollamaRequests: { kind: "fixed window", rate: 1000, period: MINUTE },
  lmstudioRequests: { kind: "fixed window", rate: 1000, period: MINUTE },
  selfHostedEmbeddings: { kind: "fixed window", rate: 2000, period: MINUTE },
  
  // Per-user/IP limits
  userAIRequests: { kind: "token bucket", rate: 100, period: HOUR, capacity: 100 },
  ipAIRequests: { kind: "fixed window", rate: 1000, period: HOUR },
  
  // Bot detection patterns
  suspiciousBehavior: { kind: "fixed window", rate: 5, period: MINUTE },
  failedAuth: { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  
  // Search provider limits
  braveSearchRequests: { kind: "fixed window", rate: 100, period: MINUTE },
  serperRequests: { kind: "fixed window", rate: 100, period: MINUTE },
  duckduckgoRequests: { kind: "fixed window", rate: 100, period: MINUTE },
});
```

## 📝 Convex Functions

### AI Service Analytics

```typescript
// convex/ai/analytics.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const logAIRequest = mutation({
  args: {
    provider: v.string(),
    model: v.string(),
    userId: v.optional(v.id("users")),
    fingerprint: v.string(),
    ip: v.string(),
    success: v.boolean(),
    error: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
    latencyMs: v.number(),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiRequestLogs", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

export const getProviderStats = query({
  args: {
    provider: v.string(),
    timeRange: v.object({
      start: v.number(),
      end: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("aiRequestLogs")
      .withIndex("by_provider", (q) =>
        q
          .eq("provider", args.provider)
          .gte("timestamp", args.timeRange.start)
          .lte("timestamp", args.timeRange.end)
      )
      .collect();
    
    return {
      totalRequests: logs.length,
      successRate: logs.filter(l => l.success).length / logs.length,
      averageLatency: logs.reduce((sum, l) => sum + l.latencyMs, 0) / logs.length,
      totalTokens: logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0),
      totalCost: logs.reduce((sum, l) => sum + (l.cost || 0), 0),
    };
  },
});

export const detectBotPatterns = mutation({
  args: {
    fingerprint: v.string(),
    ip: v.string(),
    userAgent: v.string(),
    detectionType: v.union(
      v.literal("bot_useragent"),
      v.literal("ai_scraper"),
      v.literal("suspicious_pattern"),
      v.literal("rate_limit")
    ),
  },
  handler: async (ctx, args) => {
    // Check recent activity
    const recentEvents = await ctx.db
      .query("botDetectionEvents")
      .withIndex("by_fingerprint", q => 
        q
          .eq("fingerprint", args.fingerprint)
          .gte("timestamp", Date.now() - 3600000) // Last hour
      )
      .collect();
    
    // Determine action based on pattern
    const action = recentEvents.length > 10 ? "blocked" : 
                  recentEvents.length > 5 ? "challenged" : "allowed";
    
    await ctx.db.insert("botDetectionEvents", {
      ...args,
      timestamp: Date.now(),
      action,
      metadata: { previousAttempts: recentEvents.length },
    });
    
    return { action, previousAttempts: recentEvents.length };
  },
});
```

### Embeddings Service Functions

```typescript
// convex/embeddings/rateLimiting.ts
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

export const checkRateLimit = query({
  args: {
    keyHash: v.string(),
    window: v.number(), // seconds
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - (args.window * 1000);
    
    // Get API key config
    const apiKey = await ctx.db
      .query("embeddingApiKeys")
      .withIndex("by_key_hash", q => q.eq("keyHash", args.keyHash))
      .first();
    
    if (!apiKey || !apiKey.active) {
      return { allowed: false, reason: "Invalid API key" };
    }
    
    // Count recent requests
    const recentRequests = await ctx.db
      .query("embeddingRequests")
      .withIndex("by_api_key", q => 
        q
          .eq("apiKeyHash", args.keyHash)
          .gte("timestamp", windowStart)
      )
      .collect();
    
    const requestCount = recentRequests.length;
    const limit = apiKey.rateLimit.requests;
    
    if (requestCount >= limit) {
      return { 
        allowed: false, 
        reason: "Rate limit exceeded",
        resetAt: windowStart + apiKey.rateLimit.windowSeconds * 1000
      };
    }
    
    return { allowed: true, remaining: limit - requestCount };
  },
});

export const logRequest = mutation({
  args: {
    requestId: v.string(),
    apiKeyHash: v.string(),
    batchSize: v.number(),
    latencyMs: v.number(),
    tokensUsed: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("embeddingRequests", {
      ...args,
      timestamp: Date.now(),
      model: "self-hosted",
    });
    
    // Update last used timestamp
    const apiKey = await ctx.db
      .query("embeddingApiKeys")
      .withIndex("by_key_hash", q => q.eq("keyHash", args.apiKeyHash))
      .first();
    
    if (apiKey) {
      await ctx.db.patch(apiKey._id, {
        lastUsed: Date.now(),
        requestCount: apiKey.requestCount + 1,
      });
    }
  },
});

export const logAuthFailure = mutation({
  args: {
    keyHash: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("embeddingAuthFailures", {
      ...args,
      timestamp: Date.now(),
    });
    
    // Check for repeated failures (bot detection)
    const recentFailures = await ctx.db
      .query("embeddingAuthFailures")
      .withIndex("by_key", q => 
        q
          .eq("keyHash", args.keyHash)
          .gte("timestamp", Date.now() - 3600000) // Last hour
      )
      .collect();
    
    if (recentFailures.length > 10) {
      // Flag as potential bot attack
      console.warn(`Potential bot attack detected: ${args.keyHash}`);
    }
  },
});
```

## 🔌 Next.js 15 Integration

### Client Provider Setup

```typescript
// app/providers/convex-provider.tsx
"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

### Server-Side Usage

```typescript
// app/api/ai/[provider]/route.ts
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params; // Next.js 15 async params
  
  // Log the request
  await fetchMutation(api.ai.analytics.logAIRequest, {
    provider,
    model: "gpt-4o",
    fingerprint: generateFingerprint(request),
    ip: request.headers.get("x-forwarded-for") || "unknown",
    success: true,
    latencyMs: 0,
    tokensUsed: 0,
  });
  
  // Check rate limits
  const stats = await fetchQuery(api.ai.analytics.getProviderStats, {
    provider,
    timeRange: {
      start: Date.now() - 3600000,
      end: Date.now(),
    },
  });
  
  return Response.json(stats);
}
```

## 📊 Usage Patterns

### Rate Limiting Check

```typescript
// Before any AI request
export async function checkRequestLimits(
  provider: string,
  userId?: string,
  request?: Request
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const ctx = { db: convex };
  
  // 1. Check global limits
  const globalStatus = await aiRateLimiter.check(ctx, 'globalAIRequests');
  if (!globalStatus.ok) {
    return { allowed: false, reason: 'Global rate limit exceeded', retryAfter: globalStatus.retryAfter };
  }
  
  // 2. Check provider-specific limits
  const providerKey = `${provider}Requests` as const;
  const providerStatus = await aiRateLimiter.limit(ctx, providerKey, { throws: false });
  if (!providerStatus.ok) {
    return { allowed: false, reason: `${provider} rate limit exceeded`, retryAfter: providerStatus.retryAfter };
  }
  
  // 3. Check user/IP limits if provided
  if (userId) {
    const userStatus = await aiRateLimiter.limit(ctx, 'userAIRequests', { key: userId, throws: false });
    if (!userStatus.ok) {
      return { allowed: false, reason: 'User rate limit exceeded', retryAfter: userStatus.retryAfter };
    }
  }
  
  // 4. Bot detection
  if (request) {
    const userAgent = request.headers.get('user-agent') || '';
    const botPatterns = /bot|crawler|spider|scraper|headless|selenium|puppeteer|playwright|GPTBot|Claude-Web|ChatGPT|CCBot|anthropic-ai|PerplexityBot/i;
    
    if (botPatterns.test(userAgent)) {
      await aiRateLimiter.limit(ctx, 'suspiciousBehavior', { 
        key: generateRequestFingerprint(request),
        throws: false 
      });
      return { allowed: false, reason: 'Bot detected' };
    }
  }
  
  return { allowed: true };
}
```

### Analytics Dashboard Query

```typescript
// Get comprehensive analytics
const providerStats = await Promise.all(
  ['openai', 'openrouter', 'groq', 'perplexity'].map(provider =>
    fetchQuery(api.ai.analytics.getProviderStats, {
      provider,
      timeRange: { start: Date.now() - 86400000, end: Date.now() }
    })
  )
);

// Get bot detection events
const botEvents = await fetchQuery(api.ai.analytics.getBotEvents, {
  limit: 100,
  since: Date.now() - 3600000,
});
```

## 🔐 Security Best Practices

### API Key Management

- Store API keys as SHA-256 hashes only
- Implement automatic rotation every 30 days
- Track usage per key for anomaly detection
- Support scoped permissions per key

### Request Fingerprinting

```typescript
export function generateRequestFingerprint(req: Request): string {
  const headers = req.headers;
  const fingerprint = {
    userAgent: headers.get('user-agent') || '',
    acceptLanguage: headers.get('accept-language') || '',
    acceptEncoding: headers.get('accept-encoding') || '',
    accept: headers.get('accept') || '',
    dnt: headers.get('dnt') || '',
  };
  
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(fingerprint))
    .digest('hex')
    .substring(0, 16);
}
```

## 🚀 Deployment Configuration

### Environment Variables

See the *Environment Variables Overview* section at the top of this document for the full list and explanations.

### Self-Hosted Deployment (Docker Compose)

```yaml
# docker-compose.yml
version: "3.8"

services:
  backend:
    image: ghcr.io/get-convex/convex-backend:v0.20.3   # pin version – avoid unplanned upgrades
    environment:
      CONVEX_CLOUD_ORIGIN: ${CONVEX_CLOUD_ORIGIN}
      CONVEX_SITE_ORIGIN:  ${CONVEX_SITE_ORIGIN}
      DATABASE_URL:        ${DATABASE_URL}
      DEPLOYMENT_NAME:     ${CONVEX_DEPLOYMENT_NAME}
    ports:
      - "3210:3210"   # WebSocket / queries
      - "3211:3211"   # HTTP action endpoints
    volumes:
      - convex-data:/data
    restart: unless-stopped

  dashboard:
    image: ghcr.io/get-convex/convex-dashboard:latest
    environment:
      NEXT_PUBLIC_DEPLOYMENT_URL: ${CONVEX_CLOUD_ORIGIN}
    ports:
      - "6791:6791"
    depends_on:
      - backend

volumes:
  convex-data:
```

#### Admin-Key Generation

```bash
# After the containers start the first time
docker compose exec backend ./generate_admin_key.sh

# Copy the printed key into your shell (and CI) env:
export CONVEX_SELF_HOSTED_ADMIN_KEY="<printed-key>"
```

The same key unlocks the dashboard (<http://localhost:6791>).

#### Convex CLI Workflow

```bash
# Local dev – hot-reload functions against the self-hosted backend
CONVEX_SELF_HOSTED_URL=$CONVEX_CLOUD_ORIGIN \
CONVEX_SELF_HOSTED_ADMIN_KEY=$CONVEX_SELF_HOSTED_ADMIN_KEY \
npx convex dev

# Deploy schema/funcs to the running container
npx convex deploy
```

> ⚠️  **Never** set `CONVEX_DEPLOY_KEY` when self-hosting – that flag is only for the managed Convex cloud.

### Scaling & Upgrades

- Images above are **single-node**. Horizontal scaling requires building a custom multi-service topology from the open-source repo.
- Always pin to a semver tag (`v0.Y.Z`) and follow [Convex migration docs](https://docs.convex.dev/self-hosting) before upgrading.

## 📈 Performance Optimization

### Index Optimization

All queries use indexes for O(log n) performance:

- `by_timestamp`: Time-based analytics
- `by_provider`: Provider-specific queries
- `by_fingerprint`: User tracking
- `by_api_key`: Authentication lookups

## 🔄 Migration Commands

```bash
# Initialize Convex in project
npx convex init

# Deploy schema
npx convex deploy

# Run migrations
npx convex run migrations:v1_to_v2

# Generate TypeScript types
npx convex codegen
```

## 📋 Implementation Checklist

### Core Setup

- [ ] Install Convex dependencies
- [ ] Configure convex.config.ts with rate limiter
- [ ] Define complete schema.ts
- [ ] Set up ConvexProvider in Next.js

### Rate Limiting

- [ ] Configure all provider limits
- [ ] Implement request fingerprinting
- [ ] Set up bot detection patterns
- [ ] Add sharding for high-traffic endpoints

### Analytics

- [ ] Create logging mutations
- [ ] Build analytics queries
- [ ] Set up monitoring dashboard
- [ ] Configure alerts for anomalies

### Security

- [ ] Implement API key hashing
- [ ] Set up auth failure tracking
- [ ] Configure request validation
- [ ] Add audit logging

### Performance

- [ ] Optimize indexes
- [ ] Configure sharding
- [ ] Set up caching layer
- [ ] Monitor query performance

## 🚀 Complete Deployment Guide

### Step-by-Step Deployment

1. **Clone and Initialize Convex**
   ```bash
   npx convex init
   ```

2. **Deploy Schema and Functions**
   ```
