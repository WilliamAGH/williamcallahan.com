# Document Domain Architecture

**Purpose**: ACTIONABLE domain docs, ZERO assumptions, find REAL issues.
**Domain**: $ARGUMENTS

**FORBIDDEN**: Boilerplate, templates, theory. **REQUIRED**: file:line observations.
**NOTE**: Examples = concepts, not exhaustive lists.

## 🚀 Quick Start

```bash
bun run validate && ls docs/projects/structure/[domain]*.{md,mmd}
find . -name "*[domain]*" -type f | grep -v node_modules
```

## 🚨 CRITICAL REQUIREMENTS

**Integration**: Follows solve-issue/doublecheck/reduce-code-flatten → Precedes test/create-issue/commit

### ZERO ASSUMPTIONS MANDATE

**FORBIDDEN**: Assumptions, guessing types, training data for deps, skipping connections, documenting without reading
**REQUIRED**: Read ALL imports/exports, verify CURRENT docs via MCPs, follow EVERY thread, document ACTUAL code

### Documentation Quality Standards

- Thoroughness > Brevity (never miss dependencies)
- **American English ONLY** - scan ALL British spellings (-ise/-ize, -our/-or, -re/-er)
  - **EXCEPTION**: External API fields (e.g., Karakeep uses `favourites`, `colour` in responses)
- **Goal**: DRY, light, modern code with robust error handling
- **Output**: Specific file:line observations only, no filler

### Environment Variables & Security Audit

**CRITICAL Next.js 15 Rules**:

- `NEXT_PUBLIC_*` = Client-exposed (build-time inlined!)
- No prefix = Server-only (verify not needed client-side)
- **Audit**: Secrets in NEXT*PUBLIC*? Missing NEXT*PUBLIC* for client needs?

```typescript
// ❌ SECURITY LEAK
NEXT_PUBLIC_API_KEY = "secret-key"; // Exposed to browser!

// ❌ HYDRATION ERROR
const data = process.env.API_URL; // Undefined client-side

// ✅ CORRECT
NEXT_PUBLIC_API_URL = "https://api.example.com"; // Client-safe
API_KEY = "secret-key"; // Server-only
```

## STEP 1: Pre-Documentation Setup

### A. Validate Environment

```bash
bun run validate  # Must show 0 errors, 0 warnings
```

### B. Parse User Request & Check Existing

```bash
ls docs/projects/structure/[domain]*.{md,mmd}  # Check existing
grep -l "[domain]" docs/projects/structure/*.md  # Find related
```

**IF FOUND**: Ask user - Update existing or create new with cross-refs? (DRY)

### C. Review Architecture Entrypoint

```bash
cat docs/projects/structure/00-architecture-entrypoint.md  # Extract domains, relations, dependencies
```

## STEP 2: Domain Thread Analysis

### A. Find Entry Points

```bash
find app/ components/ lib/ types/ -name "*[domain]*" -o -name "*.ts*" | xargs grep -l "[domain]"
grep -r "[domain]" --include="route.ts" app/api/
```

### B. Follow Import/Export Chains

For EACH file: Read imports → Check exports → Verify implementation → Find consumers

### C. Map Relationships

UI → API Routes → Services → Data Access → Types → External APIs → Caching → State

## STEP 3: Type System Deep Dive

```bash
find types/ -name "*.ts" | xargs grep -l "[domain]"
grep -r "z\.|interface.*{|type.*=" --include="*.ts" | grep "[domain]"
```

### B. Type Safety with TypeScript 5.8 + Zod v4

**CRITICAL**: Single source of truth - `types/` + Zod schemas. NO duplicates.

**The Golden Pattern**:

```typescript
// types/[domain].ts - ALWAYS do this
export const BaseSchema = z.object({ id: z.string(), url: z.url() });
export const UserSchema = BaseSchema.extend({ userId: z.string() });
export type User = z.infer<typeof UserSchema>; // Type from schema
```

**Type Audit - Find These Issues**:

```typescript
// ❌ DUPLICATION (80%+ similar = RED FLAG)
interface UserData {
  id: string;
  name: string;
  email: string;
}
interface AdminData {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ❌ MANUAL TYPE + SCHEMA
interface User {
  /* ... */
}
const UserSchema = z.object({
  /* same fields */
});

// ❌ NO VALIDATION
const data = await fetch().then(r => r.json()); // raw any!
```

