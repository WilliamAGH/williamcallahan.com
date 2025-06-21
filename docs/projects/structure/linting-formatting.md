# Architecting for 100% Type Safety: A Guide for Developers & LLMs

**Functionality:** `linting-formatting`

## 1. The Type Safety Mandate

This project enforces **100% strict TypeScript type safety**. There are no exceptions. The goal is not just to fix errors but to prevent them by design. All code must pass `bun run validate` with zero errors and zero warnings before any commit.

**The Golden Rule:**
```bash
bun run validate
```

This command is the single source of truth for code quality. It runs a comprehensive suite of checks:

1. **Biome:** Formatting and foundational linting.
2. **ESLint:** Advanced, type-aware linting.
3. **TypeScript Compiler (`tsc`):** The ultimate check for type correctness.

**Forbidden Practices:** Bypassing the type system is strictly prohibited. Never use the following, as they are signs of a deeper problem that must be fixed at its root:
```typescript
// ❌ FORBIDDEN IN ALL CASES
// @ts-ignore
// @ts-expect-error
// eslint-disable-next-line
```

---

## 2. The LLM Type Safety Playbook: Top 20 Issues & Solutions

LLMs are powerful but often struggle with the nuances of a strict TypeScript environment. This section outlines the most common failure modes and their canonical solutions within this project.

### Pillar I: Foundational TypeScript & ESLint

#### 1. The `any` Crutch (`@typescript-eslint/no-explicit-any`)

- **Problem:** LLMs use `any` as an escape hatch to avoid solving complex type errors. This effectively disables type checking.
- **Solution:** Replace `any` with `unknown`. `unknown` is a type-safe counterpart that forces you to perform validation before use.
  ```typescript
  // ❌ BAD: Loses all type safety
  const data: any = JSON.parse(jsonString);
  console.log(data.property); // Compiles, but will crash if property doesn't exist

  // ✅ GOOD: Forces validation
  const data: unknown = JSON.parse(jsonString);
  if (typeof data === 'object' && data && 'property' in data) {
    console.log((data as { property: unknown }).property);
  }
  ```

#### 2. Unsafe Operations (`@typescript-eslint/no-unsafe-*`)

- **Problem:** A direct result of using `any`. LLMs attempt to call, assign, or access members on a variable that could be anything at runtime.
- **Solution:** Validate the type *before* the operation. Zod is the preferred method.
  ```typescript
  // ❌ BAD: Unsafe member access
  function process(data: any) {
    console.log(data.name.toUpperCase());
  }

  // ✅ GOOD: Runtime validation with Zod
  import { z } from 'zod';
  const DataSchema = z.object({ name: z.string() });

  function process(data: unknown) {
    const validatedData = DataSchema.parse(data); // Throws if invalid
    console.log(validatedData.name.toUpperCase()); // 100% type-safe
  }
  ```

#### 3. Null/Undefined Blindness (`strictNullChecks`)

- **Problem:** LLMs often assume a value is present when it could be `null` or `undefined`, leading to runtime errors.
- **Solution:** Use modern JavaScript operators for safe access and fallbacks.
  ```typescript
  // ❌ BAD: Assumes user and address exist
  const city = user.address.city;

  // ✅ GOOD: Optional chaining and nullish coalescing
  const city = user?.address?.city ?? 'Default City';
  ```

#### 4. Overuse of Type Assertions (`as`)

- **Problem:** LLMs use `as` to force a type onto a variable, which can be unsafe if the underlying data doesn't match the asserted type.
- **Solution:** Prefer type narrowing (using `if` checks, `typeof`, `instanceof`) or Zod parsing over `as`. Use `as` only when you are 100% certain the type is correct and the compiler cannot infer it.
  ```typescript
  // ❌ RISKY: Trusts that the event target is an HTMLInputElement
  const value = (e.target as HTMLInputElement).value;

  // ✅ SAFER: Validate the type before assertion
  if (e.target instanceof HTMLInputElement) {
    const value = e.target.value;
  }
  ```

#### 5. Duplicate Type Definitions (`project/no-duplicate-types`)

- **Problem:** LLMs frequently redefine existing types within component files instead of importing them from a central location.
- **Solution:** All shared type definitions **MUST** reside in the `types/` directory. Always check for an existing type before creating a new one. Use the `@type-flattener` command to help consolidate duplicates.

