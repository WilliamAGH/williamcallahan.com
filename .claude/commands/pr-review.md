Review and resolve ONLY UNRESOLVED comments on open pull requests.

Repository: <https://github.com/WilliamAGH/williamcallahan.com>

## CRITICAL: Use GraphQL API Only - Do NOT Use REST API

The REST API (`gh api repos/.../pulls/[PR]/comments`) will FAIL with token limits. You MUST use GraphQL.

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

1. Read the file at the specified line
2. Implement the fix if valid
3. Commit the specific file:
   ```bash
   git add path/to/file.ts && git commit path/to/file.ts -m "fix(scope): specific change"
   ```

### STEP 5: Reply to comment (use comment ID from Step 3)

```bash
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR]/comments/[COMMENT_ID]/replies \
  -f body="Fixed in commit [HASH]. [What was done]"
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

1. **Comments do NOT auto-resolve** - You must manually resolve each thread after replying
2. **Use thread ID for resolution**, not comment ID
3. **Commit each file separately** with descriptive messages
4. **MCP GitHub tool does NOT support** thread resolution - use GraphQL

## Complete Example (PR #109)

```bash
# Get unresolved comments
gh api graphql -f query='...' | jq '...' 

# Output shows:
# threadId: "PRRT_kwDONglMk85SZUIt", commentId: "2151346548", path: "file.tsx", line: 56

# Fix the issue, commit
git add file.tsx && git commit file.tsx -m "fix: resolve issue at line 56"

# Reply
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/109/comments/2151346548/replies \
  -f body="Fixed in commit abc123. Resolved the issue."

# Resolve
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "PRRT_kwDONglMk85SZUIt"}) {
    thread { isResolved }
  }
}'
```
