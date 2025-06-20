Create a smart git commit with conventional commit message.

Files to commit: $ARGUMENTS

STEP 1: Show git status to see all changes.

STEP 2: Check if there are already staged files:

- If files are already staged (in "Changes to be committed"), skip to STEP 3 to review them
- If no files are staged AND no files specified in arguments, user wants to commit ALL changes - use 'git add .' BUT ONLY if explicitly confirmed
- If no files are staged AND specific files provided in arguments, stage only those specific files

STEP 3: Run git diff --cached to show what will be committed.

STEP 4: Analyze the changes to understand what was done.

STEP 5: Write a commit message using conventional format: 'category: short description'.
Categories:

- feat (new feature)
- fix (bug fix)
- docs (documentation)
- style (formatting)
- refactor (code restructuring)
- test (tests)
- chore (maintenance)

Keep under 50 characters.

STEP 6: Execute the commit with your generated message.
IMPORTANT: NEVER include Claude code attribution or co-author tags in commits.

STEP 7: Show the commit hash and message.

Example: 'fix: resolved bookmark API timeout issue'.
