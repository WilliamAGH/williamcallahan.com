# Search Architecture

**Functionality:** `search`

## Overview

The search functionality provides site-wide and section-specific search capabilities with fuzzy matching, caching, and security features. It's primarily accessed through the terminal interface and enables users to find content across blog posts, bookmarks, investments, experience, and education sections.

## Recent Improvements (Issue #120)

### ✅ RESOLVED Issues

1. **Server/Client Boundary Violation** - FIXED
   - Moved to API-based approach for all searches
   - Terminal no longer imports server-side modules
   - Clean separation of concerns

2. **Type Duplication** - FIXED
   - Consolidated `SearchResult` type in `types/search.ts`
   - Removed duplicate from `types/terminal.ts`

3. **Code Duplication** - FIXED
   - Created generic `searchContent<T>` function
   - Eliminated ~100+ lines of duplicated code
   - All search functions now use the same core algorithm

4. **Performance Issues** - FIXED
   - Added 15-minute cache via `ServerCacheInstance`
   - Implemented lazy loading in terminal
   - Search functions preload on user input

5. **Search Quality** - IMPROVED
   - Integrated MiniSearch for fuzzy/typo-tolerant search
   - Falls back to substring search for compatibility
   - Supports prefix matching and multi-word queries

6. **Security** - ENHANCED
   - Added query validation and sanitization
   - Prevents ReDoS attacks
   - Query length limits (100 chars max)

## Key Files & Responsibilities

### Core Search Logic

- **`lib/search.ts`**: Unified search functions with caching
  - `searchContent<T>()`: Generic search algorithm with MiniSearch support
  - `searchPosts()`: Searches blog posts with caching
  - `searchInvestments()`: Searches investment data with caching
  - `searchExperience()`: Searches work experience with caching
  - `searchEducation()`: Searches education data with caching
  - `searchBookmarks()`: Searches bookmarks via API with caching

- **`lib/validators/search.ts`**: Query validation
  - `validateSearchQuery()`: Validates and sanitizes input
  - `sanitizeSearchQuery()`: Simple sanitization helper
  - Prevents ReDoS attacks and dangerous patterns

### API Endpoints

- **`app/api/search/[scope]/route.ts`**: Consolidated search endpoint
  - Handles all search scopes dynamically
  - Validates queries before processing
  - Returns consistent response format
  
- **`app/api/search/all/route.ts`**: Site-wide search
  - Aggregates results from all sections
  - Adds section prefixes to results
  - Uses query validation
  
- **`app/api/search/blog/route.ts`**: Legacy blog-specific search
  - Maintained for backward compatibility
  - Routes through server-side search

### Caching Layer

- **`lib/server-cache.ts`**: Enhanced with search caching
  - `getSearchResults()`: Retrieves cached results
  - `setSearchResults()`: Stores search results
  - `shouldRefreshSearch()`: Checks cache validity
  - 15-minute TTL for search results

### Integration Points

- **`components/ui/terminal/commands.client.ts`**: Terminal integration
  - Uses consolidated API endpoint
  - Implements lazy loading with `preloadSearch()`
  - No longer imports server modules

- **`components/ui/terminal/command-input.client.tsx`**: Input handling
  - Triggers search preloading after 2 characters
  - Uses `requestIdleCallback` for performance

### Type Definitions

- **`types/search.ts`**: Single source of truth for search types
  ```typescript
  export interface SearchResult {
    label: string;
    description: string;
    path: string;
  }
  ```

## Data Flow

See [search.mmd](./search.mmd) for detailed architecture diagrams including:
- Overall architecture flow with all components
- Component interaction sequence diagram

### Simplified Flow

```
User Input → Terminal → Preload Search → API Request → Validation
                                              ↓
                                        Cache Check
                                         ↙        ↘
                                    Cached    Not Cached
                                      ↓           ↓
                                   Return    Search Function
                                              ↓
                                         MiniSearch
                                         ↙        ↘
                                   Success    Fallback
                                      ↓           ↓
                                   Fuzzy     Substring
                                   Search     Search
                                      ↘         ↙
                                       Results
                                          ↓
                                    Cache Store
                                          ↓
                                      Response
```