#### 6. Unchecked Indexed Access (`noUncheckedIndexedAccess`)

- **Problem:** LLMs access array elements (`array[i]`) or object properties (`obj[key]`) assuming a value always exists, but this option makes them `T | undefined`.
- **Solution:** Always check for `undefined` before using the result.
  ```typescript
  // ❌ BAD: item could be undefined
  const item = myArray[0];
  console.log(item.toUpperCase()); // Runtime error if array is empty

  // ✅ GOOD: Check for existence
  const item = myArray[0];
  if (item !== undefined) {
    console.log(item.toUpperCase());
  }
  ```

#### 7. Incorrect Function Typing

- **Problem:** LLMs struggle with `this` context in callbacks, create vague function signatures, and miss opportunities for type inference.
- **Solution:** Be explicit. Use arrow functions to preserve `this` context, and always type parameters and return values.
  ```typescript
  // ❌ BAD: `this` is lost, return type is implicit
  class MyClass {
    doSomething() {
      setTimeout(function() { console.log(this); }, 1000); // `this` is Window or undefined
    }
  }

  // ✅ GOOD: Arrow function preserves `this`, explicit return type
  class MyClass {
    doSomething(): void {
      setTimeout(() => { console.log(this); }, 1000); // `this` is MyClass instance
    }
  }
  ```

#### 8. Generic Misuse

- **Problem:** LLMs either omit generics, making functions less reusable, or use them without proper constraints, making them unsafe.
- **Solution:** Use generics with `extends` to enforce constraints on what types can be passed in.
  ```typescript
  // ❌ BAD: Can't access .length because T could be anything
  function logLength<T>(arg: T): void {
    console.log(arg.length);
  }

  // ✅ GOOD: Constrains T to types that have a length property
  function logLength<T extends { length: number }>(arg: T): void {
    console.log(arg.length);
  }
  ```

#### 9. Literal vs. Widened Types

- **Problem:** LLMs use a general type (`string`) when a specific literal union (`'GET' | 'POST'`) is required.
- **Solution:** Use `as const` to preserve the literal type of an object, or explicitly define literal union types.
  ```typescript
  // ❌ BAD: `method` is inferred as `string`, not `"GET"`
  const req = { url: "...", method: "GET" };
  handleRequest(req.url, req.method); // Fails if handleRequest expects a literal type

  // ✅ GOOD: `as const` preserves the literal type
  const req = { url: "...", method: "GET" } as const;
  handleRequest(req.url, req.method); // Works!
  ```

#### 10. `interface` vs. `type`

- **Problem:** LLMs use these keywords interchangeably, leading to inconsistency.
- **Solution:**
  - **Use `interface`** for defining the shape of objects or classes. They can be extended and merged.
  - **Use `type`** for creating aliases for primitives, unions, intersections, tuples, and other complex types.

---

### Pillar II: Runtime Type Safety with Zod

Static types are not enough. Data from the outside world (APIs, user input, files) is untrusted. Zod is our runtime guardian.

#### 11. Template Literal Type Inference & 'Never' Types (`@typescript-eslint/restrict-template-expressions`)

- **Problem:** LLMs encounter "Invalid type 'never' of template literal expression" errors, especially in complex control flow where TypeScript's type narrowing creates unreachable code paths.
- **Root Cause:** TypeScript's control flow analysis narrows types so aggressively that certain branches become unreachable (`never`), but the code still exists and tries to use variables in template literals.
- **Common Scenarios:**
  ```typescript
  // ❌ BAD: TypeScript infers imageUrl as 'never' in the else branch
  if (typeof imageUrl === "string" && imageUrl) {
    if (isValidImageUrl(imageUrl)) {
      return imageUrl;
    } else {
      console.log(`Invalid URL: ${imageUrl}`); // Error: 'never' type
    }
  }
  ```
