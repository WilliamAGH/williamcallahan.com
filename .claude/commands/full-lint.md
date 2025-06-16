Run comprehensive linting and type checking, then fix all issues found.

First, run all linting tools:

- Biome check
- ESLint
- TypeScript type check

STEP 1: Output the full linting results.

STEP 2: Perform deep analysis using @mcp__zen__thinkdeep with model="pro" and thinking_mode="high".

STEP 3: For each issue:
a) Categorize by severity
b) Use Read tool to examine context
c) Use Edit/MultiEdit tools to fix the issue
d) Document the fix

STEP 4: Start with critical type errors, then bugs, then style issues.

STEP 5: After all fixes, run the same lint commands again to verify all issues resolved.

Output summary of all fixes implemented with file paths and line numbers.
