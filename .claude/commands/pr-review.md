Review and resolve comments on open pull requests.

Repository: <https://github.com/WilliamAGH/williamcallahan.com>
STEP 0: Run `git branch --show-current` to capture the current branch name.

STEP 1: Use @mcp__github__list_pull_requests to get open PRs and output the list.

STEP 2: For each PR (max 5), get and output review comments using @mcp__github__get_pull_request_comments.

STEP 3: For unresolved comments:
 a) Use @mcp__zen__thinkdeep to analyze deeply
 b) Use @mcp__github__get_pull_request_files to see changes
 c) If code changes needed, implement them using Edit/MultiEdit tools
 d) Document the resolution

STEP 4: Reply to each comment with resolution details and mark resolved.

STEP 5: If code was changed, commit with descriptive message.

Output summary of all PRs reviewed, comments resolved, and code changes made.
