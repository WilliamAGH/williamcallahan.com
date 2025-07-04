Run the build command and analyze any errors or warnings with strict TypeScript type safety compliance.

First, execute: bun run build

STEP 1: Output the full build log for reference.

STEP 2: Multi-Source Analysis of Build Errors
Analyze the build output using ALL available MCP tools:

a) **Technology Documentation via MCPs**:
   For ANY build errors related to framework APIs:

- Next.js 15 errors: @mcp__context7__resolve-library-id libraryName="next.js" then @mcp__context7__get-library-docs
- React 19 errors: @mcp__context7__resolve-library-id libraryName="react" then @mcp__context7__get-library-docs
- Zod 4 validation: @mcp__context7__resolve-library-id libraryName="zod" then @mcp__context7__get-library-docs
- TypeScript 5.x: Use available documentation MCPs
- Check package.json for other dependencies and fetch their docs as needed

   CRITICAL: Always verify against current documentation - APIs change between versions!

b) **Web Search for Build Issues**:
   Use @mcp__brave-search__brave_web_search to find:

- Specific TypeScript error codes (e.g., "TS2339 Next.js 15")
- Known build issues with our framework versions
- Migration guides if APIs have changed
- Community solutions for similar errors

c) **Deep Analysis**:
   Use @mcp__zen__thinkdeep with model="pro" including:

- Full build error context
- Documentation findings from MCPs
- Web search results
- Ask for root cause analysis and type-safe solutions

STEP 3: If there are TypeScript or build errors:

**CRITICAL TYPE SAFETY MANDATE**: You MUST achieve 100% compliance with TypeScript, ESLint, and Biome rules. DO NOT use @ts-ignore, @ts-expect-error, or eslint-disable comments to bypass errors.

a) **Root Cause Analysis**:

- Identify the exact TypeScript error (e.g., TS2339, TS2345)
- Understand why the type system is raising this error
- Use Read tool to trace type definitions back to their source
- Check if related types exist in types/ directory

b) **Type Safety Resolution Strategies**:

   1. **For `any` type errors**:
      - Replace with `unknown` and use type narrowing
      - Create proper type definitions in types/ directory
      - Use Zod schemas from lib/schemas/ for runtime validation

   2. **For unsafe member access**:
      - Add proper null/undefined checks
      - Use optional chaining (?.) and nullish coalescing (??)
      - Leverage TypeScript's `noUncheckedIndexedAccess` setting

   3. **For type mismatches**:
      - Trace back to the source type definition
      - Check for duplicate type definitions using @type-flattener
      - Ensure types are imported from the canonical location

   4. **For missing types**:
      - Check if type exists elsewhere in codebase
      - Create new type definition in appropriate types/ subdirectory
      - Consider if Zod schema would provide runtime safety

c) **Implementation**:

- Use Edit/MultiEdit tools to implement type-safe fixes
- Never circumvent the type system
- Document why specific type decisions were made

d) **Validation**:

- Ensure fix addresses root cause, not symptoms
- Verify no new type errors introduced

STEP 4: If build succeeds but has warnings:

- Treat warnings as errors - fix them all
- Common warnings often indicate future type safety issues

STEP 5: Run validation suite:

- Execute: bun run validate
- Ensure ZERO errors and warnings
- If issues remain, repeat resolution process

STEP 6: Final build verification:

- Run: bun run build
- Confirm clean build with no errors or warnings

**Type Safety Resources**:

- Project uses `strict: true` with `noUncheckedIndexedAccess: true`
- Zod schemas available in lib/schemas/ for runtime validation
- All types must reside in types/ directory per ESLint rules
- Custom ESLint rule prevents duplicate type names globally

Output final status with:

- All type safety fixes implemented
- Validation results (must be zero issues)
- Build results (must be clean)
- Summary of type improvements made
