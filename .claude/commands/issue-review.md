Review and potentially fix a GitHub issue.

Repository: <https://github.com/WilliamAGH/williamcallahan.com>
Owner: WilliamAGH
Repo: williamcallahan.com

STEP 0: Run `git branch --show-current` to capture the current branch name for additional context.
Issue: #$ARGUMENTS

STEP 1: Use @mcp__github__get_issue with owner="WilliamAGH" repo="williamcallahan.com" issue_number=$ARGUMENTS to get and output full issue details.

STEP 2: Multi-Source Analysis with All Available MCPs
Gather comprehensive context from multiple sources:

a) **Technology Documentation via MCP Tools**:
   IMPORTANT: Always check current documentation for the specific versions we use:
   - For Next.js 15: @mcp__context7__resolve-library-id libraryName="next.js" then @mcp__context7__get-library-docs
   - For React 19: @mcp__context7__resolve-library-id libraryName="react" then @mcp__context7__get-library-docs
   - For Zod 4: @mcp__context7__resolve-library-id libraryName="zod" then @mcp__context7__get-library-docs
   - For TypeScript 5.x: Use available documentation MCPs
   - Check package.json for other relevant dependencies and fetch their docs

b) **Web Search for Similar Issues**:
   - Use @mcp__brave-search__brave_web_search to find:
     - Similar issues in GitHub repositories
     - Stack Overflow solutions for the error/problem
     - Recent breaking changes or known bugs
     - Community workarounds or best practices

c) **Deep Analysis with Zen MCP**:
   - Use @mcp__zen__thinkdeep with model='pro' to deeply analyze the issue
   - Include all gathered documentation and search results in the analysis
   - Consider framework-specific patterns and best practices

STEP 3: Architecture Context & Code Search
a) Read docs/projects/structure/00-architecture-entrypoint.md to understand overall structure
b) Identify affected functionality domains from the issue description
c) Read relevant docs/projects/structure/<functionality>.md files
d) Search for relevant code using @mcp__github__search_code with q="repo:WilliamAGH/williamcallahan.com <search_terms>" and Read tools

STEP 4: If issue is actionable and can be fixed now:
a) Implement the fix using Edit/MultiEdit tools
b) Document all changes made
c) Create comprehensive test if needed

STEP 5: Post detailed comment on issue using @mcp__github__add_issue_comment with owner="WilliamAGH" repo="williamcallahan.com" issue_number=$ARGUMENTS body="<your_analysis_and_plan>" including: analysis, changes made (if any), or implementation plan if changes are too large.

STEP 6: If fixed, mention it can be closed after review.

Output summary of analysis and all actions taken.
