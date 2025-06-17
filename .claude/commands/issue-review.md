Review and potentially fix a GitHub issue.

Repository: https://github.com/WilliamAGH/williamcallahan.com
Owner: WilliamAGH
Repo: williamcallahan.com

STEP 0: Run `git branch --show-current` to capture the current branch name for additional context.
Issue: #$ARGUMENTS

STEP 1: Use @mcp__github__get_issue with owner="WilliamAGH" repo="williamcallahan.com" issue_number=$ARGUMENTS to get and output full issue details.

STEP 2: Use @mcp__zen__thinkdeep with model='pro' to deeply analyze the issue.

STEP 3: Search for relevant code using @mcp__github__search_code with q="repo:WilliamAGH/williamcallahan.com <search_terms>" and Read tools.

STEP 4: If issue is actionable and can be fixed now:
a) Implement the fix using Edit/MultiEdit tools
b) Document all changes made
c) Create comprehensive test if needed

STEP 5: Post detailed comment on issue using @mcp__github__add_issue_comment with owner="WilliamAGH" repo="williamcallahan.com" issue_number=$ARGUMENTS body="<your_analysis_and_plan>" including: analysis, changes made (if any), or implementation plan if changes are too large.

STEP 6: If fixed, mention it can be closed after review.

Output summary of analysis and all actions taken.
