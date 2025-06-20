# /update-pr

Update the PR title and description based on commit analysis and file changes.

**Repository**: <https://github.com/WilliamAGH/williamcallahan.com>

**Project Constants**:

- Owner: `WilliamAGH`
- Repo: `williamcallahan.com`

## Usage

`/update-pr [PR_NUMBER]`

- If PR_NUMBER is provided: Update that specific PR
- If no PR_NUMBER: Ask user which PR to update

## Behavior

1. Determine target PR:
   - Use provided PR number, OR
   - Ask user to select from open PRs
2. Fetch PR data (in order of preference):
   - GitHub MCP tools (use owner: WilliamAGH, repo: williamcallahan.com)
   - `gh` CLI commands
   - GitHub REST/GraphQL API as fallback
3. Look at the current PR title and description for initial context
4. Analyze all commit messages in the current PR
5. Count the total files edited
6. If < 50 files: Read the actual file changes
7. If ≥ 50 files: Rely only on commit messages, existing PR description, and context
8. Rewrite the PR title and description to capture maximum detail and specificity
9. Structure the description with bullet points organized by:
   - New features
   - Bug fixes
   - Refactoring
   - Documentation
   - Other changes
10. Do not make assumptions - only describe what is evident from the changes
11. IMPORTANT: When analyzing commits, ignore any Claude code attribution or co-author tags - never include these in PR descriptions

## Purpose

Often, PRs are opened before the total scope is known. This command reorganizes the PR metadata to accurately detail what the PR does based on the actual work completed.
