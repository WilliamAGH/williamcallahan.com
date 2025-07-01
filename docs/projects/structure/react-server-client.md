# React Server/Client Architecture

This document outlines the architectural patterns, best practices, and critical rules for React 19 Server Components (RSC) and Next.js 15 server/client coordination.

## Core Objective

Provide comprehensive guidance for properly implementing server/client boundaries, streaming patterns, environment variable security, and async component patterns in React 19 and Next.js 15 applications.

## Key Components

### Server Component Architecture

1. **`app/` directory structure**
   - All components are Server Components by default
   - No `"use client"` directive needed for server-only components
   - Direct access to databases, file system, and server-side APIs
   - Zero JavaScript sent to client for server-only components

2. **Client Component Boundaries**
   - Components with `"use client"` directive at the top
   - Required for: `useState`, `useEffect`, event handlers, browser APIs
   - Creates a module graph boundary - all imports become client components
   - Should be pushed as deep into the component tree as possible

3. **Composition Patterns**
   - Server Components can be passed as children to Client Components
   - Client Components cannot import Server Components directly
   - Use component composition to minimize client bundle size

## Critical Do's and Don'ts

### ✅ DO's - Server/Client Coordination

1. **DO fetch data in Server Components**
   ```tsx
   // Server Component - Direct database access
   export default async function ProductList() {
     const products = await db.query('SELECT * FROM products')
     return <ProductGrid products={products} />
   }
   ```

2. **DO use Suspense boundaries for streaming**
   ```tsx
   <Suspense fallback={<LoadingSkeleton />}>
     <AsyncServerComponent />
   </Suspense>
   ```

3. **DO pass Server Components as children to Client Components**
   ```tsx
   // Client Component
   'use client'
   export function Modal({ children }) {
     return <div className="modal">{children}</div>
   }
   
   // Server Component usage
   <Modal>
     <ServerContent /> {/* This remains a Server Component */}
   </Modal>
   ```

4. **DO use parallel data fetching**
   ```tsx
   export default async function Page() {
     // Start all fetches in parallel
     const userPromise = getUser()
     const postsPromise = getPosts()
     
     // Wait for all to complete
     const [user, posts] = await Promise.all([userPromise, postsPromise])
     
     return <Dashboard user={user} posts={posts} />
   }
   ```

5. **DO validate environment variables**
   ```tsx
   // Server-only validation
   const apiKey = process.env.SECRET_API_KEY
   if (!apiKey) throw new Error('SECRET_API_KEY is required')
   
   // Client-safe config
   const publicUrl = process.env.NEXT_PUBLIC_API_URL
   ```

### ❌ DON'Ts - Common Pitfalls

1. **DON'T use hooks in Server Components**
   ```tsx
   // ❌ WRONG - Server Component
   export default function ServerComponent() {
     const [state, setState] = useState() // Error!
     useEffect(() => {}) // Error!
   }
   ```

2. **DON'T expose secrets with NEXT_PUBLIC_**
   ```tsx
   // ❌ NEVER DO THIS
   NEXT_PUBLIC_DATABASE_URL=postgres://... 
   NEXT_PUBLIC_API_SECRET=sk_live_...
   
   // ✅ Keep secrets server-only
   DATABASE_URL=postgres://...
   API_SECRET=sk_live_...
   ```

3. **DON'T pass non-serializable props from Server to Client**
   ```tsx
   // ❌ WRONG - Functions can't be serialized
   <ClientComponent onClick={() => console.log('error')} />
   
   // ✅ RIGHT - Handle events client-side
   'use client'
   function ClientComponent() {
     const handleClick = () => console.log('works')
     return <button onClick={handleClick}>Click</button>
   }
   ```

4. **DON'T make Client Components async**
   ```tsx
   // ❌ WRONG
   'use client'
   export default async function ClientComponent() {
     const data = await fetch() // Error!
   }
   
   // ✅ RIGHT - Use useEffect or SWR/React Query
   'use client'
   export default function ClientComponent() {
     const { data } = useSWR('/api/data', fetcher)
   }
   ```

5. **DON'T await Promises on the server that should stream**
   ```tsx
   // ❌ Blocks entire component
   export default async function Page() {
     const slowData = await fetchSlowData() // Blocks!
     return <div>{slowData}</div>
   }
   
   // ✅ Stream with Suspense
   export default function Page() {
     return (
       <Suspense fallback={<Loading />}>
         <SlowDataComponent /> {/* Async component */}
       </Suspense>
     )
   }
   ```

## Environment Variable Security Matrix

