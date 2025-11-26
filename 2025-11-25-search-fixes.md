# Search Infrastructure Fixes Checklist

**Created:** 2025-11-25
**Status:** Planning
**Related:** `docs/projects/structure/search.md`

---

## Overview

This checklist addresses bugs, inconsistencies, and DRY violations in the search infrastructure identified during the comprehensive audit.

---

## 🔴 HIGH PRIORITY

### Bug #1: `projects` Not Searchable via Terminal Scoped Search

- [ ] **Add `projects` case to terminal command handler**
  - File: `components/ui/terminal/commands.client.ts`
  - Location: Lines 399-418 (switch statement)
  - Action: Add `case "projects":` with `searchByScope("projects", searchTerms, signal)`

```typescript
// Add after line 417 (before the closing of switch)
case "projects":
  results = await searchByScope("projects", searchTerms, signal);
  break;
```

---

## 🟠 MEDIUM PRIORITY

### Bug #2: `skills` Not a Valid Search Scope

- [ ] **Decide: Should `skills` be searchable?**
  - If YES:
    - [ ] Add `"skills"` to `VALID_SCOPES` in `types/search.ts:11-19`
    - [ ] Add `"skills"` to `validScopes` in `lib/validators/search.ts:97`
    - [ ] Create `searchSkills()` function in `lib/search.ts`
    - [ ] Add `case "skills":` in `app/api/search/[scope]/route.ts`
    - [ ] Add `case "skills":` in `commands.client.ts` switch
  - If NO:
    - [ ] Document why `skills` is navigation-only (no searchable data)

### Bug #3: `projects` Navigation Missing from Terminal

- [ ] **Add `projects` to terminal sections**
  - File: `components/ui/terminal/sections.ts`
  - Location: Line 9-24
  - Action: Add `projects: "/projects",`

- [ ] **Add `projects` to `SectionKey` type**
  - File: `types/ui/terminal.ts`
  - Location: Lines 85-99
  - Action: Add `| "projects"` to the union type

### Bug #4: Rate Limiting Missing from Scoped Search

- [ ] **Add rate limiting to scoped search endpoint**
  - File: `app/api/search/[scope]/route.ts`
  - Location: After line 53 (after `noStore()` call)
  - Action: Import and apply `isOperationAllowed` check
  - Reference: `app/api/search/all/route.ts:98-114`

### Bug #5: Memory Pressure Check Missing from Scoped Search

- [ ] **Add memory pressure check to scoped search endpoint**
  - File: `app/api/search/[scope]/route.ts`
  - Location: After rate limiting check
  - Action: Import and apply `isMemoryCritical()` check
  - Reference: `app/api/search/all/route.ts:137-148`

---

## 🟡 LOW PRIORITY

### Bug #6: Duplicate `all` Search Logic

- [ ] **Option A: Remove `case "all"` from scoped endpoint**
  - File: `app/api/search/[scope]/route.ts`
  - Location: Lines 109-128
  - Action: Remove the `case "all"` block entirely
  - Rationale: Users should use `/api/search/all` for site-wide search

- [ ] **Option B: Redirect `all` scope to dedicated endpoint**
  - Action: In `case "all"`, redirect to `/api/search/all?q=...`

### Bug #7: Blog Search Prefix Inconsistency

- [ ] **Document the prefix behavior**
  - File: `docs/projects/structure/search.md`
  - Action: Add section explaining `[Blog]` prefix is added server-side

- [ ] **OR: Move prefix addition to site-wide aggregator only**
  - File: `lib/blog/server-search.ts:64`
  - Action: Remove `[Blog]` prefix from `searchBlogPostsServerSide`
  - File: `app/api/search/all/route.ts`
  - Action: Add `[Blog]` prefix in the aggregator like other categories

### Bug #8: Missing Request Coalescing in Scoped Search

- [ ] **Extract request coalescing to shared utility**
  - Create: `lib/utils/request-coalescing.ts`
  - Action: Move `inFlightSearches` Map and coalescing logic
  - Apply to: Both `/api/search/all` and `/api/search/[scope]`

### Bug #9: `SectionKey` Type Incomplete

