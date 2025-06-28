---
description: "Master configuration for ZERO TEMPERATURE development environment with absolute type safety, no assumptions, and mandatory verification workflow."
alwaysApply: true  # Exception: This master config file always applies to provide complete development governance
---

# CLAUDE Development Environment - ZERO TEMPERATURE PROTOCOLS

This project operates under **ZERO TEMPERATURE** development standards where every decision must be explicitly verified, no assumptions are permitted, and type safety is absolute.

## 🎯 COMMUNICATION PRINCIPLES - TRUTH THROUGH VERIFICATION

### Empty Platitudes & Premature Agreement - ABSOLUTELY FORBIDDEN

**NEVER use empty confirmations or filler phrases:**

- ❌ "You're right!" (without verification)
- ❌ "That makes sense!" (before investigation)
- ❌ "Good point!" (as filler)
- ❌ "I understand" (without demonstrating understanding)
- ❌ "Absolutely!" (without certainty)
- ❌ Generic affirmations before code verification

**INSTEAD, seek truth through investigation:**

- ✅ "Let me verify that by checking..."
- ✅ "I'll investigate the codebase to confirm..."
- ✅ "After examining the code, I can confirm..."
- ✅ "The evidence in [file:line] shows..."
- ✅ Demonstrate understanding through specific code references

### Truth-Seeking Protocol

**Your role is to be a seeker of the deepest level of truth and accuracy:**

1. **Investigate First**: Never agree or disagree until you've examined the code
2. **Evidence-Based Responses**: Support statements with specific file references
3. **Acknowledge Uncertainty**: If unsure, investigate rather than guess
4. **Respectful Verification**: Be patient and thorough without being agreeable or argumentative
5. **Precision Over Politeness**: Accuracy matters more than social niceties

## 🚨 ZERO TOLERANCE VIOLATIONS (IMMEDIATE HALT REQUIRED)

### Type Safety Violations - ABSOLUTELY FORBIDDEN

**IMMEDIATE HALT CONDITIONS:**

- Any `@ts-ignore` usage
- Any `eslint-disable` usage
- Any `any` type without explicit justification in comments
- Any external data without Zod validation
- Any type assertion without runtime checks
- Any implicit `any` types

### Polyfill Violations - ABSOLUTELY FORBIDDEN (2025)

**CRITICAL MANDATE: NO POLYFILLS IN MODERN CODEBASE**

- Any `core-js`, `@babel/polyfill`, `react-app-polyfill`, `polyfill.io` imports
- Any `whatwg-fetch`, `isomorphic-fetch`, `cross-fetch`, `node-fetch` usage
- Any package that patches `globalThis`, `window`, or `global` objects
- Any legacy browser support packages
- Any "kitchen-sink" polyfills

**MODERN ALTERNATIVES ONLY:**

- ✅ Use native Node 22 LTS APIs (`fetch`, `URL`, `TextEncoder`, etc.)
- ✅ Use ponyfills (import-only modules without global mutations)
- ✅ Use feature detection with dynamic imports
- ✅ Move processing to Server Components/Edge Functions

**VIOLATION PROTOCOL:**

1. **IMMEDIATELY STOP** all development work
2. **ALERT USER** with specific violation details
3. **DO NOT PROCEED** until violation is properly resolved

### Boilerplate & Example Code Prohibition - ABSOLUTELY FORBIDDEN

Claude is **NEVER EVER ALLOWED** to use:

- Boilerplate code from tutorials or examples
- Generic placeholder implementations (`// TODO: Implement this`)
- Copy-paste code from documentation examples
- Template code from previous projects
- Generic function names like `handleSubmit`, `processData`
- Placeholder text like "Lorem ipsum" or "Example content"

**VIOLATION DETECTION PROTOCOL:**
```
🚨 CRITICAL VIOLATION DETECTED 🚨
Boilerplate/example code found in: [file:line]
Code pattern: [description]
Source: [where it likely came from]
Required action: Manual review and replacement
```

### Assumptions Policy - ABSOLUTELY FORBIDDEN

**ASSUMPTION = VIOLATION**

NEVER assume:

- API behavior without checking current docs
- Type definitions without reading `.d.ts` files
- Existing functionality without searching codebase
- File contents without reading them directly
- Breaking changes without checking CHANGELOG.md

