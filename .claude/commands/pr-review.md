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

1. **ALWAYS CHECK THE QUERY OUTPUT CAREFULLY** - If there are JSON objects in the output, THOSE ARE UNRESOLVED COMMENTS!
2. **DO NOT RE-PROCESS ALREADY RESOLVED COMMENTS** - Only process comments where `isResolved == false`
3. **GraphQL for fetching/resolving** - REST API fails with token limits (GitHub MCP lacks GraphQL support)
4. **REST API for comment replies** - GitHub's GraphQL lacks working reply mutation (see note below)
5. **MANDATORY validation before EVERY commit:** `bun run validate`
   - This runs ALL checks: TypeScript, ESLint, and Biome
   - Must show 0 errors, 0 warnings
   - NEVER use @ts-ignore, @ts-expect-error, or eslint-disable
6. **Fix ALL type safety issues properly:**
   - Replace `any` with `unknown` and use type narrowing
   - Add proper null/undefined checks (leverage noUncheckedIndexedAccess)
   - Create missing type definitions in types/ directory
   - Use Zod schemas for runtime validation of external data
7. **COMMIT MESSAGE RULES - ABSOLUTELY NO EXCEPTIONS:**
   - **NEVER COMBINE MULTIPLE FILES IN ONE COMMIT**
   - **EACH FILE GETS ITS OWN COMMIT WITH SPECIFIC MESSAGE**
   - **NEVER include Claude code attribution or co-author tags in commits**
   - Format: `fix(scope): specific change description`
   - Examples:
     - ✅ `fix(eslint): re-enable jsx-no-target-blank rule with allowReferrer`
     - ✅ `fix(bookmarks): replace globalThis lock checks with distributed lock`
     - ❌ `fix(lint): resolve eslint issues` (TOO GENERIC)
     - ❌ `fix: multiple fixes` (ABSOLUTELY FORBIDDEN)
   - **SCOPE**: Must be the specific area/file being changed
   - **DESCRIPTION**: Must describe the EXACT change, not generic "fix issues"
8. **Deep analysis REQUIRED** - Review comments are suggestions, not orders

## 🧠 DEEP THINKING PROTOCOL

Before implementing ANY suggestion:

1. Find functionality in `docs/projects/file-overview-map.md` → `docs/projects/structure/<functionality>.md`
2. Analyze: Is this actually an improvement? What are the risks? Better alternatives?
3. **Gather Context from ALL Available MCPs**:

   a) **Technology Documentation**:
      - For Next.js suggestions: @mcp__context7__resolve-library-id libraryName="next.js" then @mcp__context7__get-library-docs
      - For React patterns: @mcp__context7__resolve-library-id libraryName="react" then @mcp__context7__get-library-docs
      - For Zod validation: @mcp__context7__resolve-library-id libraryName="zod" then @mcp__context7__get-library-docs
      - For TypeScript: Use available documentation MCPs
      - Verify the suggestion aligns with current best practices

   b) **Web Search for Context**:
      - Use @mcp__brave-search__brave_web_search to verify if the suggestion is:
        - A known best practice for our framework versions
        - A deprecated pattern we should avoid
        - A performance consideration worth implementing

   c) **Get second opinion with TYPE SAFETY FOCUS**:
      ```text
      @mcp__zen__thinkdeep model="pro" thinking_mode="high" prompt="
      Comment: [paste]
      File: [path] | Functionality: [from docs]
      Current: [explain] | Suggested: [what they want]
      Framework docs say: [findings from Context7]
      Web search shows: [relevant findings]
      Analyze: 
      1) Does this improve type safety? 
      2) Are there any type implications?
      3) Would this introduce any `any` types or unsafe operations?
      4) Better type-safe alternatives?
      5) Edge cases and runtime safety?
      6) Does this align with Next.js 15/React 19 best practices?"
      ```

4. **Type Safety Checklist for PR changes:**
   - No new `any` types introduced
   - All external data validated with Zod
   - Proper error types (never `catch(e)` without typing)
   - Index access protected by checks
   - Type assertions justified and safe
   - Follows current framework patterns from documentation

## 📋 WORKFLOW

### 🔍 PRE-REVIEW VALIDATION - ALWAYS RUN FIRST

Before starting the PR review process:

1. **Run full validation to check for existing issues:**
   ```bash
   bun run validate
   ```

2. **If validation fails - Apply TYPE SAFETY RESOLUTION:**

   **For TypeScript/ESLint type errors:**
   - `@typescript-eslint/no-unsafe-assignment`: Use `unknown` instead of `any`
   - `@typescript-eslint/no-unsafe-member-access`: Add null checks or optional chaining
   - `@typescript-eslint/no-explicit-any`: Define proper types in types/ directory
   - `project/no-duplicate-types`: Use @type-flattener to consolidate duplicates

   **Resolution strategies:**
   ```typescript
   // BAD: const data = JSON.parse(input);
   // GOOD: const data: unknown = JSON.parse(input);
   // BETTER: const data = UserSchema.parse(JSON.parse(input));
   ```

