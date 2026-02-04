# Chroma Vector Store

**Functionality:** `chroma`

## Core Purpose

Chroma provides vector similarity search for semantic content discovery. Unlike keyword-based search, Chroma stores embedding vectors that capture the _meaning_ of text, enabling:

- **Related content discovery** - Find semantically similar items regardless of shared keywords
- **Auto-categorization** - Cluster content by meaning, not manual tags
- **Semantic search** - Query by concept rather than exact terms

## Architecture Overview

### Data Flow

```
Content (Thoughts, Bookmarks, etc.)
         |
   Embedding Function (all-MiniLM-L6-v2, 384D)
         |
   Chroma Cloud (vector storage)
         |
   Similarity Queries -> Related Content, Categories, Tags
```

### Key Components

1. **Client Factory** (`lib/chroma/client.ts`)
   - Singleton pattern with config validation
   - Environment variable integration
   - Re-exports common types from `chromadb`

2. **Schemas** (`types/schemas/chroma.ts`)
   - Zod validation for config, documents, queries
   - Type exports for consumers

3. **Environment Configuration**
   - `CHROMA_API_KEY` - Cloud authentication
   - `CHROMA_TENANT` - Multi-tenant isolation (UUID)
   - `CHROMA_DATABASE` - Database name

## Usage

### Basic Client Access

```typescript
import { getChromaClient } from "@/lib/chroma/client";

// Reads from env vars automatically
const client = getChromaClient();

// Or provide explicit config
const client = getChromaClient({
  apiKey: "ck-...",
  tenant: "uuid-here",
  database: "my-database",
});
```

### Collection Operations

```typescript
// Create or get a collection
const collection = await client.getOrCreateCollection({
  name: "thoughts",
  metadata: { description: "Short-form content embeddings" },
});

// Count documents
const count = await collection.count();

// Modify collection metadata
await collection.modify({
  metadata: { version: 2, updatedAt: new Date().toISOString() },
});
```

### Document Operations

> **API Note:** Chroma uses `metadatas` (not `metadata`) for arrays of metadata objects.
> This follows their pattern of pluralizing field names (`ids`, `documents`, `embeddings`, `metadatas`).
> Grammatically awkward since "metadata" is already a mass noun, but consistent in their SDK.

#### Add Documents

```typescript
// Text documents (auto-embedded by default function)
await collection.add({
  ids: ["thought-1", "thought-2"],
  documents: [
    "TypeScript adds static typing to JavaScript",
    "Python excels at data science and ML",
  ],
  metadatas: [
    // Note: "metadatas" is Chroma's API convention
    { category: "programming", slug: "typescript-intro" },
    { category: "programming", slug: "python-ml" },
  ],
});
```

#### Get Documents

```typescript
// Get all (paginated)
const all = await collection.get({
  limit: 100,
  offset: 0,
  include: ["documents", "metadatas"],
});

// Get by IDs
const specific = await collection.get({
  ids: ["thought-1", "thought-2"],
  include: ["documents", "metadatas", "embeddings"],
});

// Get with filter
const filtered = await collection.get({
  where: { category: "programming" },
  include: ["documents", "metadatas"],
});
```

#### Update Documents

```typescript
await collection.update({
  ids: ["thought-1"],
  documents: ["Updated content here"],
  metadatas: [{ category: "programming", updated: true }],
});
```

#### Upsert (Insert or Update)

```typescript
// Inserts if ID doesn't exist, updates if it does
await collection.upsert({
  ids: ["thought-3"],
  documents: ["New or updated content"],
  metadatas: [{ category: "databases" }],
});
```

#### Delete Documents

```typescript
// By IDs
await collection.delete({ ids: ["thought-1", "thought-2"] });

// By filter
await collection.delete({ where: { draft: true } });

// By document content
await collection.delete({ whereDocument: { $contains: "deprecated" } });
```

### Query Operations

#### Semantic Search by Text

```typescript
const results = await collection.query({
  queryTexts: ["machine learning frameworks"],
  nResults: 5,
  include: ["documents", "metadatas", "distances"],
});

// Results structure:
// results.ids[0]       - Array of matching IDs
// results.documents[0] - Array of document texts
// results.metadatas[0] - Array of metadata objects
// results.distances[0] - Array of similarity distances (lower = more similar)
```