- **Solution Strategies:**
  1. **Explicit String Conversion:** Use `String()` to force a string type
     ```typescript
     console.log(`Invalid URL: ${String(imageUrl)}`);
     ```
  2. **Type Assertion with Comment:** When you know the type is safe
     ```typescript
     // At this point imageUrl is definitely a string (we checked above)
     console.log(`Invalid URL: ${imageUrl as string}`);
     ```
  3. **Restructure Control Flow:** Avoid deeply nested type narrowing
     ```typescript
     // ✅ GOOD: Simpler control flow
     if (typeof imageUrl !== "string" || !imageUrl) {
       console.log(`Invalid URL type: ${typeof imageUrl}`);
       continue;
     }
     
     if (!isValidImageUrl(imageUrl)) {
       console.log(`Invalid URL format: ${imageUrl}`); // No 'never' type issue
       continue;
     }
     
     return imageUrl;
     ```
  4. **Early Returns:** Eliminate else branches that cause type narrowing issues
  5. **Explicit Variable Assignment:** Break complex expressions into steps
     ```typescript
     const value = metadata[key];
     if (value && typeof value === "string") {
       const stringValue: string = value; // Explicit type annotation
       checkedTypes.push(`${key}="${stringValue}"`);
     }
     ```

#### 12. Complex Type Inference in Loops and Filters

- **Problem:** Array methods like `.filter()` and `.map()` combined with type guards can create type inference issues where TypeScript can't properly narrow types.
- **Solution:** Replace complex chained operations with explicit loops when type inference fails:
  ```typescript
  // ❌ BAD: Complex type inference can fail
  const checkedTypes = imagePriority
    .filter((key) => metadata[key] && typeof metadata[key] === "string")
    .map((key) => `${key}="${metadata[key] as string}"`) // Type assertion needed
    .join(", ");

  // ✅ GOOD: Explicit loop with clear type handling
  const checkedTypes: string[] = [];
  for (const key of imagePriority) {
    const value = metadata[key];
    if (value && typeof value === "string") {
      checkedTypes.push(`${key}="${value}"`);
    }
  }
  const checkedTypesStr = checkedTypes.join(", ");
  ```

#### 13. Neglecting Runtime Validation

- **Problem:** LLMs write code that implicitly trusts the shape of external data.
- **Solution:** **ALWAYS** parse external data with a Zod schema at the application boundary.
  ```typescript
  // lib/schemas/user.ts
  export const UserSchema = z.object({ id: z.string(), name: z.string() });

  // app/api/users/route.ts
  export async function POST(request: Request) {
    const body: unknown = await request.json();
    const user = UserSchema.parse(body); // Throws a detailed error if invalid
    // `user` is now fully typed and safe to use
  }
  ```

#### 14. Redundant TypeScript Types

- **Problem:** LLMs manually define a TypeScript `interface` and then a separate, duplicative Zod schema.
- **Solution:** Zod is the **single source of truth**. Define the schema and infer the type from it.
  ```typescript
  // ❌ BAD: Two sources of truth to maintain
  interface User { id: string; name: string; }
  const UserSchema = z.object({ id: z.string(), name: z.string() });

  // ✅ GOOD: Single source of truth
  export const UserSchema = z.object({ id: z.string(), name: z.string() });
  export type User = z.infer<typeof UserSchema>;
  ```

#### 15. Improper Error Handling

- **Problem:** LLMs use `Schema.parse()` in contexts where validation failure is expected, causing unhandled exceptions.
- **Solution:** Use `Schema.safeParse()` for a result object (`{ success: true, data: ... }` or `{ success: false, error: ... }`) that won't throw an error.
  ```typescript
  const result = UserSchema.safeParse(data);
  if (!result.success) {
    // Handle validation error, e.g., return a 400 response
    return new Response(JSON.stringify({ errors: result.error.flatten() }), { status: 400 });
  }
  // result.data is now available and type-safe
  ```

#### 16. Ignoring Transformations & Coercion

- **Problem:** LLMs perform manual data transformation after parsing, which could be handled by Zod.
- **Solution:** Use Zod's built-in methods to transform data during parsing.
  - `.transform()`: For complex transformations (e.g., string to Date).
  - `.coerce`: For simple type coercions (e.g., `z.coerce.number()` turns a string into a number).
  - `.default()`: To provide a default value for optional fields.

#### 17. Underutilizing `z.discriminatedUnion`

- **Problem:** LLMs write complex `if/else` or `switch` statements to differentiate between object variants.
- **Solution:** Use `z.discriminatedUnion` on a shared literal property to create a powerful and type-safe parser that handles the narrowing automatically.

---

### Pillar III: Framework-Specific Challenges (Next.js)

#### 18. Untyped Route Handlers & Page Props

