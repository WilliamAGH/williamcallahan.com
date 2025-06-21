Create a smart git commit with conventional commit message.

Files to commit: $ARGUMENTS

## 🚨 CRITICAL: Pre-Commit Validation

**MANDATORY: Run validation BEFORE and AFTER making any changes**

STEP 0: **Always run validation first to ensure clean starting point:**
```bash
bun run validate
```

This command runs ALL checks according to @docs/projects/structure/linting-formatting.md:

- **Biome:** Formatting and foundational linting
- **ESLint:** Advanced, type-aware linting  
- **TypeScript Compiler (tsc):** Ultimate type correctness check

**Requirements:**

- Must show 0 errors, 0 warnings
- NEVER use @ts-ignore, @ts-expect-error, or eslint-disable
- Fix ALL type safety issues properly before proceeding

## Main Commit Workflow

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

STEP 6: **Run validation again to ensure changes don't break anything:**
```bash
bun run validate
```

**If validation fails:** Fix all issues according to @docs/projects/structure/linting-formatting.md before committing.

STEP 7: Execute the commit with your generated message.

🚨 CRITICAL: NEVER include any Claude attribution, co-author tags, or AI-generated markers in commits. This includes:

- 🤖 Generated with [Claude Code]
- Co-Authored-By: Claude
- Any other AI attribution

Keep commits clean and professional.

STEP 8: Show the commit hash and message.

## Type Safety Resolution Guide

If `bun run validate` fails, apply these resolution strategies:

**Common TypeScript/ESLint Issues:**

- `@typescript-eslint/no-unsafe-assignment`: Use `unknown` instead of `any`
- `@typescript-eslint/no-unsafe-member-access`: Add null checks or optional chaining
- `@typescript-eslint/no-explicit-any`: Define proper types in types/ directory
- `project/no-duplicate-types`: Use @type-flattener to consolidate duplicates

**Resolution Examples:**
```typescript
// BAD: const data = JSON.parse(input);
// GOOD: const data: unknown = JSON.parse(input);
// BETTER: const data = UserSchema.parse(JSON.parse(input));
```

**Never bypass type system - always fix root cause.**

Example: 'fix: resolved bookmark API timeout issue'.
