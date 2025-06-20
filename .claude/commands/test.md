Run all tests with strict type safety validation. After 100% of tests pass, offer to improve test coverage.

**TYPE SAFETY MANDATE**: Tests must maintain full type safety. Never use @ts-ignore or any type bypasses.

STEP 0: Pre-test validation for clean workspace
a) Execute: bun run validate
b) If ANY errors or warnings exist:
   - Apply type safety resolution strategies from full-lint command
   - Achieve 100% compliance before proceeding
c) This ensures tests run against type-safe code

Then, execute: bun run test

STEP 1: Output the full test results.

STEP 2: Multi-Source Analysis for Test Failures
Perform comprehensive analysis using ALL available MCP tools:

a) **Technology Documentation via MCPs**:
   For test failures related to framework usage:
   - Next.js 15 testing patterns: @mcp__context7__resolve-library-id libraryName="next.js" then @mcp__context7__get-library-docs topic="testing"
   - React 19 Testing Library: @mcp__context7__resolve-library-id libraryName="react" then @mcp__context7__get-library-docs topic="testing"
   - Jest/Vitest patterns: Use available documentation MCPs
   - Testing best practices for our specific versions
   
   CRITICAL: Testing APIs and patterns change between versions!

b) **Web Search for Test Solutions**:
   Use @mcp__brave-search__brave_web_search for:
   - Specific test error messages with framework versions
   - Mock patterns for Next.js 15 App Router
   - React 19 testing patterns and hooks
   - Common testing pitfalls with our stack

c) **Deep Analysis**:
   Use @mcp__zen__thinkdeep with model="pro" and thinking_mode="high" including:
   - Test failure context
   - Framework documentation findings
   - Type safety considerations
   - Mock strategy recommendations

STEP 3: **For test failures related to types**:

**Common Type Issues in Tests**:

1. **Mock Data Type Mismatches**:
   ```typescript
   // BAD: const mockUser = { id: '123' } as any;
   // GOOD: const mockUser: User = { 
   //   id: '123',
   //   name: 'Test User',
   //   // ... all required fields
   // };
   ```
   - Create fully typed mock data
   - Use partial types when appropriate: `Partial<User>`
   - Consider factory functions for test data

2. **API Response Mocking**:
   ```typescript
   // Use Zod schemas for type-safe mocks
   const mockResponse = BookmarkSchema.parse({
     url: 'https://example.com',
     title: 'Test',
     // ... validates at runtime
   });
   ```

3. **Test Utility Types**:
   - Check types/test.ts for test-specific types
   - Create test helpers with proper generics
   - Use satisfies operator for type checking

4. **Async Test Type Safety**:
   ```typescript
   // Ensure proper Promise types
   test('async operation', async () => {
     const result: Bookmark = await fetchBookmark();
     expect(result.url).toBeDefined();
   });
   ```

**Resolution Process**:
a) Use @mcp__zen__debug to identify root causes
b) Examine test file and implementation with Read tool
c) Fix type issues in tests WITHOUT compromising type safety:
   - Add missing type annotations
   - Create proper mock objects
   - Use type assertions only when semantically correct
d) Fix implementation bugs if tests are correct
e) Document why specific type decisions were made

STEP 4: **After all tests pass (100% passing)**:
a) Run: bun run validate
   - Ensure tests didn't introduce type issues
   - Fix any new warnings/errors

b) Ask: "All tests are passing with full type safety. Would you like to:
   1) Review test coverage and add tests for uncovered code
   2) Enhance existing tests with better type safety
   3) Skip test improvements"

c) If improving tests:
   - Use Read to understand uncovered functionality
   - Check for existing Zod schemas to validate test data
   - Create type-safe test utilities
   - Ensure new tests follow strict typing

STEP 5: **Test Type Safety Best Practices**:

1. **Use Test-Specific Types**:
   ```typescript
   // In types/test.ts
   export type MockedFunction<T> = T & {
     mockReturnValue: (value: ReturnType<T>) => void;
   };
   ```

2. **Leverage Zod for Test Data**:
   ```typescript
   // Generate valid test data
   const testBookmark = BookmarkSchema.parse({
     url: faker.internet.url(),
     title: faker.lorem.sentence(),
   });
   ```

3. **Type-Safe Test Builders**:
   ```typescript
   function createMockUser(overrides?: Partial<User>): User {
     return {
       id: '1',
       name: 'Test User',
       email: 'test@example.com',
       ...overrides,
     };
   }
   ```

STEP 6: **Final Validation**:
a) Run: bun run test
   - Confirm 100% pass rate
b) Run: bun run validate
   - Must show 0 errors, 0 warnings
c) Run: bun run build
   - Ensure no build issues

**Test Configuration Notes**:
- Tests use relaxed ESLint rules but NOT for type safety
- Test files can use `any` ONLY when testing error conditions
- All test data should be fully typed
- Runtime validation with Zod is encouraged for API tests

Output comprehensive summary:
- Test results (must be 100% passing)
- Type safety improvements made
- Validation status (must be clean)
- Coverage improvements (if applicable)