- **Problem:** LLMs often leave `params` and `searchParams` in pages and layouts as `any`.
- **Solution:** Explicitly type them.
  ```typescript
  // app/blog/[slug]/page.tsx
  type PageProps = {
    params: { slug: string };
    searchParams: { [key: string]: string | string[] | undefined };
  };

  export default function Page({ params, searchParams }: PageProps) {
    // params.slug is a string
  }
  ```

#### 19. Unsafe Server Action Payloads

- **Problem:** LLMs directly access `FormData` values in Server Actions without validation.
- **Solution:** Use Zod to parse the `FormData` object.
  ```typescript
  'use server';
  import { z } from 'zod';

  const FormSchema = z.object({ name: z.string().min(1) });

  export async function myAction(formData: FormData) {
    const validatedFields = FormSchema.safeParse({
      name: formData.get('name'),
    });

    if (!validatedFields.success) {
      // Handle error
      return { error: "Invalid name" };
    }
    // Use validatedFields.data
  }
  ```

#### 20. Prop-drilling `any` from Server to Client

- **Problem:** Data fetched in a Server Component loses its type when passed to a Client Component.
- **Solution:** Define a shared type using `z.infer` and use it to type the props of the Client Component. Remember that complex objects like `Date` or `Map` cannot be passed as props directly.
  ```typescript
  // lib/schemas/shared.ts
  export const DataSchema = z.object({ /* ... */ });
  export type DataType = z.infer<typeof DataSchema>;

  // components/client-component.tsx
  'use client';
  import type { DataType } from '@/lib/schemas/shared';
  export function MyClientComponent({ data }: { data: DataType }) { /* ... */ }

  // app/page.tsx (Server Component)
  import { MyClientComponent } from '@/components/client-component';
  import { DataSchema } from '@/lib/schemas/shared';
  async function getData() {
    const res = await fetch(...);
    return DataSchema.parse(await res.json());
  }
  export default async function Page() {
    const data = await getData();
    return <MyClientComponent data={data} />;
  }
  ```

#### 21. Ignoring Statically Typed Links

- **Problem:** With `typedRoutes` enabled, LLMs may still use unsafe string concatenation for links, defeating the purpose of the feature.
- **Solution:** Use valid route literals. For dynamic segments, use template literals or cast with `as Route`.
  ```typescript
  import Link from 'next/link';
  import type { Route } from 'next';

  // ✅ GOOD
  <Link href="/blog/my-post" />
  <Link href={`/blog/${slug}`} />

  // ✅ Also GOOD for complex dynamic routes
  const dynamicRoute = ('/blog/' + slug) as Route;
  <Link href={dynamicRoute} />
  ```

#### 22. Mishandling `generateStaticParams` Return Types