### File Creation Without Consent - ABSOLUTELY FORBIDDEN

**NO NEW FILES WITHOUT EXPLICIT REPEATED CLEAR AFFIRMATIVE CONSENT**

- Presumption is NEVER consent - must be explicitly stated
- Always try to use existing files first
- Ask for specific permission: "Should I create a new file [filename] for [purpose]?"
- Wait for clear "yes" before proceeding

## 🛡️ MANDATORY PRE-TASK WORKFLOW (Required Before Any Code Changes)

### Step 1: Architecture Context Discovery

**MANDATORY SEQUENCE:**

1. Read `docs/projects/structure/00-architecture-entrypoint.md`
2. Identify functionality domain from task description
3. Read `docs/projects/structure/[functionality].md` for that domain
4. Review any `.mmd` diagrams for that functionality
5. Read `docs/projects/file-overview-map.md` for file relationships

### Step 2: Type System Review

**MANDATORY for ANY task:**

1. **Review ALL types in `types/` directory related to domain/functionality**
   ```bash
   # Search for related types
   find types/ -name "*.ts" | xargs grep -l "[functionality-keyword]"
   ```
2. **Read actual type definitions - NEVER assume what they contain**
3. **Check for existing types before creating new ones**
4. **Verify interface compatibility**

### Step 3: Existing Functionality Search

**NEVER assume functionality doesn't exist - ALWAYS search first:**
```bash
# Comprehensive search for existing functionality
grep -r "[task-keyword]" --include="*.ts" --include="*.tsx" .
find . -name "*[task-keyword]*" -type f
```

**Use Task tool for complex searches across multiple patterns**

### Step 4: Documentation Verification

**MANDATORY version verification:**

1. Check `package.json` for EXACT dependency versions
2. Use MCP providers for current documentation:
   ```bash
   @mcp__context7__resolve-library-id libraryName="[dependency]"
   @mcp__context7__get-library-docs context7CompatibleLibraryID="[id]" topic="[feature]"
   ```
3. Read `node_modules/[package]/` directly for truth:
   ```bash
   Read node_modules/[package]/package.json
   Read node_modules/[package]/README.md
   Read node_modules/[package]/CHANGELOG.md
   ```

## ⚡ CODE MODIFICATION PRINCIPLES (How to Edit Code)

### Efficiency Mandate

**Nearly ALL code edits should result in SAME or FEWER lines of code:**

- Look for duplicate code to remove during EVERY task
- Find more efficient ways to accomplish the same result
- Consolidate similar functionality
- Remove redundant imports and variables

### Existing-First Policy

**ALWAYS prefer editing existing files over creating new ones:**

1. Search for existing implementations
2. Extend existing functionality rather than duplicating
3. Refactor existing code to be more general if needed
4. Only create new files with explicit consent

### Real-Time Verification

**Referenced code MUST be reviewed at that moment:**

- Never assume what imported functions do - read them
- Check actual type definitions when using types
- Verify interface implementations immediately
- Read component props and state definitions before use

### Code Efficiency Checklist

Before completing any task:

- [ ] Could this be done with fewer lines?
- [ ] Is there duplicate code that can be removed?
- [ ] Does similar functionality already exist?
- [ ] Are all imports actually needed?
- [ ] Can multiple similar functions be consolidated?

## 📚 DOCUMENTATION & ARCHITECTURE SYNC

### Mandatory Documentation Updates

**Whenever you create, delete, move, or significantly edit any file:**

1. Update `docs/projects/structure/00-architecture-entrypoint.md`
2. Update `docs/projects/file-overview-map.md`
3. Update specific functionality document: `docs/projects/structure/[functionality].md`

### Architecture Alignment

**MUST verify changes don't violate documented architecture:**

- Check *Critical Issues* sections in functionality docs
- Verify against documented patterns
- Ensure consistency with existing implementations

## 📏 FILE MANAGEMENT POLICIES

### 500-Line Limit - ABSOLUTE MAXIMUM

**No file should exceed 500 lines of code:**

- Monitor during edits - stop before exceeding limit
- Create refactoring PBI if approaching limit
- Split into logical, maintainable modules

### Refactoring Requirements

When file approaches 500 lines:

1. **STOP development** - do not add more code
2. **Create refactoring PBI** with data-driven analysis
3. Study existing patterns in repository
4. Design safe refactoring maintaining functionality

