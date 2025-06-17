Run all tests and fix any failures. After 100% of tests are passing, ask the user if they wish to create/improve tests with low coverage.

First, execute: bun run test

STEP 1: Output the full test results.

STEP 2: Perform deep analysis using @mcp__zen__thinkdeep with model="pro" and thinking_mode="high".

STEP 3: For test failures:
a) Use @mcp__zen__debug to identify root causes
b) Use Read tool to examine failing tests and implementation
c) Use Edit/MultiEdit to fix failing tests or implementation bugs
d) Document each fix

STEP 4: If all tests pass (100% passing):
a) Ask the user if they want to improve test coverage
b) If yes, thoroughly examine the functionality of code with low coverage using Read tool
c) Only after understanding the functionality completely, propose new tests
d) Never create tests without thorough understanding of what is being tested

STEP 5: Run "bun run test" again to verify all tests pass.

Output final test results and all changes made.