- **Problem:** LLMs return an array of strings or incorrectly shaped objects from `generateStaticParams`.
- **Solution:** The function **MUST** return an array of objects where each object's keys match the dynamic segment names.
  ```typescript
  // For a route like /blog/[slug]
  export async function generateStaticParams() {
    const posts = await fetch(...).then((res) => res.json());
    // ❌ BAD: return posts.map(post => post.slug);
    // ✅ GOOD:
    return posts.map((post) => ({
      slug: post.slug,
    }));
  }

---

### Pillar IV: Next.js & React Frontend Playbook

This section addresses the most common infrastructure and architectural issues seen in modern Next.js and React development. Adhering to these patterns is critical for performance, maintainability, and type safety.

#### 23. Client vs. Server Component Confusion

- **Problem**: Using client-side hooks (`useState`, `useEffect`) or event handlers in a Server Component, or failing to use Server Components for data fetching.
- **Solution**: Adhere to a strict component model.
  - **Server Components (Default):** Use for data fetching, accessing backend resources directly (e.g., databases, file system), and keeping sensitive logic off the client.
  - **Client Components (`'use client'`):** Use only when you need interactivity, such as `onClick` handlers, or hooks like `useState`, `useEffect`, and `useContext`.
  - **Pattern**: Fetch data in a Server Component and pass it as props to a Client Component. This minimizes the client-side JavaScript bundle.

#### 24. Improper Data Fetching & Caching

- **Problem**: Using `useEffect` for initial data fetching (CRA pattern), creating request waterfalls, or misunderstanding Next.js caching.
- **Solution**: Leverage Next.js's extended `fetch` API and React Server Components.
  - **Fetch in Server Components**: Perform data fetching directly in `async` Server Components.
  - **Parallel Fetching**: Initiate multiple data fetches concurrently with `Promise.all` to avoid sequential request waterfalls.
  - **Caching**: Use `fetch` with revalidation options (`{ next: { revalidate: 3600 } }`) for incremental static regeneration. Use `React.cache` or `unstable_cache` to deduplicate requests for the same data within a render pass.

#### 25. State Management & Immutability Errors

- **Problem**: Directly mutating state variables (objects or arrays) instead of creating new instances, leading to missed re-renders and bugs.
- **Solution**: Always treat state as immutable.
  - **Arrays**: Use non-mutating methods like `.map()`, `.filter()`, or the spread syntax (`[...arr, newItem]`) instead of `.push()` or `.splice()`.
  - **Objects**: Use the spread syntax (`{ ...obj, property: newValue }`) to create a new object.
  - **For complex state**: Use the `useImmer` hook, which allows you to write "mutating" logic on a draft state while ensuring the final update is immutable.

#### 26. Prop Drilling vs. Context

- **Problem**: Passing props through many intermediate components that don't use them.
- **Solution**: Use React Context for global state that is accessed by many components at different levels of the tree (e.g., theme, user authentication).
  - **Implementation**: Create the context provider as a Client Component (`'use client'`) and wrap it around your layout in a Server Component. This allows Server Components to render inside, while Client Components deep in the tree can consume the context.

#### 27. Large Bundle Sizes & Lazy Loading

- **Problem**: Shipping large, monolithic JavaScript bundles that slow down initial page load.
- **Solution**: Aggressively code-split and lazy load components.
  - **`next/dynamic`**: Use `dynamic()` to lazy-load Client Components that are not immediately visible or are heavy.
  - **Example**: `const HeavyComponent = dynamic(() => import('../components/Heavy'), { ssr: false });`
  - **When to use**: Modals, components below the fold, or components that depend on heavy libraries.

#### 28. Hydration Errors

- **Problem**: A mismatch between the HTML rendered on the server and the initial render on the client, often caused by using browser-only APIs (`window`, `localStorage`) or dynamic values (`Math.random()`, `new Date()`) directly in the component body.
- **Solution**: Ensure the first client-side render matches the server-rendered HTML.
  - **`useEffect`**: Move any logic that relies on browser-only APIs into a `useEffect` hook, which only runs on the client after hydration.
  - **`suppressHydrationWarning`**: As a last resort for unavoidable mismatches (e.g., timestamps), use this prop on the element.
  - **Dynamic Imports**: Use `dynamic(() => ..., { ssr: false })` for components that are entirely client-side and cause hydration issues.

#### 29. SEO and Metadata Management

- **Problem**: Incorrectly managing `<head>` tags, leading to poor SEO.
- **Solution**: Use the built-in Metadata API in the App Router.
  - **Static Metadata**: Export a `metadata` object from a `layout.js` or `page.js` file.
  - **Dynamic Metadata**: Export an `async` function named `generateMetadata` that fetches data and returns a metadata object.

#### 30. Environment Variable Exposure

- **Problem**: Accidentally exposing server-side environment variables to the client.
- **Solution**: Use the `NEXT_PUBLIC_` prefix for any environment variable that needs to be accessible in the browser. Variables without this prefix are only available on the server, preventing leaks.

#### 31. Server Action Error Handling

- **Problem**: Server Actions fail without providing feedback to the user.
- **Solution**: Use React's `useActionState` hook in Client Components. It provides state for displaying errors and a `pending` status for disabling form elements during submission. The server action's signature must be updated to accept the previous state as its first argument.

#### 32. Unhandled Promise Rejections in Server Components

- **Problem**: An `async` Server Component throws an error during data fetching, crashing the render.
- **Solution**: Wrap data-fetching Server Components in a React `<Suspense>` boundary and provide an `error.js` file. The `error.js` file defines a React Error Boundary that will catch the error and display a fallback UI, preventing a full-page crash.

---

### Pillar V: Tool-Assisted Debugging & Resolution

This project is equipped with powerful MCP (Model Context Protocol) servers that provide tools for advanced debugging and information retrieval. LLMs and developers **must** leverage these tools to resolve issues efficiently.

- **`Context7` & `DeepWiki`**: When encountering an error related to a specific library (e.g., Next.js, React, Zod), use the `use_mcp_tool` with the `github.com/upstash/context7-mcp` server to fetch relevant documentation and code snippets.
  - **Workflow**:
    1. Identify the library causing the issue.
    2. Use `resolve-library-id` to get the correct ID for the library.
    3. Use `get-library-docs` with the ID and a specific topic to get targeted help.
- **Web Search (`brave-search`, `jina-ai-mcp-server`)**: For novel or undocumented errors, use the web search tools to find blog posts, GitHub issues, or Stack Overflow discussions.
- **LLM Prompt for Tool Use**: "This error relates to [Library Name]. Use the Context7 MCP tool to find documentation on [specific topic, e.g., 'React useOptimistic hook']. If that fails, use the Brave Search tool to search for '[error message]'."

By systematically using these tools, we can ensure that solutions are based on the latest documentation and community best practices, rather than outdated training data.

---

### Pillar VI: Why This Matters for LLM Collaboration

LLMs perform best in predictable, well-structured environments. A loosely-typed JavaScript codebase is ambiguous, forcing the LLM to guess. In contrast, this project's strict TypeScript setup provides clear, machine-readable rules that guide the LLM toward correct, type-safe code.

By enforcing these patterns, we reduce ambiguity and create a "happy path" for AI-assisted development, leading to higher quality code and fewer iterations.

---

### Pillar VII: Connecting Rules to `tsconfig.json`

Our type safety rules are not arbitrary; they are directly enforced by the TypeScript compiler settings in `tsconfig.json`. Understanding this connection is key to diagnosing errors.

- **`"strict": true`**: This is the master switch. It enables all strict type-checking options, including:
  - **`"strictNullChecks": true`**: The reason for **Issue #3**. It forces us to handle `null` and `undefined` explicitly.
  - **`"noImplicitAny": true`**: The reason for **Issue #1**. It disallows the `any` type unless explicitly declared.
- **`"noUncheckedIndexedAccess": true`**: The direct cause of **Issue #6**. It adds `| undefined` to any array or object property access, forcing a check.
- **`"noImplicitOverride": true`**: Requires the `override` keyword on methods that override a base class method, preventing accidental overrides.

---

### Pillar VIII: Systematic Debugging Workflow for Template Literal Issues

When encountering `@typescript-eslint/restrict-template-expressions` errors, especially "Invalid type 'never'", follow this diagnostic workflow:

#### Step 1: Identify the Exact Location

```bash
# Get the exact line causing the issue
sed -n '[LINE_NUMBER]p' [FILE_PATH]
```

#### Step 2: Analyze the Control Flow

- **Trace backwards** from the error line to understand how TypeScript narrowed the type
- **Look for type guards** (`typeof`, `instanceof`, truthiness checks) that created the narrowing
- **Identify unreachable branches** where TypeScript inferred `never`

#### Step 3: Apply the Appropriate Fix Strategy

**For Simple Cases:**
```typescript
// Use String() conversion
console.log(`Value: ${String(potentiallyNeverValue)}`);
```

**For Complex Control Flow:**
```typescript
// Restructure to use early returns instead of nested if/else
if (typeof value !== "string") {
  console.log(`Invalid type: ${typeof value}`);
  return;
}

