# AGENTS Guide - ZERO TEMPERATURE Development

> **🚨 CRITICAL**: This project operates under **ZERO TEMPERATURE** standards. Every decision must be explicitly verified. No assumptions permitted. Type safety is absolute.

## 🎯 COMMUNICATION STANDARDS - TRUTH THROUGH VERIFICATION

### Avoid Empty Platitudes & Premature Agreement

**FORBIDDEN responses before investigation:**

- ❌ "You're right!" / "That makes sense!" / "Good point!"
- ❌ Agreement or disagreement without code verification
- ❌ Filler phrases that add no value

**REQUIRED approach:**

- ✅ Investigate first, respond with evidence
- ✅ Reference specific code locations
- ✅ Acknowledge when investigation is needed
- ✅ Be respectful but prioritize accuracy

## 🎯 Quick Start - Essential Knowledge

### 1. Architecture Navigation (MANDATORY)

**Before ANY task**: Read `docs/projects/structure/00-architecture-entrypoint.md` to identify the relevant functionality domain, then read the specific `.md` file for that domain.

### 2. Core Commands

```bash
# Development & Building
bun run dev                    # Development server  
bun run build:only            # Production build
bun run validate              # MANDATORY before commits (0 errors/warnings)

# Code Quality
bun run lint && bun run biome:lint    # Linting
bun run type-check                    # TypeScript validation

# Testing (NEVER use 'bun test' directly!)
bun run test                   # ✅ CORRECT - Full test suite with Jest
bun run test:watch            # ✅ CORRECT - Watch mode
bun run test:coverage         # ✅ CORRECT - Coverage report
# ❌ FORBIDDEN: bun test (bypasses Jest configuration)
```

## 🚨 ZERO TOLERANCE VIOLATIONS (Immediate Halt Required)

### Type Safety Violations - ABSOLUTELY FORBIDDEN

- `@ts-ignore` or `eslint-disable` usage
- `any` type without explicit justification
- External data without Zod validation
- Type assertions without runtime checks

### Modern Development Violations (2025) - ABSOLUTELY FORBIDDEN  

- **NO POLYFILLS**: `core-js`, `@babel/polyfill`, `whatwg-fetch`, `node-fetch`
- Use **Node 22 LTS native APIs**: global `fetch`, `URL`, `TextEncoder`
- **File Creation**: No new files without explicit consent

### Testing Violations - ABSOLUTELY FORBIDDEN

- Using `bun test` directly (bypasses Jest config)
- Missing `jest.mock` setup for modules
- Polyfill imports in test files

**VIOLATION PROTOCOL**: STOP → Alert user → Wait for resolution

## 📚 Architecture & Documentation System

### Core References

- **Master Guide**: [`CLAUDE.md`](./CLAUDE.md) - Complete ZERO TEMPERATURE protocols
- **Architecture Map**: [`docs/projects/structure/00-architecture-entrypoint.md`](./docs/projects/structure/00-architecture-entrypoint.md)
- **Type Safety**: [`docs/projects/structure/linting-formatting.md`](./docs/projects/structure/linting-formatting.md)

### Key Functionality Domains

| Domain | Purpose | Documentation |
|--------|---------|---------------|
| `bookmarks` | Bookmark data management | [`bookmarks.md`](./docs/projects/structure/bookmarks.md) |
| `caching` | Multi-tier caching system | [`caching.md`](./docs/projects/structure/caching.md) |
| `image-handling` | Image processing & storage | [`image-handling.md`](./docs/projects/structure/image-handling.md) |
| `memory-mgmt` | Memory management protocols | [`memory-mgmt.md`](./docs/projects/structure/memory-mgmt.md) |
| `testing-config` | Testing setup & patterns | [`testing-config.md`](./docs/projects/structure/testing-config.md) |

[**View all 40+ domains →**](./docs/projects/structure/00-architecture-entrypoint.md)

## ⚡ Code Modification Principles

### Efficiency Mandate

- **Nearly ALL edits should result in SAME or FEWER lines of code**
- Remove duplicate code during every task
- Consolidate similar functionality
- Prefer editing existing files over creating new ones

### Code Style Standards