#### Multi-Query

```typescript
const results = await collection.query({
  queryTexts: ["static typing", "memory management"],
  nResults: 3,
});

// results.ids[0] - Results for "static typing"
// results.ids[1] - Results for "memory management"
```

#### Query with Filters

```typescript
const results = await collection.query({
  queryTexts: ["web development"],
  nResults: 10,
  where: { category: "programming" }, // Metadata filter
  whereDocument: { $contains: "React" }, // Content filter
  include: ["documents", "metadatas", "distances"],
});
```

#### Query by Embedding Vector

```typescript
// Useful when you already have an embedding
const embedding = [0.1, 0.2, ...]; // 384-dimensional vector

const results = await collection.query({
  queryEmbeddings: [embedding],
  nResults: 5,
});
```

### Filter Operators

#### Metadata Filters (`where`)

| Operator | Description      | Example                                                    |
| -------- | ---------------- | ---------------------------------------------------------- |
| `$eq`    | Equals (default) | `{ category: "programming" }`                              |
| `$ne`    | Not equals       | `{ category: { $ne: "draft" } }`                           |
| `$gt`    | Greater than     | `{ year: { $gt: 2020 } }`                                  |
| `$gte`   | Greater or equal | `{ year: { $gte: 2020 } }`                                 |
| `$lt`    | Less than        | `{ year: { $lt: 2020 } }`                                  |
| `$lte`   | Less or equal    | `{ year: { $lte: 2020 } }`                                 |
| `$in`    | In array         | `{ category: { $in: ["ai", "ml"] } }`                      |
| `$nin`   | Not in array     | `{ category: { $nin: ["draft"] } }`                        |
| `$and`   | Logical AND      | `{ $and: [{ category: "ai" }, { year: { $gte: 2020 } }] }` |
| `$or`    | Logical OR       | `{ $or: [{ category: "ai" }, { category: "ml" }] }`        |

#### Document Filters (`whereDocument`)

| Operator        | Description        | Example                           |
| --------------- | ------------------ | --------------------------------- |
| `$contains`     | Contains substring | `{ $contains: "React" }`          |
| `$not_contains` | Does not contain   | `{ $not_contains: "deprecated" }` |

## Embedding Function

### Default: all-MiniLM-L6-v2

The `@chroma-core/default-embed` package provides:

- **Model**: sentence-transformers/all-MiniLM-L6-v2
- **Dimensions**: 384
- **Runtime**: Local ONNX (no API calls)
- **Performance**: Fast, suitable for real-time queries
- **Quality**: Good for general semantic similarity

### When to Use Custom Embeddings

Consider OpenAI/Cohere embeddings when:

- Content is domain-specific (legal, medical, etc.)
- Higher accuracy is critical
- Documents are very long (chunk first)
- Multi-language support needed

## Collection Design Patterns

### Single Collection per Content Type

```typescript
// Recommended: One collection per content type
const thoughts = await client.getOrCreateCollection({ name: "thoughts" });
const bookmarks = await client.getOrCreateCollection({ name: "bookmarks" });
```

### Metadata for Filtering

```typescript
// Store filterable attributes as metadata
await collection.add({
  ids: [thought.id],
  documents: [thought.content],
  metadatas: [
    {
      slug: thought.slug,
      category: thought.category,
      tags: thought.tags?.join(","), // Chroma doesn't support arrays in metadata
      createdAt: thought.createdAt,
      draft: thought.draft ?? false,
    },
  ],
});
```

### ID Strategy

```typescript
// Use the same ID as your primary data store
// This enables easy sync and lookup
await collection.add({
  ids: [thought.id], // UUID from thought schema
  documents: [thought.content],
});
```

## Sync Patterns

### Full Sync

```typescript
async function syncAllThoughts(thoughts: Thought[]) {
  const collection = await getOrCreateCollection("thoughts");

  // Clear and repopulate
  await collection.delete({ where: {} }); // Delete all

  await collection.add({
    ids: thoughts.map((t) => t.id),
    documents: thoughts.map((t) => t.content),
    metadatas: thoughts.map((t) => ({
      slug: t.slug,
      category: t.category ?? "",
      createdAt: t.createdAt,
    })),
  });
}
```

