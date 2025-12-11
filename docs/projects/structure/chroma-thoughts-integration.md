# Chroma + Thoughts Integration Plan

**Status:** Planning
**Dependencies:** `chroma.md`, `thoughts.md`

## Overview

This document outlines the integration of Chroma vector store with the Thoughts content type to enable semantic features: related content discovery, auto-categorization, and tag suggestions.

The design is intentionally **extensible** - the same patterns will later apply to:

- Blog posts (28 MDX files in `data/blog/posts/`)
- Bookmarks (via Karakeep API)
- Books (via AudioBookShelf API)

## Design Principles

### 1. Content-Type Agnostic Collection Naming

```
Collection: "content"  (single unified collection)
           vs
Collections: "thoughts", "blog-posts", "bookmarks", "books"  (per-type)
```

**Decision: Per-type collections with cross-collection queries**

Rationale:

- Simpler metadata schemas per collection
- Independent lifecycle management (rebuild one without touching others)
- Cross-content discovery via multi-collection queries when needed
- Cleaner ID namespacing (thought UUIDs vs bookmark IDs vs blog slugs)

### 2. Source of Truth

```
Primary Data Store (JSON/MDX/S3) ──sync──> Chroma (embeddings + metadata)
                                              │
                                              ▼
                                   Computed relationships
                                              │
                                              ▼
                           Optional: Persist back to primary store
```

- **Primary store** owns the content and required fields
- **Chroma** is a derived index for semantic queries
- **Computed values** (related content, suggested tags) can be:
  - Used ephemerally (query-time only)
  - Persisted back to primary store for caching

### 3. Embedding Strategy

| Content Type | What to Embed                               | Rationale                      |
| ------------ | ------------------------------------------- | ------------------------------ |
| Thoughts     | `title + " " + content`                     | Full semantic capture          |
| Blog Posts   | `title + " " + description + " " + excerpt` | Avoid embedding entire MDX     |
| Bookmarks    | `title + " " + description`                 | External content, limited text |
| Books        | `title + " " + description`                 | Publisher descriptions         |

## Thoughts Collection Schema

### Collection Configuration

```typescript
const thoughtsCollection = await client.getOrCreateCollection({
  name: "thoughts",
  metadata: {
    description: "Short-form content embeddings for semantic discovery",
    contentType: "thought",
    version: "1",
    embeddingModel: "all-MiniLM-L6-v2",
    embeddingDimension: 384,
  },
});
```

### Document Structure

```typescript
// Document ID: thought.id (UUID)
// Document text: `${thought.title}\n\n${thought.content}`

// Metadata (Chroma limitations: no arrays, no nested objects)
interface ThoughtChromaMetadata {
  slug: string;
  title: string;
  category: string; // Empty string if unset
  tags: string; // Comma-separated: "python,testing,pytest"
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601, same as createdAt if never updated
  draft: boolean;
  contentType: "thought"; // For future cross-collection queries
}
```

### Metadata Conventions

**Tags as comma-separated string:**

```typescript
// Chroma doesn't support array values in metadata
// Convert on write:
const tagsString = thought.tags?.join(",") ?? "";

// Parse on read:
const tagsArray = metadata.tags ? metadata.tags.split(",") : [];
```

**Empty vs null:**

```typescript
// Use empty string for optional string fields
category: thought.category ?? "",

// Use false for optional boolean fields
draft: thought.draft ?? false,
```

## Sync Operations

### File: `lib/thoughts/chroma-sync.ts`