- [ ] **Add `projects` to `SectionKey`** (covered in Bug #3)

### Bug #10: Empty Query Handling Inconsistent

- [ ] **Standardize empty query behavior**
  - Decision needed: Return empty array OR return all items?
  - Files to update:
    - `lib/search.ts` (multiple functions)
    - `lib/blog/server-search.ts:26-28`
  - Recommendation: Return empty array for empty queries (REST convention)

---

## 🔧 DRY VIOLATIONS & DEDUPLICATION

### DRY #1: `validScopes` Defined in Multiple Places

**Current State:**

- `lib/validators/search.ts:97` - `validScopes` array
- `types/search.ts:11-19` - `VALID_SCOPES` const

**Fix:**

- [ ] **Single Source of Truth for Search Scopes**
  - Keep: `types/search.ts` as the canonical source
  - File: `lib/validators/search.ts`
  - Action: Import `VALID_SCOPES` from `@/types/search`
  - Delete: Local `validScopes` array at line 97

```typescript
// lib/validators/search.ts - AFTER fix
import { VALID_SCOPES } from "@/types/search";

export function SearchScopeValidator(scope: unknown) {
  // ... use VALID_SCOPES instead of local validScopes
  if (!VALID_SCOPES.includes(scope.toLowerCase() as (typeof VALID_SCOPES)[number])) {
    return { isValid: false, error: `Invalid scope. Valid scopes are: ${VALID_SCOPES.join(", ")}` };
  }
}
```

### DRY #2: Terminal Sections vs Switch Statement

**Current State:**

- `components/ui/terminal/sections.ts` - `sections` object
- `components/ui/terminal/commands.client.ts:399-418` - switch statement duplicates section names

**Fix:**

- [ ] **Derive searchable sections from `sections` object**
  - File: `components/ui/terminal/commands.client.ts`
  - Action: Replace switch with dynamic check against `sections` keys
  - Benefit: Adding a section auto-enables search

```typescript
// commands.client.ts - AFTER fix
const SEARCHABLE_SECTIONS = [
  "blog",
  "experience",
  "education",
  "investments",
  "bookmarks",
  "bookmark",
  "projects",
] as const;

if (command && SEARCHABLE_SECTIONS.includes(command as (typeof SEARCHABLE_SECTIONS)[number]) && args.length > 0) {
  const scope = command === "bookmark" ? "bookmarks" : command;
  results = await searchByScope(scope, searchTerms, signal);
}
```

### DRY #3: `SectionKey` Type vs `sections` Object

**Current State:**

- `types/ui/terminal.ts:85-99` - `SectionKey` type (manual union)
- `components/ui/terminal/sections.ts` - `sections` object

**Fix:**

- [ ] **Derive `SectionKey` from `sections` object**
  - File: `types/ui/terminal.ts`
  - Action: Use `keyof typeof sections` pattern

```typescript
// Option A: Export sections as const and derive type
// components/ui/terminal/sections.ts
export const sections = { ... } as const;
export type SectionKey = keyof typeof sections;

// Option B: Keep type definition, but validate against runtime object
```

### DRY #4: Rate Limiting + Memory Check Logic

**Current State:**

- `app/api/search/all/route.ts:35-67` - `getCriticalThreshold()`, `isMemoryCritical()`
- `app/api/search/all/route.ts:98-114` - Rate limiting inline

**Fix:**

- [ ] **Extract to shared search middleware/utilities**
  - Create: `lib/search/api-guards.ts`
  - Move: `getCriticalThreshold()`, `isMemoryCritical()` functions
  - Move: Rate limiting logic into reusable function
  - Export: `applySearchGuards(request: NextRequest): Response | null`

```typescript
// lib/search/api-guards.ts
export function checkSearchRateLimit(clientIp: string): Response | null { ... }
export function checkMemoryPressure(): Response | null { ... }
export function applySearchGuards(request: NextRequest): Response | null {
  const rateLimitResponse = checkSearchRateLimit(getClientIp(request));
  if (rateLimitResponse) return rateLimitResponse;

  const memoryResponse = checkMemoryPressure();
  if (memoryResponse) return memoryResponse;

  return null;
}
```

### DRY #5: Search Result Transformation

**Current State:**

- `commands.client.ts:13-33` - `transformSearchResultToSelectionItem()`
- Multiple places format `SearchResult` → display format

**Fix:**

- [ ] **Centralize search result transformation**
  - File: `lib/utils/search-helpers.ts` (already exists)
  - Action: Move `transformSearchResultToSelectionItem` there
  - Export for use in terminal and any other consumers

### DRY #6: Scoped Search API Response Format

**Current State:**

- `/api/search/[scope]` returns `{ results, meta }`
- `/api/search/all` returns raw array

**Fix:**

- [ ] **Standardize API response format**
  - Decision: Use wrapper object or raw array?
  - Recommendation: Always use `{ results, meta }` format
  - File: `app/api/search/all/route.ts`
  - Action: Wrap results in standard format

---

## 📋 Implementation Order

### Phase 1: Critical Fixes (Do First)

1. [ ] Bug #1 - Add `projects` to terminal search switch
2. [ ] Bug #3 - Add `projects` to sections and `SectionKey`
3. [ ] DRY #1 - Unify `validScopes` definitions

### Phase 2: Security & Stability

4. [ ] Bug #4 - Add rate limiting to scoped search
5. [ ] Bug #5 - Add memory pressure check to scoped search
6. [ ] DRY #4 - Extract guards to shared module (enables #4 and #5)

### Phase 3: Consistency & Cleanup

7. [ ] Bug #6 - Remove or redirect `case "all"` from scoped endpoint
8. [ ] Bug #10 - Standardize empty query handling
9. [ ] DRY #2 - Refactor terminal switch to use section list
10. [ ] DRY #3 - Derive `SectionKey` from sections object

### Phase 4: Polish

11. [ ] Bug #2 - Decide on `skills` searchability
12. [ ] Bug #7 - Standardize blog prefix handling
13. [ ] Bug #8 - Add request coalescing to scoped search
14. [ ] DRY #5 - Centralize result transformation
15. [ ] DRY #6 - Standardize API response format

---

## 🧪 Verification Steps

After each fix:

- [ ] Run `bun run validate` - Must pass with 0 errors
- [ ] Run `bun run test` - All search tests must pass
- [ ] Manual test in terminal:
  - [ ] `projects` → Should navigate to /projects
  - [ ] `projects react` → Should search projects for "react"
  - [ ] `blog nextjs` → Should search blog for "nextjs"
  - [ ] `react` → Should perform site-wide search

---

## 📚 Files Reference

| File                                        | Purpose                   |
| ------------------------------------------- | ------------------------- |
| `lib/search.ts`                             | Core search functions     |
| `lib/validators/search.ts`                  | Query validation          |
| `lib/blog/server-search.ts`                 | Blog-specific search      |
| `app/api/search/[scope]/route.ts`           | Scoped search API         |
| `app/api/search/all/route.ts`               | Site-wide search API      |
| `components/ui/terminal/commands.client.ts` | Terminal command handler  |
| `components/ui/terminal/sections.ts`        | Navigation sections       |
| `types/search.ts`                           | Search type definitions   |
| `types/ui/terminal.ts`                      | Terminal type definitions |
| `docs/projects/structure/search.md`         | Architecture docs         |
