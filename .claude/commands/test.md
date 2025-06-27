> 🛑 **AGENT PREREQUISITE & CONTEXT REFRESH PROTOCOL** 🛑
>
> **1. MANDATORY PREREQUISITE:** Before executing any step in this command, you **MUST** first read the entire [Testing Configuration & Modernization Guide](./docs/projects/structure/testing-config.md) to load the complete architectural context, modern patterns, and project-specific rules into your working memory.
>
> **2. MANDATORY CONTEXT REFRESH:** After any context window reset, your first action must be to re-read this file (`test.md`) and the main [Testing Configuration Guide](./docs/projects/structure/testing-config.md) to ensure these critical instructions are always active.
>
> ---

Run all tests with strict type safety validation. The goal is a 100% passing test suite with a clean output, free of warnings and debug logs. After this is achieved, offer to improve test coverage.

**TYPE SAFETY MANDATE**: Tests must maintain full type safety. Never use @ts-ignore or any type bypasses.

A comprehensive guide to our testing philosophy, modern practices for Jest, React, and Next.js, and detailed troubleshooting can be found in the [Testing Configuration & Modernization Guide](./docs/projects/structure/testing-config.md).

### **STEP 0: Pre-Test Validation**

a) Execute: `bun run validate`
b) If ANY errors or warnings exist:

- Apply type safety resolution strategies from the `full-lint` command.
- Achieve 100% compliance before proceeding.
c) This ensures tests run against type-safe code.

Then, execute: `bun run test`

### **STEP 1: Output Full Test Results**

Present the complete, un-truncated output from the test runner.

### **STEP 2: Test Failure Analysis & Solution Workflow**

When tests fail, a systematic, deep-thinking approach is required. Do not patch symptoms; find and fix the root cause. This workflow must be followed for all test failures.

a) **Initial Context Gathering & Analysis**:

- Systematically identify all failing tests from the test runner output.
- Use the `Read` tool to review the full source code of every failing test file AND the application code (components, functions) they are testing.

b) **Deep, Multi-Source Research (No Assumptions)**:

- **MANDATORY**: This codebase uses cutting-edge features. Your internal knowledge is insufficient. You **MUST** search for current, version-specific documentation.
- **MCP-driven Documentation Search**: Use `@mcp_context7` to fetch the LATEST official docs for Next.js, React, Jest, etc.
  - *Example Workflow:* First, find the exact library version from `package.json`. Then, construct the query dynamically: `@mcp_context7 get-library-docs --context7CompatibleLibraryID='/[org]/[project]/[retrieved-version]' --topic='[topic]'`
- **Targeted Web Search**: Use `@mcp_brave-search` for *exact* error messages.
- **Official Documentation Quick Links**:
  - [Next.js Testing Docs](https://nextjs.org/docs/pages/guides/testing/jest)
  - [Jest React Tutorial](https://jestjs.io/docs/tutorial-react)

**⚠️ CRITICAL ANTI-POLYFILL MANDATE (2025)**:

- **FORBIDDEN**: Never suggest polyfills as solutions to test failures
- **BANNED PACKAGES**: `whatwg-fetch`, `isomorphic-fetch`, `core-js`, `@babel/polyfill`, `polyfill.io`
- **MODERN APPROACH**: Use native Node 22 LTS APIs (`fetch`, `URL`, `TextEncoder`)
- **TEST ENVIRONMENT**: Jest runs in Node 22 - no browser polyfills needed
- **LEGACY DETECTION**: If you find polyfill imports in test files, remove them immediately

c) **Synthesize Findings & Formulate an Initial Plan**:

- Based on your exhaustive research, develop a detailed, step-by-step plan to fix the tests.
- The plan must address the root cause and maintain 100% type safety.

d) **Contrarian Review & Plan Refinement**:

- Before implementing, engage the Zen MCP for a contrarian review to ensure your solution is robust.
- Use a prompt like: `"I am fixing test failures related to [feature]. My plan is [plan]. As a contrarian expert, challenge this. What are the risks and edge cases?"`
- Revise your plan based on the feedback.

e) **Code Conformance Validation (Pre-Change Check)**:

- Before finalizing any code, you **MUST** validate it against the rules in **`docs/projects/structure/linting-formatting.md`** and **`CLAUDE.md`**.
- **CRITICAL**: Check for forbidden underscore prefixes (`_variable`) or other ridiculous overrides that are not linting compliant. The only correct way to handle unused variables is `void variableName;`. Do not suggest underscore prefixes.
- **CRITICAL**: Ensure all type safety rules from the playbook are followed.

f) **Implementation**:

- **Do not begin editing code until all above steps are complete.**
- Proceed with the final, robust, and CONFORMANT plan.