// Now value is definitely a string in all subsequent code
console.log(`Valid value: ${value}`);
```

**For Loop/Filter Scenarios:**
```typescript
// Replace complex chained operations with explicit loops
const results: string[] = [];
for (const item of items) {
  if (item && typeof item === "string") {
    results.push(`${key}="${item}"`); // Clear type inference
  }
}
```

#### Step 4: Verify the Fix

```bash
bun run validate
```

#### Common Anti-Patterns to Avoid

- **DON'T** use `as any` to bypass the error
- **DON'T** use `// @ts-ignore` to suppress the warning
- **DON'T** add unnecessary type assertions without understanding why TypeScript inferred `never`
- **DO** understand the control flow that led to the `never` type
- **DO** prefer restructuring code over type assertions when possible

---

### Pillar IX: Glossary of Key Terms

- **Structural Typing:** TypeScript's system for determining type compatibility based on the shape of an object (its properties and methods), not its explicit name or `class` declaration.
- **Type Narrowing:** The process of refining a broad type (like `string | number` or `unknown`) to a more specific one within a certain code block, usually after a runtime check like `typeof` or `instanceof`.
- **Type Inference:** TypeScript's ability to automatically determine the type of a variable based on its value or usage, without requiring an explicit type annotation.
- **Generics (`<T>`):** A tool for creating reusable components (functions, classes, types) that can work with a variety of types while maintaining type safety.
- **Literal Types:** Types that represent a specific, exact value (e.g., `'GET'`, `42`). They are more specific than their primitive counterparts (`string`, `number`).
- **`as const`:** A type assertion that tells TypeScript to infer the most specific literal type possible for an object or array, making its properties `readonly`.
- **Zod:** A TypeScript-first schema declaration and validation library used in this project for all runtime data validation.
- **Dependency Inversion:** An architectural principle where high-level modules do not depend on low-level modules directly, but both depend on a shared abstraction (like a `types/` file). This is a key strategy for breaking circular dependencies.
- **Barrel File (`index.ts`):** A file that re-exports modules from a directory, providing a single, clean entry point for consumers of that directory. Our `types/index.ts` is an example.
- **Control Flow Analysis:** TypeScript's ability to track how types change through conditional statements, leading to type narrowing that can sometimes result in `never` types in unreachable branches.