## Search Algorithm

### Generic Search Function

```typescript
function searchContent<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => (string | undefined | null)[],
  getExactMatchField?: (item: T) => string,
  miniSearchIndex?: MiniSearch<T> | null
): T[]
```

### Features

1. **Query Sanitization**: Removes dangerous regex patterns
2. **MiniSearch Integration**: 
   - Fuzzy matching (10% edit distance)
   - Prefix matching for autocomplete
   - Multi-word AND search
3. **Fallback Strategy**: Substring search if MiniSearch fails
4. **Exact Match Priority**: Optional exact field matching

## Performance Optimizations

### Caching Strategy

- **Duration**: 15 minutes for successful searches
- **Failure Handling**: 1 minute cache for failed attempts
- **Key Format**: `search:{dataType}:{normalizedQuery}`
- **Memory Efficient**: Uses existing `ServerCacheInstance`

### Lazy Loading

1. **Preload Trigger**: After 2 characters typed
2. **Background Loading**: Uses `requestIdleCallback`
3. **One-time Load**: Functions cached after first use
4. **API-based**: No server modules in client bundle

### Index Management

- **Static Data**: Singleton MiniSearch indexes
- **Dynamic Data**: Real-time API fetching
- **Memory Conscious**: Indexes created on first use

## Security Features

### Query Validation

- **Length Limit**: 100 characters maximum
- **Special Characters**: Sanitized to prevent ReDoS
- **Empty Queries**: Rejected with error message
- **Pattern Removal**: Strips regex metacharacters

### API Security

- **Input Validation**: All endpoints validate queries
- **Error Handling**: Safe error messages
- **Rate Limiting**: Ready for implementation

## Testing

### Test Coverage

- **Unit Tests**: `__tests__/lib/search.test.ts`
  - Query validation and sanitization
  - Cache behavior verification
  - Search algorithm correctness
  - 34 tests, all passing

### Test Categories

1. **Validation Tests**: Query sanitization and limits
2. **Cache Tests**: Hit/miss behavior, storage
3. **Search Tests**: Exact, partial, multi-word
4. **Integration Tests**: API endpoint behavior

## Future Enhancements

### Planned Improvements

1. **Build-time Indexing**: Pre-generate search indexes
2. **Highlighting**: Return match positions
3. **Ranking**: Implement relevance scoring
4. **Synonyms**: Support alternative terms
5. **Rate Limiting**: Implement API throttling

### Architecture Evolution

```
Current:
Runtime indexing → Memory usage → API-based search

Future:
Build-time index → Static files → Edge caching → Instant search
```

## Migration Notes

### Breaking Changes

- Terminal commands now use `/api/search/[scope]` endpoint
- `SearchResult` type moved to `types/search.ts`
- Query validation may reject previously valid queries

### Backward Compatibility

- Legacy `/api/search/blog` endpoint maintained
- Fallback substring search for MiniSearch failures
- Cache-aside pattern allows gradual rollout

## Usage Examples

### Terminal Search

```bash
# Section-specific search
blog react hooks
bookmarks typescript

# Site-wide search
react typescript nextjs

# Fuzzy search (typo tolerance)
raect  # finds "react"
typscript  # finds "typescript"
```

### API Usage

```typescript
// Scoped search
GET /api/search/blog?q=react+hooks

// Site-wide search
GET /api/search/all?q=nextjs

// Response format
{
  "results": [...],
  "meta": {
    "query": "react hooks",
    "scope": "blog",
    "count": 5,
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## Monitoring & Debugging

### Cache Monitoring

```typescript
// Check cache stats
ServerCacheInstance.getStats()

// Clear search cache
ServerCacheInstance.clearSearchCache()
```

### Debug Logging

- Development mode includes search timing logs
- Cache hit/miss logged for debugging
- Query sanitization results visible

This architecture provides sub-50ms search response times with improved search quality through fuzzy matching while maintaining security and performance.