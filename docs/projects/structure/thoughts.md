# Thoughts

Short-form content feature inspired by Simon Willison's [TIL](https://til.simonwillison.net/).

## Schema

**Location:** `types/schemas/thought.ts`

### Required Fields

| Field       | Type     | Description            |
| ----------- | -------- | ---------------------- |
| `id`        | `uuid`   | Unique identifier (v4) |
| `slug`      | `string` | URL-safe identifier    |
| `title`     | `string` | Thought title          |
| `content`   | `string` | Markdown content       |
| `createdAt` | `string` | ISO 8601 datetime      |

### Optional Fields

| Field             | Type       | Description                               |
| ----------------- | ---------- | ----------------------------------------- |
| `updatedAt`       | `string`   | ISO 8601 datetime, set on edit            |
| `category`        | `string`   | Grouping category (manual or ML-computed) |
| `tags`            | `string[]` | Cross-category discovery (manual or ML)   |
| `draft`           | `boolean`  | If true, not publicly visible             |
| `relatedThoughts` | `uuid[]`   | Related thought IDs (manual or ML)        |

### Auto-generation

When creating a thought via `thoughtInputSchema`:

- `id` - UUID v4 generated if omitted
- `slug` - Generated from title if omitted
- `createdAt` - Current timestamp if omitted

## URL Structure

```
/thoughts                     # List all thoughts
/thoughts/{slug}              # Individual thought (no category)
/thoughts/{category}/{slug}   # Individual thought (with category)
```

## Content Format

Standard Markdown:

- Links: `[text](url)`
- Images: `![alt](src)`
- Code blocks with syntax highlighting
- Bold, italic, lists, headings

## Categorization Strategy

Categories, tags, and related thoughts support two modes:

1. **Manual** - Explicitly set values take priority
2. **ML-computed** - When not set, computed via similarity algorithms

Manual values always override computed values.

## Schema Variants

### `Thought` - Full object

Used for individual thought pages.

### `ThoughtListItem` - List view

Excludes `content` and `relatedThoughts`, adds optional `excerpt`.

| Field       | Type        | Description                   |
| ----------- | ----------- | ----------------------------- |
| `id`        | `uuid`      | Unique identifier             |
| `slug`      | `string`    | URL-safe identifier           |
| `title`     | `string`    | Thought title                 |
| `excerpt`   | `string?`   | Preview text (auto-generated) |
| `createdAt` | `string`    | ISO 8601 datetime             |
| `updatedAt` | `string?`   | ISO 8601 datetime             |
| `category`  | `string?`   | Grouping category             |
| `tags`      | `string[]?` | Tags for discovery            |
| `draft`     | `boolean?`  | Draft status                  |

### API Response - Use Standard `PaginatedResponse<ThoughtListItem>`

Uses `types/lib.ts` standard pagination pattern:

```typescript
// PaginatedResponse<ThoughtListItem>
{
  data: ThoughtListItem[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    }
  }
}
```

### `ThoughtCategory` - Category summary

For filtering UI and category counts:

```typescript
{
  id: string;
  name: string;
  count: number;
}
```

## Examples

### Full Thought

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "subtests-in-pytest",
  "title": "Subtests in pytest 9.0.0+",
  "content": "pytest 9.0.0 introduced native subtest support...",
  "createdAt": "2025-12-04T21:44:04-08:00",
  "category": "python",
  "tags": ["testing", "pytest"],
  "draft": false
}
```

### List Item

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "subtests-in-pytest",
  "title": "Subtests in pytest 9.0.0+",
  "excerpt": "pytest 9.0.0 introduced native subtest support...",
  "createdAt": "2025-12-04T21:44:04-08:00",
  "category": "python",
  "tags": ["testing", "pytest"]
}
```

## Future Considerations

- Reading time calculation
- Search indexing
- Related content via embedding similarity
- RSS/Atom feed generation
