Review and resolve comments on open pull requests.

Note: The comments you're about to review are not dictations, they are suggestions you need to review carefully using your own deep thinking, and, after you summarize your own thoughts, after you send them to Zen MCP for scrutiny of your proposed actions before proceeding to any implementation of suggested changes.

IMPORTANT: This workflow uses GraphQL to fetch ONLY unresolved comments, avoiding:

- Processing already-resolved threads
- Token limit errors from large PR comment histories
- Duplicate work on previously addressed issues

Repository: <https://github.com/WilliamAGH/williamcallahan.com>
Owner: WilliamAGH
Repo: williamcallahan.com

STEP 0: Run `git branch --show-current` to capture the current branch name.

STEP 1: Use @mcp__github__list_pull_requests with owner="WilliamAGH" repo="williamcallahan.com" state="open" to get open PRs and output the list.

STEP 2: For each PR (max 5), retrieve ONLY UNRESOLVED review comments:
 a) Use GraphQL to get unresolved threads only:
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
 b) This approach:
    - Only fetches unresolved threads
    - Avoids token limits by using GraphQL
    - Gets thread IDs needed for resolution
 c) For very large PRs, use pagination with `after` cursor

STEP 3: For unresolved comments:
 a) Use @mcp__zen__thinkdeep to analyze deeply if needed
 b) Check exact file state with Read tool at specific line numbers
 c) If code changes needed, implement them using Edit/MultiEdit tools
 d) Document the resolution approach

STEP 4: Reply to each comment with resolution details:
 a) Use GitHub CLI to reply to comments:
    `gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR_NUMBER]/comments/[COMMENT_ID]/replies -f body="Your reply message"`
 b) Include specific commit hash (e.g., "Fixed in commit abc123")
 c) IMPORTANT: Comments are NOT automatically resolved when replied to - manual resolution required
 d) To resolve a comment thread, use GraphQL mutation (see examples below)

STEP 5: If code was changed, commit with descriptive message:
 a) Stage individual files: `git add path/to/file.ts`
 b) Commit individual files: `git commit path/to/file.ts -m "fix(scope): specific change description"`
 c) Use conventional commit format: "fix(scope): address PR #X review comments"
 d) Reference specific issues addressed in commit messages

Output summary of all PRs reviewed, comments resolved, and code changes made.

TROUBLESHOOTING TIPS:

- If @mcp__github__get_pull_request_comments fails due to token limit, use GitHub CLI with jq filtering
- For very large PRs, process comments in batches by file path
- Use `gh pr review [PR_NUMBER] --repo WilliamAGH/williamcallahan.com` to see review status
- NOTE: The MCP GitHub tool does NOT support resolving review threads - use GitHub CLI with GraphQL instead
- Comments must be manually resolved - they do NOT auto-resolve when owner replies

SUCCESSFUL COMMAND EXAMPLES:

1. Get ONLY unresolved comments with details:
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
                 body
                 author { login }
               }
             }
           }
         }
       }
     }
   }' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | {threadId: .id, path: .path, line: .line, commentId: .comments.nodes[0].id, body: (.comments.nodes[0].body | split("\n")[0]), author: .comments.nodes[0].author.login}'
   ```

2. Reply to a comment:
   `gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/109/comments/2129845641/replies -f body="Fixed in commit a09cf7c. The hard-coded value has been replaced with the constant."`

3. Check if comments are resolved:
   `gh api graphql -f query='{ repository(owner: "WilliamAGH", name: "williamcallahan.com") { pullRequest(number: 109) { reviewThreads(first: 10) { nodes { id isResolved comments(first: 1) { nodes { body } } } } } } }'`

4. Commit individual files:
   `git add scripts/update-s3-data.ts && git commit scripts/update-s3-data.ts -m "fix(scripts): update comment to use constant instead of hard-coded value"`

5. Resolve a comment thread (requires thread ID from GraphQL):
   ```bash
   gh api graphql -f query='
   mutation {
     resolveReviewThread(input: {threadId: "PRRT_kwDONglMk85RjfP5"}) {
       thread {
         isResolved
       }
     }
   }'
   ```

6. Get review thread IDs:
   ```bash
   gh api graphql -f query='
   {
     repository(owner: "WilliamAGH", name: "williamcallahan.com") {
       pullRequest(number: 109) {
         reviewThreads(first: 20) {
           nodes {
             id
             isResolved
             resolvedBy { login }
             comments(first: 1) {
               nodes {
                 body
                 author { login }
               }
             }
           }
         }
       }
     }
   }'
   ```
