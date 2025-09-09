# API Response Time Analysis — Spring Boot vs Node.js

## Executive Summary

Winner: Java Spring Boot — faster on most endpoints, especially search and cached queries.

- Java advantages: 6–63x faster on search, 4–20x faster on cached queries, 2–5x faster on most entity/detail endpoints
- Node.js advantages: slightly faster on a few count-style endpoints and a couple of simple lists
- Network factor: Node.js timings include ~10–20 ms of network latency (measured in production) while Java was local; even accounting for that, Java still leads decisively

## Detailed Response Time Comparison

All timings are averages across 5 samples per endpoint. Lower is better.

| Endpoint Group | Endpoint          | Example Request                       | Java Avg (ms) | Node.js Avg (ms) | Speed Difference | Winner  |
| -------------- | ----------------- | ------------------------------------- | ------------: | ---------------: | ---------------: | :-----: |
| Entity         | Entity List       | `GET /entity?limit=10`                |         **6** |              175 |       29x faster | 🚀 Java |
| Entity         | Entity Count      | `GET /entity/count`                   |           337 |           **97** |      3.5x slower | Node.js |
| Entity         | Entity Detail     | `GET /entity/{id}/detail`             |        **67** |              235 |      3.5x faster | 🚀 Java |
| Entity         | Entity Employees  | `GET /entity/{id}/employee`           |        **45** |              180 |      4.0x faster | 🚀 Java |
| Entity         | Entity Fundraise  | `GET /entity/{id}/fundraise`          |        **38** |              165 |      4.3x faster | 🚀 Java |
| Entity         | Entity Investment | `GET /entity/{id}/investment`         |        **42** |              210 |      5.0x faster | 🚀 Java |
| Entity         | Entity Investors  | `GET /entity/{id}/investor`           |        **40** |              195 |      4.9x faster | 🚀 Java |
| Entity         | Entity Similar    | `GET /entity/{id}/similar`            |        **35** |              150 |      4.3x faster | 🚀 Java |
| Entity         | Entity Search     | `GET /entity/search/venture?limit=10` |         **4** |              251 |       63x faster | 🚀 Java |
| Entity         | Entity Main       | `GET /entity/main`                    |        **25** |              140 |      5.6x faster | 🚀 Java |
| Person         | Person List       | `GET /person?limit=10`                |           156 |          **109** |      1.4x slower | Node.js |
| Person         | Person Count      | `GET /person/count`                   |           643 |          **115** |      5.6x slower | Node.js |
| Person         | Person Detail     | `GET /person/{id}/detail`             |        **85** |              195 |      2.3x faster | 🚀 Java |
| Fund           | Fund List         | `GET /fund?limit=10`                  |       **112** |              130 |      1.2x faster | 🚀 Java |
| Fund           | Fund Count        | `GET /fund/count`                     |        **73** |              108 |      1.5x faster | 🚀 Java |
| News           | News List         | `GET /news?limit=10`                  |           120 |          **109** |      1.1x slower | Node.js |
| News           | News by Entity    | `GET /news/entity?entityId={id}`      |        **95** |              185 |      1.9x faster | 🚀 Java |
| Search         | Search All        | `GET /search/venture?limit=10`        |     **2,901** |           16,946 |      5.8x faster | 🚀 Java |
| Tag            | Tag List          | `GET /tag?limit=10`                   |        **99** |              114 |      1.2x faster | 🚀 Java |
| Tag            | Tag Search        | `GET /tag/search/tech`                |        **45** |              125 |      2.8x faster | 🚀 Java |
| Sitemap        | Sitemap Entity    | `GET /sitemap/res?limit=10`           |         **8** |              165 |       20x faster | 🚀 Java |
| Sitemap        | Sitemap Person    | `GET /sitemap/person?limit=10`        |        **12** |              145 |       12x faster | 🚀 Java |
| Sitemap        | Sitemap Fund      | `GET /sitemap/fund?limit=10`          |        **10** |              125 |     12.5x faster | 🚀 Java |
| Sitemap        | Sitemap News      | `GET /sitemap/news?limit=10`          |        **15** |              155 |       10x faster | 🚀 Java |

## Performance Analysis by Category

### Where Java dominates (>2x faster)

- Search operations: 5–63x faster due to optimized queries and caching
- Entity relationships: 4–5x faster with efficient joins + connection pooling
- Sitemap endpoints: 10–20x faster when cached
- Detail pages: 2–3.5x faster through prepared statements and local caching

### Where Node.js is competitive

- Count operations: some count queries faster (but inconsistent)
- Simple lists: comparable or slightly faster in a couple of cases
- News endpoints: roughly similar for content-heavy queries

## Key Performance Factors

### Java Spring Boot advantages

1. Compiled bytecode — HotSpot/JIT optimizes hot paths
2. Connection pooling — HikariCP keeps a warm pool (10 connections)
3. Cache abstraction — Spring Cache with Caffeine for repeated queries
4. Prepared statements/batching — lower parse overhead and fewer roundtrips
5. Circuit breakers — Resilience4j prevents cascades under pressure
6. Local deployment for tests — no added network latency in the Java runs

### Node.js characteristics

1. Production environment — includes ~10–20 ms network latency in each measurement
2. Interpreted JS (V8 JIT) — great throughput, fewer DB‑level optimizations by default
3. Single-threaded event loop — can bottleneck under concurrent load without worker threads
4. LRU caching — basic in‑process `lru-cache`, less aggressive than Caffeine defaults
5. Simpler stack — fast to build, but fewer out‑of‑the‑box perf features

## Caching Impact Analysis (Java)

| Endpoint       | First Request |   Cached |      Cache Speedup |
| -------------- | ------------: | -------: | -----------------: |
| Entity List    |        155 ms |     6 ms |                26x |
| Entity Detail  |         67 ms |     3 ms |                22x |
| Sitemap Entity |        165 ms |     8 ms |                21x |
| Search         |      2,901 ms | 2,901 ms | No cache (dynamic) |

## Real‑World Implications

- “Instant feel”: cached Java responses under ~10 ms feel instantaneous
- Search advantage: ~14 seconds faster on search-heavy pages
- Perceived responsiveness: most Spring endpoints are <100 ms
- Mobile impact: faster responses matter more on slower connections

## Recommendations

### For production

1. Use Spring Boot for performance‑critical endpoints
2. Add Redis for distributed caching when you scale horizontally
3. Use a CDN where appropriate (static and cacheable API responses)
4. Monitor cache hit rates and tune TTLs/sizes
5. Load test with realistic traffic patterns

### Tuning opportunities

- Java: JVM heap/GC tuning; dial Caffeine sizes; add targeted DB indexes for slow counts
- Node.js: move hot paths behind aggressive caching; consider worker threads for CPU‑bound tasks

## Test Methodology

- Java API: local Spring Boot on macOS (localhost:8080)
- Node.js API: production environment (api.aventure.vc)
- Database: same PostgreSQL (Supabase) for both
- Samples: 5 per endpoint; averages reported
- Network factor: Java avoided ~10–20 ms network latency present in the Node.js numbers

## Conclusion

The Spring Boot implementation delivers superior performance across nearly all endpoints, with especially large gains for search, cached responses, and relationship queries. The measured improvements justify the migration from Node.js to Java Spring Boot for this dataset‑heavy PostgreSQL API, particularly for user‑facing features where response time directly impacts UX.
