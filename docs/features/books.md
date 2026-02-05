# Books

Personal reading list sourced from AudioBookShelf and other metadata providers.

## Schema

**Schema Location:** `types/schemas/book.ts`
**Transform Location:** `lib/books/transforms.ts`

### Required Fields

| Field   | Type     | Description       |
| ------- | -------- | ----------------- |
| `id`    | `string` | Unique identifier |
| `title` | `string` | Book title        |

### Optional Fields

| Field                  | Type       | Description                              |
| ---------------------- | ---------- | ---------------------------------------- |
| `isbn10`               | `string`   | ISBN-10 identifier                       |
| `isbn13`               | `string`   | ISBN-13 identifier                       |
| `asin`                 | `string`   | Amazon Standard Identification Number    |
| `subtitle`             | `string`   | Book subtitle                            |
| `authors`              | `string[]` | Author names                             |
| `publisher`            | `string`   | Publisher name                           |
| `publishedYear`        | `string`   | Year of publication                      |
| `genres`               | `string[]` | Genre categories                         |
| `description`          | `string`   | Book description/summary                 |
| `formats`              | `string[]` | Available formats (default: `["ebook"]`) |
| `audioNarrators`       | `string[]` | Audiobook narrator names                 |
| `audioDurationSeconds` | `number`   | Audiobook length in seconds              |
| `audioChapterCount`    | `number`   | Number of audiobook chapters             |
| `coverUrl`             | `url`      | Cover image URL                          |
| `findMyBookUrl`        | `url`      | FindMyBook.com link                      |
| `publisherUrl`         | `url`      | Publisher's page for book                |
| `amazonUrl`            | `url`      | Amazon product page                      |
| `audibleUrl`           | `url`      | Audible product page                     |
| `bookshopUrl`          | `url`      | Bookshop.org product page                |

### Format Options

The `formats` field accepts an array of:

- `ebook` - Digital ebook format
- `audio` - Audiobook format
- `print` - Physical print format

Default value: `["ebook"]`

## URL Structure

```text
/books                # List all books
/books/{slug}         # Individual book detail
```

## Data Source

Primary data sourced from AudioBookShelf API:

- Library items endpoint: `/api/libraries/{id}/items`
- Expanded item details: `/api/items/{id}?expanded=1`
- Cover images: `/api/items/{id}/cover` (WebP format)

## Schema Variants

### `Book` - Full object

Used for individual book pages. Contains all metadata fields.

### `BookListItem` - List view

Minimal schema for grids/cards:

| Field      | Type        | Description       |
| ---------- | ----------- | ----------------- |
| `id`       | `string`    | Unique identifier |
| `title`    | `string`    | Book title        |
| `authors`  | `string[]?` | Author names      |
| `coverUrl` | `url?`      | Cover image URL   |

### API Response - Use Standard `PaginatedResponse<BookListItem>`

Uses `types/lib.ts` standard pagination pattern:

```typescript
// PaginatedResponse<BookListItem>
{
  data: BookListItem[];
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

## Examples

### Full Book

```json
{
  "id": "li_abc123",
  "title": "The Pragmatic Programmer",
  "subtitle": "Your Journey to Mastery",
  "isbn13": "9780135957059",
  "authors": ["David Thomas", "Andrew Hunt"],
  "publisher": "Addison-Wesley Professional",
  "publishedYear": "2019",
  "genres": ["Technology", "Programming"],
  "formats": ["ebook", "audio", "print"],
  "audioNarrators": ["Anna Katarina"],
  "audioDurationSeconds": 28800,
  "coverUrl": "https://example.com/covers/pragprog.webp",
  "amazonUrl": "https://amazon.com/dp/0135957052",
  "bookshopUrl": "https://bookshop.org/p/books/..."
}
```

### List Item

```json
{
  "id": "li_abc123",
  "title": "The Pragmatic Programmer",
  "authors": ["David Thomas", "Andrew Hunt"],
  "coverUrl": "https://example.com/covers/pragprog.webp"
}
```

## Future Considerations

- Reading progress tracking
- Reading list status (reading, completed, want-to-read)
- Personal ratings and notes
- Book recommendations via ML
- RSS/Atom feed for reading activity

## Runtime Strategy (static prerender, cacheComponents-safe)

### Core Approach

Both `/books` (list) and `/books/[book-slug]` (detail) pages are **statically prerendered** with 5-minute revalidation. No `connection()` bailout is used—this allows pages to be analyzed at build time while fetching fresh data via time-based revalidation.

### Implementation Details

| Route                | Rendering | Revalidation | Fallback                            |
| -------------------- | --------- | ------------ | ----------------------------------- |
| `/books`             | Static    | 5 minutes    | Empty state + "unavailable" message |
| `/books/[book-slug]` | Static    | 5 minutes    | In-memory snapshot (6h TTL) or 404  |

### Key Design Decisions

1. **No `connection()` bailout**: Using `connection()` from `next/server` causes `DYNAMIC_SERVER_USAGE` errors with `cacheComponents: true`. Removed entirely.

2. **Time-based revalidation over `no-store`**: Using `cache: "no-store"` (equivalent to `revalidate: 0`) causes "Page changed from static to dynamic at runtime" errors. Use `next: { revalidate: 300 }` instead.

3. **Prerender-safe timestamps**: `Date.now()` before data access causes `next-prerender-current-time` errors. The snapshot system uses `fetchedAt: 0` as a prerender-safe sentinel value.

4. **Graceful degradation**: When AudioBookShelf is unavailable:
   - List page returns empty array (renders "unavailable" UI)
   - Detail pages fall back to in-memory snapshot if within 6-hour TTL
   - Never throws—pages always render

### Files Involved

| File                                         | Purpose                                                     |
| -------------------------------------------- | ----------------------------------------------------------- |
| `components/features/books/books.server.tsx` | Server component (no `connection()`)                        |
| `lib/books/audiobookshelf.server.ts`         | API client with 5-min revalidation, prerender-safe snapshot |
| `app/books/page.tsx`                         | List page with Suspense boundary                            |
| `app/books/[book-slug]/page.tsx`             | Detail page with fallback banner                            |

### Critical Patterns (cacheComponents-safe)

```typescript
//  CORRECT: Time-based revalidation
const response = await fetchWithTimeout(url, {
  next: { revalidate: 300 }, // 5 minutes
  headers: { Authorization: `Bearer ${apiKey}` },
});

//  BROKEN: Causes static-to-dynamic error
const response = await fetch(url, { cache: "no-store" });

//  CORRECT: Prerender-safe timestamp
const cacheSnapshot = (books: Book[]): void => {
  lastBooksSnapshot = {
    booksById: new Map(books.map((book) => [book.id, book])),
    fetchedAt: 0, // prerender-safe sentinel
  };
};

//  BROKEN: Causes next-prerender-current-time error
const cacheSnapshot = (books: Book[]): void => {
  lastBooksSnapshot = {
    booksById: new Map(books.map((book) => [book.id, book])),
    fetchedAt: Date.now(), //  Not allowed before data access
  };
};
```

### Sitemap Considerations

- Sitemap skips books during builds to avoid external API dependency
- Book URLs are generated at runtime when AudioBookShelf is available