```typescript
import { getChromaClient } from "@/lib/chroma/client";
import type { Thought } from "@/types/schemas/thought";

const COLLECTION_NAME = "thoughts";

/**
 * Get or create the thoughts collection with standard configuration
 */
export async function getThoughtsCollection() {
  const client = getChromaClient();
  return client.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: {
      contentType: "thought",
      version: "1",
    },
  });
}

/**
 * Sync a single thought to Chroma (upsert)
 * Call on create or update
 */
export async function syncThoughtToChroma(thought: Thought): Promise<void> {
  const collection = await getThoughtsCollection();

  const documentText = `${thought.title}\n\n${thought.content}`;

  await collection.upsert({
    ids: [thought.id],
    documents: [documentText],
    metadatas: [
      {
        slug: thought.slug,
        title: thought.title,
        category: thought.category ?? "",
        tags: thought.tags?.join(",") ?? "",
        createdAt: thought.createdAt,
        updatedAt: thought.updatedAt ?? thought.createdAt,
        draft: thought.draft ?? false,
        contentType: "thought",
      },
    ],
  });
}

/**
 * Remove a thought from Chroma
 * Call on delete
 */
export async function removeThoughtFromChroma(thoughtId: string): Promise<void> {
  const collection = await getThoughtsCollection();
  await collection.delete({ ids: [thoughtId] });
}

/**
 * Full sync: clear and repopulate from source of truth
 * Use sparingly - for rebuilds or migration
 */
export async function fullSyncThoughtsToChroma(thoughts: Thought[]): Promise<void> {
  const collection = await getThoughtsCollection();

  // Delete all existing
  const existing = await collection.get({ limit: 10000 });
  if (existing.ids.length > 0) {
    await collection.delete({ ids: existing.ids });
  }

  // Skip drafts in full sync (or include based on use case)
  const publishedThoughts = thoughts.filter(t => !t.draft);

  if (publishedThoughts.length === 0) return;

  await collection.add({
    ids: publishedThoughts.map(t => t.id),
    documents: publishedThoughts.map(t => `${t.title}\n\n${t.content}`),
    metadatas: publishedThoughts.map(t => ({
      slug: t.slug,
      title: t.title,
      category: t.category ?? "",
      tags: t.tags?.join(",") ?? "",
      createdAt: t.createdAt,
      updatedAt: t.updatedAt ?? t.createdAt,
      draft: t.draft ?? false,
      contentType: "thought",
    })),
  });
}
```

## Semantic Query Operations

### File: `lib/thoughts/chroma-queries.ts`

