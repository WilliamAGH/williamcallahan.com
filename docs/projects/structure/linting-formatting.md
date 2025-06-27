# Architecting for 100% Type Safety: Developers & LLMs Guide

**Functionality:** `linting-formatting`

## Core Mandate

This project enforces **100% strict TypeScript type safety** with zero exceptions. All code must pass `bun run validate` with zero errors and warnings.

```bash
bun run validate  # Golden rule - runs Biome, ESLint, and tsc
```

## Forbidden Practices

```typescript
// ❌ NEVER USE - No exceptions
// @ts-ignore
// @ts-expect-error  
// eslint-disable-next-line
const _unused = value;  // No underscore prefixes
```

### Handling Unused Variables

```typescript
// ❌ DON'T
const { buffer: _, ...metadata } = s3Result;

// ✅ DO
const { buffer, ...metadata } = s3Result;
void buffer;  // Explicitly mark as unused
```

## Top TypeScript Issues & Solutions

### 1. The `any` Trap

```typescript
// ❌ DON'T
const data: any = JSON.parse(jsonString);
console.log(data.property);  // No type safety

// ✅ DO
const data: unknown = JSON.parse(jsonString);
if (typeof data === 'object' && data && 'property' in data) {
  console.log((data as { property: unknown }).property);
}
```

### 2. Unsafe Operations

```typescript
// ❌ DON'T
function process(data: any) {
  console.log(data.name.toUpperCase());
}

// ✅ DO - Validate with Zod
const DataSchema = z.object({ name: z.string() });
function process(data: unknown) {
  const validatedData = DataSchema.parse(data);
  console.log(validatedData.name.toUpperCase());
}
```

### 3. Null/Undefined Handling

```typescript
// ❌ DON'T
const city = user.address.city;

// ✅ DO
const city = user?.address?.city ?? 'Default City';
```

### 4. Type Assertions

```typescript
// ❌ DON'T
const value = (e.target as HTMLInputElement).value;

// ✅ DO
if (e.target instanceof HTMLInputElement) {
  const value = e.target.value;
}
```

### 5. Duplicate Types

**Rule:** All shared types MUST be in `types/` directory. Check existing types before creating new ones.

### 6. Unchecked Array Access

```typescript
// ❌ DON'T
const item = myArray[0];
console.log(item.toUpperCase());  // Could crash

// ✅ DO
const item = myArray[0];
if (item !== undefined) {
  console.log(item.toUpperCase());
}
```

### 7. Function Context

```typescript
// ❌ DON'T
class MyClass {
  doSomething() {
    setTimeout(function() { console.log(this); }, 1000);  // Lost context
  }
}

// ✅ DO
class MyClass {
  doSomething(): void {
    setTimeout(() => { console.log(this); }, 1000);  // Preserves context
  }
}
```

### 8. Generic Constraints

```typescript
// ❌ DON'T
function logLength<T>(arg: T): void {
  console.log(arg.length);  // Error: T might not have length
}

// ✅ DO
function logLength<T extends { length: number }>(arg: T): void {
  console.log(arg.length);
}
```

### 9. Literal Types

```typescript
// ❌ DON'T
const req = { url: "...", method: "GET" };
handleRequest(req.url, req.method);  // method is string, not "GET"

// ✅ DO
const req = { url: "...", method: "GET" } as const;
handleRequest(req.url, req.method);  // method is "GET"
```

### 10. Interface vs Type

- **`interface`**: For object shapes, classes (can extend/merge)
- **`type`**: For primitives, unions, intersections, tuples

## Template Literal & Never Type Issues

### 11. Template Literal Never Types

```typescript
// ❌ Problem: TypeScript narrows to 'never'
if (typeof imageUrl === "string" && imageUrl) {
  if (isValidImageUrl(imageUrl)) {
    return imageUrl;
  } else {
    console.log(`Invalid URL: ${imageUrl}`);  // Error: 'never' type
  }
}

// ✅ Solution 1: String conversion
console.log(`Invalid URL: ${String(imageUrl)}`);

// ✅ Solution 2: Restructure control flow
if (typeof imageUrl !== "string" || !imageUrl) {
  console.log(`Invalid URL type: ${typeof imageUrl}`);
  continue;
}
if (!isValidImageUrl(imageUrl)) {
  console.log(`Invalid URL format: ${imageUrl}`);  // No 'never' issue
  continue;
}
return imageUrl;
```

### 12. Complex Type Inference

```typescript
// ❌ DON'T - Complex chains fail inference
const checkedTypes = imagePriority
  .filter((key) => metadata[key] && typeof metadata[key] === "string")
  .map((key) => `${key}="${metadata[key] as string}"`)
  .join(", ");

// ✅ DO - Explicit loops
const checkedTypes: string[] = [];
for (const key of imagePriority) {
  const value = metadata[key];
  if (value && typeof value === "string") {
    checkedTypes.push(`${key}="${value}"`);
  }
}
```

## Zod v4 Best Practices

### 13. Runtime Validation

```typescript
// Always validate at boundaries
export async function POST(request: Request) {
  const body: unknown = await request.json();
  const user = UserSchema.parse(body);  // Validates or throws
}
```

### 14. Single Source of Truth

