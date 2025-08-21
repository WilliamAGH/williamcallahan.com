Run comprehensive linting and type checking with strict TypeScript type safety compliance.

**TYPE SAFETY MANDATE**: Achieve 100% compliance with TypeScript, ESLint, and Biome rules. Never use @ts-ignore, @ts-expect-error, or eslint-disable to bypass errors - fix the root cause.

First, run validation suite: bun run validate

This includes:

- Biome formatting and linting
- ESLint with TypeScript rules
- TypeScript strict type checking

STEP 1: Output the full validation results.

STEP 2: Multi-Source Analysis of Linting Errors
Perform comprehensive analysis using ALL available MCP tools:

a) **Technology Documentation via MCPs**:
For ANY TypeScript/ESLint errors related to framework usage:

- Next.js 15 patterns: @mcp**context7**resolve-library-id libraryName="next.js" then @mcp**context7**get-library-docs
- React 19 hooks/patterns: @mcp**context7**resolve-library-id libraryName="react" then @mcp**context7**get-library-docs
- Zod 4 validation: @mcp**context7**resolve-library-id libraryName="zod" then @mcp**context7**get-library-docs
- TypeScript 5.x features: Use available documentation MCPs
- ESLint rules: Search for rule documentation if unfamiliar

  CRITICAL: Framework best practices change - always verify current patterns!

b) **Anti-Polyfill Mandate (2025)**:
**FORBIDDEN**: Never add polyfills to this modern Next.js 15 + Node 22 LTS codebase:

- ❌ BANNED: `core-js`, `@babel/polyfill`, `react-app-polyfill`, `polyfill.io`
- ❌ BANNED: `whatwg-fetch`, `isomorphic-fetch`, `cross-fetch` (use native `fetch`)
- ❌ BANNED: Any "kitchen-sink" polyfills or legacy browser support packages
- ❌ BANNED: Any polyfill that patches `globalThis`, `window`, or `global` objects

  **MODERN ALTERNATIVES ONLY**:

- ✅ NATIVE: Use built-in Node 22 LTS APIs (`fetch`, `URL`, `TextEncoder`, etc.)
- ✅ PONYFILLS: Import-only modules that don't mutate globals
- ✅ FEATURE-DETECT: Dynamic imports with runtime capability detection
- ✅ SERVER-FIRST: Move heavy processing to Server Components/Edge Functions

c) **Web Search for Solutions**:
Use @mcp**brave-search**brave_web_search for:

- Specific ESLint rule explanations and fixes
- TypeScript error codes with framework context
- Migration guides for deprecated patterns
- Community-approved type patterns
- **Modern alternatives to any polyfills found in codebase**

d) **Architecture Alignment**:

- Read docs/projects/structure/linting-formatting.md for project standards
- Check docs/projects/structure/00-architecture-entrypoint.md
- Ensure fixes align with documented patterns
- **Verify no polyfills introduced that violate modern practices**

e) **Deep Analysis**:
Use @mcp**zen**thinkdeep with model="pro" and thinking_mode="high" including:

- All error context
- Documentation findings
- Project architecture requirements
- **Analysis of any polyfill dependencies for removal strategy**

STEP 3: **Type Error Resolution Priority**:

**Priority 1 - Critical Type Safety Errors**:

- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-return`
- `@typescript-eslint/no-unsafe-argument`
- `@typescript-eslint/no-explicit-any`
- Custom `project/no-duplicate-types` errors

**Resolution Strategies**:

1. **For unsafe assignment/member access**:

   ```typescript
   // BAD: const data = JSON.parse(input);
   // GOOD: const data: unknown = JSON.parse(input);
   // Then use type narrowing or Zod validation
   ```

   - Use `unknown` instead of `any`
   - Implement type guards or Zod schemas
   - Check lib/schemas/ for existing validators

2. **For `any` type usage**:
   - Trace the source of the `any`
   - Define proper types in types/ directory
   - For external APIs, create interface definitions
   - For dynamic data, use Zod runtime validation

3. **For duplicate types**:
   - Use @type-flattener command if multiple duplicates
   - Identify canonical type location
   - Update all imports to use single source

4. **For index access errors** (noUncheckedIndexedAccess):
   ```typescript
   // BAD: const item = array[index]; // item could be undefined
   // GOOD: const item = array[index];
   if (item !== undefined) {
     /* use item */
   }
   ```

**Priority 2 - Type Mismatches**:

- Incorrect type assertions
- Missing type parameters
- Type inference failures

**Priority 3 - Code Quality**:

- Naming conventions
- Unused variables
- Style issues

STEP 4: **Implementation Process**:

For EACH error:
a) **Understand the Error**:

- Read the exact error message and code
- Identify which TypeScript/ESLint rule triggered it
- Use Read tool to examine full context
- Trace type definitions to their source

b) **Apply Type-Safe Fix**:

- Never bypass the type system
- Create missing type definitions in types/
- Use type narrowing for runtime checks
- Leverage existing Zod schemas when applicable

c) **Verify Fix**:

- Ensure no new errors introduced
- Check related files for consistency

STEP 5: **Incremental Validation**:

- After fixing each category, run: bun run validate
- Address any cascading issues immediately
- Continue until ZERO errors and warnings

STEP 6: **Final Verification**:

- Run: bun run validate
- Must show 0 errors, 0 warnings
- Run: bun run build
- Must complete successfully

**Type Safety Best Practices**:

1. Project enforces types in types/ directory only
2. Use Zod for runtime validation of external data
3. Leverage `noUncheckedIndexedAccess` for safer arrays/objects
4. All type names must be globally unique
5. Prefer `unknown` over `any` for type narrowing
6. **CRITICAL**: Never add polyfills - use native Node 22 LTS APIs and modern alternatives

**Modern Dependency Guidelines (2025)**:

- **Native APIs**: Always use Node 22's built-in `fetch`, `URL`, `TextEncoder`, etc.
- **Current Documentation**: Use MCPs (Context7, DeepWiki) for latest framework patterns
- **No Legacy Support**: This codebase targets evergreen browsers (Baseline 2023+)
- **Bundle Hygiene**: Any polyfill detected in `node_modules` should be investigated for removal

**Common Patterns**:

```typescript
// Type narrowing with unknown
function processData(data: unknown) {
  const parsed = BookmarkSchema.parse(data); // Zod validation
  // Now 'parsed' is fully typed
}

// Safe index access
const value = record[key];
if (value !== undefined) {
  // Safe to use value
}

// Optional chaining for nested access
const city = user.address?.city ?? "Unknown";
```

Output comprehensive summary:

- Total issues found and fixed
- Type safety improvements made
- Files modified with specific fixes
- Final validation status (must be clean)