```typescript
import { getThoughtsCollection } from "./chroma-sync";

interface RelatedThought {
  id: string;
  slug: string;
  title: string;
  distance: number; // Lower = more similar
}

/**
 * Find thoughts semantically similar to the given thought
 * Excludes the source thought and drafts
 */
export async function getRelatedThoughts(thoughtId: string, limit: number = 5): Promise<RelatedThought[]> {
  const collection = await getThoughtsCollection();

  // Get the source thought's embedding
  const source = await collection.get({
    ids: [thoughtId],
    include: ["embeddings"],
  });

  if (source.embeddings.length === 0 || !source.embeddings[0]) {
    return [];
  }

  // Query for similar thoughts
  const results = await collection.query({
    queryEmbeddings: [source.embeddings[0]],
    nResults: limit + 1, // +1 because source thought will match itself
    where: { draft: false },
    include: ["metadatas", "distances"],
  });

  // Filter out the source thought and map results
  return (
    results.ids[0]
      ?.map((id, index) => ({
        id,
        slug: results.metadatas[0]?.[index]?.slug as string,
        title: results.metadatas[0]?.[index]?.title as string,
        distance: results.distances?.[0]?.[index] ?? 0,
      }))
      .filter(r => r.id !== thoughtId)
      .slice(0, limit) ?? []
  );
}

/**
 * Semantic search across thoughts
 */
export async function searchThoughts(
  query: string,
  options: {
    limit?: number;
    category?: string;
    excludeDrafts?: boolean;
  } = {},
): Promise<RelatedThought[]> {
  const { limit = 10, category, excludeDrafts = true } = options;
  const collection = await getThoughtsCollection();

  const where: Record<string, unknown> = {};
  if (excludeDrafts) where.draft = false;
  if (category) where.category = category;

  const results = await collection.query({
    queryTexts: [query],
    nResults: limit,
    where: Object.keys(where).length > 0 ? where : undefined,
    include: ["metadatas", "distances"],
  });

  return (
    results.ids[0]?.map((id, index) => ({
      id,
      slug: results.metadatas[0]?.[index]?.slug as string,
      title: results.metadatas[0]?.[index]?.title as string,
      distance: results.distances?.[0]?.[index] ?? 0,
    })) ?? []
  );
}

/**
 * Suggest category based on similar thoughts
 * Returns null if no clear suggestion
 */
export async function suggestCategory(content: string, title: string): Promise<string | null> {
  const collection = await getThoughtsCollection();

  const results = await collection.query({
    queryTexts: [`${title}\n\n${content}`],
    nResults: 10,
    where: {
      $and: [
        { draft: false },
        { category: { $ne: "" } }, // Only thoughts with categories
      ],
    },
    include: ["metadatas"],
  });

  // Count categories among top results
  const categoryCounts = new Map<string, number>();
  results.metadatas[0]?.forEach(meta => {
    const cat = meta?.category as string;
    if (cat) {
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
  });

  // Return most common if it appears in >40% of results
  const sorted = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0 && sorted[0][1] >= 4) {
    return sorted[0][0];
  }

  return null;
}

/**
 * Suggest tags based on similar thoughts
 */
export async function suggestTags(content: string, title: string, maxTags: number = 5): Promise<string[]> {
  const collection = await getThoughtsCollection();

  const results = await collection.query({
    queryTexts: [`${title}\n\n${content}`],
    nResults: 20,
    where: { draft: false },
    include: ["metadatas", "distances"],
  });

  // Collect tags weighted by similarity (inverse distance)
  const tagScores = new Map<string, number>();

  results.metadatas[0]?.forEach((meta, index) => {
    const tagsString = meta?.tags as string;
    const distance = results.distances?.[0]?.[index] ?? 1;
    const weight = 1 / (1 + distance); // Higher weight for closer matches

    if (tagsString) {
      tagsString.split(",").forEach(tag => {
        const trimmed = tag.trim();
        if (trimmed) {
          tagScores.set(trimmed, (tagScores.get(trimmed) ?? 0) + weight);
        }
      });
    }
  });

  // Return top tags by score
  return [...tagScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag]) => tag);
}
```

## Integration Points

### 1. On Thought Create/Update

```typescript
// In thought creation/update handler
import { syncThoughtToChroma } from "@/lib/thoughts/chroma-sync";

async function saveThought(thought: Thought) {
  // Save to primary store first
  await saveToPrimaryStore(thought);

  // Sync to Chroma (fire-and-forget or await based on needs)
  await syncThoughtToChroma(thought);
}
```

### 2. On Thought Delete

```typescript
import { removeThoughtFromChroma } from "@/lib/thoughts/chroma-sync";

async function deleteThought(thoughtId: string) {
  await deleteFromPrimaryStore(thoughtId);
  await removeThoughtFromChroma(thoughtId);
}
```

### 3. Thought Detail Page

```typescript
// app/thoughts/[slug]/page.tsx
import { getRelatedThoughts } from "@/lib/thoughts/chroma-queries";

export default async function ThoughtPage({ params }) {
  const thought = await getThoughtBySlug(params.slug);
  const related = await getRelatedThoughts(thought.id, 5);

  return (
    <>
      <ThoughtContent thought={thought} />
      <RelatedThoughts items={related} />
    </>
  );
}
```

### 4. Thought Creation UI

