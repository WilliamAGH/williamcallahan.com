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

## Runtime Strategy (request-time, cacheComponents-safe)

- **Detail pages** resolve slugs by extracting the ABS ID/ISBN first, fetching a single item, and fall back to a last-good in-memory snapshot when AudioBookShelf is unavailable.
- **List page** fetches at request time with `connection()` and shows a stale banner if it has to serve cached data.
- **No build-time fetching**: the sitemap skips books during builds, and pages rely purely on request-time data to avoid cacheComponents conflicts.
