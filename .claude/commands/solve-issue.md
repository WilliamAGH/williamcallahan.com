Comprehensive issue resolution workflow with full context gathering and testing.

Repository: https://github.com/WilliamAGH/williamcallahan.com
Owner: WilliamAGH
Repo: williamcallahan.com

Issue/Problem Description: $ARGUMENTS

STEP 1: Issue Tracking Setup
First, ask the user: "Would you like to: 
1) Create a new GitHub issue for this problem
2) Link this to an existing GitHub issue (provide issue number)
3) Proceed without creating/linking to an issue (just fix it now)
Please respond with 1, 2, or 3"

If option 1: Use @mcp__github__create_issue with owner="WilliamAGH" repo="williamcallahan.com" to create the issue
If option 2: Use @mcp__github__get_issue with owner="WilliamAGH" repo="williamcallahan.com" issue_number=<provided_number> to get issue details

STEP 2: Context Discovery (Run in parallel using Task agents)
While waiting for user response, begin gathering context:
a) List all documented functionalities: ls -la docs/projects/structure/
b) Based on the problem description, identify which functionality areas are likely affected
c) For each potentially affected functionality:
   - Read docs/projects/structure/<functionality>.md
   - Read docs/projects/structure/<functionality>.mmd if it exists
   - Use Grep to find all files tagged with that functionality
d) Use Read tool to examine docs/projects/file-overview-map.md to understand file-to-functionality mapping

STEP 3: Deep Analysis with Zen MCP
Once all context is gathered:
a) Use @mcp__zen__thinkdeep with model="pro" and thinking_mode="max" to:
   - Analyze the issue in context of the functionality documentation
   - Identify all files that need to be modified
   - Consider edge cases and potential side effects
   - Create a comprehensive solution plan
b) Use @mcp__zen__codereview on key files to understand current implementation
c) Identify any gaps or risks in the plan and address them

STEP 4: Create Action Plan
Generate a detailed todo list using TodoWrite with:
- Specific files to modify
- Tests to write or update
- Documentation to update
- Order of operations to minimize risk

STEP 5: Implementation
For each todo item:
a) Mark as in_progress
b) Use Read to examine the file
c) Use Edit/MultiEdit to make changes
d) Document what was changed and why
e) Mark as completed

STEP 6: Update Documentation
CRITICAL: If ANY structural changes were made:
a) Update docs/projects/structure/<functionality>.md with new architecture details
b) Update docs/projects/structure/<functionality>.mmd diagrams if logic flow changed
c) Update docs/projects/file-overview-map.md if new files were added or file purposes changed
d) Ensure all documentation accurately reflects the new state

STEP 7: Automated Testing
Run tests for affected functionalities:
a) Identify test files related to the changed functionality
b) Run those specific tests using: bun run test <test-files>
c) If any tests fail, fix them immediately
d) Run tests again to ensure 100% pass rate
e) Check coverage to ensure no regression

STEP 8: Manual Testing Guidance
Provide the user with:
a) Specific steps to test the fix manually
b) Expected behavior to verify
c) Edge cases to check
Wait for user confirmation that manual testing passed.

STEP 9: Final Verification
Once user confirms testing passed:
a) Run full test suite one more time
b) Run linting on changed files
c) Ensure no new warnings or errors introduced

STEP 10: Commit Changes
ONLY after ALL tests pass and user confirms:
Ask: "All tests are passing and the fix is verified. Would you like to commit these changes? (yes/no)"
If yes:
a) Show all changed files with git status
b) Create a comprehensive commit message summarizing:
   - What issue was fixed
   - Which functionality was affected
   - What approach was taken
c) Commit using conventional format (fix:, feat:, etc.)
d) Show the commit hash

STEP 11: Issue Closure
If a GitHub issue was created or linked:
a) Post a final comment using @mcp__github__add_issue_comment with owner="WilliamAGH" repo="williamcallahan.com" issue_number=<issue_number> summarizing the fix
b) Reference the commit hash in the comment
c) Ask if the issue should be closed
d) If yes, use @mcp__github__update_issue with owner="WilliamAGH" repo="williamcallahan.com" issue_number=<issue_number> state="closed"

Output a complete summary of all actions taken, files changed, and tests run.