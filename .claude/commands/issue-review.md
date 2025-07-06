Review and potentially fix a GitHub issue.

Repository: {{PROJECT_REPO_URL}}
Owner: {{PROJECT_OWNER}}
Repo: {{PROJECT_NAME}}

STEP 0: Run `git branch --show-current` to capture the current branch name for additional context.

STEP 0.5: Check if issue number was provided:

- If no arguments were passed to the command (user just ran `/issue-review`):
  a) Ask user if they want to see all open issues
  b) If yes, use `gh issue list --repo {{PROJECT_OWNER}}/{{PROJECT_NAME}} --state open --json number,title,labels,author,createdAt,updatedAt --limit 50`
  c) Analyze and prioritize issues based on:
  - Labels (urgent priority, bug, etc.)
  - Age of issue
  - Impact on system
  d) Present prioritized list with recommendations
  e) Ask user which issue to work on
- If an issue number was provided as an argument (e.g., `/issue-review 260`), continue to STEP 1

Issue: #[issue number from command arguments]

STEP 1: Use `gh issue view [issue_number] --repo {{PROJECT_OWNER}}/{{PROJECT_NAME}}` to get and output full issue details.

STEP 2: Multi-Source Analysis with All Available MCPs
Gather comprehensive context from multiple sources:

a) **Technology Documentation via MCP Tools**:
   IMPORTANT: Always check current documentation for the specific versions we use:

- For Express.js: @mcp_context7 resolve-library-id libraryName="express" then @mcp_context7 get-library-docs
- For Node.js 22: @mcp_context7 resolve-library-id libraryName="node" then @mcp_context7 get-library-docs
- For TypeScript 5.x: Use available documentation MCPs
- Check package.json for other relevant dependencies and fetch their docs

b) **Web Search for Similar Issues**:

- Use @mcp_brave-search brave_web_search to find:
  - Similar issues in GitHub repositories
  - Stack Overflow solutions for the error/problem
  - Recent breaking changes or known bugs
  - Community workarounds or best practices

c) **Deep Analysis with Zen MCP**:

- Use @mcp_zen_thinkdeep with model='pro' to deeply analyze the issue
- Include all gathered documentation and search results in the analysis
- Consider framework-specific patterns and best practices

STEP 3: Architecture Context & Code Search
a) Read docs/projects/structure/00-architecture-entrypoint.md to understand overall structure
b) Identify affected functionality domains from the issue description
c) Read relevant docs/projects/structure/<functionality>.md files
d) Search for relevant code using codebase_search and Read tools

STEP 4: If issue is actionable and can be fixed now:
a) **MANDATORY: Run validation before making changes:**
   ```bash
   pnpm run validate
   ```
   Must show 0 errors, 0 warnings. Fix any issues following @docs/projects/structure/linting-formatting.md guidance.

b) Implement the fix using Edit/MultiEdit tools
c) Document all changes made
d) Create comprehensive test if needed

e) **MANDATORY: Run validation after making changes:**
   ```bash
   pnpm run validate
   ```
   Never use @ts-ignore, @ts-expect-error, or eslint-disable. Fix all type safety issues properly.

STEP 5: Post detailed comment on issue using `gh issue comment [issue_number] --repo aventurevc/back-end --body "<your_analysis_and_plan>"` including: analysis, changes made (if any), or implementation plan if changes are too large.

STEP 6: If fixed, mention it can be closed after review.

Output summary of analysis and all actions taken.