```typescript
// Suggestion component for category/tags
import { suggestCategory, suggestTags } from "@/lib/thoughts/chroma-queries";

async function ThoughtEditor({ draft }: { draft: ThoughtInput }) {
  const [suggestions, setSuggestions] = useState({ category: null, tags: [] });

  // Fetch suggestions when content changes (debounced)
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (draft.content && draft.title) {
        const [category, tags] = await Promise.all([
          suggestCategory(draft.content, draft.title),
          suggestTags(draft.content, draft.title),
        ]);
        setSuggestions({ category, tags });
      }
    };
    // Debounce this in production
    fetchSuggestions();
  }, [draft.content, draft.title]);

  return (
    <>
      <CategoryPicker
        value={draft.category}
        suggestion={suggestions.category}
        onAcceptSuggestion={() => setCategory(suggestions.category)}
      />
      <TagsInput
        value={draft.tags}
        suggestions={suggestions.tags}
        onAcceptSuggestion={(tag) => addTag(tag)}
      />
    </>
  );
}
```

## Cross-Content Discovery (Future)

### Multi-Collection Queries

When blog posts and bookmarks are added to Chroma:

```typescript
async function findRelatedContent(
  sourceContent: string,
  sourceType: "thought" | "blog-post" | "bookmark",
  sourceId: string,
): Promise<CrossContentResult[]> {
  const client = getChromaClient();

  // Query each collection
  const [thoughts, blogPosts, bookmarks] = await Promise.all([
    client.getCollection({ name: "thoughts" }).then(c => c.query({ queryTexts: [sourceContent], nResults: 3 })),
    client.getCollection({ name: "blog-posts" }).then(c => c.query({ queryTexts: [sourceContent], nResults: 3 })),
    client.getCollection({ name: "bookmarks" }).then(c => c.query({ queryTexts: [sourceContent], nResults: 3 })),
  ]);

  // Merge and rank by distance
  return mergeAndRank([
    { type: "thought", results: thoughts },
    { type: "blog-post", results: blogPosts },
    { type: "bookmark", results: bookmarks },
  ]).filter(r => !(r.type === sourceType && r.id === sourceId));
}
```

### Unified Content Type Identifier

Include `contentType` in all collection metadata:

```typescript
// Thoughts
metadatas: [{ contentType: "thought", ... }]

// Blog posts (future)
metadatas: [{ contentType: "blog-post", ... }]

// Bookmarks (future)
metadatas: [{ contentType: "bookmark", ... }]
```

This enables queries like "find all content (any type) related to X."

## Implementation Phases

### Phase 1: Foundation (Complete)

- [x] Chroma client and schemas
- [x] Documentation
- [x] `lib/thoughts/chroma-sync.ts` - sync operations
- [x] `lib/thoughts/chroma-queries.ts` - query operations
- [x] Test script for thoughts sync (`scripts/test-thoughts-chroma.ts` - 30 tests)

### Phase 2: Related Thoughts

- [ ] `getRelatedThoughts()` function
- [ ] Integration with thought detail page
- [ ] Optional: persist `relatedThoughts` field

### Phase 3: Category & Tag Suggestions

- [ ] `suggestCategory()` function
- [ ] `suggestTags()` function
- [ ] UI components for suggestion acceptance

### Phase 4: Semantic Search

- [ ] `/api/thoughts/search` endpoint
- [ ] Search UI with semantic ranking
- [ ] Hybrid keyword + semantic (optional)

### Phase 5: Cross-Content (Future)

- [ ] Blog posts collection
- [ ] Bookmarks collection
- [ ] Cross-collection related content
- [ ] Unified search across all content types

## Open Questions

1. **Rebuild strategy**: How to handle Chroma index rebuilds? Background job? On-demand?

2. **Embedding versioning**: If we change embedding model, need to re-embed everything. Track version in collection metadata.

3. **Distance thresholds**: What distance score indicates "not related enough"? Needs tuning with real data.

4. **Rate limiting**: Chroma Cloud has rate limits. Batch operations for full syncs.

5. **Offline development**: Can we seed Chroma with test data for local dev? Or mock the queries?

## Related Documentation

- `chroma.md` - Chroma client and operations reference
- `thoughts.md` - Thoughts schema and content model
- `bookmarks.md` - Bookmarks architecture (future Chroma integration)