```typescript
// ✅ CORRECT: Imports order
import { external } from 'library';           // External modules first
import { internal } from '@/components/ui';   // Absolute paths second  
import { local } from './local-file';         // Relative paths last

// ✅ CORRECT: Type safety
const UserSchema = z.object({ id: z.string(), name: z.string() });
const user = UserSchema.parse(externalData);  // Zod validation required

// ✅ CORRECT: Error handling  
import { CustomError } from '@/lib/errors';
throw new CustomError('Specific error context');

// ❌ FORBIDDEN: Type violations
const data: any = response;           // No 'any' types
// @ts-ignore                        // No ignore comments
const user = data as User;           // No unsafe assertions
```

### Naming Conventions

- Files/components: `kebab-case`
- Types: in `types/` directory
- Functions: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

## 🔒 Security & Performance Requirements

### Input Validation

- **ALL external data** must use Zod schemas
- **API endpoints** must validate query parameters  
- **File operations** must validate paths and sizes

### Memory Management

- **Images**: Use `UnifiedImageService` for all operations ([details](./docs/projects/structure/image-handling.md))
- **Caching**: Follow multi-tier strategy ([details](./docs/projects/structure/caching.md))
- **S3 Operations**: Use established patterns ([details](./docs/projects/structure/s3-object-storage.md))

## 📋 Pre-Task Workflow (MANDATORY)

### 1. Architecture Discovery

```bash
# Read master architecture document
docs/projects/structure/00-architecture-entrypoint.md

# Identify relevant functionality domain
# Read specific domain documentation: docs/projects/structure/[domain].md
```

### 2. Existing Code Search

```bash
# Search for existing functionality (NEVER assume it doesn't exist)
grep -r "[task-keyword]" --include="*.ts" --include="*.tsx" .
find . -name "*[task-keyword]*" -type f
```

### 3. Type System Review

```bash
# Check existing types before creating new ones
find types/ -name "*.ts" | xargs grep -l "[functionality-keyword]"
```

## 🧪 Testing Protocols

### Essential Testing Rules

- **ALWAYS** use `bun run test` scripts (never `bun test` directly)
- **Mock global.fetch** for API tests (Node 22 native, no imports needed)
- **Await async queries**: Use `findBy*` and `waitFor` properly
- **No side effects in waitFor**: Keep event triggers outside

### Example Test Pattern

```typescript
// ✅ CORRECT: Modern testing with native fetch
beforeEach(() => {
  global.fetch = jest.fn(); // Native Node 22 fetch, no imports
});

it('should handle API response', async () => {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: 'test' }),
  } as Response);
  
  render(<MyComponent />);
  expect(await screen.findByText('test')).toBeInTheDocument();
});
```

## 📝 Documentation Sync (MANDATORY)

### When to Update Documentation

**Always update these when modifying files**:

- `docs/projects/structure/00-architecture-entrypoint.md`
- `docs/projects/file-overview-map.md`  
- Relevant functionality doc: `docs/projects/structure/[domain].md`

### File Management Rules

- **500-line limit**: No file should exceed 500 lines
- **No new files** without explicit consent
- **Existing-first policy**: Extend existing files when possible

## 🔍 Validation & Quality Gates

### Before Every Commit

```bash
bun run validate    # MUST show 0 errors, 0 warnings
```

### Type Safety Checklist

- [ ] No `any` types without justification
- [ ] External data validated with Zod
- [ ] No `@ts-ignore` or `eslint-disable`
- [ ] All imports properly typed
- [ ] Functions have explicit return types

## 🆘 Need Help?

### For Detailed Guidance

- **Complete protocols**: [`CLAUDE.md`](./CLAUDE.md)  
- **Type safety guide**: [`linting-formatting.md`](./docs/projects/structure/linting-formatting.md)
- **Testing patterns**: [`testing-config.md`](./docs/projects/structure/testing-config.md)
- **Architecture overview**: [`overview.md`](./docs/projects/structure/overview.md)

### Emergency Troubleshooting

- **Build failures**: Check `bun run validate` output
- **Test failures**: Ensure using `bun run test` (not `bun test`)
- **Type errors**: Reference current library docs via Context7 MCP
- **Architecture questions**: Start with `00-architecture-entrypoint.md`

---

**Remember**: This is a **ZERO TEMPERATURE** environment. Every decision must be explicitly verified. Assumptions are violations. Type safety is absolute. Efficiency is mandatory.
