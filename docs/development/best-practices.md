# Development Best Practices
@module docs/development/best-practices.md

## Dependency Management

### Preventing Circular Dependencies

The project uses `madge` to detect circular dependencies. Run this check before committing:

```bash
npx madge --circular --extensions ts,tsx .
```

For visualization of the dependency graph:
```bash
npx madge --image graph.svg --extensions ts,tsx .
```

#### Best Practices

1. Barrel File Usage
   - ✅ Use barrel files (index.ts) only for exposing public APIs
   - ❌ Don't import from barrel files within the same feature
   - ✅ Use direct imports for internal feature components

2. Component Organization
   - Keep related components in feature directories
   - Use clear naming conventions for server/client components
   - Document dependencies and import patterns
   - Follow Next.js 14 conventions for client/server components

3. Regular Checks
   - Run circular dependency checks before commits
   - Review dependency graphs for complex features
   - Document any necessary circular dependencies

#### Example Structure

```typescript
// feature/
//   ├── index.ts         // Public API exports only
//   ├── component.tsx    // Main component
//   ├── server.tsx      // Server components
//   └── client.tsx      // Client components

// Good: Direct imports for internal use
import { ServerComponent } from './server';
import { ClientComponent } from './client';

// Bad: Importing through barrel file within same feature
import { ServerComponent } from './index';  // Risk of circular dependency
```

### Common Patterns to Avoid

1. Circular Dependencies Through Barrel Files
```typescript
// feature/index.ts
export { Component } from './component';

// feature/component.tsx
import { OtherComponent } from './index';  // ❌ Circular dependency risk
import { OtherComponent } from './other';  // ✅ Direct import
```

2. Cross-Feature Circular Dependencies
```typescript
// features/a/index.ts
export { A } from './a';

// features/b/index.ts
export { B } from './b';

// features/a/a.tsx
import { B } from '../b';  // Potential circular dependency if B imports from A
```

### Best Practices for Next.js Components

1. Server Components
```typescript
// server-component.tsx
import { ClientComponent } from './client';  // ✅ Server can import client

// Explicit async for server component
export async function ServerComponent() {
  // Server-side operations
  return <ClientComponent />;
}
```

2. Client Components
```typescript
// client-component.tsx
'use client';  // ✅ Explicit client directive

// ❌ Don't import server components in client components
// import { ServerComponent } from './server';

export function ClientComponent() {
  return <div>Client Rendered</div>;
}
```

### Dependency Validation

Add these checks to your development workflow:

1. Pre-commit Hook
```bash
#!/bin/sh
# .husky/pre-commit

# Check for circular dependencies
npx madge --circular --extensions ts,tsx . || (
  echo "❌ Circular dependencies found. Please fix before committing.";
  exit 1;
)
```

2. CI Pipeline
```yaml
# .github/workflows/validate.yml
- name: Check Dependencies
  run: npx madge --circular --extensions ts,tsx .
```

### Additional Resources

- [Next.js Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Next.js Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)
- [Madge Documentation](https://github.com/pahen/madge)