g) **Iterative Refinement & Focused Testing**:
    - After applying a fix, validate it by running the test for the specific file you are working on: `bun run test <path/to/your/test-file.test.ts>`. This provides fast feedback and isolates changes.
    - Continue this iterative process—fix, then test the specific file—until the test passes.
    - **CRITICAL**: Avoid changing broad-reaching Jest/testing configurations. Such changes are a last resort and require strong justification. The goal is to fix the code/test, not the environment.
    - Do not run the full `bun run test` suite during this iterative fixing process. The full suite run is reserved for the final validation stage.
    - Once you believe all individually failing tests have been fixed, proceed to the subsequent steps.

### **STEP 3: Common Test Failure Patterns & Solutions**

**For test failures related to types**:

1. **Mock Data Type Mismatches**:
    ```typescript
    // BAD: const mockUser = { id: '123' } as any;
    // GOOD: const mockUser: User = {
    //   id: '123',
    //   name: 'Test User',
    //   // ... all required fields
    // };
    ```
    - Create fully typed mock data.
    - Use partial types when appropriate: `Partial<User>`.
    - Consider factory functions for test data.

2. **Native `fetch` Mocking (Node 22 LTS)**:
    ```typescript
    // ✅ MODERN: Mock native fetch (no polyfills needed)
    beforeEach(() => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: 'test' }),
        })
      ) as jest.Mock;
    });
    
    afterEach(() => {
      jest.restoreAllMocks();
    });
    ```

3. **API Response Mocking**:
    ```typescript
    // Use Zod schemas for type-safe mocks
    const mockResponse = BookmarkSchema.parse({
      url: 'https://example.com',
      title: 'Test',
      // ... validates at runtime
    });
    ```

4. **Test Utility Types**:
    - Check `types/test.ts` for test-specific types.
    - Create test helpers with proper generics.
    - Use the `satisfies` operator for type checking.

5. **Async Test Type Safety**:
    ```typescript
    // Ensure proper Promise types
    test('async operation', async () => {
      const result: Bookmark = await fetchBookmark();
      expect(result.url).toBeDefined();
    });
    ```

**Resolution Process**:
a) Use `@mcp_zen__debug` to identify root causes during implementation.
b) Fix type issues in tests WITHOUT compromising type safety by adding missing type annotations, creating proper mock objects, or using type assertions only when semantically correct.
c) Fix implementation bugs if tests are correct.
d) Document why specific type decisions were made in your thought process.

### **STEP 4: Test Type Safety Best Practices**

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

### **STEP 5: Final Validation**

This step marks the confirmation phase. After iteratively fixing individual tests, run the entire test suite to ensure system-wide stability.

a) Run: `bun run test` (confirm 100% pass rate and clean output).
b) Run: `bun run validate` (must show 0 errors/warnings).
c) Run: `bun run build` (ensure no build issues).

### **STEP 6: Test Coverage Improvement**

**Note**: This step occurs *after* the final validation runs in STEP 5 confirm that the entire test suite is passing.

a) Ask: "All tests are passing with full type safety. Would you like to: 1) Review test coverage and add tests for uncovered code, or 2) Skip test improvements?"
b) If improving tests, use `Read` to understand uncovered functionality and create new, type-safe tests.

### **STEP 7: Finalization and Commit**

This is the final step after all validations are clean. The task is not complete until this step is successfully executed.

a) **Final Verification Run**: Before committing, run `bun run test` one last time.
b) **Commit Changes**:

- Stage only the specific, explicitly named files that you have fixed.
- **CRITICAL**: Never use broad staging commands like `git add .` or commit commands with the `-a` flag. You must stage each file individually.
- Commit with a clear, succinct, and specific message.
- **CRITICAL**: Do not add `Co-authored-by: Claude ...` or any other AI attribution to the commit message.
c) **Task Completion**: The task is complete only after the commit is successful.

**Test Configuration Notes**:

- Tests use relaxed ESLint rules but NOT for type safety.
- Test files can use `any` ONLY when testing error conditions; otherwise use Zod and `unknown` solutions.
- All test data should be fully typed.
- Runtime validation with Zod is generally required for APIs and tests.

**Modern Testing Environment (2025)**:

- **Node 22 LTS**: Native `fetch`, `URL`, `TextEncoder` - no polyfills required
- **Jest + Next.js 15**: Uses `next/jest` for optimal transformation and mocking
- **No Legacy Support**: Remove any `whatwg-fetch`, `isomorphic-fetch`, or similar imports
- **Current Dependencies**: Always verify latest patterns via Context7/DeepWiki MCPs

Output comprehensive summary:

- Test results (must be 100% passing with a clean output).
- Type safety improvements made.
- Validation status (must be clean).
- Coverage improvements (if applicable).
