# Search Architecture

**Functionality:** `search`

## Overview

The search functionality provides site-wide and section-specific search capabilities, primarily accessed through the terminal interface. It enables users to find content across blog posts, bookmarks, investments, experience, and education sections.

## Critical Issues & Bugs

### 🔴 CRITICAL Issues

1. **Server/Client Boundary Violation**
   - **Location**: `lib/search.ts:152`
   - **Issue**: `searchBookmarks` imports from `'./bookmarks.client'` in server context
   - **Impact**: Production crash when called from API routes
   - **Fix**: Separate client and server bookmark logic

2. **Type Duplication**
   - **Location**: `types/search.ts` and `types/terminal.ts`
   - **Issue**: `SearchResult` defined in both files
   - **Impact**: Maintenance burden and potential inconsistencies
   - **Fix**: Consolidate into single type definition

### 🟠 HIGH Priority Issues

1. **Severe Code Duplication**
   - All search functions copy-paste the same algorithm
   - Makes maintenance difficult and error-prone
   - Fix: Extract common search logic

2. **Performance Bottlenecks**
   - Every search re-fetches all data
   - No caching mechanism
   - Fix: Implement caching strategy

3. **Poor Search Quality**
   - Only exact string matching
   - No typo tolerance or fuzzy matching
   - Fix: Integrate Fuse.js for better UX

## Key Files & Responsibilities

### Core Search Logic

- **`lib/search.ts`**: Client/server mixed search functions
  - `searchPosts()`: Searches blog posts
  - `searchInvestments()`: Searches investment data
  - `searchExperience()`: Searches work experience
  - `searchEducation()`: Searches education data
  - `searchBookmarks()`: Searches bookmarks
  - **Issue**: Server/client boundary violation

- **`lib/blog/server-search.ts`**: Server-only blog search
  - Properly handles MDX file reading
  - Good pattern to follow

### API Endpoints

- **`app/api/search/all/route.ts`**: Site-wide search
  - Aggregates results from all sections
  - Adds section prefixes to results
  
- **`app/api/search/blog/route.ts`**: Blog-specific search
  - Searches only blog posts
  - Returns blog-formatted results

### Integration Points

- **`components/ui/terminal/commands.client.ts`**: Terminal integration
  - Parses search commands
  - Routes to appropriate API endpoints
  - Handles result display

### Type Definitions

- **`types/search.ts`**: Search result interface (duplicate)
- **`types/terminal.ts`**: Terminal-specific types (duplicate)

## Data Flow

```
Terminal Input → commands.client.ts → API Routes → Search Functions → Results
                                           ↓
                                    Data Sources
                                   (MDX, JSON, etc.)
```

## Architecture Issues

### Code Duplication

```typescript
// Repeated 6 times across different functions
const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
return items.filter(item => {
  const searchableText = extractSearchableText(item).toLowerCase();
  return searchTerms.every(term => searchableText.includes(term));
});
```

### Performance

- No caching of data sources
- Full data fetch on every search
- Synchronous operations block the event loop

### Search Quality

- No ranking or relevance scoring
- Case-sensitive issues in some places
- No support for partial matches or typos

## Recommendations

### Immediate Fixes

1. Fix server/client boundary issue
2. Consolidate type definitions
3. Extract common search algorithm
4. Add input validation and sanitization

### Performance Improvements

1. Implement caching with `unstable_cache`
2. Add rate limiting to API endpoints
3. Consider build-time search index generation

### Search Quality Enhancements

1. Integrate Fuse.js for fuzzy matching
2. Implement weighted search fields
3. Add result ranking and scoring
4. Include match highlighting data

### Architecture Refactoring

1. Create unified search service
2. Build search index during build process
3. Consolidate API endpoints
4. Add comprehensive test coverage

## Future Architecture

```
Build Time:
MDX/Data → build-search-index.ts → search-index.json

Runtime:
Terminal → Unified API → Search Service → Fuse.js → Results
                              ↓
                        Cached Index
```

This architecture would provide:

- Sub-10ms search response times
- Better search quality with fuzzy matching
- Reduced server load
- Easier maintenance