3. **Commit type safety fixes properly:**
   ```bash
   # Example: Fix type safety in specific file
   git add lib/bookmarks/service.server.ts
   git commit -m "fix(bookmarks): replace any with proper bookmark types and Zod validation"
   ```

4. **Why strict type safety matters:**
   - Prevents runtime errors before they happen
   - Makes code self-documenting with clear contracts
   - Enables better IDE support and refactoring
   - Catches edge cases during development

### ⚠️ COMMIT WORKFLOW - FOLLOW EXACTLY

When fixing multiple issues:

1. Fix ONE file with proper type safety
2. Run validation: `bun run validate`
   - Must show 0 errors, 0 warnings
   - Fix type issues properly, never bypass
3. Commit ONLY that file with SPECIFIC message
4. Move to next file and repeat

**Type Safety Fix Examples:**
```bash
# ✅ CORRECT - Type safety improvement
git add lib/api/bookmarks/route.ts
git commit -m "fix(api): add Zod validation for bookmark request body"

# ✅ CORRECT - Unsafe operation fix  
git add components/bookmarks/list.tsx
git commit -m "fix(bookmarks): add null checks for array access with noUncheckedIndexedAccess"

# ❌ WRONG - Generic or bypassing
git add lib/utils/helpers.ts  
git commit -m "fix: add ts-ignore to suppress error" # NEVER DO THIS
```

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

⚠️ **CRITICAL**: The query output WILL show unresolved comments! DO NOT assume there are none if the output appears empty at first glance. The jq filter produces JSON objects, not a message saying "no comments". If you see JSON output, THOSE ARE THE UNRESOLVED COMMENTS TO PROCESS!

```bash
# STEP 1: First check total thread count to detect pagination needs
echo "Checking total review thread count..."
TOTAL_THREADS=$(gh api graphql -f query='
{
  repository(owner: "WilliamAGH", name: "williamcallahan.com") {
    pullRequest(number: [PR_NUMBER]) {
      reviewThreads {
        totalCount
      }
    }
  }
}' | jq '.data.repository.pullRequest.reviewThreads.totalCount')

echo "Total review threads: $TOTAL_THREADS"

# STEP 2: Handle pagination if needed (GitHub GraphQL limit is 100 per page)
echo "Checking for unresolved comments..."
if [ "$TOTAL_THREADS" -le 100 ]; then
  # Simple case: all threads fit in one request
  UNRESOLVED_COUNT=$(gh api graphql -f query='
  {
    repository(owner: "WilliamAGH", name: "williamcallahan.com") {
      pullRequest(number: [PR_NUMBER]) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
          }
        }
      }
    }
  }' | jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')
else
  # Complex case: need to paginate through all threads
  echo "PR has $TOTAL_THREADS threads, paginating through them..."
  UNRESOLVED_COUNT=0
  CURSOR=""
  
  while true; do
    if [ -z "$CURSOR" ]; then
      # First page
      RESPONSE=$(gh api graphql -f query='
      {
        repository(owner: "WilliamAGH", name: "williamcallahan.com") {
          pullRequest(number: [PR_NUMBER]) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }')
    else
      # Subsequent pages
      RESPONSE=$(gh api graphql -f query='
      {
        repository(owner: "WilliamAGH", name: "williamcallahan.com") {
          pullRequest(number: [PR_NUMBER]) {
            reviewThreads(first: 100, after: "'$CURSOR'") {
              nodes {
                id
                isResolved
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }')
    fi
    
    # Count unresolved in this page
    PAGE_UNRESOLVED=$(echo "$RESPONSE" | jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')
    UNRESOLVED_COUNT=$((UNRESOLVED_COUNT + PAGE_UNRESOLVED))
    
    # Check if more pages exist
    HAS_NEXT=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
    if [ "$HAS_NEXT" = "false" ]; then
      break
    fi
    
    # Get cursor for next page
    CURSOR=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')
  done
fi

echo "Found $UNRESOLVED_COUNT unresolved comments"

# STEP 3: If there are unresolved comments, fetch them with details
if [ "$UNRESOLVED_COUNT" -gt 0 ]; then
  echo "Fetching details of $UNRESOLVED_COUNT unresolved comments..."
  
  # Similar pagination logic for fetching full details
  if [ "$TOTAL_THREADS" -le 100 ]; then
    # Simple case
    gh api graphql -f query='
    {
      repository(owner: "WilliamAGH", name: "williamcallahan.com") {
        pullRequest(number: [PR_NUMBER]) {
          reviewThreads(first: 100) {
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
    }' | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | 
    "---\nThread ID: \(.id)\nPath: \(.path // "general comment")\nLine: \(.line // "N/A")\nComment ID: \(.comments.nodes[0].databaseId)\nAuthor: \(.comments.nodes[0].author.login)\nFirst line: \(.comments.nodes[0].body | split("\n")[0])"'
  else
    # Complex case: paginate through all unresolved threads
    echo "Paginating through unresolved comments..."
    CURSOR=""
    
    while true; do
      if [ -z "$CURSOR" ]; then
        # First page
        RESPONSE=$(gh api graphql -f query='
        {
          repository(owner: "WilliamAGH", name: "williamcallahan.com") {
            pullRequest(number: [PR_NUMBER]) {
              reviewThreads(first: 100) {
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
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }')
      else
        # Subsequent pages
        RESPONSE=$(gh api graphql -f query='
        {
          repository(owner: "WilliamAGH", name: "williamcallahan.com") {
            pullRequest(number: [PR_NUMBER]) {
              reviewThreads(first: 100, after: "'$CURSOR'") {
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
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }')
      fi
      
      # Output unresolved comments from this page
      echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | 
      "---\nThread ID: \(.id)\nPath: \(.path // "general comment")\nLine: \(.line // "N/A")\nComment ID: \(.comments.nodes[0].databaseId)\nAuthor: \(.comments.nodes[0].author.login)\nFirst line: \(.comments.nodes[0].body | split("\n")[0])"'
      
      # Check if more pages exist
      HAS_NEXT=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
      if [ "$HAS_NEXT" = "false" ]; then
        break
      fi
      
      # Get cursor for next page
      CURSOR=$(echo "$RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')
    done
  fi
  
  echo -e "\n✅ Above are all unresolved comments. Process each one individually."
fi
```