| Variable Type | Server Access | Client Access | Build-Time Inlined | Use Cases |
|---------------|---------------|---------------|-------------------|-----------|
| `PRIVATE_KEY` | ✅ Yes | ❌ No | ❌ No | API keys, secrets, passwords |
| `NEXT_PUBLIC_*` | ✅ Yes | ✅ Yes | ✅ Yes | Public API endpoints, analytics IDs |

### Security Rules

1. **Build-time inlining**: NEXT_PUBLIC_ variables are permanently baked into the client bundle at build time
2. **No runtime updates**: Changing NEXT_PUBLIC_ values requires a rebuild
3. **Git safety**: Always add `.env.local` to `.gitignore`
4. **Production secrets**: Use proper secrets management (AWS Secrets Manager, Vault, etc.)

## Streaming & Async Patterns

### Progressive Enhancement Strategy

```tsx
// 1. Instant shell rendering
export default function Layout({ children }) {
  return (
    <div>
      <Header /> {/* Static, renders immediately */}
      <Nav />    {/* Static, renders immediately */}
      {children}
    </div>
  )
}

// 2. Progressive content streaming
export default function Page() {
  return (
    <>
      <HeroSection /> {/* Static content first */}
      
      <Suspense fallback={<ProductsSkeleton />}>
        <ProductList /> {/* Async, streams when ready */}
      </Suspense>
      
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews /> {/* Async, streams independently */}
      </Suspense>
    </>
  )
}
```

### Data Loading Patterns

1. **Preload Pattern**
   ```tsx
   // Preload function starts fetch early
   export const preload = (id: string) => {
     void getProduct(id) // Start loading, don't await
   }
   
   export default async function ProductPage({ params }) {
     preload(params.id) // Start early
     
     const user = await getUser() // Do other work
     
     return <ProductDetails id={params.id} user={user} />
   }
   ```

2. **Streaming Promises Pattern**
   ```tsx
   // Server Component
   async function Comments({ postId }) {
     const commentsPromise = getComments(postId) // Don't await!
     
     return (
       <Suspense fallback={<CommentsSkeleton />}>
         <CommentsList commentsPromise={commentsPromise} />
       </Suspense>
     )
   }
   
   // Client Component with use()
   'use client'
   function CommentsList({ commentsPromise }) {
     const comments = use(commentsPromise) // Suspends here
     return comments.map(c => <Comment key={c.id} {...c} />)
   }
   ```

## Next.js 15 Breaking Changes

### Async Request APIs

All request-specific APIs are now async in Next.js 15:

```tsx
// ❌ OLD (Next.js 14)
export default function Page({ params, searchParams }) {
  const { id } = params
  const { sort } = searchParams
}

// ✅ NEW (Next.js 15)
export default async function Page({ params, searchParams }) {
  const { id } = await params
  const { sort } = await searchParams
}

// Also applies to:
// - headers()
// - cookies()
// - draftMode()
```

### Caching Changes

```tsx
// Next.js 15 - No default caching
const data = await fetch('/api/data') // Not cached by default

// Opt-in to caching
const data = await fetch('/api/data', {
  next: { revalidate: 3600 } // Cache for 1 hour
})

// Or use unstable_cache
import { unstable_cache } from 'next/cache'

const getCachedData = unstable_cache(
  async () => fetchData(),
  ['cache-key'],
  { revalidate: 3600 }
)
```

## Error Boundary Patterns

### Server Component Errors

```tsx
// app/error.tsx - Catches errors in server components
'use client'
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

### Global Error Handling

```tsx
// app/global-error.tsx - Catches root layout errors
'use client'
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
```

## Performance Optimization Checklist

- [ ] Server Components used for all non-interactive UI
- [ ] Client Components only where interactivity needed
- [ ] Suspense boundaries for async content
- [ ] Parallel data fetching implemented
- [ ] Preload pattern for critical data
- [ ] Progressive enhancement with instant shell
- [ ] No secrets in NEXT_PUBLIC_ variables
- [ ] Error boundaries at appropriate levels
- [ ] Loading states for all async operations
- [ ] Streaming configured for large responses

## Related Documentation

- [app-layout.md](./app-layout.md) - Root layout and provider setup
- [caching.md](./caching.md) - Caching strategies and implementation
- [linting-formatting.md](./linting-formatting.md) - Type safety and code quality
- [state-theme-window-providers.md](./state-theme-window-providers.md) - Client-side state management

## References

- [React Server Components Documentation](https://react.dev/reference/rsc/server-components)
- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [Next.js 15 Migration Guide](https://nextjs.org/docs/app/building-your-application/upgrading/version-15)