---

### Pillar X: Connecting Rules to `tsconfig.json`

Our type safety rules are not arbitrary; they are directly enforced by the TypeScript compiler settings in `tsconfig.json`. Understanding this connection is key to diagnosing errors.

- **`"strict": true`**: This is the master switch. It enables all strict type-checking options, including:
  - **`"strictNullChecks": true`**: The reason for **Issue #3**. It forces us to handle `null` and `undefined` explicitly.
  - **`"noImplicitAny": true`**: The reason for **Issue #1**. It disallows the `any` type unless explicitly declared.
- **`"noUncheckedIndexedAccess": true`**: The direct cause of **Issue #6**. It adds `| undefined` to any array or object property access, forcing a check.
- **`"noImplicitOverride": true`**: Requires the `override` keyword on methods that override a base class method, preventing accidental overrides.

---

### Pillar XI: Advanced Topics & Troubleshooting

#### 35. Interpreting Vague Type Errors: Symptoms of Deeper Issues

- **Problem:** LLMs encounter a cryptic error like `Type 'A' is not assignable to type 'B'` or `Cannot read properties of undefined (reading '...')` and attempt to fix it locally, often with an unsafe type assertion. This is a "false positive" in the sense that the error message masks the real root cause.
- **Symptom vs. Cause:** A vague type error is often a **symptom** of a deeper architectural problem. The most common causes are:
    1. **Circular Dependencies:** Module A imports Module B, and Module B imports Module A. At runtime, one of them will be `undefined` when imported, causing the type to be missing.
    2. **Failed Data Fetch:** An API call or database query failed silently and returned `null` or `undefined` instead of the expected data structure.
- **Solution:** When faced with a vague error, **do not fix the symptom**. Investigate the entire data and import flow.
  - **Trace the Imports:** Check the import graph for the files involved. Do they import each other?
  - **Trace the Data:** Where does the variable in question get its value? Log the value to the console right before the error occurs to see if it's `undefined`.
  - **Fix the Root Cause:** Refactor the circular dependency or add proper error handling to the data fetch.

#### 36. Resolving Circular Dependencies

- **Problem:** A direct or indirect circular import between modules (`A -> B -> A`) results in one of the imports being `undefined` at runtime, leading to the vague type errors described above.
- **Solution:** Refactor the dependency graph to be unidirectional.
    1. **Dependency Inversion:** Create a third, lower-level module that both A and B can import from. This is the most common pattern. For example, move shared types to a file in `types/` and have both modules import from there.
    2. **Centralized Barrel File (`index.ts`):** For types, our project uses barrel files (`types/index.ts`) to export all types from a single point. This prevents components from importing types from each other directly.
    3. **Code Reorganization:** If two components depend on each other, extract the shared logic or types into a new, dedicated utility or hook that both can import from.
- **LLM Prompt:** "When a type is unexpectedly `undefined`, analyze the import graph of the files involved to check for circular dependencies."