**⚠️ CRITICAL INTERPRETATION RULES:**

1. **ALWAYS run the count check first** - This tells you definitively if there are unresolved comments
2. **"Tool ran without output" does NOT mean no comments** - The shell might not echo JSON output
3. **If UNRESOLVED_COUNT > 0, there ARE comments to process** - Do not assume otherwise
4. **Each JSON object in Step 2 output = ONE unresolved thread** - Process every single one

**2. For each comment:**

**PROCESSING WORKFLOW FOR EACH UNRESOLVED COMMENT**:
```bash
# For EACH comment in the output:
# 1. Extract these values:
THREAD_ID="PRRT_..."      # From "Thread ID:" line
FILE_PATH="path/to/file"  # From "Path:" line  
LINE_NUM="123"            # From "Line:" line
COMMENT_ID="2148802948"   # From "Comment ID:" line (numeric!)

# 2. Read the full comment body
gh api graphql -f query='...' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.id == "'$THREAD_ID'") | .comments.nodes[0].body'

# 3. Analyze and decide (see Deep Thinking Protocol)

# 4. IF implementing:
- Read file at specified line
- Make changes
- Run: bun run lint && bun run type-check && bun run biome:check
- Commit ONLY this file with specific message

# 5. Reply to comment (use numeric COMMENT_ID):
gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR]/comments/$COMMENT_ID/replies \
  -f body="[Your response]"

# 6. Resolve thread (use THREAD_ID):
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "'$THREAD_ID'"}) { thread { isResolved } } }'
```

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

## 🤖 CRITICAL LLM INSTRUCTIONS

**MANDATORY EXECUTION PATTERN**:
```bash
1. RUN: UNRESOLVED_COUNT=$(gh api graphql -f query='...' | jq '[...] | length')
2. READ: The numeric value of $UNRESOLVED_COUNT
3. DECISION: If UNRESOLVED_COUNT > 0, then unresolved comments EXIST
4. ACTION: Process EVERY comment from Step 2 output
```

**OUTPUT INTERPRETATION RULES**:

- `Tool ran without output` → IGNORE THIS MESSAGE, run count check
- Empty visual output → DOES NOT MEAN no comments, run count check  
- `$UNRESOLVED_COUNT = 0` → No unresolved comments (ONLY valid signal)
- `$UNRESOLVED_COUNT > 0` → Unresolved comments EXIST, must process ALL

**FORBIDDEN ASSUMPTIONS**:

- ❌ "No output means no comments" → WRONG
- ❌ "Already processed this comment" → WRONG, only process `isResolved == false`
- ❌ "Can skip count check" → WRONG, count is mandatory first step
- ✅ "Trust only numeric count value" → CORRECT

## 📚 WORKING EXAMPLES

**Get all unresolved comments with both IDs:**
```bash
# First check total thread count
TOTAL_THREADS=$(gh api graphql -f query='
{
  repository(owner: "WilliamAGH", name: "williamcallahan.com") {
    pullRequest(number: 109) {
      reviewThreads {
        totalCount
      }
    }
  }
}' | jq '.data.repository.pullRequest.reviewThreads.totalCount')

# Then fetch with pagination if needed
if [ "$TOTAL_THREADS" -le 100 ]; then
  # Simple case: fetch all in one request
  gh api graphql -f query='
  {
    repository(owner: "WilliamAGH", name: "williamcallahan.com") {
      pullRequest(number: 109) {
        reviewThreads(first: 100) {
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
else
  # Complex case: use pagination (see main workflow above)
  echo "PR has more than 100 threads - use the full pagination workflow from Step 2"
fi
```

**Get IDs for specific file:**
```bash
# For a specific file's comments
gh api graphql -f query='...' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.path == "lib/utils/api-sanitization.ts" and .isResolved == false)'
```
