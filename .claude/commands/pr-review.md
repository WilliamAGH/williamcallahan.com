# PR Review Command

**Purpose**: Systematically review and address unresolved comments on GitHub pull requests, making thoughtful decisions about which suggestions to implement.

**What this does**:

- Fetches only unresolved review comments from a PR using GraphQL
- Analyzes each suggestion for genuine code improvement
- Implements beneficial changes with proper validation
- Replies to comments and marks threads as resolved

**Repository**: <https://github.com/WilliamAGH/williamcallahan.com>

## ⚠️ CRITICAL REQUIREMENTS

1. **GraphQL for fetching/resolving** - REST API fails with token limits (GitHub MCP lacks GraphQL support)
2. **REST API for comment replies** - GitHub's GraphQL lacks working reply mutation (see note below)
3. **MANDATORY validation before EVERY commit:** `bun run lint && bun run type-check && bun run biome:check`
4. **NO generic commit messages** - Use: `fix(scope): specific change description`
5. **Deep analysis REQUIRED** - Review comments are suggestions, not orders

## 🧠 DEEP THINKING PROTOCOL

Before implementing ANY suggestion:

1. Find functionality in `docs/projects/file-overview-map.md` → `docs/projects/structure/<functionality>.md`
2. Analyze: Is this actually an improvement? What are the risks? Better alternatives?
3. Get second opinion:

```
@mcp__zen__thinkdeep model="pro" thinking_mode="high" prompt="
Comment: [paste]
File: [path] | Functionality: [from docs]
Current: [explain] | Suggested: [what they want]
Analyze: 1) Improvement? 2) Risks? 3) Alternatives? 4) Edge cases?"
```

## 📋 WORKFLOW

**1. Get unresolved comments (GraphQL):**

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

**2. For each comment:**

- Analyze deeply (see protocol above)
- IF beneficial: implement → validate → commit
- IF not: skip implementation, explain in reply

**3. Reply to comment (REST API - see note):**

```bash
# Implemented:
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR]/comments/[COMMENT_ID]/replies \
  -f body="Fixed in [HASH]. [What was done]"

# Rejected:
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR]/comments/[COMMENT_ID]/replies \
  -f body="After analysis: [reasoning]. Current implementation [why better]."
```

**Note**: GitHub's GraphQL API cannot reply to review comments. The mutation `addPullRequestReviewCommentReply` suggested by linters doesn't exist. GitHub deprecated `addPullRequestReviewComment` and promised `addPullRequestReviewThreadReply` as replacement, but it was never implemented. REST API is the ONLY way to reply to PR review comments.

**4. Resolve thread (GraphQL):**

```bash
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "[THREAD_ID]"}) {
    thread { isResolved }
  }
}'
```

## 💡 REMEMBER

- Rejection is OK if suggestion doesn't improve code
- Comments don't auto-resolve - use thread ID to resolve
- Each file gets separate commit with descriptive message
