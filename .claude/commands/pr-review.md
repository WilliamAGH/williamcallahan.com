Review and resolve comments on open pull requests.

Note: The comments you're about to review are not dictations, they are suggestions you need to review carefully using your own deep thinking, and, after you summarize your own thoughts, after you send them to Zen MCP for scrutiny of your proposed actions before proceeding to any implementation of suggested changes.

Repository: <https://github.com/WilliamAGH/williamcallahan.com>
Owner: WilliamAGH
Repo: williamcallahan.com

STEP 0: Run `git branch --show-current` to capture the current branch name.

STEP 1: Use @mcp__github__list_pull_requests with owner="WilliamAGH" repo="williamcallahan.com" state="open" to get open PRs and output the list.

STEP 2: For each PR (max 5), retrieve review comments efficiently:
 a) Use GitHub CLI for focused comment retrieval:
    `gh api repos/WilliamAGH/williamcallahan.com/pulls/[PR_NUMBER]/comments --paginate | jq -r '.[] | select(.in_reply_to_id == null) | {id: .id, path: .path, line: .line, body: .body}' | head -20`
 b) For large PRs with many comments, use pagination and filtering to avoid token limits
 c) Focus on unresolved, top-level comments (not replies)

STEP 3: For unresolved comments:
 a) Use @mcp__zen__thinkdeep to analyze deeply if needed
 b) Check exact file state with Read tool at specific line numbers
 c) If code changes needed, implement them using Edit/MultiEdit tools
 d) Document the resolution approach

STEP 4: Reply to each comment with resolution details:
 a) Use GitHub CLI to reply to comments:
    `gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/[PR_NUMBER]/comments/[COMMENT_ID]/replies -f body="Your reply message"`
 b) Include specific commit hash (e.g., "Fixed in commit abc123") 
 c) Comments are automatically marked as resolved when replied to via GitHub API

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

SUCCESSFUL COMMAND EXAMPLES:

1. Get comment IDs with first line of body:
   `gh api repos/WilliamAGH/williamcallahan.com/pulls/109/comments --paginate | jq -r '.[] | select(.in_reply_to_id == null) | {id: .id, path: .path, line: .line, body: (.body | split("\n")[0])} | @json' | head -5`

2. Reply to a comment:
   `gh api -X POST repos/WilliamAGH/williamcallahan.com/pulls/109/comments/2129845641/replies -f body="Fixed in commit a09cf7c. The hard-coded value has been replaced with the constant."`

3. Check if comments are resolved:
   `gh api graphql -f query='{ repository(owner: "WilliamAGH", name: "williamcallahan.com") { pullRequest(number: 109) { reviewThreads(first: 10) { nodes { id isResolved comments(first: 1) { nodes { body } } } } } } }'`

4. Commit individual files:
   `git add scripts/update-s3-data.ts && git commit scripts/update-s3-data.ts -m "fix(scripts): update comment to use constant instead of hard-coded value"`