**Zod v4 Power Patterns**:

```typescript
// Boundary validation (MANDATORY)
const body: unknown = await request.json();
const validated = Schema.parse(body); // Throws on invalid

// Transform inconsistencies ONCE
const APISchema = z
  .object({
    user_name: z.string(),
  })
  .transform(data => ({
    userName: data.user_name, // Fix naming here, not everywhere
  }));

// Discriminated unions for variants
const Result = z.discriminatedUnion("type", [
  z.object({ type: z.literal("success"), data: Schema }),
  z.object({ type: z.literal("error"), code: z.number() }),
]);
```

**Rules (see `linting-formatting.md` for complete list)**:

- `z.infer<>` for types (never duplicate)
- `.extend()` for composition (DRY)
- `.parse()` at ALL boundaries
- v4 validators: `z.email()` not `.string().email()`
- Check ALL Zod patterns, not just these examples

### C. Runtime Validation & Type Analysis

```bash
grep -r "fetch\|axios\|parse\|safeParse" --include="*.ts" | grep "[domain]"
grep -r "z\.infer\|z\.input\|z\.output" --include="*.ts" | grep "[domain]"  # Type inference

# Find similar type structures
grep -r "interface.*{" -A 10 --include="*.ts" | grep "[domain]"  # Compare interfaces
grep -r "z\.object({" -A 10 --include="*.ts" | grep "[domain]"   # Compare schemas
```

**Document ALL validation gaps**:

- External API responses without `.parse()`
- Form data without `.safeParse()`
- JSON.parse without validation
- Type assertions instead of runtime checks

**Look for Type Similarity Patterns**:

- Types with 80%+ identical properties
- Types that differ only in 1-2 fields
- Types with same data but different property names
- Types that could share a common base

### D. Hydration & Server/Client Issues

**Find ALL hydration errors (see `react-server-client.md` for complete patterns)**:

```typescript
// ❌ DATE/TIME MISMATCH
<div>{new Date().toLocaleString()}</div>  // Different server/client

// ❌ BROWSER-ONLY API
const width = window.innerWidth  // window undefined server-side

// ❌ RANDOM VALUES
<div key={Math.random()}>  // Different each render

// ✅ SOLUTIONS
// Use useEffect for client-only
const [mounted, setMounted] = useState(false)
useEffect(() => setMounted(true), [])

// suppressHydrationWarning for timestamps
<time suppressHydrationWarning>{new Date()}</time>

// Stable keys
<div key={item.id}>  // Not Math.random()
```

**React 19/Next.js 15 Streaming Patterns**:

```typescript
// ✅ PARALLEL FETCH (not waterfall)
const [users, posts] = await Promise.all([
  getUsers(), getPosts()
])

// ✅ STREAMING WITH SUSPENSE
<Suspense fallback={<Skeleton />}>
  <SlowComponent />
</Suspense>

// ❌ NO DEFAULT CACHING IN v15
fetch(url)  // Not cached!
fetch(url, { cache: 'force-cache' })  // Explicit cache
```

## STEP 4: External Dependency Documentation

### A. Identify External Dependencies

```bash
cat package.json | jq '.dependencies' | grep -i "[keyword]"
grep -r "from '[^./]" --include="*.ts*" | grep "[domain]"
```

### B. Get CURRENT Documentation

**NEVER use training data - sources IN ORDER**:

1. **MCPs**: `@mcp__context7__resolve-library-id` → `get-library-docs`
2. **Package**: `cat node_modules/[pkg]/{package.json,README.md,*.d.ts}`
3. **Web**: `@brave-search "[package] [version] breaking changes"`

### C. Document Version-Specific Behavior

Include: exact version, auth method, rate limits, breaking changes, API patterns

## STEP 4: Create Domain Documentation

### A. Pre-Documentation Validation

```bash
bun run validate && bun run test [domain]
grep -r "TODO\|FIXME\|HACK\|XXX" --include="*.ts" | grep "[domain]"
```

### B. Markdown File Structure (REAL DATA ONLY)

**ABSOLUTE MANDATE**: Every line below MUST contain ACTUAL findings from code inspection.
**FORBIDDEN**: Generic descriptions, placeholder text, theoretical explanations.
**REQUIRED**: Specific file:line references, actual function names, real measurements.