### Incremental Sync

```typescript
async function syncThought(thought: Thought) {
  const collection = await getOrCreateCollection("thoughts");

  // Upsert handles both new and updated
  await collection.upsert({
    ids: [thought.id],
    documents: [thought.content],
    metadatas: [
      {
        slug: thought.slug,
        category: thought.category ?? "",
        updatedAt: thought.updatedAt ?? thought.createdAt,
      },
    ],
  });
}
```

### Delete Sync

```typescript
async function deleteThought(thoughtId: string) {
  const collection = await getOrCreateCollection("thoughts");
  await collection.delete({ ids: [thoughtId] });
}
```

## Performance Considerations

### Batch Operations

```typescript
// Good: Batch add
await collection.add({
  ids: thoughts.map(t => t.id),
  documents: thoughts.map(t => t.content),
  metadatas: thoughts.map(t => ({ ... })),
});

// Bad: Individual adds in a loop
for (const thought of thoughts) {
  await collection.add({ ids: [thought.id], ... }); // N network calls
}
```

### Query Optimization

```typescript
// Good: Use filters to reduce result set before similarity search
const results = await collection.query({
  queryTexts: ["machine learning"],
  nResults: 5,
  where: { category: "programming" }, // Filter first, then rank
});

// Less optimal: Query all, filter client-side
const results = await collection.query({
  queryTexts: ["machine learning"],
  nResults: 100, // Over-fetch
});
// Then filter in JS...
```

### Include Only What You Need

```typescript
// Good: Request only needed fields
const results = await collection.query({
  queryTexts: ["..."],
  nResults: 5,
  include: ["metadatas"], // Just need IDs and metadata
});

// Wasteful: Including embeddings when not needed
const results = await collection.query({
  queryTexts: ["..."],
  nResults: 5,
  include: ["documents", "metadatas", "embeddings", "distances"], // Embeddings are large
});
```

## Testing

### Test Script

```bash
# Basic connection test
bun scripts/test-chroma-client.ts

# Comprehensive feature test (41 tests)
bun scripts/test-chroma-comprehensive.ts
```

### Live Integration Test (Opt-In)

- `__tests__/lib/chroma/chroma-actual.test.ts` runs real Chroma Cloud operations using
  `describe.runIf(...)` gated by `CHROMA_API_KEY`, `CHROMA_TENANT`, and `CHROMA_DATABASE`.
- The test uses explicit embeddings with `embeddingFunction: null` to avoid local ONNX
  initialization and keep CI safe.

### Test Coverage

| Category              | Operations Tested                             |
| --------------------- | --------------------------------------------- |
| Collection Management | Create, Get, List, Count, Modify              |
| Document CRUD         | Add, Get (all/by ID/paginated), Update, Peek  |
| Upsert                | Update existing, Insert new                   |
| Queries               | Text queries, Multi-query, Semantic relevance |
| Filters               | $eq, $gte, $in, $ne, $and, $contains          |
| Batch                 | Batch add, update, delete, delete by filter   |
| Embeddings            | Retrieve embeddings, Query by vector          |

## Environment Setup

### Required Variables

```bash
# .env
CHROMA_API_KEY=ck-your-api-key
CHROMA_TENANT=your-tenant-uuid
CHROMA_DATABASE=your-database-name
```

### Get Credentials

1. Sign up at https://trychroma.com/
2. Create a database
3. Copy API key, tenant ID, and database name

## Related Documentation

- See [`thoughts.md`](../features/thoughts.md) for the Thoughts content type that will use Chroma
- See [`bookmarks.md`](../features/bookmarks.md) for bookmark architecture (potential future Chroma integration)
- See [`search.md`](../features/search.md) for current keyword-based search implementation

## Future Considerations

1. **Hybrid Search** - Combine keyword (BM25) with semantic search
2. **Clustering** - Auto-discover categories from embedding space
3. **Cross-Content Discovery** - Find related bookmarks for thoughts
4. **Embedding Caching** - Store embeddings in S3 for rebuild scenarios
5. **Custom Embedding Models** - Domain-specific fine-tuned models
