Review and resolve ONLY UNRESOLVED comments on open pull requests.

Repository: <https://github.com/WilliamAGH/williamcallahan.com>

## CRITICAL: Use GraphQL API Only - Do NOT Use REST API

The REST API (`gh api repos/.../pulls/[PR]/comments`) will FAIL with token limits. You MUST use GraphQL.

## MANDATORY: Run ALL Validation Checks Before EVERY Commit

**YOU MUST RUN THIS COMMAND BEFORE EVERY SINGLE `git commit`:**

```bash
bun run lint && bun run type-check && bun run biome:check
```

**If ANY of these checks fail, you MUST fix ALL errors before committing.**

## FORBIDDEN: Generic Commit Messages

**NEVER use generic commit messages like:**

- `fix: resolve multiple code review issues`
- `fix: address review comments`
- `fix: various fixes`

**ALWAYS use specific commit messages that describe the exact change:**

- `fix(github-activity): convert div to button for proper a11y`
- `fix(instrumentation): lazy-load EventEmitter to prevent Edge bundling`
- `fix(middleware): include /api/debug paths in matcher for security`

## CRITICAL: Deep Thinking Analysis Required

**BEFORE implementing ANY changes suggested in review comments:**

1. **Treat comments as suggestions, NOT requirements**
   - Review comments are opinions that may or may not be correct
   - Never assume a suggestion should be implemented without analysis

2. **Perform deep analysis for EACH comment:**
   - Read the entire file and understand its purpose
   - Check `docs/projects/file-overview-map.md` to find the functionality
   - Read `docs/projects/structure/<functionality>.md` for architecture context
   - Understand how the code fits into the larger system
   - Consider edge cases and potential side effects

3. **Consult Zen MCP for second opinion:**
   ```
   @mcp__zen__thinkdeep model="pro" thinking_mode="high" prompt="
   Review comment suggests: [paste comment]
   
   File: [path]
   Functionality: [from docs/projects/structure/*.md]
   
   Current implementation: [explain current code]
   Suggested change: [what the comment wants]
   
   Please analyze:
   1. Is this suggestion actually an improvement?
   2. What are the potential risks?
   3. Are there better alternatives?
   4. What edge cases should we consider?
   "
   ```

4. **Make an informed decision:**
   - Only implement changes that genuinely improve the code
   - Document your reasoning when replying to comments
   - If rejecting a suggestion, explain why politely and thoroughly

## Direct Workflow - Follow Exactly

### STEP 1: Get current branch

```bash
git branch --show-current
```

### STEP 2: List open PRs

```
@mcp__github__list_pull_requests owner="WilliamAGH" repo="williamcallahan.com" state="open"
```

### STEP 3: Get ONLY unresolved comments (use this exact command)

```bash
gh api graphql -f query='
{
  repository(owner: "WilliamAGH", name: "williamcallahan.com") {
    pullRequest(number: [PR_NUMBER]) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 1) {
            nodes {
              id
              body
              author { login }
            }
          }
        }
      }
    }
  }
}' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

### STEP 4: For each unresolved comment

1. **ANALYZE DEEPLY** (see "Deep Thinking Analysis Required" section above)
2. Read the file and surrounding context
3. Check functionality docs in `docs/projects/structure/*.md`
4. Consult Zen MCP for second opinion
5. **ONLY IF the change is genuinely beneficial:**
   - Implement the fix
   - **RUN VALIDATION:** `bun run lint && bun run type-check && bun run biome:check`
   - Fix any validation errors
   - Commit with descriptive message:
     ```bash
     git add path/to/file.ts && git commit path/to/file.ts -m "fix(scope): specific change description"
     ```
6. **IF rejecting the suggestion:**
   - Skip to STEP 5 and explain your reasoning in the reply

### STEP 5: Reply to comment (use comment ID from Step 3)

**For implemented changes:**
```bash
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR]/comments/[COMMENT_ID]/replies \
  -f body="Fixed in commit [HASH]. [What was done]"
```

**For rejected suggestions:**
```bash
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR]/comments/[COMMENT_ID]/replies \
  -f body="After careful analysis, I've decided not to implement this suggestion because [detailed reasoning]. The current implementation [explain why it's better]."
```

### STEP 6: Resolve thread (use thread ID from Step 3)

```bash
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "[THREAD_ID]"}) {
    thread { isResolved }
  }
}'
```

## Important Notes

1. **Deep thinking is MANDATORY** - Never blindly implement review suggestions
2. **Comments do NOT auto-resolve** - You must manually resolve each thread after replying
3. **Use thread ID for resolution**, not comment ID
4. **Commit each file separately** with descriptive messages
5. **MCP GitHub tool does NOT support** thread resolution - use GraphQL
6. **ALWAYS run validation before committing** - no exceptions
7. **Rejection is OK** - If a suggestion doesn't improve the code, explain why and move on

## Complete Example (PR #109)

```bash
# Get unresolved comments
gh api graphql -f query='...' | jq '...' 
```

# Output shows

# threadId: "PRRT_kwDONglMk85SZUIt", commentId: "2151346548", path: "file.tsx", line: 56

# Fix the issue

# RUN VALIDATION FIRST

bun run lint && bun run type-check && bun run biome:check

# If validation passes, commit

git add file.tsx && git commit file.tsx -m "fix(component): add tabIndex for keyboard accessibility"

# Reply

gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/109/comments/2151346548/replies \
  -f body="Fixed in commit abc123. Added tabIndex={0} for keyboard accessibility."

# Resolve

gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "PRRT_kwDONglMk85SZUIt"}) {
    thread { isResolved }
  }
}'
```
EOF < /dev/null