````markdown
# [Domain] Architecture

## Core Purpose

[What this domain ACTUALLY does based on code at file:line - NO generic descriptions]

## Architecture Overview

Data Flow: External → Fetch → Transform → Cache → Serve
Components:

- **[Layer]** (`file.ts:line`): purpose, exports

## Key Features

- **[Feature]**: implementation at file:line, measured performance

## Data Structures

```typescript
// Paste ACTUAL interfaces from code
```
````

## Design Decisions

1. **[Decision]**: Problem at file:line → Solution → Trade-offs

## External Integrations

- **[Service] vX.Y.Z**: auth, limits, docs link

## Performance & Security

- Response times, TTLs, memory limits
- Auth methods, validation, XSS prevention

## Operations & Testing

- Health: [endpoints at file:line]
- Tests: [files] with X% coverage
- Ops: [exact working commands]

## 🐛 Bugs & Improvements Inventory

### Type/Validation Issues (PRIORITY)

1. **Duplicate Type** - `file:line`: Same type defined in X locations
2. **Similar Types** - `file:line`: 80%+ identical structure, should extend base
3. **Missing Validation** - `file:line`: External data used without Zod
4. **Type Mismatch** - `file:line`: Zod schema doesn't match TS type
5. **Inconsistent Naming** - `file:line`: Same data, different property names

### Environment Issues (CRITICAL - scan ALL env vars)

1. **Secret Exposure** - `file:line`: ANY secret in NEXT*PUBLIC*\*
2. **Missing Prefix** - `file:line`: ANY client-used var without NEXT*PUBLIC*

### Hydration Issues (scan for ALL patterns, not just these)

1. **Date/Time** - `file:line`: ANY dynamic time/date rendering
2. **Browser APIs** - `file:line`: ANY browser-only API (window, document, localStorage, etc.)
3. **Random Values** - `file:line`: ANY non-deterministic values (Math.random, Date.now, etc.)

### Performance Issues (find ALL instances)

1. **Sequential Loading** - `file:line`: ANY await chains that could be parallel
2. **Blocking Components** - `file:line`: ANY slow component without Suspense
3. **Missing Cache** - `file:line`: ANY fetch() without explicit cache strategy

### Bugs

1. **[Title]** - `file:line`: description, impact, fix

### Improvements

1. **[Title]** - `file:line`: current → proposed, effort: S/M/L

### British English (ALL instances, not just these examples)

- `file:line`: "[actual word found]" → "[correct American spelling]"
- **EXCLUDE**: External API field names (document as-is: `api.favourites`, `response.colour`)

## Related Documentation

- `[domain].mmd` - visual diagram
- `[related].md` - cross-references

````

### C. Mermaid Diagram Best Practices

```mermaid
graph TD
    subgraph "External"
        API[External API]
    end
    subgraph "Application"
        Service[Domain Service]
    end
    API --"1. Fetch"--> Service
    Service --"2. Transform"--> Cache
    style Service fill:#e1f5fe
````

**DO**: Group by layers, number flows, style key nodes
**DON'T**: Overcrowd, use abbreviations, mix abstraction levels

## STEP 5: Error Handling & Edge Cases

### Error Handling & Edge Cases

```bash
grep -r "try.*catch\|.catch\|Error\|throw" --include="*.ts" | grep "[domain]"
```

Document: Network failures, rate limits, validation errors, concurrent requests, retry logic, circuit breakers

## STEP 6: Verification & Refinement

### Verification & Refinement

```bash
grep -r "[domain]" --include="*.ts*" . | grep -v node_modules  # Find missed files
find app/api -name "route.ts" | xargs grep -l "[domain]"  # Verify endpoints
npm view [package] version  # Check for updates
```

## STEP 7: Finalize

```bash
grep -r "useMemo\|lazy" --include="*.ts*"  # Performance patterns
```

### Commit Instructions - ABSOLUTELY CRITICAL

**NEVER include AI/Claude attribution in commits:**

- ❌ 🤖 Generated with [Claude Code]
- ❌ Co-Authored-By: Claude <noreply@anthropic.com>
- ❌ Any other AI attribution or markers

**Commit Requirements:**

1. Clear, specific messages using conventional format: `docs([domain]): architecture`
2. Small batches: 1-3 domain-related files per commit maximum
3. NO generic messages like "update docs" or "fix stuff"
4. Each commit must describe the specific change made

```bash
# Example commits (one at a time):
git add docs/projects/structure/[domain].md
git commit -m "docs([domain]): add architecture documentation with data flow"

