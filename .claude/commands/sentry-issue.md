Comprehensive Sentry issue resolution workflow with multi-source analysis and full validation.

Repository: <https://github.com/WilliamAGH/williamcallahan.com>
Owner: WilliamAGH
Repo: williamcallahan.com

Sentry Issue ID/URL: $ARGUMENTS

STEP 0: Pre-flight Validation & Clean Workspace
CRITICAL: Ensure clean working environment before ANY analysis:
a) Run: bun run validate
b) If ANY errors or warnings exist:

- Apply type safety resolution strategies from @full-lint command
- Fix ALL issues to achieve 100% compliance
- Never use @ts-ignore, @ts-expect-error, or eslint-disable
c) Run: bun run test
- Ensure 100% test pass rate
d) Only proceed once BOTH commands report ZERO issues

STEP 1: Retrieve Sentry Issue Details
Use available Sentry MCP tools to fetch the issue:
a) Get full issue details including:

- Error message and stack trace
- Affected users count
- First/last seen timestamps
- Environment (production/staging)
- Release version
- Tags and metadata
- Event breadcrumbs
- User actions leading to error
b) If Sentry MCP unavailable, ask user for:
- Full error message
- Stack trace
- Steps to reproduce
- Affected functionality

STEP 2: Initial Architecture Context Discovery
Based on the error location and stack trace:
a) Read docs/projects/structure/00-architecture-entrypoint.md
b) Identify which functionality/domain is affected by analyzing:

- File paths in stack trace
- Component/function names
- Error context
c) For each identified functionality:
- Read docs/projects/structure/<functionality>.md
- Read docs/projects/structure/<functionality>.mmd if exists
- Note critical issues and known pitfalls sections
d) Use docs/projects/file-overview-map.md to understand file relationships

STEP 3: Multi-Source Knowledge Gathering (Run in parallel using Task agents)
Gather comprehensive context from multiple sources:

a) **Technology Documentation (Context7 MCP)**:

- If error involves Next.js: @mcp__context7__resolve-library-id libraryName="next.js"
- If error involves React: @mcp__context7__resolve-library-id libraryName="react"
- For any other libraries in stack trace, resolve and fetch their docs
- Focus on error-related topics (e.g., hydration, routing, data fetching)

b) **Web Search for Similar Issues**:

- Use @mcp__brave-search__brave_web_search with query constructed from:
  - Error message (sanitized of app-specific details)
  - Framework version + error keywords
  - "site:github.com issues" for known bugs
- Search Stack Overflow for solutions
- Check framework GitHub issues

c) **Code Analysis**:

- Use Grep to find all files containing error-related keywords
- Read all files mentioned in stack trace
- Search for similar error handling patterns
- Identify all files importing/using the problematic code

STEP 4: Deep Analysis with Zen MCP
Synthesize all gathered information:
a) Use @mcp__zen__thinkdeep with model="pro" and thinking_mode="max":

- Include Sentry issue details
- Include relevant architecture documentation
- Include code from affected files
- Include findings from web searches
- Include relevant library documentation
- Ask for:
  - Root cause analysis
  - Multiple solution approaches
  - Risk assessment for each approach
  - Edge cases to consider

b) Use @mcp__zen__debug with all diagnostic information:

- Sentry stack trace and breadcrumbs
- Related source files
- Environment configuration
- Recent commits that might be related

STEP 5: Solution Planning
Create comprehensive action plan using TodoWrite:
a) Root cause fix tasks
b) Type safety improvements if needed
c) Error boundary additions if appropriate
d) Logging enhancements for better debugging
e) Test coverage for the bug scenario
f) Documentation updates if needed
g) Preventive measures for similar issues

Include in each todo:

- Specific file to modify
- Exact change needed
- Risk level (low/medium/high)
- Testing approach

STEP 6: Implementation Phase
For each todo item:
a) Mark as in_progress
b) Read the current file state
c) Apply fix using Edit/MultiEdit
d) Ensure type safety is maintained:

- No new `any` types
- Proper error handling with typed catches
- Zod validation for external data if needed
e) Run: bun run validate after each fix
f) Fix any new issues immediately
g) Mark as completed

STEP 7: Error Reproduction & Testing
Create tests to verify the fix:
a) Write test case that reproduces the original error
b) Verify test fails without the fix
c) Apply fix and verify test passes
d) Add edge case tests
e) Run full test suite: bun run test
f) Ensure 100% pass rate

STEP 8: Error Boundary & Monitoring Improvements
If appropriate for the error type:
a) Add/improve error boundaries around affected components
b) Enhance logging for better future debugging:

- Add contextual information
- Include user actions in logs
- Add performance metrics if relevant
c) Consider adding:
- Input validation
- Loading states
- Fallback UI

STEP 9: Documentation Updates
Update all relevant documentation:
a) If new patterns introduced, update architecture docs
b) Update docs/projects/structure/<functionality>.md with:

- New error handling approach
- Lessons learned
- Known issues section if applicable
c) Update inline code comments for clarity
d) Add JSDoc comments for complex error handling

STEP 10: Final Validation Suite
Run comprehensive validation:
a) Run: bun run validate

- Must show 0 errors, 0 warnings
b) Run: bun run test
- Must show 100% pass rate
c) Run: bun run build
- Must complete successfully
d) If ANY issues, resolve before proceeding

STEP 11: Sentry Issue Status Update
Update the Sentry issue to reflect resolution:
a) Use Sentry MCP to update issue status:

- Mark as "Resolved in Next Release"
- Add comment with:
  - Root cause explanation
  - Fix summary
  - Affected files
  - Testing performed
b) If Sentry MCP unavailable:
- Provide user with update text for manual entry
- Include commit hash once available

STEP 12: Pre-Commit Verification
Use @mcp__zen__precommit to validate all changes:
a) Review ensures:

- Fix addresses the Sentry issue
- No regressions introduced
- Type safety maintained
- Tests cover the bug scenario
b) Address any findings before commit

STEP 13: Commit Decision
Ask user: "The Sentry issue has been resolved and all validations pass. Would you like to commit these changes? (yes/no)"

If yes:
a) Show all changed files with git status
b) Create detailed commit message:
   ```
   fix(<functionality>): resolve Sentry issue #<id> - <brief description>
   
   - Root cause: <explanation>
   - Solution: <what was fixed>
   - Added tests to prevent regression
   - Sentry: <issue URL>
   ```
c) Commit using conventional format
d) IMPORTANT: NEVER include Claude code attribution or co-author tags
e) Show commit hash

STEP 14: Final Summary
Output comprehensive summary including:

- Sentry issue ID and description
- Root cause identified
- Solution implemented
- Files modified
- Tests added/updated
- Type safety improvements
- Documentation updates
- Validation results
- Commit hash (if committed)
- Sentry status update confirmation

CRITICAL SUCCESS CRITERIA:

1. Original error can no longer be reproduced
2. All tests pass (100%)
3. Zero TypeScript/ESLint errors or warnings
4. No performance regressions
5. Error handling improved for better debugging
6. Documentation reflects current implementation
