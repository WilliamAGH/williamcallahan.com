# PR Review Command

**Purpose**: Systematically review and address unresolved comments on GitHub pull requests, making thoughtful decisions about which suggestions to implement.

**What this does**:

- Fetches only unresolved review comments from a PR using GraphQL
- Analyzes each suggestion for genuine code improvement
- Implements beneficial changes with proper validation
- Replies to comments and marks threads as resolved

**Repository**: <https://github.com/WilliamAGH/williamcallahan.com>

**Project Constants**:

- Owner: `WilliamAGH`
- Repo: `williamcallahan.com`

## ⚠️ CRITICAL REQUIREMENTS

1. **GraphQL for fetching/resolving** - REST API fails with token limits (GitHub MCP lacks GraphQL support)
2. **REST API for comment replies** - GitHub's GraphQL lacks working reply mutation (see note below)
3. **MANDATORY validation before EVERY commit:** `bun run lint && bun run type-check && bun run biome:check`
4. **Fix ALL language server warnings** - Including biome, ESLint, TypeScript diagnostics in modified files
5. **COMMIT MESSAGE RULES - ABSOLUTELY NO EXCEPTIONS:**
   - **NEVER COMBINE MULTIPLE FILES IN ONE COMMIT**
   - **EACH FILE GETS ITS OWN COMMIT WITH SPECIFIC MESSAGE**
   - Format: `fix(scope): specific change description`
   - Examples:
     - ✅ `fix(eslint): re-enable jsx-no-target-blank rule with allowReferrer`
     - ✅ `fix(bookmarks): replace globalThis lock checks with distributed lock`
     - ❌ `fix(lint): resolve eslint issues` (TOO GENERIC)
     - ❌ `fix: multiple fixes` (ABSOLUTELY FORBIDDEN)
   - **SCOPE**: Must be the specific area/file being changed
   - **DESCRIPTION**: Must describe the EXACT change, not generic "fix issues"
6. **Deep analysis REQUIRED** - Review comments are suggestions, not orders

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

### ⚠️ COMMIT WORKFLOW - FOLLOW EXACTLY

When fixing multiple issues:

1. Fix ONE file
2. Run validation: `bun run lint && bun run type-check && bun run biome:check`
3. Commit ONLY that file with SPECIFIC message
4. Move to next file and repeat

**NEVER DO THIS:**
```bash
# ❌ WRONG - Multiple files in one commit
git add file1.ts file2.ts file3.ts && git commit -m "fix: various issues"

# ❌ WRONG - Generic message
git add eslint.config.ts && git commit -m "fix: lint issues"
```

**ALWAYS DO THIS:**
```bash
# ✅ CORRECT - One file, specific message
git add eslint.config.ts && git commit -m "fix(eslint): re-enable jsx-no-target-blank with allowReferrer"

# ✅ CORRECT - Next file, its own commit
git add lib/bookmarks.ts && git commit -m "fix(bookmarks): replace globalThis.isBookmarkRefreshLocked with distributed lock check"
```

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
              databaseId
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
- IF beneficial: implement → validate → commit → reply → resolve
- IF not: skip implementation → reply with reasoning → resolve
- **IMPORTANT**: Both accepted AND rejected comments must be resolved

**3. Reply to comment (REST API - see note):**

First get the numeric comment ID from GraphQL output:
```bash
# The GraphQL query returns both 'id' and 'databaseId'
# Use the 'databaseId' value for REST API calls
```

Then reply using the numeric databaseId:
```bash
# Implemented:
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR]/comments/[NUMERIC_DATABASE_ID]/replies \
  -f body="Fixed in commit [HASH]. [What was done]"

# Rejected:
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR]/comments/[NUMERIC_DATABASE_ID]/replies \
  -f body="After careful analysis, I've decided not to implement this suggestion because [detailed reasoning]. The current implementation [explain why it's better]."
```

**Note**: GitHub's GraphQL API cannot reply to review comments. The mutation `addPullRequestReviewCommentReply` suggested by linters doesn't exist. GitHub deprecated `addPullRequestReviewComment` and promised `addPullRequestReviewThreadReply` as replacement, but it was never implemented. REST API is the ONLY way to reply to PR review comments.

**4. Resolve thread (GraphQL):**

Use the thread ID (not comment ID) from the GraphQL output:
```bash
# The thread ID starts with "PRRT_" (e.g., "PRRT_kwDONglMk85SSn9V")
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "[THREAD_ID_STARTING_WITH_PRRT]"}) {
    thread { isResolved }
  }
}'
```

## 💡 REMEMBER

- **EVERY comment needs a reply AND thread resolution** - Even rejected suggestions
- Rejection is OK if suggestion doesn't improve code
- Comments don't auto-resolve - use thread ID to resolve
- Each file gets separate commit with descriptive message
- **Mark threads as resolved AFTER replying** - Whether implemented or rejected

## ⚠️ COMMON PITFALLS TO AVOID

1. **JQ syntax errors**: The `!=` operator in jq must be written without backslash escaping
   - ❌ Wrong: `select(.databaseId \!= null)`
   - ✅ Correct: `select(.databaseId != null)`

2. **Comment ID confusion**: Always use numeric `databaseId` for REST replies, not GraphQL IDs
   - ❌ Wrong: Using ID like `PRRC_kwDONglMk86AFCFz`
   - ✅ Correct: Using numeric ID like `2148802931`

3. **Forgetting to validate**: ALWAYS run validation before committing, even for "simple" fixes

## 📚 WORKING EXAMPLES

**Get all unresolved comments with both IDs:**
```bash
gh api graphql -f query='
{
  repository(owner: "WilliamAGH", name: "williamcallahan.com") {
    pullRequest(number: 109) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 1) {
            nodes {
              id
              databaseId
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

**Get IDs for specific file:**
```bash
# For a specific file's comments
gh api graphql -f query='...' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.path == "lib/utils/api-sanitization.ts" and .isResolved == false)'
```