git add docs/projects/structure/[domain].mmd
git commit -m "docs([domain]): add mermaid diagram for component relationships"

git add docs/projects/structure/00-architecture-entrypoint.md docs/projects/file-overview-map.md
git commit -m "docs: update entrypoint and file map with [domain] functionality"
```

## 🚨 Common Pitfalls to AVOID

### DON'T: Make Assumptions

**❌ WRONG**: "getBookmarks fetches from API"
**✅ RIGHT**: "getBookmarks (file:45-89): Cache → S3 → API, 15min TTL, coalesced requests"

**❌ WRONG**: "Handles errors gracefully"  
**✅ RIGHT**: "Network: 30s timeout → throw; Invalid JSON: Sentry log → []; Rate limit: backoff 1s/2s/4s"

### DON'T: Use Stale External Docs

**❌ WRONG**: "Next.js uses getServerSideProps"
**✅ RIGHT**: "Next.js 15.1.4: App Router, async components, no getServerSideProps"

**❌ WRONG**: "Uses Karakeep API"
**✅ RIGHT**: "Karakeep v2.1.0: Bearer auth, 100/min limit, offset/limit paging, breaking: archived→isArchived"

### DON'T: Document Partial Flows

**❌ WRONG**: "BookmarksPage fetches and renders"

**✅ RIGHT**: Complete flow with file:line refs:

1. Browser → page.tsx (Suspense, async component)
2. Data → server.ts:45 (Cache[15m] → S3[120ms] → refresh if stale)
3. Validate → json.ts:67 (parse, transform, narrow types)
4. Enrich → fetch.ts:234 (batch 10, 5s timeout, 7d cache)
5. Render → Grid.tsx:12 (24/page, lazy images, Fuse.js search)

## STEP 8: Final Review

```bash
grep -o '[a-zA-Z0-9/_-]*/[a-zA-Z0-9._-]*\.[tj]sx\?' [domain].md | while read f; do
  [ -f "$f" ] || echo "Missing: $f"
done
```

**Verify**: Files documented? Deps current? Types DRY? Boundaries validated?

## STEP 9: Bug Reporting

**Summary**: X bugs, Y improvements, Z British spellings found.

**Search existing issues FIRST**:

```bash
# MCP (in Claude)
@mcp__github__search_issues query="[domain] bug" state="open"
@mcp__github__search_issues query="[domain] improvement" state="open"

# CLI (in terminal)
gh search issues "[domain] bug" --state=open --repo=WilliamAGH/williamcallahan.com
gh search issues "[domain] improvement" --state=open --repo=WilliamAGH/williamcallahan.com
```

**Ask**: "Create GitHub issues for findings not already reported?"

**If approved, create**:

```bash
# ONE bug issue (if any bugs found)
@mcp__github__create_issue
  title="fix([domain]): [summary of all bugs found]"
  body="## Bugs found in [domain] audit\n\n[list all bugs with file:line]\n\n### British English corrections\n[list any found]"
  labels="bug"

# ONE improvement issue (if any improvements found)
@mcp__github__create_issue
  title="feat([domain]): improvements from architecture audit"
  body="## Potential improvements\n\n[list all improvements with effort estimates]"
  labels="enhancement"
```

**Common mistakes**: Don't create per-bug issues. Include repo in CLI search. Use conventional commit format in titles.

## Success Criteria

✅ ZERO assumptions • 100% deps current • Every file referenced • Line numbers accurate • <30s diagram clarity • NO duplicate types • 100% validated boundaries

**REMEMBER**: Detective work. Follow EVERY thread. Find EVERY duplicate type. Validate EVERY boundary.

**Cross-References**:

- Type safety: `docs/projects/structure/linting-formatting.md`
- Server/Client: `docs/projects/structure/react-server-client.md`
- Zod v4: <https://zod.dev> or Context7 MCP
- Next.js 15/React 19: Use Context7 for current docs