```typescript
// ❌ DON'T - Duplicate definitions
interface User { id: string; name: string; }
const UserSchema = z.object({ id: z.string(), name: z.string() });

// ✅ DO - Infer from schema
export const UserSchema = z.object({ id: z.string(), name: z.string() });
export type User = z.infer<typeof UserSchema>;
```

### 15. Safe Parsing

```typescript
const result = UserSchema.safeParse(data);
if (!result.success) {
  return new Response(JSON.stringify({ errors: result.error.flatten() }), { status: 400 });
}
// result.data is type-safe
```

### 16. Zod v4 Top-Level Validators

```typescript
// ✅ DO - v4 pattern (tree-shakeable)
z.email();
z.uuid();
z.url();

// ❌ DON'T - Old pattern (deprecated)
z.string().email();
z.string().uuid();
```

## Next.js 15 Type Safety

### 17. Async Route Params

```typescript
// Next.js 15 - params are now async
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const search = await searchParams;
  const validSlug = z.string().min(1).parse(slug);
}
```

### 18. Server Component Caching

```typescript
// Use 'use cache' directive
async function getUsers() {
  'use cache';
  const response = await fetch('https://api.example.com/users');
  const data = await response.json();
  return UserSchema.array().parse(data);
}
```

### 19. Route Handler Validation

```typescript
const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const result = QuerySchema.safeParse(searchParams);
  
  if (!result.success) {
    return Response.json(
      { error: 'Invalid query parameters', issues: result.error.flatten() },
      { status: 400 }
    );
  }
}
```

### 20. Fetch Caching Changes

```typescript
// ❌ OLD - Cached by default in v14
const res = await fetch('https://api.example.com/data');

// ✅ NEW - Explicit caching in v15
const cached = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 }  // Cache for 1 hour
});
```

## React Best Practices

### 21. Server vs Client Components

- **Server (default)**: Data fetching, backend access, no hooks/handlers
- **Client (`'use client'`)**: Interactivity, hooks, event handlers

### 22. Data Fetching

```typescript
// ✅ DO - Parallel fetching in Server Components
const [users, posts] = await Promise.all([
  fetch('/api/users').then(r => r.json()),
  fetch('/api/posts').then(r => r.json())
]);
```

### 23. State Immutability

```typescript
// ❌ DON'T
state.items.push(newItem);

// ✅ DO
setState([...state.items, newItem]);
```

### 24. Dynamic Imports

```typescript
const HeavyComponent = dynamic(() => import('../components/Heavy'), { 
  ssr: false 
});
```

### 25. Hydration Safety

```typescript
// Move browser APIs to useEffect
useEffect(() => {
  const stored = localStorage.getItem('key');
  // ...
}, []);
```

## Debugging Workflows

### Module Resolution Errors (TS2307, TS2305)

1. Check if path exists: `ls -d lib/data/read/`
2. Find correct location: `grep -r "function getBookmarks" lib/`
3. Update import path
4. Check for circular dependencies: `npx dpdm --tree --warning false ./src`

### Unsafe Type Errors

1. Identify the unsafe variable
2. Fix the source (often a failed import)
3. Validate with Zod:
   ```typescript
   const LogoResultSchema = z.object({ success: z.boolean() });
   const parsed = LogoResultSchema.safeParse(result);
   if (parsed.success && parsed.data.success) {
     // Safe to use
   }
   ```

## Circular Dependency Prevention

### Zod Schema Organization

```
lib/
  schemas/          # All Zod schemas
    base.ts        # Shared base schemas
    user.ts        # Domain-specific schemas
  validators/      # Validation functions
types/
  user.ts          # Type definitions (z.infer only)
```

### Key Principles

1. Use `import type` for Zod type imports
2. Move shared constants to `lib/constants.ts`
3. Never re-export schemas from `types/`
4. Place validation at API boundaries

## tsconfig.json Enforcement

Key settings enforcing our rules:

- `"strict": true` - Master switch for all strict checks
- `"strictNullChecks": true` - Forces null/undefined handling
- `"noImplicitAny": true` - Bans implicit any
- `"noUncheckedIndexedAccess": true` - Makes array access safe
- `"noImplicitOverride": true` - Requires override keyword

## MCP Tools for Resolution

When stuck, use:

1. **Context7**: `resolve-library-id` → `get-library-docs` for library docs
2. **Web Search**: Brave Search for novel errors
3. **Script**: `analyze-circular-deps.ts` for dependency analysis

## Quick Reference Tables

### Type Safety Checklist

| Rule | Check |
|------|-------|
| No `any` types | ✓ Replace with `unknown` |
| No `@ts-ignore` | ✓ Fix root cause |
| No underscore prefixes | ✓ Use `void` operator |
| Validate external data | ✓ Use Zod schemas |
| Check array access | ✓ Handle undefined |
| Type function returns | ✓ Explicit return types |

### Zod v4 Migration

| Old (v3) | New (v4) |
|----------|----------|
| `z.string().email()` | `z.email()` |
| `z.string().uuid()` | `z.uuid()` |
| `z.string().url()` | `z.url()` |
| Complex recursion | Use getter pattern |

### Next.js 15 Changes

| Feature | v14 | v15 |
|---------|-----|-----|
| Route params | Sync | `Promise<{}>` |
| Default caching | Enabled | Opt-in with `'use cache'` |
| Fetch caching | Default | Explicit `next: { revalidate }` |

Remember: **Zero tolerance for type safety violations. Every line must be provably correct.**