## ✅ VALIDATION & QUALITY ASSURANCE

### Mandatory Validation

**BEFORE and AFTER every code change:**
```bash
bun run validate
```

**Requirements:**

- MUST show 0 errors, 0 warnings
- Fix ALL issues according to `@docs/projects/structure/linting-formatting.md`
- NEVER use bypass methods (@ts-ignore, eslint-disable)

### Type Safety Standards

**EVERY SINGLE LINE OF CODE MUST:**

- Have explicit types (no implicit `any`)
- Use proper null/undefined handling
- Validate external data with Zod schemas
- Follow strictest TypeScript settings
- Pass validation with ZERO errors/warnings

### 🧪 TESTING REQUIREMENTS

**MANDATORY TEST COMMANDS - NEVER run `bun test` directly:**

```bash
# CORRECT - Use these commands only:
bun run test                    # Full test suite
bun run test:watch             # Watch mode
bun run test:coverage          # Coverage report
bun run test:ci                # CI environment
bun run test:smoke             # Smoke tests only

# FORBIDDEN - Never use:
bun test                       # ❌ Bypasses Jest config
bun test --watch              # ❌ Bypasses Jest config
bun test [filename]           # ❌ Bypasses Jest config
```

**Why npm scripts are required:**

- Loads proper Jest configuration from `config/jest/config.ts`
- Sets up essential test environment configuration (NO POLYFILLS on Node 22 LTS)
- Configures JSDOM environment for DOM testing
- Enables `jest.mock` and other Jest globals
- Handles module resolution and path aliases
- **CRITICAL**: Ensures native Node 22 APIs are used (no polyfill imports)

## 🔄 COMMIT & VERSION CONTROL

### No AI Attribution Policy - ABSOLUTELY FORBIDDEN

**NEVER include in commits:**

- 🤖 Generated with [Claude Code]
- Co-Authored-By: Claude <noreply@anthropic.com>
- Any other AI attribution or markers

**All commits must be clean, professional messages without AI attribution.**

### Current Version Documentation

**ALWAYS verify against EXACT versions in package.json:**

- Use MCP providers for current docs
- Read node_modules directly for truth
- Check for breaking changes in CHANGELOG.md
- Research migration guides when APIs change

## 🎯 CURSOR RULES SYSTEM

### Rule Configuration Standards

All rules follow Agent Requested configuration:
```yaml
---
description: "Brief, specific description"
alwaysApply: false  # All rules are Agent Requested type
---
```

### Available Architecture Documentation

**Functionality domains in `docs/projects/structure/`:**

- accessibility, analytics, app-layout, batch-fetch-update
- blog-article, blog, bookmarks, caching, code-block
- config, css, data-access, education, experience
- github-activity, home, hooks, image-handling
- instrumentation-monitoring, interactive-containers
- investments, json-handling, linting-formatting
- log-error-debug-handling, macos-gui, memory-mgmt
- middleware, navigation, opengraph, projects
- rate-limit-and-sanitize, s3-object-storage, search
- seo, social-links, state-theme-window-providers
- string-manipulation, terminal, testing-config

### Agent Requested Benefits

- **Context-Aware**: Rules included only when relevant
- **Performance**: Reduced context overhead
- **Flexibility**: AI makes intelligent rule decisions
- **Zero Assumptions**: Every decision explicitly verified

## 🔍 VERIFICATION COMMANDS

```bash
# Check current dependency versions
cat package.json | jq '.dependencies'

# Find files over 400 lines (warning threshold)
find . -name "*.ts" -o -name "*.tsx" -exec wc -l {} + | awk '$1 > 400' | sort -n

# Search for existing functionality
grep -r "[keyword]" --include="*.ts" --include="*.tsx" .

# Validate codebase
bun run validate

# Review types for domain
find types/ -name "*.ts" | xargs grep -l "[domain]"

# Run tests (NEVER use 'bun test' directly!)
bun run test
```

---

**REMEMBER: This is a ZERO TEMPERATURE environment. Every decision must be explicitly verified. Assumptions are violations. Type safety is absolute. Efficiency is mandatory. ALWAYS use `bun run test` - NEVER `bun test` directly. NO POLYFILLS - use Node 22 LTS native APIs only.**
